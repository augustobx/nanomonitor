package main

import (
	_ "embed"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

//go:embed embedded/nanoagent.exe
var nanoagentBin []byte

//go:embed embedded/nanotray.exe
var nanotrayBin []byte

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	messageBox   = user32.NewProc("MessageBoxW")
	shellExecute = shell32.NewProc("ShellExecuteW")
)

const (
	MB_OK              = 0x00000000
	MB_OKCANCEL        = 0x00000001
	MB_ICONINFORMATION = 0x00000040
	MB_ICONWARNING     = 0x00000030
	MB_ICONERROR       = 0x00000010
	IDOK               = 1

	SW_SHOWNORMAL = 1
	SW_HIDE       = 0

	DefaultInstallDir = `C:\Program Files\NanoLabs\NanoMonitor`
	DefaultDataDir    = `C:\ProgramData\NanoLabs\NanoMonitor`
	ServiceName       = "NanoLabsAgent"
)

func main() {
	var (
		tokenFlag     = flag.String("token", "", "Token de enrolamiento del cliente")
		apiURLFlag    = flag.String("api-url", "https://monitor.nanolabs.com.ar", "URL del servidor central")
		silentFlag    = flag.Bool("silent", false, "Modo silencioso / desatendido")
		uninstallFlag = flag.Bool("uninstall", false, "Desinstalar NanoLabs Monitor")
	)
	flag.Parse()

	// Check for /silent or /VERYSILENT in raw args (Inno Setup / standard Windows installer compatibility)
	for _, arg := range os.Args[1:] {
		lower := strings.ToLower(arg)
		if lower == "/silent" || lower == "/verysilent" || lower == "-s" || lower == "/s" {
			*silentFlag = true
		}
		if lower == "/uninstall" || lower == "-u" {
			*uninstallFlag = true
		}
	}

	// Ensure elevation (Administrator)
	if !isAdmin() {
		if *silentFlag {
			fmt.Fprintln(os.Stderr, "Error: Se requieren privilegios de Administrador para instalar el servicio.")
			os.Exit(1)
		}
		// Relaunch elevated via UAC
		elevateSelf()
		os.Exit(0)
	}

	if *uninstallFlag {
		doUninstall(*silentFlag)
		os.Exit(0)
	}

	doInstall(*tokenFlag, *apiURLFlag, *silentFlag)
}

func isAdmin() bool {
	var sid *windows.SID
	err := windows.AllocateAndInitializeSid(
		&windows.SECURITY_NT_AUTHORITY,
		2,
		windows.SECURITY_BUILTIN_DOMAIN_RID,
		windows.DOMAIN_ALIAS_RID_ADMINS,
		0, 0, 0, 0, 0, 0,
		&sid,
	)
	if err != nil {
		return false
	}
	defer windows.FreeSid(sid)

	token := windows.Token(0)
	member, err := token.IsMember(sid)
	if err != nil {
		return false
	}
	return member
}

func elevateSelf() {
	exePath, err := os.Executable()
	if err != nil {
		return
	}

	pVerb, _ := windows.UTF16PtrFromString("runas")
	pFile, _ := windows.UTF16PtrFromString(exePath)
	pArgs, _ := windows.UTF16PtrFromString(strings.Join(os.Args[1:], " "))

	shellExecute.Call(
		0,
		uintptr(unsafe.Pointer(pVerb)),
		uintptr(unsafe.Pointer(pFile)),
		uintptr(unsafe.Pointer(pArgs)),
		0,
		SW_SHOWNORMAL,
	)
}

func promptDialog(title, text string, style uint32) int {
	pTitle, _ := windows.UTF16PtrFromString(title)
	pText, _ := windows.UTF16PtrFromString(text)
	r, _, _ := messageBox.Call(0, uintptr(unsafe.Pointer(pText)), uintptr(unsafe.Pointer(pTitle)), uintptr(style))
	return int(r)
}

