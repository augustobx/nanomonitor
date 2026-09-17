package tray

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"

	"github.com/nanolabs/nanomonitor/agent/internal/config"
	"github.com/nanolabs/nanomonitor/agent/internal/version"
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	defWindowProc    = user32.NewProc("DefWindowProcW")
	registerClassEx  = user32.NewProc("RegisterClassExW")
	createWindowEx   = user32.NewProc("CreateWindowExW")
	destroyWindow    = user32.NewProc("DestroyWindow")
	loadIcon         = user32.NewProc("LoadIconW")
	loadImage        = user32.NewProc("LoadImageW")
	createIcon       = user32.NewProc("CreateIcon")
	createPopupMenu  = user32.NewProc("CreatePopupMenu")
	appendMenu       = user32.NewProc("AppendMenuW")
	trackPopupMenuEx = user32.NewProc("TrackPopupMenuEx")
	destroyMenu      = user32.NewProc("DestroyMenu")
	getCursorPos     = user32.NewProc("GetCursorPos")
	setForegroundWnd = user32.NewProc("SetForegroundWindow")
	postQuitMessage  = user32.NewProc("PostQuitMessage")
	getMessage       = user32.NewProc("GetMessageW")
	translateMessage = user32.NewProc("TranslateMessage")
	dispatchMessage  = user32.NewProc("DispatchMessageW")
	openClipboard    = user32.NewProc("OpenClipboard")
	emptyClipboard   = user32.NewProc("EmptyClipboard")
	closeClipboard   = user32.NewProc("CloseClipboard")
	setClipboardData = user32.NewProc("SetClipboardData")
	messageBox       = user32.NewProc("MessageBoxW")

	shellNotifyIcon  = shell32.NewProc("Shell_NotifyIconW")
	shellExecute     = shell32.NewProc("ShellExecuteW")

	globalAlloc      = kernel32.NewProc("GlobalAlloc")
	globalLock       = kernel32.NewProc("GlobalLock")
	globalUnlock     = kernel32.NewProc("GlobalUnlock")
)

const (
	WM_USER         = 0x0400
	WM_TRAYICON     = WM_USER + 1
	WM_COMMAND      = 0x0111
	WM_RBUTTONUP    = 0x0205
	WM_LBUTTONDBLCLK = 0x0203
	WM_DESTROY      = 0x0002

	NIM_ADD         = 0x00000000
	NIM_MODIFY      = 0x00000001
	NIM_DELETE      = 0x00000002

	NIF_MESSAGE     = 0x00000001
	NIF_ICON        = 0x00000002
	NIF_TIP         = 0x00000004
	NIF_INFO        = 0x00000010

	NIIF_INFO       = 0x00000001

	IDI_APPLICATION = 32512
	IMAGE_ICON      = 1
	LR_LOADFROMFILE = 0x00000010
	LR_DEFAULTSIZE  = 0x00000040

	MF_STRING       = 0x00000000
	MF_GRAYED       = 0x00000001
	MF_DISABLED     = 0x00000002
	MF_SEPARATOR    = 0x00000800

	TPM_BOTTOMALIGN = 0x0020
	TPM_RIGHTBUTTON = 0x0002

	CF_UNICODETEXT  = 13
	GMEM_MOVEABLE   = 0x0002

	SW_SHOWNORMAL   = 1
	SW_HIDE         = 0
	MB_OK           = 0x00000000
	MB_ICONINFO     = 0x00000040
	MB_ICONWARNING  = 0x00000030
)

const (
	IDM_HEADER       = 1001
	IDM_HOSTNAME     = 1002
	IDM_ORGANIZATION = 1003
	IDM_VERSION      = 1004
	IDM_STATUS       = 1005
	IDM_SEPARATOR    = 1006
	IDM_COPY_ID      = 2001
	IDM_OPEN_PORTAL  = 2002
	IDM_OPEN_LOGS    = 2003
	IDM_RESTART_SVC  = 2004
	IDM_ABOUT        = 2005
	IDM_EXIT         = 3001
)

