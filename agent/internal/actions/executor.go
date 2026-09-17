package actions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/patch"
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
	ReportPatches(ctx context.Context, scanResult *patch.ScanResult)
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
		return executeDefenderUpdateSignatures(ctx)

	case "DEFENDER_QUICK_SCAN":
		return executeDefenderScan(ctx, "QuickScan", 10*time.Minute)

	case "DEFENDER_FULL_SCAN":
		return executeDefenderScan(ctx, "FullScan", 60*time.Minute)

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

	// ==================== PARCHES Y ACTUALIZACIONES ====================
	case "WINDOWS_UPDATE_SCAN":
		return executePatchScan(ctx, hook)

	case "WINDOWS_UPDATE_INSTALL_KB", "WINDOWS_UPDATE_INSTALL_APPROVED":
		return executePatchInstall(ctx, action, hook)

	case "WINDOWS_UPDATE_SCHEDULE_REBOOT":
		return executeScheduleReboot(ctx, action)

	// ==================== AUTO-REMEDIACIÓN ====================
	case "CLEAN_TEMP_FILES":
		return executeCleanTempFiles(ctx, hook)

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

func executePatchScan(ctx context.Context, hook SchedTriggerHook) *ExecutionResult {
	res, err := patch.ScanWindowsUpdates(ctx, 10*time.Minute)
	if err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    err.Error(),
		}
	}

	if hook != nil {
		hook.ReportPatches(ctx, res)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Escaneo de Windows Update completado en %d ms.\n\n", res.ScanDurationMs))
	sb.WriteString(fmt.Sprintf("📦 Actualizaciones pendientes encontradas: %d\n", len(res.Patches)))
	sb.WriteString(fmt.Sprintf("🔄 Reinicio del sistema requerido: %v\n", res.RebootPending))
	if res.RebootReason != "" {
		sb.WriteString(fmt.Sprintf("ℹ️ Motivo de reinicio: %s\n", res.RebootReason))
	}

	if len(res.Patches) > 0 {
		sb.WriteString("\nDetalle de parches detectados:\n")
		for i, p := range res.Patches {
			downloadedStr := "Pendiente descarga"
			if p.IsDownloaded {
				downloadedStr = "Descargado"
			}
			rebootStr := "No requiere reinicio"
			if p.RequiresReboot {
				rebootStr = "Requiere reinicio"
			}
			sizeMb := float64(p.SizeBytes) / (1024 * 1024)
			sb.WriteString(fmt.Sprintf("\n%d. [%s / %s] %s\n   %s\n   Estado: %s | %s | Tamaño: %.1f MB\n",
				i+1, p.Category, p.Severity, p.KBArticleID, p.Title,
				downloadedStr, rebootStr, sizeMb))
		}
	} else {
		sb.WriteString("\n✅ El equipo está completamente al día. No se detectaron parches pendientes.")
	}

	return &ExecutionResult{
		ExitCode: 0,
		Output:   sb.String(),
		Result: map[string]interface{}{
			"patches":        res.Patches,
			"rebootPending":  res.RebootPending,
			"rebootReason":   res.RebootReason,
			"scanDurationMs": res.ScanDurationMs,
		},
	}
}

func executePatchInstall(ctx context.Context, action *transport.ActionItem, hook SchedTriggerHook) *ExecutionResult {
	var targetKBs []string
	if rawKBs, ok := action.Parameters["kbArticleIds"]; ok {
		switch v := rawKBs.(type) {
		case []interface{}:
			for _, item := range v {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					targetKBs = append(targetKBs, strings.TrimSpace(s))
				}
			}
		case []string:
			targetKBs = v
		case string:
			if strings.TrimSpace(v) != "" {
				targetKBs = append(targetKBs, strings.TrimSpace(v))
			}
		}
	}

	if len(targetKBs) == 0 {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    "Se requiere al menos un KB (kbArticleIds) para la instalación dirigida",
		}
	}

	res, err := patch.InstallTargetKBs(ctx, targetKBs, 45*time.Minute)
	if err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    err.Error(),
		}
	}

	if hook != nil {
		hook.TriggerWindowsUpdate(ctx)
	}

	exitCode := 0
	if !res.Success {
		exitCode = 1
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   res.Details,
		Result: map[string]interface{}{
			"success":        res.Success,
			"resultCode":     res.ResultCode,
			"rebootRequired": res.RebootRequired,
			"installedCount": res.InstalledCount,
			"targetKBs":      res.TargetKBs,
		},
	}
}

func executeScheduleReboot(ctx context.Context, action *transport.ActionItem) *ExecutionResult {
	delaySec := 300 // default 5 minutos
	if rawDelay, ok := action.Parameters["delaySeconds"]; ok {
		switch v := rawDelay.(type) {
		case float64:
			if int(v) >= 10 {
				delaySec = int(v)
			}
		case int:
			if v >= 10 {
				delaySec = v
			}
		}
	}

	msg := "Reinicio programado por NanoMonitor RMM para aplicar actualizaciones críticas del sistema."
	if rawMsg, ok := action.Parameters["message"].(string); ok && strings.TrimSpace(rawMsg) != "" {
		msg = strings.TrimSpace(rawMsg)
	}

	return runCommand(ctx, 30*time.Second, "shutdown.exe", "/r", "/t", fmt.Sprintf("%d", delaySec), "/c", msg)
}

