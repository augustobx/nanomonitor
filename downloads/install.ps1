# NanoLabs Monitor - Automated Installer for Windows
param(
    [Parameter(Mandatory=$false)]
    [string]$Token = "",

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "https://monitor.nanolabs.com.ar",

    [Parameter(Mandatory=$false)]
    [switch]$Silent = $true
)

$ErrorActionPreference = "Stop"

# Fallback to variable from caller/global scope or environment variable
if (-not $Token -and (Test-Path Variable:\Token)) {
    $Token = (Get-Variable -Name Token -ValueOnly -ErrorAction SilentlyContinue)
}
if (-not $Token -and $global:Token) {
    $Token = $global:Token
}
if (-not $Token -and $env:NANOMONITOR_TOKEN) {
    $Token = $env:NANOMONITOR_TOKEN
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "   NanoLabs Control Center - Monitoring Agent Setup  " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Check Administrator Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[*] Solicitando elevacion de privilegios de Administrador (UAC)..." -ForegroundColor Yellow
    try {
        $tokenParam = if ($Token) { " -Token `"$Token`"" } else { "" }
        $fullCmd = "& { irm '$ApiUrl/install.ps1' | iex$tokenParam }"
        Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$fullCmd`"" -Verb RunAs
        exit 0
    } catch {
        Write-Host "[!] Error: Este instalador requiere ejecutarse como Administrador." -ForegroundColor Red
        Write-Host "[!] Abra PowerShell como Administrador e intente nuevamente." -ForegroundColor Yellow
        exit 1
    }
}

# 2. Download Unified Installer
$tempDir = [System.IO.Path]::GetTempPath()
$installerPath = Join-Path $tempDir "NanoMonitor-Setup.exe"
$cacheBuster = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$downloadUrl = "$ApiUrl/downloads/NanoMonitor-Setup.exe?t=$cacheBuster"

if (Test-Path $installerPath) {
    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
}

Write-Host "[1/3] Descargando instalador de NanoLabs Monitor..." -ForegroundColor Yellow
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" }
    Write-Host "      Descarga completada con exito." -ForegroundColor Green
} catch {
    $err = $_.Exception.Message
    Write-Host "[!] Error descargando desde $downloadUrl" -ForegroundColor Red
    Write-Host "    Detalle: $err" -ForegroundColor Red
    exit 1
}

# 3. Execute Installation
Write-Host "[2/3] Instalando servicio de monitoreo e icono de bandeja..." -ForegroundColor Yellow

# Ensure previous instances are stopped to allow file replacement
Stop-Service -Name "NanoLabsAgent" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "nanoagent", "nanotray" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

$procArgs = @("-api-url=$ApiUrl", "-silent")
if ($Token) {
    $procArgs += "-token=$Token"
}

try {
    $process = Start-Process -FilePath $installerPath -ArgumentList $procArgs -PassThru
    # Espera controlada de max 15 segundos para evitar bloqueos por handles heredados
    $null = $process.WaitForExit(15000)
    if ($process.HasExited -and $process.ExitCode -ne 0) {
        Write-Host "[!] El instalador finalizo con codigo de error: $($process.ExitCode)" -ForegroundColor Red
        exit $process.ExitCode
    }
} catch {
    $err = $_.Exception.Message
    Write-Host "[!] Error ejecutando el instalador." -ForegroundColor Red
    Write-Host "    Detalle: $err" -ForegroundColor Red
    exit 1
}

# 4. Verify Windows Service & Version
Write-Host "[3/3] Verificando servicio de Windows..." -ForegroundColor Yellow
$started = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    $svc = Get-Service -Name "NanoLabsAgent" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        $started = $true
        break
    }
}

if (-not $started) {
    Start-Service -Name "NanoLabsAgent" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name "NanoLabsAgent" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        $started = $true
    }
}

$agentExe = Join-Path $env:ProgramFiles "NanoLabs\NanoMonitor\nanoagent.exe"
$installedVersion = "v1.3.0"
if (Test-Path $agentExe) {
    try {
        $vOut = (& $agentExe -v 2>&1)
        if ($vOut) { $installedVersion = $vOut.ToString().Trim() }
    } catch {}
}

if ($started) {
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "  [OK] NanoLabs Monitor instalado exitosamente!      " -ForegroundColor Green
    Write-Host "  Version:  $installedVersion                        " -ForegroundColor Green
    Write-Host "  Servicio: En ejecucion continua                    " -ForegroundColor Green
    Write-Host "  Bandeja:  Icono activo en la barra de tareas       " -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
} else {
    Write-Host "[*] El agente se instalo ($installedVersion). Verifique el estado con: Get-Service NanoLabsAgent" -ForegroundColor Yellow
}