type WNDCLASSEX struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     windows.Handle
	HIcon         windows.Handle
	HCursor       windows.Handle
	HbrBackground windows.Handle
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       windows.Handle
}

type POINT struct {
	X int32
	Y int32
}

type MSG struct {
	HWnd    windows.HWND
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      POINT
}

type NOTIFYICONDATA struct {
	CbSize            uint32
	HWnd              windows.HWND
	UID               uint32
	UFlags            uint32
	UCallbackMessage  uint32
	HIcon             windows.Handle
	SzTip             [128]uint16
	DwState           uint32
	DwStateMask       uint32
	SzInfo            [256]uint16
	UTimeoutOrVersion uint32
	SzInfoTitle       [64]uint16
	DwInfoFlags       uint32
	GuidItem          windows.GUID
	HBalloonIcon      windows.Handle
}

type TrayApp struct {
	hwnd        windows.HWND
	nid         NOTIFYICONDATA
	cfg         *config.Config
	hostname    string
	serviceName string
	hIcon           windows.Handle
	greenIcon       windows.Handle
	redIcon         windows.Handle
	amberIcon       windows.Handle
	activeActionId  string
	isActionRunning bool
}

var instance *TrayApp

func NewTrayApp() (*TrayApp, error) {
	cfg, err := config.Load()
	if err != nil {
		cfg = config.DefaultConfig()
	}

	hName, _ := os.Hostname()
	if hName == "" {
		hName = "Desconocido"
	}

	app := &TrayApp{
		cfg:         cfg,
		hostname:    hName,
		serviceName: "NanoLabsAgent",
	}
	instance = app
	return app, nil
}

func (app *TrayApp) Run() error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	className, _ := windows.UTF16PtrFromString("NanoLabsTrayClass")
	windowTitle, _ := windows.UTF16PtrFromString("NanoLabs Monitor Tray")

	// Create dynamic colored circle icons
	app.greenIcon = createCircleIcon(16, 185, 129) // Emerald Green #10b981
	app.redIcon = createCircleIcon(239, 68, 68)    // Crimson Red #ef4444
	app.amberIcon = createCircleIcon(245, 158, 11) // Amber Maintenance #f59e0b

	if app.isServiceRunning() {
		app.hIcon = app.greenIcon
	} else {
		app.hIcon = app.redIcon
	}

	wndProcCallback := syscall.NewCallback(wndProc)

	var wc WNDCLASSEX
	wc.CbSize = uint32(unsafe.Sizeof(wc))
	wc.LpfnWndProc = wndProcCallback
	wc.LpszClassName = className
	wc.HIcon = app.hIcon
	wc.HIconSm = app.hIcon

	r, _, err := registerClassEx.Call(uintptr(unsafe.Pointer(&wc)))
	if r == 0 && err != nil && err.(syscall.Errno) != 1410 { // 1410 = class already exists
		return fmt.Errorf("registerClassEx failed: %w", err)
	}

	hWnd, _, err := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowTitle)),
		0,
		0, 0, 0, 0,
		0, 0, 0, 0,
	)
	if hWnd == 0 {
		return fmt.Errorf("createWindowEx failed: %w", err)
	}
	app.hwnd = windows.HWND(hWnd)

	// Setup tray icon
	app.nid.CbSize = uint32(unsafe.Sizeof(app.nid))
	app.nid.HWnd = app.hwnd
	app.nid.UID = 1
	app.nid.UFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
	app.nid.UCallbackMessage = WM_TRAYICON
	app.nid.HIcon = app.hIcon
	copy(app.nid.SzTip[:], windows.StringToUTF16(fmt.Sprintf("NanoLabs Monitor v%s — %s", version.Version, app.hostname)))

	shellNotifyIcon.Call(NIM_ADD, uintptr(unsafe.Pointer(&app.nid)))

	// Show balloon notification on initial startup
	app.ShowNotification("NanoLabs Control Center", "Agente activo y monitoreando el equipo.")

	// Periodic service status check in background
	go func() {
		for {
			time.Sleep(15 * time.Second)
			if !app.isActionRunning {
				app.updateTooltip()
			}
		}
	}()

	// Periodic check for active maintenance actions
	go func() {
		for {
			time.Sleep(1500 * time.Millisecond)
			app.checkActiveActions()
		}
	}()

	// Message loop
	var msg MSG
	for {
		r, _, _ := getMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		translateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		dispatchMessage.Call(uintptr(unsafe.Pointer(&msg)))
	}

	shellNotifyIcon.Call(NIM_DELETE, uintptr(unsafe.Pointer(&app.nid)))
	return nil
}