func executeCleanTempFiles(ctx context.Context, hook SchedTriggerHook) *ExecutionResult {
	sysRoot := os.Getenv("SystemRoot")
	if sysRoot == "" {
		sysRoot = `C:\Windows`
	}
	progData := os.Getenv("ProgramData")
	if progData == "" {
		progData = `C:\ProgramData`
	}

	safeDirs := []string{
		filepath.Join(sysRoot, "Temp"),
		filepath.Join(progData, "Microsoft", "Windows", "WER", "ReportQueue"),
		filepath.Join(progData, "Microsoft", "Windows", "WER", "ReportArchive"),
		filepath.Join(sysRoot, "SoftwareDistribution", "Download"),
	}

	var totalFreedBytes int64
	var totalDeletedFiles int
	var sb strings.Builder
	sb.WriteString("Limpieza segura de archivos temporales del sistema (Auto-Remediation):\n\n")

	oneHourAgo := time.Now().Add(-1 * time.Hour)

	for _, dir := range safeDirs {
		cleanDir := filepath.Clean(dir)

		// Guard rails: strictly verify path prefix to prevent any traversal or deletion of user data
		isUnderSysRoot := strings.HasPrefix(strings.ToLower(cleanDir), strings.ToLower(sysRoot))
		isUnderProgData := strings.HasPrefix(strings.ToLower(cleanDir), strings.ToLower(progData))
		if !isUnderSysRoot && !isUnderProgData {
			continue
		}

		entries, err := os.ReadDir(cleanDir)
		if err != nil {
			continue
		}

		dirFreed := int64(0)
		dirFiles := 0

		for _, entry := range entries {
			fullPath := filepath.Join(cleanDir, entry.Name())
			info, err := entry.Info()
			if err != nil {
				continue
			}

			// Only clean files/folders older than 1 hour (skip active locks)
			if info.ModTime().Before(oneHourAgo) {
				size := info.Size()
				err := os.RemoveAll(fullPath)
				if err == nil {
					dirFreed += size
					dirFiles++
				}
			}
		}

		totalFreedBytes += dirFreed
		totalDeletedFiles += dirFiles
		sb.WriteString(fmt.Sprintf("• %s: %d elementos eliminados (%.2f MB liberados)\n", cleanDir, dirFiles, float64(dirFreed)/(1024*1024)))
	}

	totalMB := float64(totalFreedBytes) / (1024 * 1024)
	sb.WriteString(fmt.Sprintf("\nResultado: %d archivos temporales eliminados, %.2f MB de espacio recuperado.", totalDeletedFiles, totalMB))

	// Trigger immediate inventory to update free space telemetry
	if hook != nil {
		hook.TriggerInventory(ctx)
	}

	return &ExecutionResult{
		ExitCode: 0,
		Output:   sb.String(),
		Result: map[string]interface{}{
			"success":      true,
			"deletedFiles": totalDeletedFiles,
			"freedBytes":   totalFreedBytes,
			"freedMB":      totalMB,
		},
	}
}

