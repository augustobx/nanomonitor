package actions

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

// SchedTriggerHook allows remote actions to trigger internal agent collectors directly
type SchedTriggerHook interface {
	TriggerHeartbeat(ctx context.Context)
	TriggerMetrics(ctx context.Context)
	TriggerSecurity(ctx context.Context)
	TriggerInventory(ctx context.Context)
	TriggerSmart(ctx context.Context)
	TriggerWindowsUpdate(ctx context.Context)
}

// ExecutionResult holds the sanitized output and exit code of a completed action
type ExecutionResult struct {
	ExitCode int
	Output   string
	Error    string
	Result   map[string]interface{}
}

// ExecuteAction executes a validated remote action
func ExecuteAction(ctx context.Context, action *transport.ActionItem, hook SchedTriggerHook) *ExecutionResult {
	switch action.ActionType {
	// ==================== SISTEMA ====================
	case "REBOOT_DEVICE":
		return runCommand(ctx, 30*time.Second, "shutdown.exe", "/r", "/t", "10", "/c", "NanoMonitor Remote Reboot")

	case "SHUTDOWN_DEVICE":
		return runCommand(ctx, 30*time.Second, "shutdown.exe", "/s", "/t", "10", "/c", "NanoMonitor Remote Shutdown")

	// ==================== TELEMETRÍA NANOMONITOR ====================
	case "FORCE_HEARTBEAT":
		if hook != nil {
			hook.TriggerHeartbeat(ctx)
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Ciclo de Heartbeat y Seguridad disparado y sincronizado con éxito.",
		}

	case "FORCE_METRICS":
		if hook != nil {
			hook.TriggerMetrics(ctx)
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Recolección de métricas de rendimiento disparada y sincronizada con éxito.",
		}

	case "FORCE_SECURITY_SCAN":
		if hook != nil {
			hook.TriggerSecurity(ctx)
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Escaneo completo de seguridad (AV + Firewall) disparado y sincronizado con éxito.",
		}

	case "FORCE_INVENTORY":
		if hook != nil {
			hook.TriggerInventory(ctx)
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Recolección de inventario de hardware y software disparada y sincronizada con éxito.",
		}

	case "FORCE_SMART_CHECK":
		if hook != nil {
			hook.TriggerSmart(ctx)
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Comprobación física SMART de discos disparada y sincronizada con éxito.",
		}

	case "FORCE_WINDOWS_UPDATE":
		if hook != nil {
			hook.TriggerWindowsUpdate(ctx)
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Comprobación de Windows Update y reinicios pendientes disparada con éxito.",
		}

	// ==================== WINDOWS DEFENDER ====================
	case "DEFENDER_UPDATE_SIGNATURES":
		return runCommand(ctx, 5*time.Minute, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Update-MpSignature")

	case "DEFENDER_QUICK_SCAN":
		return runCommand(ctx, 10*time.Minute, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Start-MpScan -ScanType QuickScan")

	case "DEFENDER_FULL_SCAN":
		return runCommand(ctx, 30*time.Minute, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Start-MpScan -ScanType FullScan")

	// ==================== RED & CONECTIVIDAD ====================
	case "FLUSH_DNS":
		return runCommand(ctx, 30*time.Second, "ipconfig.exe", "/flushdns")

	case "RENEW_DHCP":
		return runCommand(ctx, 60*time.Second, "ipconfig.exe", "/renew")

	// ==================== INTEGRIDAD WINDOWS ====================
	case "WINDOWS_SFC_SCAN":
		return runCommand(ctx, 20*time.Minute, "sfc.exe", "/scannow")

	case "WINDOWS_DISM_CHECK":
		return runCommand(ctx, 10*time.Minute, "dism.exe", "/online", "/cleanup-image", "/checkhealth")

	case "WINDOWS_CHKDSK_SCAN":
		// Modo diagnóstico / lectura exclusivamente (sin /f ni /r)
		return runCommand(ctx, 10*time.Minute, "chkdsk.exe", "C:")

	// ==================== SERVICIOS WINDOWS ====================
	case "QUERY_SERVICES":
		return executeQueryServices(ctx)

	case "RESTART_SERVICE":
		return executeRestartService(ctx, action)

	default:
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Acción desconocida o no autorizada en el agente: %s", action.ActionType),
		}
	}
}

func executeQueryServices(ctx context.Context) *ExecutionResult {
	var sb strings.Builder
	results := make(map[string]interface{})

	sb.WriteString("Estado de servicios autorizados en whitelist:\n\n")

	for _, canonical := range AllowedServicesWhitelist {
		cmdCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		cmd := exec.CommandContext(cmdCtx, "sc.exe", "query", canonical)
		out, err := cmd.CombinedOutput()
		cancel()

		outStr := strings.TrimSpace(string(out))
		isRunning := strings.Contains(strings.ToUpper(outStr), "RUNNING")
		isStopped := strings.Contains(strings.ToUpper(outStr), "STOPPED")

		state := "UNKNOWN"
		if isRunning {
			state = "RUNNING"
		} else if isStopped {
			state = "STOPPED"
		}

		results[canonical] = state
		if err != nil && !isRunning && !isStopped {
			sb.WriteString(fmt.Sprintf("• %s: NO DISPONIBLE O NO INSTALADO\n", canonical))
		} else {
			sb.WriteString(fmt.Sprintf("• %s: %s\n", canonical, state))
		}
	}

	return &ExecutionResult{
		ExitCode: 0,
		Output:   sb.String(),
		Result:   results,
	}
}

func executeRestartService(ctx context.Context, action *transport.ActionItem) *ExecutionResult {
	svcParam, _ := action.Parameters["serviceName"].(string)
	if svcParam == "" {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    "Parámetro serviceName es requerido para RESTART_SERVICE",
		}
	}

	canonical, ok := IsServiceAllowed(svcParam)
	if !ok {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("El servicio '%s' no pertenece a la whitelist de servicios autorizados", svcParam),
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Iniciando reinicio seguro de servicio Windows: %s\n\n", canonical))

	// Step 1: Detener servicio
	stopRes := runCommand(ctx, 45*time.Second, "net.exe", "stop", canonical)
	sb.WriteString(">>> net stop " + canonical + ":\n")
	sb.WriteString(stopRes.Output)
	sb.WriteString("\n")

	// Pequeña pausa
	time.Sleep(2 * time.Second)

	// Step 2: Iniciar servicio
	startRes := runCommand(ctx, 45*time.Second, "net.exe", "start", canonical)
	sb.WriteString(">>> net start " + canonical + ":\n")
	sb.WriteString(startRes.Output)

	exitCode := 0
	if startRes.ExitCode != 0 {
		exitCode = startRes.ExitCode
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   sb.String(),
		Error:    startRes.Error,
		Result: map[string]interface{}{
			"serviceName": canonical,
			"restarted":   exitCode == 0,
		},
	}
}

// runCommand ejecuta un comando del sistema operativo de forma controlada con timeout y sanitización
func runCommand(ctx context.Context, timeout time.Duration, name string, args ...string) *ExecutionResult {
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, name, args...)

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	err := cmd.Run()

	outputStr := stdoutBuf.String()
	errorStr := stderrBuf.String()

	combined := strings.TrimSpace(outputStr)
	if errorStr != "" {
		if combined != "" {
			combined += "\n\nSTDERR:\n" + strings.TrimSpace(errorStr)
		} else {
			combined = strings.TrimSpace(errorStr)
		}
	}

	// Sanitizar longitud a máx 64KB
	if len(combined) > 65536 {
		combined = combined[:65536] + "\n\n[Salida truncada a 64KB por seguridad...]"
	}

	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = 1
		}
		if combined == "" {
			combined = err.Error()
		}
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   combined,
		Error:    strings.TrimSpace(errorStr),
	}
}