func (app *TrayApp) ShowNotification(title, message string) {
	app.nid.UFlags |= NIF_INFO
	copy(app.nid.SzInfoTitle[:], windows.StringToUTF16(title))
	copy(app.nid.SzInfo[:], windows.StringToUTF16(message))
	app.nid.DwInfoFlags = NIIF_INFO
	shellNotifyIcon.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&app.nid)))
}

func (app *TrayApp) updateTooltip() {
	isRunning := app.isServiceRunning()
	var statusText string
	if isRunning {
		statusText = "🟢 Conectado al NOC"
		app.nid.HIcon = app.greenIcon
	} else {
		statusText = "🔴 Servicio Detenido"
		app.nid.HIcon = app.redIcon
	}

	tip := fmt.Sprintf("NanoLabs v%s: %s (%s)", version.Version, app.hostname, statusText)
	if len(tip) > 120 {
		tip = tip[:120]
	}
	copy(app.nid.SzTip[:], windows.StringToUTF16(tip))
	app.nid.UFlags = NIF_TIP | NIF_ICON
	shellNotifyIcon.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&app.nid)))
}

func (app *TrayApp) isServiceRunning() bool {
	m, err := mgr.Connect()
	if err != nil {
		return false
	}
	defer m.Disconnect()

	s, err := m.OpenService(app.serviceName)
	if err != nil {
		return false
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return false
	}
	return status.State == svc.Running
}

func (app *TrayApp) checkActiveActions() {
	stateFile := `C:\ProgramData\NanoLabs\NanoMonitor\active_action.json`
	data, err := os.ReadFile(stateFile)
	if err != nil {
		return
	}

	type actionState struct {
		ActionID   string `json:"actionId"`
		ActionType string `json:"actionType"`
		Title      string `json:"title"`
		Status     string `json:"status"`
		StartedAt  string `json:"startedAt"`
		FinishedAt string `json:"finishedAt"`
		ExitCode   int    `json:"exitCode"`
		Error      string `json:"error"`
	}

	var state actionState
	if err := json.Unmarshal(data, &state); err != nil {
		return
	}

	if state.Status == "RUNNING" {
		if app.activeActionId != state.ActionID {
			app.activeActionId = state.ActionID
			app.isActionRunning = true

			// Switch to Amber maintenance icon
			app.nid.HIcon = app.amberIcon
			tip := fmt.Sprintf("NanoLabs v%s: %s (⚙️ Mantenimiento en Curso)", version.Version, app.hostname)
			if len(tip) > 120 {
				tip = tip[:120]
			}
			copy(app.nid.SzTip[:], windows.StringToUTF16(tip))
			app.nid.UFlags = NIF_TIP | NIF_ICON
			shellNotifyIcon.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&app.nid)))

			// Native Windows Toast / Balloon Notification
			app.ShowNotification("🛠️ NanoLabs Soporte Remoto", fmt.Sprintf("Mantenimiento en curso:\n%s", state.Title))
		}
	} else if state.Status == "COMPLETED" || state.Status == "FAILED" {
		if app.isActionRunning && app.activeActionId == state.ActionID {
			app.isActionRunning = false

			if state.Status == "COMPLETED" {
				app.ShowNotification("✓ NanoLabs Soporte Remoto", fmt.Sprintf("Tarea finalizada con éxito:\n%s", state.Title))
			} else {
				app.ShowNotification("⚠️ NanoLabs Soporte Remoto", fmt.Sprintf("Tarea finalizada con advertencias:\n%s", state.Title))
			}

			// Restore normal green icon and status
			app.updateTooltip()
		}
	}
}

