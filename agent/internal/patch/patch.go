package patch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// PatchItem represents a discovered or installed Windows update
type PatchItem struct {
	Title          string   `json:"title"`
	KBArticleID    string   `json:"kbArticleId"`
	AllKBs         []string `json:"allKBs"`
	UpdateID       string   `json:"updateId,omitempty"`
	Category       string   `json:"category"`
	Severity       string   `json:"severity"`
	IsDownloaded   bool     `json:"isDownloaded"`
	RequiresReboot bool     `json:"requiresReboot"`
	SizeBytes      int64    `json:"sizeBytes"`
	Status         string   `json:"status,omitempty"`
	LastOperation  string   `json:"lastOperation,omitempty"`
	LastResultCode int      `json:"lastResultCode,omitempty"`
	LastHResult    string   `json:"lastHResult,omitempty"`
	LastAttemptAt  string   `json:"lastAttemptAt,omitempty"`
}

// ScanResult contains discovered updates and system reboot status
type ScanResult struct {
	Patches        []PatchItem `json:"patches"`
	RebootPending  bool        `json:"rebootPending"`
	RebootReason   string      `json:"rebootReason,omitempty"`
	ScanDurationMs int64       `json:"scanDurationMs"`
}

// InstallResult represents the outcome of a patch installation action
type PatchInstallOutcome struct {
	Identifier string `json:"identifier"`
	Title      string `json:"title"`
	ResultCode int    `json:"resultCode"`
	HResult    int64  `json:"hResult"`
	Downloaded bool   `json:"downloaded"`
	Installed  bool   `json:"installed"`
}

type PatchDownloadOutcome struct {
	Identifier string `json:"identifier"`
	Title      string `json:"title"`
	ResultCode int    `json:"resultCode"`
	HResult    int64  `json:"hResult"`
	Downloaded bool   `json:"downloaded"`
}

type DownloadResult struct {
	Success         bool                   `json:"success"`
	ResultCode      int                    `json:"resultCode"`
	DownloadedCount int                    `json:"downloadedCount"`
	MatchedCount    int                    `json:"matchedCount"`
	TargetKBs       []string               `json:"targetKBs"`
	Outcomes        []PatchDownloadOutcome `json:"outcomes"`
	Details         string                 `json:"details"`
}

type InstallResult struct {
	Success        bool                  `json:"success"`
	ResultCode     int                   `json:"resultCode"`
	RebootRequired bool                  `json:"rebootRequired"`
	InstalledCount int                   `json:"installedCount"`
	MatchedCount   int                   `json:"matchedCount"`
	TargetKBs      []string              `json:"targetKBs"`
	Outcomes       []PatchInstallOutcome `json:"outcomes"`
	Details        string                `json:"details"`
}

