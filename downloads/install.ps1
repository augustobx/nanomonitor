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
Write-Host " NanoLabs Control Center - Monitoring Agent v1.4.3 " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Check Administrator Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[*] Solicitando elevacion de privilegios de Administrador (UAC)..." -ForegroundColor Yellow
    try {
        $scriptUrl = "$ApiUrl/install.ps1"
        $escapedToken = $Token.Replace("'", "''")
        $tokenBootstrap = if ($Token) { "`$env:NANOMONITOR_TOKEN='$escapedToken'; " } else { "" }
        $fullCmd = $tokenBootstrap + "irm `"$scriptUrl`" -Headers @{ 'Cache-Control'='no-cache' } | iex"
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
    # Espera controlada: el wrapper no puede declarar éxito mientras el instalador siga trabajando.
    $exited = $process.WaitForExit(60000)
    if (-not $exited) {
        try { $process.Kill() } catch {}
        Write-Host "[!] El instalador no finalizo dentro de 60 segundos. Instalacion abortada." -ForegroundColor Red
        exit 1
    }
    if ($process.ExitCode -ne 0) {
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
    try {
        Start-Service -Name "NanoLabsAgent" -ErrorAction Stop
    } catch {
        Write-Host "[!] No se pudo iniciar NanoLabsAgent: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }

    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $svc = Get-Service -Name "NanoLabsAgent" -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') {
            $started = $true
            break
        }
        if ($svc -and $svc.Status -eq 'Stopped') {
            break
        }
    }
}

if (-not $started) {
    Write-Host "[!] INSTALACION INCOMPLETA: NanoLabsAgent no quedo en estado RUNNING." -ForegroundColor Red
    Write-Host "    Revise: Visor de eventos > Registros de Windows > Sistema > Service Control Manager." -ForegroundColor Yellow
    exit 1
}

# Require a stable RUNNING state, not a transient start immediately followed by a crash.
Start-Sleep -Seconds 3
$svc = Get-Service -Name "NanoLabsAgent" -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne 'Running') {
    Write-Host "[!] NanoLabsAgent arranco pero no permanecio RUNNING de forma estable." -ForegroundColor Red
    Write-Host "    Revise: Visor de eventos > Registros de Windows > Sistema > Service Control Manager." -ForegroundColor Yellow
    exit 1
}

# Validate automatic + delayed startup. The agent must survive Windows reboot without user intervention.
$svcConfig = Get-CimInstance Win32_Service -Filter "Name='NanoLabsAgent'" -ErrorAction SilentlyContinue
if (-not $svcConfig) {
    Write-Host "[!] No se pudo validar la configuracion de NanoLabsAgent." -ForegroundColor Red
    exit 1
}
if ($svcConfig.StartMode -ne 'Auto') {
    Write-Host "[!] StartMode invalido: $($svcConfig.StartMode). Se esperaba Auto." -ForegroundColor Red
    exit 1
}

$delayedStart = 0
try {
    $delayedStart = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NanoLabsAgent" -Name "DelayedAutoStart" -ErrorAction Stop).DelayedAutoStart
} catch {
    Write-Host "[!] No se pudo validar DelayedAutoStart." -ForegroundColor Red
    exit 1
}
if ($delayedStart -ne 1) {
    Write-Host "[!] DelayedAutoStart no esta habilitado." -ForegroundColor Red
    exit 1
}

$agentExe = Join-Path $env:ProgramFiles "NanoLabs\NanoMonitor\nanoagent.exe"
if (-not (Test-Path $agentExe)) {
    Write-Host "[!] No se encontro nanoagent.exe en $agentExe" -ForegroundColor Red
    exit 1
}

$installedVersion = "desconocida"
try {
    $vOut = (& $agentExe -v 2>&1)
    if ($vOut) { $installedVersion = $vOut.ToString().Trim() }
} catch {
    Write-Host "[!] No se pudo consultar la version instalada: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$trayRunning = [bool](Get-Process -Name "nanotray" -ErrorAction SilentlyContinue)
$trayText = if ($trayRunning) { "Iniciada en la sesion actual" } else { "Se iniciara con la proxima sesion de usuario" }

Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  [OK] NanoLabs Monitor instalado y VERIFICADO       " -ForegroundColor Green
Write-Host "  Version:  $installedVersion" -ForegroundColor Green
Write-Host "  Servicio: RUNNING / Automatic / Delayed Start" -ForegroundColor Green
Write-Host "  Bandeja:  $trayText" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green