func (app *TrayApp) handleExit() {
	// If Tamper Protection is enabled in config
	if app.cfg != nil && app.cfg.TamperKey != "" {
		pTitle, _ := windows.UTF16PtrFromString("Tamper Protection — NanoLabs Control Center")
		pText, _ := windows.UTF16PtrFromString(
			"Acceso Denegado: La aplicación de bandeja está protegida contra cierre no autorizado.\n\n" +
				"Para desinstalar o cerrar el agente en este equipo, debe solicitar la Clave de Desbloqueo al Administrador del NOC desde el portal web.",
		)
		messageBox.Call(uintptr(app.hwnd), uintptr(unsafe.Pointer(pText)), uintptr(unsafe.Pointer(pTitle)), uintptr(MB_OK|MB_ICONWARNING))
		return
	}

	destroyWindow.Call(uintptr(app.hwnd))
	postQuitMessage.Call(0)
}

func (app *TrayApp) showContextMenu() {
	hMenu, _, _ := createPopupMenu.Call()
	if hMenu == 0 {
		return
	}
	defer destroyMenu.Call(hMenu)

	isRunning := app.isServiceRunning()
	statusText := "Estado: 🟢 En ejecución (Reportando)"
	if !isRunning {
		statusText = "Estado: 🔴 Detenido"
	}

	orgText := "Organización: NanoLabs"
	if app.cfg.TenantID != "" {
		orgText = fmt.Sprintf("Organización: %s", app.cfg.TenantID)
	}

	appendMenuString(hMenu, MF_DISABLED|MF_GRAYED, IDM_HEADER, fmt.Sprintf("🛡️ NanoLabs Monitor v%s", version.Version))
	appendMenuSeparator(hMenu)
	appendMenuString(hMenu, MF_DISABLED|MF_GRAYED, IDM_HOSTNAME, fmt.Sprintf("Equipo: %s", app.hostname))
	appendMenuString(hMenu, MF_DISABLED|MF_GRAYED, IDM_ORGANIZATION, orgText)
	appendMenuString(hMenu, MF_DISABLED|MF_GRAYED, IDM_VERSION, fmt.Sprintf("Versión: v%s", version.Version))
	appendMenuString(hMenu, MF_DISABLED|MF_GRAYED, IDM_STATUS, statusText)
	appendMenuSeparator(hMenu)

	appendMenuString(hMenu, MF_STRING, IDM_COPY_ID, "📋 Copiar ID del Dispositivo")
	appendMenuString(hMenu, MF_STRING, IDM_OPEN_PORTAL, "🌐 Abrir Consola Web NOC")
	appendMenuString(hMenu, MF_STRING, IDM_OPEN_LOGS, "📁 Ver Archivos de Registro (Logs)")
	appendMenuString(hMenu, MF_STRING, IDM_ABOUT, "ℹ️ Acerca de NanoLabs Monitor...")
	appendMenuSeparator(hMenu)

	if isRunning {
		appendMenuString(hMenu, MF_STRING, IDM_RESTART_SVC, "🔄 Reiniciar Servicio de Monitoreo")
	} else {
		appendMenuString(hMenu, MF_STRING, IDM_RESTART_SVC, "▶️ Iniciar Servicio de Monitoreo")
	}
	appendMenuString(hMenu, MF_STRING, IDM_EXIT, "❌ Cerrar Bandeja")

	var pt POINT
	getCursorPos.Call(uintptr(unsafe.Pointer(&pt)))

	setForegroundWnd.Call(uintptr(app.hwnd))
	trackPopupMenuEx.Call(
		hMenu,
		TPM_BOTTOMALIGN|TPM_RIGHTBUTTON,
		uintptr(pt.X),
		uintptr(pt.Y),
		uintptr(app.hwnd),
		0,
	)
}

