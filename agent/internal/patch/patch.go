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
type InstallResult struct {
	Success        bool     `json:"success"`
	ResultCode     int      `json:"resultCode"`
	RebootRequired bool     `json:"rebootRequired"`
	InstalledCount int      `json:"installedCount"`
	TargetKBs      []string `json:"targetKBs"`
	Details        string   `json:"details"`
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
try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $SearchResult = $Searcher.Search("IsInstalled=0 and IsHidden=0")
    $list = @()
    foreach ($u in $SearchResult.Updates) {
        $kbs = @()
        foreach ($kb in $u.KBArticleIDs) { $kbs += "KB$kb" }
        $mainKB = if ($kbs.Count -gt 0) { $kbs[0] } else {
            if ($u.Identity.UpdateID) { "KB-" + $u.Identity.UpdateID.Substring(0, [Math]::Min(12, $u.Identity.UpdateID.Length)) } else { "KB0" }
        }
        
        $cat = "OTHER"
        foreach ($c in $u.Categories) {
            $cName = $c.Name.ToLower()
            if ($cName -match "critical") { $cat = "CRITICAL"; break }
            elseif ($cName -match "security") { $cat = "SECURITY"; break }
            elseif ($cName -match "update") { $cat = "IMPORTANT" }
            elseif ($cName -match "driver") { $cat = "DRIVER" }
            elseif ($cName -match "feature") { $cat = "FEATURE_UPDATE" }
        }
        
        $sev = "UNSPECIFIED"
        if ($u.MsrcSeverity) {
            $sev = $u.MsrcSeverity.ToUpper()
        } elseif ($cat -eq "CRITICAL") {
            $sev = "CRITICAL"
        } elseif ($cat -eq "SECURITY") {
            $sev = "IMPORTANT"
        }

        $list += [PSCustomObject]@{
            title = $u.Title
            kbArticleId = $mainKB
            allKBs = $kbs
            category = $cat
            severity = $sev
            isDownloaded = [bool]$u.IsDownloaded
            requiresReboot = [bool]$u.RebootRequired
            sizeBytes = [long]$u.MaxDownloadSize
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
		kbList[i] = fmt.Sprintf("'%s'", clean)
	}
	kbArrayLiteral := "@(" + strings.Join(kbList, ", ") + ")"

	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
$targetKBs = %s
try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $SearchResult = $Searcher.Search("IsInstalled=0 and Type='Software'")
    
    $UpdatesToDownload = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($u in $SearchResult.Updates) {
        $matched = $false
        foreach ($kb in $u.KBArticleIDs) {
            $fullKB = "KB$kb"
            if ($targetKBs -contains $fullKB -or $targetKBs -contains "$kb") {
                $matched = $true
                break
            }
        }
        if ($matched) {
            $UpdatesToDownload.Add($u) | Out-Null
        }
    }

    if ($UpdatesToDownload.Count -eq 0) {
        [PSCustomObject]@{
            success = $true
            resultCode = 0
            rebootRequired = $false
            installedCount = 0
            details = "No se encontraron actualizaciones pendientes que coincidan con los KBs solicitados en este equipo."
        } | ConvertTo-Json -Compress
        exit 0
    }

    # Step 1: Download
    $Downloader = $Session.CreateUpdateDownloader()
    $Downloader.Updates = $UpdatesToDownload
    $Downloader.Download() | Out-Null

    # Step 2: Filter downloaded
    $UpdatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($u in $UpdatesToDownload) {
        if ($u.IsDownloaded) {
            $UpdatesToInstall.Add($u) | Out-Null
        }
    }

    if ($UpdatesToInstall.Count -eq 0) {
        [PSCustomObject]@{
            success = $false
            resultCode = 1
            rebootRequired = $false
            installedCount = 0
            details = "Falló la descarga de los parches seleccionados."
        } | ConvertTo-Json -Compress
        exit 0
    }

    # Step 3: Install
    $Installer = $Session.CreateUpdateInstaller()
    $Installer.Updates = $UpdatesToInstall
    $InstallResult = $Installer.Install()

    # ResultCode: 2 = InProgress, 3 = Succeeded, 4 = SucceededWithErrors, 5 = Failed, 6 = Aborted
    $isSuccess = ($InstallResult.ResultCode -eq 2 -or $InstallResult.ResultCode -eq 3)

    [PSCustomObject]@{
        success = $isSuccess
        resultCode = [int]$InstallResult.ResultCode
        rebootRequired = [bool]$InstallResult.RebootRequired
        installedCount = [int]$UpdatesToInstall.Count
        details = "Instalación completada. Código de resultado: $($InstallResult.ResultCode)."
    } | ConvertTo-Json -Compress
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
