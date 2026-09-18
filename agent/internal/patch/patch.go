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
	Category       string   `json:"category"`
	Severity       string   `json:"severity"`
	IsDownloaded   bool     `json:"isDownloaded"`
	RequiresReboot bool     `json:"requiresReboot"`
	SizeBytes      int64    `json:"sizeBytes"`
	Status         string   `json:"status,omitempty"`
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
	Installed  bool   `json:"installed"`
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
    $list = @()
    foreach ($u in $SearchResult.Updates) {
        $kbs = @()
        foreach ($kb in $u.KBArticleIDs) { $kbs += "KB$kb" }
        $mainKB = if ($kbs.Count -gt 0) { $kbs[0] } else {
            if ($u.Identity.UpdateID) { "WU:" + $u.Identity.UpdateID.ToUpperInvariant() } else { "WU:UNKNOWN" }
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

        if ($sev -eq "UNSPECIFIED") {
            if ($cat -eq "CRITICAL") { $sev = "CRITICAL" }
            elseif ($cat -eq "SECURITY") { $sev = "IMPORTANT" }
        }

        $list += [PSCustomObject]@{
            title = $u.Title
            kbArticleId = $mainKB
            allKBs = $kbs
            category = $cat
            severity = $sev
            isDownloaded = [bool]$u.IsDownloaded
            requiresReboot = [bool]$u.RebootRequired
            sizeBytes = [long](if ($u.MinDownloadSize -gt 0) { $u.MinDownloadSize } else { $u.MaxDownloadSize })
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
        foreach ($u in $UpdatesToDownload) {
            $meta = $matchedMeta[$u.Identity.UpdateID]
            $outcomes += [PSCustomObject]@{
                identifier = $meta.identifier
                title = $meta.title
                resultCode = -1
                hResult = 0
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