func appendMenuString(hMenu uintptr, flags uint32, id uintptr, text string) {
	pText, _ := windows.UTF16PtrFromString(text)
	appendMenu.Call(hMenu, uintptr(flags), id, uintptr(unsafe.Pointer(pText)))
}

func appendMenuSeparator(hMenu uintptr) {
	appendMenu.Call(hMenu, uintptr(MF_SEPARATOR), 0, 0)
}

func wndProc(hWnd windows.HWND, msg uint32, wParam, lParam uintptr) uintptr {
	if instance == nil {
		r, _, _ := defWindowProc.Call(uintptr(hWnd), uintptr(msg), wParam, lParam)
		return r
	}

	switch msg {
	case WM_TRAYICON:
		switch lParam {
		case WM_RBUTTONUP:
			instance.showContextMenu()
			return 0
		case WM_LBUTTONDBLCLK:
			instance.handleOpenPortal()
			return 0
		}

	case WM_COMMAND:
		cmdID := uint32(wParam & 0xFFFF)
		switch cmdID {
		case IDM_COPY_ID:
			instance.handleCopyID()
		case IDM_OPEN_PORTAL:
			instance.handleOpenPortal()
		case IDM_OPEN_LOGS:
			instance.handleOpenLogs()
		case IDM_RESTART_SVC:
			instance.handleRestartService()
		case IDM_ABOUT:
			instance.handleAbout()
		case IDM_EXIT:
			instance.handleExit()
		}
		return 0

	case WM_DESTROY:
		postQuitMessage.Call(0)
		return 0
	}

	r, _, _ := defWindowProc.Call(uintptr(hWnd), uintptr(msg), wParam, lParam)
	return r
}

func (app *TrayApp) handleAbout() {
	pTitle, _ := windows.UTF16PtrFromString("Acerca de NanoLabs Monitor")
	pText, _ := windows.UTF16PtrFromString(fmt.Sprintf(
		"NanoLabs Control Center — Enterprise NOC & RMM\n\n"+
			"Versión del Agente: %s\n"+
			"Equipo: %s\n"+
			"Plataforma: Windows (x64)\n"+
			"Arquitectura: Outbound Long-Polling (HMAC-SHA256)\n\n"+
			"© 2026 NanoLabs Software Solutions",
		version.Info(),
		app.hostname,
	))
	messageBox.Call(uintptr(app.hwnd), uintptr(unsafe.Pointer(pText)), uintptr(unsafe.Pointer(pTitle)), uintptr(MB_OK|MB_ICONINFO))
}

func (app *TrayApp) handleCopyID() {
	id := app.cfg.DeviceID
	if id == "" {
		id = "NO-ENROLADO"
	}
	copyToClipboard(id)
	app.ShowNotification("NanoLabs ID", fmt.Sprintf("ID copiado al portapapeles: %s", id))
}

func (app *TrayApp) handleOpenPortal() {
	url := app.cfg.APIUrl
	if url == "" {
		url = "https://monitor.nanolabs.com.ar"
	}
	pURL, _ := windows.UTF16PtrFromString(url)
	pOp, _ := windows.UTF16PtrFromString("open")
	shellExecute.Call(0, uintptr(unsafe.Pointer(pOp)), uintptr(unsafe.Pointer(pURL)), 0, 0, SW_SHOWNORMAL)
}

func (app *TrayApp) handleOpenLogs() {
	logsDir := filepath.Join(config.DefaultConfigDir, "logs")
	_ = os.MkdirAll(logsDir, 0755)
	pDir, _ := windows.UTF16PtrFromString(logsDir)
	pOp, _ := windows.UTF16PtrFromString("open")
	shellExecute.Call(0, uintptr(unsafe.Pointer(pOp)), uintptr(unsafe.Pointer(pDir)), 0, 0, SW_SHOWNORMAL)
}