// UnmarshalJSON implements custom JSON decoding for ScanResult to handle both array and single-object patches from PowerShell
func (r *ScanResult) UnmarshalJSON(data []byte) error {
	type Alias ScanResult
	aux := struct {
		Patches json.RawMessage `json:"patches"`
		*Alias
	}{
		Alias: (*Alias)(r),
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	if len(aux.Patches) == 0 || string(aux.Patches) == "null" {
		r.Patches = []PatchItem{}
		return nil
	}
	// Try slice first
	if err := json.Unmarshal(aux.Patches, &r.Patches); err == nil {
		return nil
	}
	// Fallback to single object if PowerShell serialized 1 item as an object
	var single PatchItem
	if err := json.Unmarshal(aux.Patches, &single); err == nil {
		r.Patches = []PatchItem{single}
		return nil
	}
	r.Patches = []PatchItem{}
	return nil
}

// ScanWindowsUpdates actively scans for pending updates via Windows Update Session
func ScanWindowsUpdates(ctx context.Context, timeout time.Duration) (*ScanResult, error) {
	startTime := time.Now()

	// PowerShell script using native Microsoft.Update.Session COM
	script := `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $SearchResult = $Searcher.Search("IsInstalled=0 and IsHidden=0")

    $historyById = @{}
    try {
        $historyCount = [Math]::Min([int]$Searcher.GetTotalHistoryCount(), 250)
        if ($historyCount -gt 0) {
            $history = $Searcher.QueryHistory(0, $historyCount)
            foreach ($h in $history) {
                $hid = ""
                try { $hid = "$($h.UpdateIdentity.UpdateID)".ToUpperInvariant() } catch {}
                if (-not $hid) { continue }
                $existing = $historyById[$hid]
                if ($null -eq $existing -or $h.Date -gt $existing.date) {
                    $op = switch ([int]$h.Operation) {
                        1 { "INSTALL" }
                        2 { "UNINSTALL" }
                        default { "OTHER" }
                    }
                    $historyById[$hid] = [PSCustomObject]@{
                        date = $h.Date
                        operation = $op
                        resultCode = [int]$h.ResultCode
                        hResult = [long]$h.HResult
                    }
                }
            }
        }
    } catch {}

    $list = @()
    foreach ($u in $SearchResult.Updates) {
        $kbs = @()
        foreach ($kb in $u.KBArticleIDs) { $kbs += "KB$kb" }
        $updateId = if ($u.Identity.UpdateID) { $u.Identity.UpdateID.ToUpperInvariant() } else { "" }
        $mainKB = if ($kbs.Count -gt 0) { $kbs[0] } else {
            if ($updateId) { "WU:" + $updateId } else { "WU:UNKNOWN" }
        }

        $last = if ($updateId -and $historyById.ContainsKey($updateId)) { $historyById[$updateId] } else { $null }
        $status = if ([bool]$u.IsDownloaded) { "DOWNLOADED" } else { "PENDING_DOWNLOAD" }
        if (-not [bool]$u.IsDownloaded -and $null -ne $last -and ($last.resultCode -eq 4 -or $last.resultCode -eq 5)) {
            $status = "FAILED"
        }
        
        $cat = "OTHER"
        $sev = "UNSPECIFIED"
        if ($u.MsrcSeverity) {
            $sev = $u.MsrcSeverity.ToUpper()
            if ($sev -eq "CRITICAL") { $cat = "CRITICAL" }
            else { $cat = "SECURITY" }
        }

        foreach ($c in $u.Categories) {
            $cName = $c.Name.ToLowerInvariant()
            if ($cat -eq "OTHER") {
                if ($cName -match "critical|crítica|critica") { $cat = "CRITICAL" }
                elseif ($cName -match "security|seguridad") { $cat = "SECURITY" }
                elseif ($cName -match "driver|controlador") { $cat = "DRIVER" }
                elseif ($cName -match "feature|característica|caracteristica") { $cat = "FEATURE_UPDATE" }
                elseif ($cName -match "update|actualización|actualizacion") { $cat = "IMPORTANT" }
            }
        }

        # WUA sometimes exposes a Feature Update with KBArticleIDs that belong to
        # servicing payloads rather than the update identity itself. Avoid pairing
        # a Feature Update title with an unrelated KB by using the stable WU UpdateID.
        $titleLower = "$($u.Title)".ToLowerInvariant()
        if ($cat -eq "OTHER" -and $titleLower -match "feature update|actualización de características|actualizacion de caracteristicas") {
            $cat = "FEATURE_UPDATE"
        }
        if ($cat -eq "FEATURE_UPDATE" -and $updateId) {
            $mainKB = "WU:" + $updateId
        }

        if ($sev -eq "UNSPECIFIED") {
            if ($cat -eq "CRITICAL") { $sev = "CRITICAL" }
            elseif ($cat -eq "SECURITY") { $sev = "IMPORTANT" }
        }

        $reportedSize = [long]$u.MinDownloadSize
        if ($reportedSize -le 0) {
            $reportedSize = [long]$u.MaxDownloadSize
        }

        $list += [PSCustomObject]@{
            title = $u.Title
            kbArticleId = $mainKB
            allKBs = $kbs
            updateId = $updateId
            category = $cat
            severity = $sev
            isDownloaded = [bool]$u.IsDownloaded
            requiresReboot = [bool]$u.RebootRequired
            sizeBytes = $reportedSize
            status = $status
            lastOperation = if ($null -ne $last) { $last.operation } else { "" }
            lastResultCode = if ($null -ne $last) { [int]$last.resultCode } else { 0 }
            lastHResult = if ($null -ne $last) { "$([long]$last.hResult)" } else { "" }
            lastAttemptAt = if ($null -ne $last) { $last.date.ToUniversalTime().ToString("o") } else { "" }
        }
    }
    
    # Check registry reboot flags
    $reboot = $false
    $reason = ""
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") {
        $reboot = $true
        $reason = "Windows Update Reboot Required"
    } elseif (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") {
        $reboot = $true
        $reason = "CBS Reboot Pending"
    }

    [PSCustomObject]@{
        patches = @($list)
        rebootPending = $reboot
        rebootReason = $reason
    } | ConvertTo-Json -Depth 4 -Compress
} catch {
    Write-Error $_.Exception.Message
    exit 1
}`

	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		errText := strings.TrimSpace(stderr.String())
		if errText == "" {
			errText = err.Error()
		}
		return nil, fmt.Errorf("error ejecutando escaneo de Windows Update: %s", errText)
	}

	output := strings.TrimSpace(stdout.String())
	if output == "" {
		return &ScanResult{
			Patches:        []PatchItem{},
			ScanDurationMs: time.Since(startTime).Milliseconds(),
		}, nil
	}

	var res ScanResult
	if err := json.Unmarshal([]byte(output), &res); err != nil {
		return nil, fmt.Errorf("error decodificando resultado del escaneo: %w (salida: %s)", err, output)
	}

	res.ScanDurationMs = time.Since(startTime).Milliseconds()
	return &res, nil
}


