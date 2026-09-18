package actions

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

// DefaultActionStateFile is the IPC state file shared between nanoagent (service) and nanotray (desktop)
const DefaultActionStateFile = `C:\ProgramData\NanoLabs\NanoMonitor\active_action.json`

// ActiveActionState represents the active maintenance or remote task status
type ActiveActionState struct {
	ActionID   string `json:"actionId"`
	ActionType string `json:"actionType"`
	Title      string `json:"title"`
	Status     string `json:"status"` // "RUNNING", "COMPLETED", "FAILED"
	StartedAt  string `json:"startedAt"`
	FinishedAt string `json:"finishedAt,omitempty"`
	ExitCode   int    `json:"exitCode,omitempty"`
	Error      string `json:"error,omitempty"`
}

// GetActionFriendlyTitle maps technical action types to user-friendly Spanish titles
func GetActionFriendlyTitle(actionType string, params map[string]interface{}) string {
	switch actionType {
	case "WINDOWS_SFC_SCAN":
		return "Verificación de Integridad de Archivos (sfc /scannow)"
	case "WINDOWS_DISM_CHECK":
		return "Comprobación de Imagen del Sistema (DISM)"
	case "WINDOWS_CHKDSK_SCAN":
		return "Análisis Diagnóstico de Disco (CHKDSK)"
	case "CLEAN_TEMP_FILES":
		return "Limpieza Segura de Archivos Temporales"
	case "DEFENDER_UPDATE_SIGNATURES":
		return "Actualización de Firmas de Windows Defender"
	case "DEFENDER_QUICK_SCAN":
		return "Análisis Rápido Antivirus"
	case "DEFENDER_FULL_SCAN":
		return "Análisis Completo Antivirus"
	case "WINDOWS_UPDATE_SCAN":
		return "Búsqueda de Parches de Seguridad"
	case "WINDOWS_UPDATE_INSTALL_KB", "WINDOWS_UPDATE_INSTALL_APPROVED":
		return "Instalación de Actualizaciones de Seguridad"
	case "WINDOWS_UPDATE_SCHEDULE_REBOOT":
		return "Programación de Reinicio por Actualizaciones"
	case "REBOOT_DEVICE":
		return "Reinicio Controlado del Sistema"
	case "SHUTDOWN_DEVICE":
		return "Apagado Remoto del Sistema"
	case "FLUSH_DNS":
		return "Vaciado de Caché DNS de Red"
	case "RENEW_DHCP":
		return "Renovación de Conexión de Red"
	case "FORCE_SECURITY_SCAN":
		return "Escaneo de Postura de Seguridad"
	case "FORCE_HEARTBEAT", "FORCE_METRICS", "FORCE_INVENTORY", "FORCE_SMART_CHECK", "FORCE_WINDOWS_UPDATE":
		return "Sincronización de Telemetría con el NOC"
	case "RESTART_SERVICE":
		if sName, ok := params["serviceName"].(string); ok && sName != "" {
			return "Reinicio de Servicio: " + sName
		}
		return "Reinicio de Servicio del Sistema"
	case "EXECUTE_POWERSHELL":
		if cmd, ok := params["command"].(string); ok && cmd != "" {
			cmdClean := strings.TrimSpace(cmd)
			if len(cmdClean) > 40 {
				cmdClean = cmdClean[:37] + "..."
			}
			return "Mantenimiento PowerShell: " + cmdClean
		}
		return "Mantenimiento Técnico PowerShell"
	case "EXECUTE_CMD":
		return "Mantenimiento Técnico CMD"
	default:
		return "Mantenimiento Técnico Remoto"
	}
}

// getStateFilePath returns the target state file, falling back to local dir if ProgramData is unavailable
func getStateFilePath() string {
	dir := filepath.Dir(DefaultActionStateFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "active_action.json"
	}
	return DefaultActionStateFile
}

// PublishActionStart registers an action as RUNNING so nanotray can inform the interactive user
func PublishActionStart(action *transport.ActionItem) error {
	path := getStateFilePath()
	friendlyTitle := GetActionFriendlyTitle(action.ActionType, action.Parameters)

	state := ActiveActionState{
		ActionID:   action.ID,
		ActionType: action.ActionType,
		Title:      friendlyTitle,
		Status:     "RUNNING",
		StartedAt:  time.Now().Format(time.RFC3339),
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(path, data, 0600); err != nil {
		return err
	}
	return protectTrayStateACL(path)
}

// PublishActionEnd registers the final status (COMPLETED or FAILED) of an action
func PublishActionEnd(actionID string, actionType string, exitCode int, errStr string) error {
	path := getStateFilePath()
	friendlyTitle := GetActionFriendlyTitle(actionType, nil)

	status := "COMPLETED"
	if exitCode != 0 || errStr != "" {
		status = "FAILED"
	}

	state := ActiveActionState{
		ActionID:   actionID,
		ActionType: actionType,
		Title:      friendlyTitle,
		Status:     status,
		ExitCode:   exitCode,
		Error:      errStr,
		FinishedAt: time.Now().Format(time.RFC3339),
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(path, data, 0600); err != nil {
		return err
	}
	return protectTrayStateACL(path)
}

// ReadActiveAction reads the current state file if it exists
func protectTrayStateACL(path string) error {
	cmd := exec.Command(
		"icacls.exe",
		path,
		"/inheritance:r",
		"/grant:r",
		"*S-1-5-18:F",
		"*S-1-5-32-544:F",
		"*S-1-5-32-545:R",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("protecting tray IPC ACL: %w (%s)", err, string(out))
	}
	return nil
}

func ReadActiveAction() (*ActiveActionState, error) {
	path := getStateFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var state ActiveActionState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}

	return &state, nil
}