func (app *TrayApp) handleRestartService() {
	go func() {
		pVerb, _ := windows.UTF16PtrFromString("runas")
		pCmd, _ := windows.UTF16PtrFromString("cmd.exe")

		var cmdStr string
		if app.isServiceRunning() {
			cmdStr = "/c net stop " + app.serviceName + " & net start " + app.serviceName
		} else {
			cmdStr = "/c net start " + app.serviceName
		}
		pArgs, _ := windows.UTF16PtrFromString(cmdStr)

		ret, _, _ := shellExecute.Call(
			0,
			uintptr(unsafe.Pointer(pVerb)),
			uintptr(unsafe.Pointer(pCmd)),
			uintptr(unsafe.Pointer(pArgs)),
			0,
			SW_HIDE,
		)
		if ret <= 32 {
			app.ShowNotification("Permisos Requeridos", "Debe aceptar el diálogo de administrador de Windows para iniciar el servicio.")
			return
		}

		for i := 0; i < 6; i++ {
			time.Sleep(1 * time.Second)
			app.updateTooltip()
			if app.isServiceRunning() {
				app.ShowNotification("Servicio de Monitoreo", "El servicio se ha iniciado correctamente.")
				return
			}
		}
		app.ShowNotification("Servicio de Monitoreo", "Comando enviado. Verificando estado...")
	}()
}

func createCircleIcon(r, g, b byte) windows.Handle {
	const size = 16
	andMask := make([]byte, (size*size)/8)
	xorPixels := make([]byte, size*size*4)

	radius := 6.5
	center := 7.5

	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			pixelIdx := (y*size + x) * 4
			maskByteIdx := (y*size + x) / 8
			maskBitIdx := 7 - ((y*size + x) % 8)

			dx := float64(x) - center
			dy := float64(y) - center
			dist := math.Sqrt(dx*dx + dy*dy)

			if dist <= radius {
				if dist > radius-1.0 {
					xorPixels[pixelIdx+0] = byte(float64(b) * 0.7)
					xorPixels[pixelIdx+1] = byte(float64(g) * 0.7)
					xorPixels[pixelIdx+2] = byte(float64(r) * 0.7)
					xorPixels[pixelIdx+3] = 255
				} else if dist < 2.5 {
					xorPixels[pixelIdx+0] = minByte(b+40, 255)
					xorPixels[pixelIdx+1] = minByte(g+40, 255)
					xorPixels[pixelIdx+2] = minByte(r+40, 255)
					xorPixels[pixelIdx+3] = 255
				} else {
					xorPixels[pixelIdx+0] = b
					xorPixels[pixelIdx+1] = g
					xorPixels[pixelIdx+2] = r
					xorPixels[pixelIdx+3] = 255
				}
			} else {
				andMask[maskByteIdx] |= (1 << maskBitIdx)
				xorPixels[pixelIdx+0] = 0
				xorPixels[pixelIdx+1] = 0
				xorPixels[pixelIdx+2] = 0
				xorPixels[pixelIdx+3] = 0
			}
		}
	}

	hIcon, _, _ := createIcon.Call(
		0,
		uintptr(size),
		uintptr(size),
		1,
		32,
		uintptr(unsafe.Pointer(&andMask[0])),
		uintptr(unsafe.Pointer(&xorPixels[0])),
	)
	return windows.Handle(hIcon)
}

func minByte(a byte, b int) byte {
	if int(a) > b {
		return byte(b)
	}
	return a
}

func copyToClipboard(text string) {
	utf16 := windows.StringToUTF16(text)
	byteLen := uintptr(len(utf16) * 2)

	hMem, _, _ := globalAlloc.Call(GMEM_MOVEABLE, byteLen)
	if hMem == 0 {
		return
	}

	ptr, _, _ := globalLock.Call(hMem)
	if ptr == 0 {
		return
	}

	copy((*[1 << 30]uint16)(unsafe.Pointer(ptr))[:len(utf16)], utf16)
	globalUnlock.Call(hMem)

	r, _, _ := openClipboard.Call(0)
	if r == 0 {
		return
	}
	defer closeClipboard.Call()

	emptyClipboard.Call()
	setClipboardData.Call(CF_UNICODETEXT, hMem)
}