func DownloadTargetKBs(ctx context.Context, targetKBs []string, timeout time.Duration) (*DownloadResult, error) {
	if len(targetKBs) == 0 { return nil, fmt.Errorf("no se proporcionaron KBs para descargar") }

	kbList := make([]string, len(targetKBs))
	for i, kb := range targetKBs {
		clean := strings.ToUpper(strings.TrimSpace(kb))
		clean = strings.ReplaceAll(clean, "'", "''")
		kbList[i] = fmt.Sprintf("'%s'", clean)
	}
	kbArrayLiteral := "@(" + strings.Join(kbList, ", ") + ")"

	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$targetIds = %s
try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $SearchResult = $Searcher.Search("IsInstalled=0 and IsHidden=0")
    $UpdatesToDownload = New-Object -ComObject Microsoft.Update.UpdateColl
    $matchedMeta = @{}

    foreach ($u in $SearchResult.Updates) {
        $ids = @()
        foreach ($kb in $u.KBArticleIDs) { $ids += ("KB" + $kb).ToUpperInvariant() }
        if ($u.Identity.UpdateID) { $ids += ("WU:" + $u.Identity.UpdateID).ToUpperInvariant() }
        $matchedIdentifier = $null
        foreach ($target in $targetIds) {
            $normalizedTarget = "$target".ToUpperInvariant()
            if ($ids -contains $normalizedTarget) { $matchedIdentifier = $normalizedTarget; break }
        }
        if ($matchedIdentifier) {
            $UpdatesToDownload.Add($u) | Out-Null
            $matchedMeta[$u.Identity.UpdateID] = @{ identifier = $matchedIdentifier; title = "$($u.Title)" }
        }
    }

    $matchedCount = [int]$UpdatesToDownload.Count
    $outcomes = @()
    $overallCode = 4
    if ($matchedCount -gt 0) {
        $Downloader = $Session.CreateUpdateDownloader()
        $Downloader.Updates = $UpdatesToDownload
        $DownloadResult = $Downloader.Download()
        $overallCode = [int]$DownloadResult.ResultCode
        for ($i = 0; $i -lt $UpdatesToDownload.Count; $i++) {
            $u = $UpdatesToDownload.Item($i)
            $meta = $matchedMeta[$u.Identity.UpdateID]
            $perUpdate = $DownloadResult.GetUpdateResult($i)
            $outcomes += [PSCustomObject]@{
                identifier = $meta.identifier
                title = $meta.title
                resultCode = [int]$perUpdate.ResultCode
                hResult = [long]$perUpdate.HResult
                downloaded = [bool]$u.IsDownloaded
            }
        }
    }

    foreach ($target in $targetIds) {
        $normalizedTarget = "$target".ToUpperInvariant()
        if (@($outcomes | Where-Object { $_.identifier -eq $normalizedTarget }).Count -eq 0) {
            $outcomes += [PSCustomObject]@{
                identifier = $normalizedTarget
                title = ""
                resultCode = -1
                hResult = 0
                downloaded = $false
            }
        }
    }

    $downloadedCount = @($outcomes | Where-Object { $_.downloaded -eq $true }).Count
    $allSucceeded = ($downloadedCount -eq $targetIds.Count -and $matchedCount -eq $targetIds.Count)
    [PSCustomObject]@{
        success = [bool]$allSucceeded
        resultCode = [int]$overallCode
        downloadedCount = [int]$downloadedCount
        matchedCount = [int]$matchedCount
        outcomes = @($outcomes)
        details = "Windows Update confirmó $downloadedCount de $($targetIds.Count) actualización(es) como descargadas."
    } | ConvertTo-Json -Depth 5 -Compress
} catch {
    Write-Error $_.Exception.Message
    exit 1
}`, kbArrayLiteral)

	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(cmdCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		errText := strings.TrimSpace(stderr.String())
		if errText == "" { errText = err.Error() }
		return nil, fmt.Errorf("error ejecutando descarga de parches: %s", errText)
	}
	output := strings.TrimSpace(stdout.String())
	var res DownloadResult
	if err := json.Unmarshal([]byte(output), &res); err != nil {
		return nil, fmt.Errorf("error decodificando resultado de descarga: %w (salida: %s)", err, output)
	}
	res.TargetKBs = targetKBs
	return &res, nil
}

// InstallTargetKBs downloads and installs the specified KB articles
func InstallTargetKBs(ctx context.Context, targetKBs []string, timeout time.Duration) (*InstallResult, error) {
	if len(targetKBs) == 0 {
		return nil, fmt.Errorf("no se proporcionaron KBs para instalar")
	}

	// Format KBs array for PowerShell
	kbList := make([]string, len(targetKBs))
	for i, kb := range targetKBs {
		clean := strings.ToUpper(strings.TrimSpace(kb))
		clean = strings.ReplaceAll(clean, "'", "''")
		kbList[i] = fmt.Sprintf("'%s'", clean)
	}
	kbArrayLiteral := "@(" + strings.Join(kbList, ", ") + ")"

	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$targetIds = %s
try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $SearchResult = $Searcher.Search("IsInstalled=0 and IsHidden=0")

    $UpdatesToDownload = New-Object -ComObject Microsoft.Update.UpdateColl
    $matchedMeta = @{}

    foreach ($u in $SearchResult.Updates) {
        $ids = @()
        foreach ($kb in $u.KBArticleIDs) { $ids += ("KB" + $kb).ToUpperInvariant() }
        if ($u.Identity.UpdateID) { $ids += ("WU:" + $u.Identity.UpdateID).ToUpperInvariant() }

        $matchedIdentifier = $null
        foreach ($target in $targetIds) {
            $normalizedTarget = "$target".ToUpperInvariant()
            if ($ids -contains $normalizedTarget) {
                $matchedIdentifier = $normalizedTarget
                break
            }
        }

        if ($matchedIdentifier) {
            $UpdatesToDownload.Add($u) | Out-Null
            $matchedMeta[$u.Identity.UpdateID] = @{
                identifier = $matchedIdentifier
                title = "$($u.Title)"
            }
        }
    }

    $matchedCount = [int]$UpdatesToDownload.Count
    if ($matchedCount -eq 0) {
        $outcomes = @()
        foreach ($target in $targetIds) {
            $outcomes += [PSCustomObject]@{
                identifier = "$target"
                title = ""
                resultCode = -1
                hResult = 0
                downloaded = $false
                installed = $false
            }
        }
        [PSCustomObject]@{
            success = $false
            resultCode = 4
            rebootRequired = $false
            installedCount = 0
            matchedCount = 0
            outcomes = @($outcomes)
            details = "No se encontró ninguna actualización pendiente que coincida con los identificadores solicitados."
        } | ConvertTo-Json -Depth 5 -Compress
        exit 0
    }

    $Downloader = $Session.CreateUpdateDownloader()
    $Downloader.Updates = $UpdatesToDownload
    $DownloadResult = $Downloader.Download()

    $UpdatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($u in $UpdatesToDownload) {
        if ($u.IsDownloaded) {
            $UpdatesToInstall.Add($u) | Out-Null
        }
    }

    if ($UpdatesToInstall.Count -ne $UpdatesToDownload.Count) {
        $outcomes = @()
        for ($i = 0; $i -lt $UpdatesToDownload.Count; $i++) {
            $u = $UpdatesToDownload.Item($i)
            $meta = $matchedMeta[$u.Identity.UpdateID]
            $perDownload = $DownloadResult.GetUpdateResult($i)
            $outcomes += [PSCustomObject]@{
                identifier = $meta.identifier
                title = $meta.title
                resultCode = [int]$perDownload.ResultCode
                hResult = [long]$perDownload.HResult
                downloaded = [bool]$u.IsDownloaded
                installed = $false
            }
        }
        [PSCustomObject]@{
            success = $false
            resultCode = [int]$DownloadResult.ResultCode
            rebootRequired = $false
            installedCount = 0
            matchedCount = $matchedCount
            outcomes = @($outcomes)
            details = "No todos los parches seleccionados pudieron descargarse. Instalación cancelada para evitar un éxito parcial silencioso."
        } | ConvertTo-Json -Depth 5 -Compress
        exit 0
    }

    $Installer = $Session.CreateUpdateInstaller()
    $Installer.Updates = $UpdatesToInstall
    $InstallResult = $Installer.Install()

    $outcomes = @()
    $installedCount = 0
    $allSucceeded = $true

    for ($i = 0; $i -lt $UpdatesToInstall.Count; $i++) {
        $u = $UpdatesToInstall.Item($i)
        $meta = $matchedMeta[$u.Identity.UpdateID]
        $perUpdate = $InstallResult.GetUpdateResult($i)
        $installed = ([int]$perUpdate.ResultCode -eq 2)

        if ($installed) {
            $installedCount++
        } else {
            $allSucceeded = $false
        }

        $outcomes += [PSCustomObject]@{
            identifier = $meta.identifier
            title = $meta.title
            resultCode = [int]$perUpdate.ResultCode
            hResult = [long]$perUpdate.HResult
            downloaded = [bool]$u.IsDownloaded
            installed = [bool]$installed
        }
    }

    # Any requested identifier not matched is a failure, never a success.
    foreach ($target in $targetIds) {
        $normalizedTarget = "$target".ToUpperInvariant()
        $alreadyReported = @($outcomes | Where-Object { $_.identifier -eq $normalizedTarget }).Count -gt 0
        if (-not $alreadyReported) {
            $allSucceeded = $false
            $outcomes += [PSCustomObject]@{
                identifier = $normalizedTarget
                title = ""
                resultCode = -1
                hResult = 0
                downloaded = $false
                installed = $false
            }
        }
    }

    $reboot = [bool]$InstallResult.RebootRequired
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") { $reboot = $true }
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") { $reboot = $true }

    [PSCustomObject]@{
        success = [bool]($allSucceeded -and $installedCount -eq $targetIds.Count)
        resultCode = [int]$InstallResult.ResultCode
        rebootRequired = $reboot
        installedCount = [int]$installedCount
        matchedCount = [int]$matchedCount
        outcomes = @($outcomes)
        details = "Windows Update verificó $installedCount de $($targetIds.Count) actualización(es) como instaladas."
    } | ConvertTo-Json -Depth 5 -Compress
} catch {
    Write-Error $_.Exception.Message
    exit 1
}`, kbArrayLiteral)

	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		errText := strings.TrimSpace(stderr.String())
		if errText == "" {
			errText = err.Error()
		}
		return nil, fmt.Errorf("error ejecutando instalación de parches: %s", errText)
	}

	output := strings.TrimSpace(stdout.String())
	var res InstallResult
	if err := json.Unmarshal([]byte(output), &res); err != nil {
		return nil, fmt.Errorf("error decodificando resultado de instalación: %w (salida: %s)", err, output)
	}

	res.TargetKBs = targetKBs
	return &res, nil
}