// executeDefenderScan runs a Defender scan with pre/post validation to capture real results
func executeDefenderScan(ctx context.Context, scanType string, timeout time.Duration) *ExecutionResult {
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
$out = @{}
try {
    $pre = Get-MpComputerStatus
    $out.preQuickScanStart = $pre.QuickScanStartTime.ToString('o')
    $out.preFullScanStart = $pre.FullScanStartTime.ToString('o')
    $out.antivirusEnabled = [bool]$pre.AntivirusEnabled
    $out.realTimeProtection = [bool]$pre.RealTimeProtectionEnabled
    $out.signatureVersion = $pre.AntivirusSignatureVersion
    $out.signatureLastUpdated = $pre.AntivirusSignatureLastUpdated.ToString('o')

    $scanStart = Get-Date
    Start-MpScan -ScanType %s
    $scanEnd = Get-Date

    Start-Sleep -Seconds 2
    $post = Get-MpComputerStatus

    $out.scanType = '%s'
    $out.scanStarted = $scanStart.ToString('o')
    $out.scanFinished = $scanEnd.ToString('o')
    $out.scanDurationSeconds = [math]::Round(($scanEnd - $scanStart).TotalSeconds, 1)

    if ('%s' -eq 'QuickScan') {
        $out.postScanStart = $post.QuickScanStartTime.ToString('o')
        $out.postScanEnd = $post.QuickScanEndTime.ToString('o')
        $out.scanConfirmed = ($post.QuickScanStartTime -gt $pre.QuickScanStartTime)
    } else {
        $out.postScanStart = $post.FullScanStartTime.ToString('o')
        $out.postScanEnd = $post.FullScanEndTime.ToString('o')
        $out.scanConfirmed = ($post.FullScanStartTime -gt $pre.FullScanStartTime)
    }

    # Check for threats
    try {
        $threats = Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object { $_.InitialDetectionTime -gt $scanStart }
        $out.threatsFound = @($threats).Count
        if ($out.threatsFound -gt 0) {
            $out.threatNames = ($threats | Select-Object -First 5 | ForEach-Object {
                try { (Get-MpThreat -ThreatID $_.ThreatID -ErrorAction SilentlyContinue).ThreatName } catch { 'Unknown' }
            }) -join ', '
        }
    } catch {
        $out.threatsFound = 0
    }

    $out.success = $true
} catch {
    $out.success = $false
    $out.error = $_.Exception.Message
}
$out | ConvertTo-Json -Compress`, scanType, scanType, scanType)

	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	combined := strings.TrimSpace(stdout.String())
	errStr := strings.TrimSpace(stderr.String())

	if err != nil && combined == "" {
		if errStr != "" {
			combined = errStr
		} else {
			combined = err.Error()
		}
	}

	// Try to parse JSON output for structured result
	result := make(map[string]interface{})
	if err := json.Unmarshal([]byte(combined), &result); err == nil {
		// Build human-readable summary
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("Windows Defender %s completado.\n\n", scanType))
		if confirmed, ok := result["scanConfirmed"].(bool); ok && confirmed {
			sb.WriteString("✅ Scan confirmado por Defender.\n")
		}
		if dur, ok := result["scanDurationSeconds"].(float64); ok {
			sb.WriteString(fmt.Sprintf("⏱️ Duración: %.1f segundos\n", dur))
		}
		if threats, ok := result["threatsFound"].(float64); ok {
			if threats > 0 {
				sb.WriteString(fmt.Sprintf("🚨 Amenazas detectadas: %.0f\n", threats))
				if names, ok := result["threatNames"].(string); ok && names != "" {
					sb.WriteString(fmt.Sprintf("   Nombres: %s\n", names))
				}
			} else {
				sb.WriteString("🛡️ Sin amenazas detectadas.\n")
			}
		}
		if sigVer, ok := result["signatureVersion"].(string); ok {
			sb.WriteString(fmt.Sprintf("📋 Versión de firmas: %s\n", sigVer))
		}

		exitCode := 0
		if success, ok := result["success"].(bool); ok && !success {
			exitCode = 1
		}

		return &ExecutionResult{
			ExitCode: exitCode,
			Output:   sb.String(),
			Result:   result,
		}
	}

	// Fallback: return raw output
	exitCode := 0
	if err != nil {
		exitCode = 1
	}
	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   combined,
		Error:    errStr,
	}
}

// executeDefenderUpdateSignatures updates Defender signatures and reports pre/post version
func executeDefenderUpdateSignatures(ctx context.Context) *ExecutionResult {
	script := `$ErrorActionPreference = 'Stop'
$out = @{}
try {
    $pre = Get-MpComputerStatus
    $out.preVersion = $pre.AntivirusSignatureVersion
    $out.preLastUpdated = $pre.AntivirusSignatureLastUpdated.ToString('o')

    Update-MpSignature

    Start-Sleep -Seconds 2
    $post = Get-MpComputerStatus
    $out.postVersion = $post.AntivirusSignatureVersion
    $out.postLastUpdated = $post.AntivirusSignatureLastUpdated.ToString('o')
    $out.updated = ($post.AntivirusSignatureVersion -ne $pre.AntivirusSignatureVersion)
    $out.engineVersion = $post.AMEngineVersion
    $out.success = $true
} catch {
    $out.success = $false
    $out.error = $_.Exception.Message
}
$out | ConvertTo-Json -Compress`

	cmdCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	combined := strings.TrimSpace(stdout.String())
	errStr := strings.TrimSpace(stderr.String())

	if err != nil && combined == "" {
		if errStr != "" {
			combined = errStr
		} else {
			combined = err.Error()
		}
	}

	result := make(map[string]interface{})
	if err := json.Unmarshal([]byte(combined), &result); err == nil {
		var sb strings.Builder
		sb.WriteString("Actualización de firmas de Windows Defender.\n\n")
		if preVer, ok := result["preVersion"].(string); ok {
			sb.WriteString(fmt.Sprintf("📋 Versión anterior: %s\n", preVer))
		}
		if postVer, ok := result["postVersion"].(string); ok {
			sb.WriteString(fmt.Sprintf("📋 Versión actual:   %s\n", postVer))
		}
		if updated, ok := result["updated"].(bool); ok {
			if updated {
				sb.WriteString("✅ Firmas actualizadas exitosamente.\n")
			} else {
				sb.WriteString("ℹ️ Las firmas ya estaban al día.\n")
			}
		}
		if engine, ok := result["engineVersion"].(string); ok {
			sb.WriteString(fmt.Sprintf("⚙️ Motor AM: %s\n", engine))
		}

		exitCode := 0
		if success, ok := result["success"].(bool); ok && !success {
			exitCode = 1
		}

		return &ExecutionResult{
			ExitCode: exitCode,
			Output:   sb.String(),
			Result:   result,
		}
	}

	exitCode := 0
	if err != nil {
		exitCode = 1
	}
	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   combined,
		Error:    errStr,
	}
}