func askTokenGUI() string {
	// Try looking for adjacent token.txt
	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		for _, name := range []string{"token.txt", "enrollment-token.txt", "token"} {
			tPath := filepath.Join(dir, name)
			if b, err := os.ReadFile(tPath); err == nil {
				token := strings.TrimSpace(string(b))
				if token != "" {
					return token
				}
			}
		}
	}

	// PowerShell native InputBox dialog
	psScript := `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox('Ingrese el Token de Enrolamiento proporcionado para este cliente en el panel web:', 'Instalador NanoLabs Monitor', '')`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psScript)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func doInstall(token, apiURL string, silent bool) {
	if token == "" && !silent {
		res := promptDialog("NanoLabs Monitor — Instalador",
			"Bienvenido al instalador de NanoLabs Monitor.\n\n"+
				"Este instalador configurará el Agente de Monitoreo como Servicio de Windows y el icono de estado en la bandeja del sistema.\n\n"+
				"¿Desea continuar con la instalación?",
			MB_OKCANCEL|MB_ICONINFORMATION)
		if res != IDOK {
			os.Exit(0)
		}

		// Prompt for token
		token = askTokenGUI()
	}

	// 1. Stop existing service if running
	_ = exec.Command("net", "stop", ServiceName).Run()

	// 2. Kill existing tray if running
	_ = exec.Command("taskkill", "/F", "/IM", "nanotray.exe").Run()
	time.Sleep(500 * time.Millisecond)

	// 3. Create target program files directory
	if err := os.MkdirAll(DefaultInstallDir, 0755); err != nil {
		showError(fmt.Sprintf("Error creando directorio de instalación:\n%v", err), silent)
		os.Exit(1)
	}

	// 4. Extract binaries
	agentDest := filepath.Join(DefaultInstallDir, "nanoagent.exe")
	if err := os.WriteFile(agentDest, nanoagentBin, 0755); err != nil {
		showError(fmt.Sprintf("Error instalando nanoagent.exe:\n%v", err), silent)
		os.Exit(1)
	}

	trayDest := filepath.Join(DefaultInstallDir, "nanotray.exe")
	if err := os.WriteFile(trayDest, nanotrayBin, 0755); err != nil {
		showError(fmt.Sprintf("Error instalando nanotray.exe:\n%v", err), silent)
		os.Exit(1)
	}

	// 5. Create Data directory & configuration
	if err := os.MkdirAll(DefaultDataDir, 0755); err != nil {
		showError(fmt.Sprintf("Error creando directorio de datos:\n%v", err), silent)
		os.Exit(1)
	}
	_ = os.MkdirAll(filepath.Join(DefaultDataDir, "logs"), 0755)

	// Grant modify permissions to Users on data dir
	_ = exec.Command("icacls", DefaultDataDir, "/grant", "*S-1-5-32-545:(OI)(CI)M", "/T").Run()

	configYamlPath := filepath.Join(DefaultDataDir, "config.yaml")
	initialConfig := fmt.Sprintf("apiUrl: %s\nlogFile: %s\\logs\\nanoagent.log\nlogLevel: info\n", apiURL, DefaultDataDir)
	_ = os.WriteFile(configYamlPath, []byte(initialConfig), 0666)

	// If token was provided, write .enrollment-token
	if token != "" {
		tokenFile := filepath.Join(DefaultDataDir, ".enrollment-token")
		_ = os.WriteFile(tokenFile, []byte(token), 0666)
	}

	// 6. Install Windows Service
	// Try uninstalling old registration first to ensure fresh binary path
	_ = exec.Command(agentDest, "-uninstall").Run()
	installCmd := exec.Command(agentDest, "-install", "-api-url="+apiURL)
	if token != "" {
		installCmd.Args = append(installCmd.Args, "-token="+token)
	}
	if out, err := installCmd.CombinedOutput(); err != nil {
		showError(fmt.Sprintf("Error instalando el servicio de Windows:\n%s\n%v", string(out), err), silent)
		os.Exit(1)
	}

	// 7. Register nanotray.exe in Windows autorun registry
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, registry.SET_VALUE)
	if err == nil {
		_ = k.SetStringValue("NanoLabsTray", fmt.Sprintf(`"%s"`, trayDest))
		k.Close()
	}

	// 8. Start Windows Service
	_ = exec.Command("sc.exe", "start", ServiceName).Run()

	// 9. Launch nanotray.exe in current user session
	pTray, _ := windows.UTF16PtrFromString(trayDest)
	pDir, _ := windows.UTF16PtrFromString(DefaultInstallDir)
	pOp, _ := windows.UTF16PtrFromString("open")
	shellExecute.Call(0, uintptr(unsafe.Pointer(pOp)), uintptr(unsafe.Pointer(pTray)), 0, uintptr(unsafe.Pointer(pDir)), SW_SHOWNORMAL)

	// 10. Success notice
	if !silent {
		promptDialog("NanoLabs Monitor",
			"¡Instalación completada exitosamente!\n\n"+
				"• El servicio de monitoreo está en ejecución continua.\n"+
				"• El icono de estado se encuentra activo en la bandeja del sistema (junto al reloj).\n"+
				"• El equipo comenzará a reportar telemetría al NOC.",
			MB_OK|MB_ICONINFORMATION)
	}
	os.Exit(0)
}

func doUninstall(silent bool) {
	if !silent {
		res := promptDialog("NanoLabs Monitor — Desinstalación",
			"¿Está seguro de que desea desinstalar completamente NanoLabs Monitor de este equipo?",
			MB_OKCANCEL|MB_ICONWARNING)
		if res != IDOK {
			os.Exit(0)
		}
	}

	// 1. Stop service
	_ = exec.Command("net", "stop", ServiceName).Run()

	// 2. Kill tray
	_ = exec.Command("taskkill", "/F", "/IM", "nanotray.exe").Run()

	// 3. Uninstall service
	agentExe := filepath.Join(DefaultInstallDir, "nanoagent.exe")
	if _, err := os.Stat(agentExe); err == nil {
		_ = exec.Command(agentExe, "-uninstall").Run()
	}

	// 4. Remove autorun registry
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, registry.SET_VALUE)
	if err == nil {
		_ = k.DeleteValue("NanoLabsTray")
		k.Close()
	}

	// 5. Remove Program Files directory
	_ = os.RemoveAll(DefaultInstallDir)

	if !silent {
		promptDialog("NanoLabs Monitor", "NanoLabs Monitor ha sido desinstalado correctamente.", MB_OK|MB_ICONINFORMATION)
	}
}

func showError(msg string, silent bool) {
	if silent {
		fmt.Fprintln(os.Stderr, msg)
	} else {
		promptDialog("Error de Instalación — NanoLabs Monitor", msg, MB_OK|MB_ICONERROR)
	}
}
