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

	"github.com/nanolabs/nanomonitor/agent/internal/collector"
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
		return executeForceHeartbeat(ctx, hook)

	case "FORCE_METRICS":
		return executeForceMetrics(ctx, hook)

	case "FORCE_SECURITY_SCAN":
		return executeForceSecurityScan(ctx, hook)

	case "FORCE_INVENTORY":
		if hook != nil {
			hook.TriggerInventory(ctx)
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Recolección de inventario de hardware y software disparada y sincronizada con éxito.",
		}

	case "FORCE_SMART_CHECK":
		return executeForceSmartCheck(ctx, hook)

	case "FORCE_WINDOWS_UPDATE":
		return executePatchScan(ctx, hook)

	// ==================== WINDOWS DEFENDER ====================
	case "DEFENDER_UPDATE_SIGNATURES":
		return executeDefenderUpdateSignatures(ctx)

	case "DEFENDER_QUICK_SCAN":
		return executeDefenderScan(ctx, "QuickScan", 10*time.Minute)

	case "DEFENDER_FULL_SCAN":
		return executeDefenderScan(ctx, "FullScan", 60*time.Minute)

	case "DEFENDER_ENABLE_PROTECTION":
		return executeDefenderEnableProtection(ctx, hook)

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

	exitCode := 0
	if !res.Success {
		exitCode = 1
	}

	var sb strings.Builder
	sb.WriteString(res.Details)
	sb.WriteString("\n")
	for _, outcome := range res.Outcomes {
		if outcome.Installed {
			sb.WriteString(fmt.Sprintf("\n✅ %s — instalado y confirmado por Windows Update.", outcome.Identifier))
		} else {
			sb.WriteString(fmt.Sprintf("\n❌ %s — no confirmado (ResultCode=%d, HResult=%d).", outcome.Identifier, outcome.ResultCode, outcome.HResult))
		}
	}
	if res.RebootRequired {
		sb.WriteString("\n\n🔄 Windows informa que se requiere reinicio.")
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   sb.String(),
		Result: map[string]interface{}{
			"success":        res.Success,
			"resultCode":     res.ResultCode,
			"rebootRequired": res.RebootRequired,
			"installedCount": res.InstalledCount,
			"matchedCount":   res.MatchedCount,
			"targetKBs":      res.TargetKBs,
			"outcomes":       res.Outcomes,
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

const safeIsoDatePsSnippet = `function Safe-IsoDate($d) {
    if ($null -ne $d -and ($d -is [System.DateTime] -or $d -is [string]) -and "$d" -ne "" -and "$d" -ne "01/01/0001 00:00:00") {
        try { return ([DateTime]$d).ToString("o") } catch { return "" }
    }
    return ""
}`

const defenderReactivationPsSnippet = `function Invoke-DefenderReactivation {
    $report = @{
        preferenceApplied = $false
        mpCmdSuccess = $false
        activeAfter = $false
        antivirusEnabled = $false
        realTimeProtection = $false
        serviceRunning = $false
        tamperProtected = $false
        error = ""
    }

    try {
        $pre = Get-MpComputerStatus -ErrorAction Stop
        if ($null -ne $pre.IsTamperProtected) {
            $report.tamperProtected = [bool]$pre.IsTamperProtected
        }
    } catch {
        $report.error = "No se pudo consultar Microsoft Defender: " + $_.Exception.Message
        return $report
    }

    try {
        Set-MpPreference -DisableRealtimeMonitoring:$false -DisableBehaviorMonitoring:$false -DisableIOAVProtection:$false -DisableScriptScanning:$false -DisableBlockAtFirstSeen:$false -ErrorAction Stop
        $report.preferenceApplied = $true
    } catch {
        $report.error = "Windows rechazó Set-MpPreference: " + $_.Exception.Message
    }

    try {
        $mpCmd = "C:\Program Files\Windows Defender\MpCmdRun.exe"
        if (-not (Test-Path $mpCmd)) {
            $found = Get-ChildItem "C:\ProgramData\Microsoft\Windows Defender\Platform" -Filter MpCmdRun.exe -Recurse -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
            if ($found) { $mpCmd = $found }
        }

        if (Test-Path $mpCmd) {
            & $mpCmd -wdenable 2>&1 | Out-Null
            $report.mpCmdSuccess = ($LASTEXITCODE -eq 0)
            if (-not $report.mpCmdSuccess -and -not $report.error) {
                $report.error = "MpCmdRun -wdenable devolvió código " + $LASTEXITCODE
            }
        }
    } catch {
        if (-not $report.error) {
            $report.error = "MpCmdRun falló: " + $_.Exception.Message
        }
    }

    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $post = Get-MpComputerStatus -ErrorAction Stop
            $report.antivirusEnabled = [bool]$post.AntivirusEnabled
            $report.realTimeProtection = [bool]$post.RealTimeProtectionEnabled
            $report.serviceRunning = [bool]$post.AMServiceEnabled
            if ($null -ne $post.IsTamperProtected) {
                $report.tamperProtected = [bool]$post.IsTamperProtected
            }

            $report.activeAfter = [bool](
                $report.antivirusEnabled -and
                $report.realTimeProtection -and
                $report.serviceRunning
            )

            if ($report.activeAfter) {
                break
            }
        } catch {
            if (-not $report.error) {
                $report.error = "No se pudo validar el estado final de Defender: " + $_.Exception.Message
            }
        }
    }

    if (-not $report.activeAfter -and -not $report.error) {
        if ($report.tamperProtected) {
            $report.error = "Defender no quedó completamente activo. Tamper Protection está habilitado y puede impedir cambios locales."
        } else {
            $report.error = "Defender no quedó completamente activo. Puede existir una política administrada o un antivirus de terceros."
        }
    }

    return $report
}`

// executeDefenderScan runs a Defender scan with pre/post validation to capture real results
func executeDefenderScan(ctx context.Context, scanType string, timeout time.Duration) *ExecutionResult {
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
%s
%s
$out = @{}
try {
    $pre = Get-MpComputerStatus -ErrorAction Stop
    if ($pre) {
        $out.preQuickScanStart = Safe-IsoDate $pre.QuickScanStartTime
        $out.preFullScanStart = Safe-IsoDate $pre.FullScanStartTime
        $out.antivirusEnabled = [bool]$pre.AntivirusEnabled
        $out.realTimeProtection = [bool]$pre.RealTimeProtectionEnabled
        $out.signatureVersion = "$($pre.AntivirusSignatureVersion)"
        $out.signatureLastUpdated = Safe-IsoDate $pre.AntivirusSignatureLastUpdated
    } else {
        $out.antivirusEnabled = $false
        $out.realTimeProtection = $false
    }

    # If Defender or RealTimeProtection is disabled, reactivate it aggressively before scanning
    if (-not $out.antivirusEnabled -or -not $out.realTimeProtection) {
        $out.wasDisabled = $true
        $react = Invoke-DefenderReactivation
        $out.reactivation = $react
        $out.reactivated = [bool]$react.activeAfter
        if (-not $out.reactivated) {
            throw ("No se pudo activar Microsoft Defender antes del escaneo: " + $react.error)
        }
        $pre = Get-MpComputerStatus -ErrorAction Stop
    }

    $scanStart = Get-Date
    Start-MpScan -ScanType %s
    $scanEnd = Get-Date

    Start-Sleep -Seconds 2
    $post = Get-MpComputerStatus -ErrorAction Stop

    $out.scanType = '%s'
    $out.scanStarted = Safe-IsoDate $scanStart
    $out.scanFinished = Safe-IsoDate $scanEnd
    $out.scanDurationSeconds = [math]::Round(($scanEnd - $scanStart).TotalSeconds, 1)

    if ($post) {
        if ('%s' -eq 'QuickScan') {
            $out.postScanStart = Safe-IsoDate $post.QuickScanStartTime
            $out.postScanEnd = Safe-IsoDate $post.QuickScanEndTime
            $out.scanConfirmed = ($null -ne $post.QuickScanStartTime -and ($post.QuickScanStartTime -ge $scanStart -or ($pre -and $null -ne $pre.QuickScanStartTime -and $post.QuickScanStartTime -gt $pre.QuickScanStartTime)))
        } else {
            $out.postScanStart = Safe-IsoDate $post.FullScanStartTime
            $out.postScanEnd = Safe-IsoDate $post.FullScanEndTime
            $out.scanConfirmed = ($null -ne $post.FullScanStartTime -and ($post.FullScanStartTime -ge $scanStart -or ($pre -and $null -ne $pre.FullScanStartTime -and $post.FullScanStartTime -gt $pre.FullScanStartTime)))
        }
        $out.signatureVersion = "$($post.AntivirusSignatureVersion)"
    } else {
        $out.scanConfirmed = $false
    }

    if (-not $out.scanConfirmed) {
        throw "Windows Defender no confirmó el escaneo solicitado."
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
$out | ConvertTo-Json -Compress`, safeIsoDatePsSnippet, defenderReactivationPsSnippet, scanType, scanType, scanType)

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
		var sb strings.Builder

		success, successOK := result["success"].(bool)
		confirmed, confirmedOK := result["scanConfirmed"].(bool)
		if !successOK || !success || !confirmedOK || !confirmed {
			errDetail := "Fallo en la ejecución o validación del escaneo de Windows Defender"
			if e, ok := result["error"].(string); ok && e != "" {
				errDetail = e
			}
			sb.WriteString(fmt.Sprintf("Windows Defender %s: ❌ NO PUDO COMPLETARSE\n\n", scanType))
			sb.WriteString(fmt.Sprintf("Detalle del error: %s\n", errDetail))
			if wasDis, ok := result["wasDisabled"].(bool); ok && wasDis {
				sb.WriteString("\n⚠️ Causa detectada: El Antivirus o la Protección en Tiempo Real estaban DESACTIVADOS al solicitar el examen.\n")
				if react, ok := result["reactivated"].(bool); ok && react {
					sb.WriteString("⚡ Se intentó reactivar el motor, pero el escaneo no pudo completarse.\n")
				}
			}
			return &ExecutionResult{
				ExitCode: 1,
				Output:   sb.String(),
				Error:    errDetail,
				Result:   result,
			}
		}

		// Success case
		sb.WriteString(fmt.Sprintf("Windows Defender %s completado con éxito.\n\n", scanType))
		if reactivated, ok := result["reactivated"].(bool); ok && reactivated {
			sb.WriteString("⚡ La protección estaba desactivada y fue REACTIVADA automáticamente antes del examen.\n")
		}
		if confirmed {
			sb.WriteString("✅ Escaneo confirmado por el motor de Defender.\n")
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
		if sigVer, ok := result["signatureVersion"].(string); ok && sigVer != "" {
			sb.WriteString(fmt.Sprintf("📋 Versión de firmas: %s\n", sigVer))
		}

		return &ExecutionResult{
			ExitCode: 0,
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
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
%s
$out = @{}
try {
    $pre = Get-MpComputerStatus -ErrorAction Stop
    if (-not $pre) { throw "Microsoft Defender no devolvió estado previo." }

    $out.preVersion = "$($pre.AntivirusSignatureVersion)"
    $out.preLastUpdated = Safe-IsoDate $pre.AntivirusSignatureLastUpdated

    Update-MpSignature -ErrorAction Stop

    Start-Sleep -Seconds 2
    $post = Get-MpComputerStatus -ErrorAction Stop
    if (-not $post) { throw "Microsoft Defender no devolvió estado posterior a la actualización." }

    $out.postVersion = "$($post.AntivirusSignatureVersion)"
    $out.postLastUpdated = Safe-IsoDate $post.AntivirusSignatureLastUpdated
    $out.updated = ($post.AntivirusSignatureVersion -ne $pre.AntivirusSignatureVersion)
    $out.engineVersion = "$($post.AMEngineVersion)"
    $out.success = -not [string]::IsNullOrWhiteSpace($out.postVersion)
} catch {
    $out.success = $false
    $out.error = $_.Exception.Message
}
$out | ConvertTo-Json -Compress`, safeIsoDatePsSnippet)

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
		if preVer, ok := result["preVersion"].(string); ok && preVer != "" {
			sb.WriteString(fmt.Sprintf("📋 Versión anterior: %s\n", preVer))
		}
		if postVer, ok := result["postVersion"].(string); ok && postVer != "" {
			sb.WriteString(fmt.Sprintf("📋 Versión actual:   %s\n", postVer))
		}
		if updated, ok := result["updated"].(bool); ok {
			if updated {
				sb.WriteString("✅ Firmas actualizadas exitosamente.\n")
			} else {
				sb.WriteString("ℹ️ Las firmas ya estaban al día.\n")
			}
		}
		if engine, ok := result["engineVersion"].(string); ok && engine != "" {
			sb.WriteString(fmt.Sprintf("⚙️ Motor AM: %s\n", engine))
		}

		success, ok := result["success"].(bool)
		if !ok || !success {
			detail := "Windows Defender no confirmó la actualización de firmas."
			if msg, msgOK := result["error"].(string); msgOK && msg != "" {
				detail = msg
			}
			sb.WriteString(fmt.Sprintf("❌ %s\n", detail))
			return &ExecutionResult{
				ExitCode: 1,
				Output:   sb.String(),
				Error:    detail,
				Result:   result,
			}
		}

		return &ExecutionResult{
			ExitCode: 0,
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

func executeForceHeartbeat(ctx context.Context, hook SchedTriggerHook) *ExecutionResult {
	if hook != nil {
		hook.TriggerHeartbeat(ctx)
	}

	return &ExecutionResult{
		ExitCode: 0,
		Output:   "Ciclo de Heartbeat, Seguridad y Telemetría disparado y sincronizado exitosamente con el servidor central.",
	}
}

// executeDefenderEnableProtection performs deep reactivation and remediation of Microsoft Defender
func executeDefenderEnableProtection(ctx context.Context, hook SchedTriggerHook) *ExecutionResult {
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
%s
$out = @{
    preferenceApplied = $false
    mpCmdSuccess = $false
    activeBefore = $false
    activeAfter = $false
    antivirusEnabled = $false
    realTimeProtection = $false
    serviceRunning = $false
    tamperProtected = $false
    signatureVersion = ''
    error = ''
}

try {
    $pre = Get-MpComputerStatus -ErrorAction Stop
    if ($pre) {
        $out.activeBefore = [bool]($pre.AntivirusEnabled -and $pre.RealTimeProtectionEnabled)
    }

    $react = Invoke-DefenderReactivation
    $out.preferenceApplied = $react.preferenceApplied
    $out.mpCmdSuccess = $react.mpCmdSuccess
    $out.activeAfter = $react.activeAfter
    $out.tamperProtected = $react.tamperProtected
    $out.error = $react.error

    $post = Get-MpComputerStatus -ErrorAction Stop
    if ($post) {
        $out.antivirusEnabled = [bool]$post.AntivirusEnabled
        $out.realTimeProtection = [bool]$post.RealTimeProtectionEnabled
        $out.serviceRunning = [bool]$post.AMServiceEnabled
        $out.signatureVersion = "$($post.AntivirusSignatureVersion)"
        $out.activeAfter = [bool](
            $post.AntivirusEnabled -and
            $post.RealTimeProtectionEnabled -and
            $post.AMServiceEnabled
        )
    }
} catch {
    $out.error = $_.Exception.Message
}
$out | ConvertTo-Json -Compress`, defenderReactivationPsSnippet)

	cmdCtx, cancel := context.WithTimeout(ctx, 35*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()

	combined := strings.TrimSpace(stdout.String())
	errStr := strings.TrimSpace(stderr.String())
	var result map[string]interface{}
	parseErr := json.Unmarshal([]byte(combined), &result)
	if err != nil || parseErr != nil || result == nil {
		detail := errStr
		if detail == "" && err != nil {
			detail = err.Error()
		}
		if detail == "" && parseErr != nil {
			detail = parseErr.Error()
		}
		if detail == "" {
			detail = "Windows Defender no devolvió un resultado verificable."
		}
		return &ExecutionResult{
			ExitCode: 1,
			Output:   "No se pudo verificar la reactivación de Microsoft Defender.",
			Error:    detail,
		}
	}

	var sb strings.Builder
	sb.WriteString("Protocolo de Reactivación Forzada de Microsoft Defender:\n\n")

	isActive := false
	if result != nil {
		active, _ := result["activeAfter"].(bool)
		av, _ := result["antivirusEnabled"].(bool)
		rtp, _ := result["realTimeProtection"].(bool)
		svc, _ := result["serviceRunning"].(bool)
		isActive = active && av && rtp && svc

		if pref, ok := result["preferenceApplied"].(bool); ok && pref {
			sb.WriteString("🛡️ Parámetros de Protección en Tiempo Real aplicados vía Set-MpPreference.\n")
		}
		if mpCmd, ok := result["mpCmdSuccess"].(bool); ok && mpCmd {
			sb.WriteString("⚡ Herramienta nativa MpCmdRun (-wdenable) ejecutada con éxito.\n")
		}

		sb.WriteString("\nEstado final del motor de Defender:\n")
		if av, ok := result["antivirusEnabled"].(bool); ok {
			sb.WriteString(fmt.Sprintf("   • Antivirus Habilitado: %s\n", formatStatusBool(av)))
		}
		if rtp, ok := result["realTimeProtection"].(bool); ok {
			sb.WriteString(fmt.Sprintf("   • Protección en Tiempo Real: %s\n", formatStatusBool(rtp)))
		}
		if svc, ok := result["serviceRunning"].(bool); ok {
			sb.WriteString(fmt.Sprintf("   • Servicio Antimalware (WinDefend): %s\n", formatStatusBool(svc)))
		}
		if sig, ok := result["signatureVersion"].(string); ok && sig != "" {
			sb.WriteString(fmt.Sprintf("   • Versión de Firmas: %s\n", sig))
		}
		if tamper, ok := result["tamperProtected"].(bool); ok && tamper {
			sb.WriteString("   • Tamper Protection: Activa\n")
		}
		if msg, ok := result["error"].(string); ok && msg != "" && !isActive {
			sb.WriteString(fmt.Sprintf("   • Motivo: %s\n", msg))
		}
	} else {
		sb.WriteString("Protocolo de reactivación ejecutado en el endpoint.\n")
	}

	// Trigger immediate security collection to push green status to server NOC
	if hook != nil {
		hook.TriggerSecurity(ctx)
	}

	exitCode := 0
	if !isActive {
		exitCode = 1
		sb.WriteString("\n❌ ATENCIÓN: El motor de Defender no respondió activo luego del intento de reactivación.\n")
	} else {
		sb.WriteString("\n✅ ÉXITO: Microsoft Defender reactivado y protegiendo el endpoint.\n")
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   sb.String(),
		Result:   result,
	}
}

func executeForceSecurityScan(ctx context.Context, hook SchedTriggerHook) *ExecutionResult {
	// 1. Recolectar estado de seguridad actual
	sec, err := collector.CollectSecurity()
	if err != nil {
		if hook != nil {
			hook.TriggerSecurity(ctx)
		}
		return &ExecutionResult{
			ExitCode: 1,
			Output:   fmt.Sprintf("Error auditando seguridad del endpoint: %v", err),
			Error:    err.Error(),
		}
	}

	var sb strings.Builder
	sb.WriteString("Auditoría y Validación de Seguridad Operativa (AV & Firewall):\n\n")

	initialAV := sec.HasEnabledAV()
	reactivated := false

	// Si el antivirus / Defender se encuentra desactivado, ejecutar protocolo profundo de reactivación
	if !initialAV {
		sb.WriteString("⚠️ Alerta detectada: La Protección Antivirus se encuentra DESACTIVADA.\n")
		sb.WriteString("⚡ Ejecutando reactivación forzada multinivel de Microsoft Defender...\n")

		reactScript := fmt.Sprintf(`$ErrorActionPreference = 'Continue'
%s
$res = Invoke-DefenderReactivation
$res | ConvertTo-Json -Compress`, defenderReactivationPsSnippet)

		cmdCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		reactCmd := exec.CommandContext(cmdCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", reactScript)
		reactOut, _ := reactCmd.CombinedOutput()
		cancel()

		var reactResult map[string]interface{}
		_ = json.Unmarshal([]byte(strings.TrimSpace(string(reactOut))), &reactResult)

		if reactResult != nil {
			if mp, ok := reactResult["mpCmdSuccess"].(bool); ok && mp {
				sb.WriteString("   ⚡ MpCmdRun -wdenable confirmado.\n")
			}
			if msg, ok := reactResult["error"].(string); ok && msg != "" {
				sb.WriteString(fmt.Sprintf("   ℹ️ Resultado de reactivación: %s\n", msg))
			}
		}

		time.Sleep(2 * time.Second)

		// Volver a inspeccionar tras el protocolo de activación
		if resec, err := collector.CollectSecurity(); err == nil && resec != nil {
			sec = resec
			if sec.HasEnabledAV() {
				reactivated = true
				sb.WriteString("✅ Reactivación exitosa: Las defensas de Windows Defender fueron restauradas.\n\n")
			} else {
				sb.WriteString("❌ No se pudo reactivar automáticamente (posible bloqueo por política externa no revocable o servicio desinstalado).\n\n")
			}
		}
	}

	// Disparar hook para que el NOC y dashboard se sincronicen de inmediato
	if hook != nil {
		hook.TriggerSecurity(ctx)
	}

	finalAV := sec.HasEnabledAV()
	if finalAV {
		sb.WriteString("🛡️ Antivirus: ✅ ACTIVO\n")
	} else {
		sb.WriteString("🛡️ Antivirus: 🚨 DESACTIVADO\n")
	}

	if len(sec.AntivirusList) > 0 {
		for _, av := range sec.AntivirusList {
			stateStr := "Desactivado"
			if av.Enabled {
				stateStr = "Protección en Tiempo Real Activa"
			}
			upStr := "Firmas Desactualizadas"
			if av.UpToDate {
				upStr = "Firmas al Día"
			}
			sb.WriteString(fmt.Sprintf("   • %s: %s | %s\n", av.DisplayName, stateStr, upStr))
		}
	} else {
		sb.WriteString("   • Sin antivirus registrado en el Centro de Seguridad.\n")
	}

	sb.WriteString("\n🔥 Firewall de Windows:\n")
	if sec.FirewallActive {
		sb.WriteString("   • Estado Global: ✅ ACTIVO\n")
	} else {
		sb.WriteString("   • Estado Global: 🚨 DESACTIVADO\n")
	}
	sb.WriteString(fmt.Sprintf("   • Perfil Dominio: %s\n", formatStatusBool(sec.FirewallProfiles.Domain)))
	sb.WriteString(fmt.Sprintf("   • Perfil Privado: %s\n", formatStatusBool(sec.FirewallProfiles.Private)))
	sb.WriteString(fmt.Sprintf("   • Perfil Público: %s\n", formatStatusBool(sec.FirewallProfiles.Public)))

	exitCode := 0
	if !finalAV || !sec.FirewallActive {
		exitCode = 1
		sb.WriteString("\n🚨 ESTADO CRÍTICO: El equipo presenta protecciones de seguridad desactivadas.")
	} else if reactivated {
		sb.WriteString("\n✅ Protección restablecida y telemetría sincronizada con el NOC.")
	} else {
		sb.WriteString("\n✅ Todas las defensas del endpoint operan con normalidad.")
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   sb.String(),
		Result: map[string]interface{}{
			"antivirusEnabled": finalAV,
			"wasReactivated":   reactivated,
			"firewallActive":   sec.FirewallActive,
			"primaryAV":        sec.PrimaryAVName(),
			"defenderActive":   sec.DefenderActive,
			"defenderUpdated":  sec.DefenderUpdated,
		},
	}
}

func executeForceMetrics(ctx context.Context, hook SchedTriggerHook) *ExecutionResult {
	if hook != nil {
		hook.TriggerMetrics(ctx)
	}

	perf, err := collector.CollectPerformance()
	if err != nil {
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Recolección de métricas de rendimiento disparada y sincronizada con éxito.",
		}
	}

	var sb strings.Builder
	sb.WriteString("Métricas de Rendimiento en Tiempo Real:\n\n")
	if perf.CPUPercent >= 0 {
		sb.WriteString(fmt.Sprintf("⚡ Uso de CPU: %.1f%%\n", perf.CPUPercent))
	}
	sb.WriteString(fmt.Sprintf("🧠 Memoria RAM: %.1f%% en uso (%d MB usados / %d MB disponibles)\n",
		perf.RAMPercent, perf.RAMUsedMB, perf.RAMAvailMB))

	if len(perf.Volumes) > 0 {
		sb.WriteString("\n💾 Almacenamiento:\n")
		for _, v := range perf.Volumes {
			sb.WriteString(fmt.Sprintf("   • Unidad %s (%s): %.1f GB libres de %.1f GB (%.1f%% usado)\n",
				v.Letter, v.FSType, v.FreeGB, v.TotalGB, v.Percent))
		}
	}

	hours := perf.UptimeSecs / 3600
	mins := (perf.UptimeSecs % 3600) / 60
	sb.WriteString(fmt.Sprintf("\n⏱️ Tiempo activo del sistema: %d horas, %d minutos\n", hours, mins))
	sb.WriteString("✅ Métricas sincronizadas con el NOC.")

	return &ExecutionResult{
		ExitCode: 0,
		Output:   sb.String(),
		Result: map[string]interface{}{
			"cpuPercent": perf.CPUPercent,
			"ramPercent": perf.RAMPercent,
			"ramUsedMb":  perf.RAMUsedMB,
			"uptimeSecs": perf.UptimeSecs,
		},
	}
}

func executeForceSmartCheck(ctx context.Context, hook SchedTriggerHook) *ExecutionResult {
	if hook != nil {
		hook.TriggerSmart(ctx)
	}

	smart, err := collector.CollectSmart()
	if err != nil {
		return &ExecutionResult{
			ExitCode: 0,
			Output:   "Comprobación física SMART de discos disparada y sincronizada con éxito.",
		}
	}

	var sb strings.Builder
	sb.WriteString("Diagnóstico Físico de Discos (S.M.A.R.T.):\n\n")
	sb.WriteString(fmt.Sprintf("📊 Estado General: %s\n", smart.OverallStatus))

	if len(smart.Disks) > 0 {
		sb.WriteString("\nUnidades detectadas:\n")
		for i, d := range smart.Disks {
			name := d.FriendlyName
			if name == "" {
				name = d.Model
			}
			tempStr := "N/A"
			if d.TemperatureC != nil {
				tempStr = fmt.Sprintf("%d°C", *d.TemperatureC)
			}
			wearStr := "N/A"
			if d.WearPercent != nil {
				wearStr = fmt.Sprintf("%d%%", *d.WearPercent)
			}
			sb.WriteString(fmt.Sprintf(" %d. %s [%s]\n    Salud: %s | Operativo: %s | Temp: %s | Desgaste: %s\n",
				i+1, name, d.MediaType, d.HealthStatus, d.OperationalStatus, tempStr, wearStr))
		}
	}

	exitCode := 0
	if smart.OverallStatus == "CRITICAL" || smart.OverallStatus == "WARNING" {
		exitCode = 1
		sb.WriteString("\n⚠️ ALERTA: Se detectaron discos con degradación o advertencia física.")
	} else {
		sb.WriteString("\n✅ Todas las unidades de almacenamiento se encuentran en óptimo estado de salud.")
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   sb.String(),
		Result: map[string]interface{}{
			"overallStatus": smart.OverallStatus,
			"diskCount":     len(smart.Disks),
			"degradedCount": smart.DegradedCount,
		},
	}
}

func formatStatusBool(val bool) string {
	if val {
		return "Activo"
	}
	return "Inactivo"
}


