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
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

//go:embed embedded/nanoagent.exe
var nanoagentBin []byte

//go:embed embedded/nanotray.exe
var nanotrayBin []byte

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	messageBox       = user32.NewProc("MessageBoxW")
	shellExecute     = shell32.NewProc("ShellExecuteW")
	getConsoleWindow = kernel32.NewProc("GetConsoleWindow")
	showWindow       = user32.NewProc("ShowWindow")
	freeConsole      = kernel32.NewProc("FreeConsole")
)

func detachAndHideConsole() {
	hwnd, _, _ := getConsoleWindow.Call()
	if hwnd != 0 {
		showWindow.Call(hwnd, 0) // SW_HIDE = 0
	}
	freeConsole.Call()
}

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
		keyFlag       = flag.String("key", "", "Clave de desbloqueo de Tamper Protection")
		silentFlag    = flag.Bool("silent", false, "Modo silencioso / desatendido")
		uninstallFlag = flag.Bool("uninstall", false, "Desinstalar NanoLabs Monitor")
	)
	flag.Parse()

	// Check for /silent, /uninstall, or -key in raw args
	for _, arg := range os.Args[1:] {
		lower := strings.ToLower(arg)
		if lower == "/silent" || lower == "/verysilent" || lower == "-s" || lower == "/s" {
			*silentFlag = true
		}
		if lower == "/uninstall" || lower == "-u" {
			*uninstallFlag = true
		}
		if strings.HasPrefix(lower, "-key=") || strings.HasPrefix(lower, "/key=") {
			parts := strings.SplitN(arg, "=", 2)
			if len(parts) == 2 {
				*keyFlag = strings.Trim(parts[1], `"' `)
			}
		}
	}

	if !*silentFlag {
		detachAndHideConsole()
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
		doUninstall(*keyFlag, *silentFlag)
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

	// 1. Temporarily disable watchdog and stop service/tray
	_ = exec.Command("sc.exe", "failure", ServiceName, "reset=", "0", "actions=", "").Run()
	_ = exec.Command("net", "stop", ServiceName).Run()
	_ = exec.Command("taskkill", "/F", "/IM", "nanoagent.exe").Run()
	_ = exec.Command("taskkill", "/F", "/IM", "nanotray.exe").Run()
	time.Sleep(800 * time.Millisecond)

	// 3. Create target program files directory
	if err := os.MkdirAll(DefaultInstallDir, 0755); err != nil {
		showError(fmt.Sprintf("Error creando directorio de instalación:\n%v", err), silent)
		os.Exit(1)
	}

	// 4. Extract binaries safely with lock handling
	agentDest := filepath.Join(DefaultInstallDir, "nanoagent.exe")
	if err := safeWriteBinary(agentDest, nanoagentBin); err != nil {
		showError(fmt.Sprintf("Error instalando nanoagent.exe:\n%v", err), silent)
		os.Exit(1)
	}

	trayDest := filepath.Join(DefaultInstallDir, "nanotray.exe")
	if err := safeWriteBinary(trayDest, nanotrayBin); err != nil {
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
	if _, err := os.Stat(configYamlPath); os.IsNotExist(err) {
		initialConfig := fmt.Sprintf("apiUrl: %s\nlogFile: %s\\logs\\nanoagent.log\nlogLevel: info\n", apiURL, DefaultDataDir)
		_ = os.WriteFile(configYamlPath, []byte(initialConfig), 0666)
	}

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

	// 7b. Validate the service configuration created by nanoagent.exe.
	if err := validateServiceConfiguration(); err != nil {
		showError(fmt.Sprintf("El servicio fue creado pero su configuración no es válida:\n%v", err), silent)
		os.Exit(1)
	}

	// 8. Start Windows Service and verify the SCM really reports RUNNING.
	if err := ensureServiceRunning(30 * time.Second); err != nil {
		showError(fmt.Sprintf("NanoLabsAgent fue instalado pero NO pudo quedar en ejecución:\n%v\n\nRevise el Visor de Eventos > Windows Logs > System > Service Control Manager.", err), silent)
		os.Exit(1)
	}

	// 9. Launch nanotray.exe in current user session only after the service is confirmed RUNNING
	pTray, _ := windows.UTF16PtrFromString(trayDest)
	pDir, _ := windows.UTF16PtrFromString(DefaultInstallDir)
	pOp, _ := windows.UTF16PtrFromString("open")
	shellExecute.Call(0, uintptr(unsafe.Pointer(pOp)), uintptr(unsafe.Pointer(pTray)), 0, uintptr(unsafe.Pointer(pDir)), SW_HIDE)

	// 10. Success notice
	if !silent {
		promptDialog("NanoLabs Monitor",
			"¡Instalación completada exitosamente!\n\n"+
				"• El servicio de monitoreo está en ejecución continua con auto-recuperación activa.\n"+
				"• El icono de estado se encuentra activo en la bandeja del sistema (junto al reloj).\n"+
				"• El equipo comenzará a reportar telemetría al NOC.",
			MB_OK|MB_ICONINFORMATION)
	}
	os.Exit(0)
}

func validateServiceConfiguration() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("conectando con Service Control Manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("abriendo servicio %s: %w", ServiceName, err)
	}
	defer s.Close()

	cfg, err := s.Config()
	if err != nil {
		return fmt.Errorf("leyendo configuración del servicio: %w", err)
	}
	if cfg.StartType != mgr.StartAutomatic {
		return fmt.Errorf("StartType inesperado: %v; se esperaba Automatic", cfg.StartType)
	}

	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Services\NanoLabsAgent`, registry.QUERY_VALUE)
	if err != nil {
		return fmt.Errorf("leyendo DelayedAutoStart: %w", err)
	}
	defer k.Close()
	delayed, _, err := k.GetIntegerValue("DelayedAutoStart")
	if err != nil {
		return fmt.Errorf("DelayedAutoStart no configurado: %w", err)
	}
	if delayed != 1 {
		return fmt.Errorf("DelayedAutoStart=%d; se esperaba 1", delayed)
	}

	return nil
}

func ensureServiceRunning(timeout time.Duration) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("conectando con Service Control Manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("abriendo servicio %s: %w", ServiceName, err)
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return fmt.Errorf("consultando estado inicial: %w", err)
	}
	if status.State != svc.Running {
		if err := s.Start(); err != nil {
			return fmt.Errorf("iniciando servicio: %w", err)
		}
	}

	deadline := time.Now().Add(timeout)
	var lastState svc.State
	for time.Now().Before(deadline) {
		status, err = s.Query()
		if err != nil {
			return fmt.Errorf("consultando estado durante arranque: %w", err)
		}
		lastState = status.State
		if status.State == svc.Running {
			return nil
		}
		if status.State == svc.Stopped {
			return fmt.Errorf("el servicio volvió a STOPPED durante el arranque")
		}
		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("timeout esperando RUNNING; último estado SCM=%v", lastState)
}

func safeWriteBinary(destPath string, data []byte) error {
	// 1. Try direct writes first
	for i := 0; i < 3; i++ {
		if err := os.WriteFile(destPath, data, 0755); err == nil {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}

	// 2. If locked, rename old file out of the way (Windows permits renaming running .exe)
	oldPath := destPath + ".old"
	_ = os.Remove(oldPath)
	_ = os.Rename(destPath, oldPath)

	if err := os.WriteFile(destPath, data, 0755); err == nil {
		_ = os.Remove(oldPath)
		return nil
	}

	// 3. Force kill specific binary name and retry
	procName := filepath.Base(destPath)
	_ = exec.Command("taskkill", "/F", "/IM", procName).Run()
	time.Sleep(500 * time.Millisecond)
	_ = os.Remove(oldPath)
	_ = os.Rename(destPath, oldPath)
	err := os.WriteFile(destPath, data, 0755)
	_ = os.Remove(oldPath)
	return err
}

func readConfigTamperKey(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "tamperKey:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				val := strings.TrimSpace(parts[1])
				return strings.Trim(val, `"' `)
			}
		}
	}
	return ""
}

func doUninstall(key string, silent bool) {
	// Check if Tamper Protection is enabled in config.yaml
	configPath := filepath.Join(DefaultDataDir, "config.yaml")
	storedKey := readConfigTamperKey(configPath)

	if storedKey != "" {
		// Tamper Protection is ACTIVE!
		if key == "" && !silent {
			psScript := `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox('Este equipo cuenta con Protección Anti-Sabotaje (Tamper Protection).' + [char]10 + [char]10 + 'Ingrese la Clave de Desbloqueo provista en el portal NanoLabs:', 'Desinstalación Protegida — NanoLabs', '')`
			cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psScript)
			if out, err := cmd.Output(); err == nil {
				key = strings.TrimSpace(string(out))
			}
		}

		if strings.TrimSpace(key) != storedKey {
			showError("Acceso Denegado: Clave de desbloqueo incorrecta o ausente.\n\nLa desinstalación ha sido cancelada por Tamper Protection. Solicite la clave de autorización al administrador del NOC en el portal web.", silent)
			os.Exit(1)
		}
	}

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
