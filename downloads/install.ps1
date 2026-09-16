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

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "   NanoLabs Control Center - Monitoring Agent Setup  " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Check Administrator Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Error: Este instalador requiere ejecutarse como Administrador." -ForegroundColor Red
    Write-Host "[!] Abra PowerShell como Administrador e intente nuevamente." -ForegroundColor Yellow
    exit 1
}

# 2. Download Unified Installer
$tempDir = [System.IO.Path]::GetTempPath()
$installerPath = Join-Path $tempDir "NanoMonitor-Setup.exe"
$downloadUrl = "$ApiUrl/downloads/NanoMonitor-Setup.exe"

Write-Host "[1/3] Descargando instalador de NanoLabs Monitor..." -ForegroundColor Yellow
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "      Descarga completada con exito." -ForegroundColor Green
} catch {
    $err = $_.Exception.Message
    Write-Host "[!] Error descargando desde $downloadUrl" -ForegroundColor Red
    Write-Host "    Detalle: $err" -ForegroundColor Red
    exit 1
}

# 3. Execute Installation
Write-Host "[2/3] Instalando servicio de monitoreo e icono de bandeja..." -ForegroundColor Yellow
$procArgs = @("-api-url=$ApiUrl", "-silent")
if ($Token) {
    $procArgs += "-token=$Token"
}

try {
    $process = Start-Process -FilePath $installerPath -ArgumentList $procArgs -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Host "[!] El instalador finalizo con codigo de error $($process.ExitCode)." -ForegroundColor Red
        exit $process.ExitCode
    }
} catch {
    $err = $_.Exception.Message
    Write-Host "[!] Error ejecutando el instalador." -ForegroundColor Red
    Write-Host "    Detalle: $err" -ForegroundColor Red
    exit 1
}

# 4. Verify Windows Service
Write-Host "[3/3] Verificando servicio de Windows..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$svc = Get-Service -Name "NanoLabsAgent" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "  [OK] NanoLabs Monitor instalado exitosamente!      " -ForegroundColor Green
    Write-Host "  Servicio: En ejecucion continua                    " -ForegroundColor Green
    Write-Host "  Bandeja:  Icono activo en la barra de tareas       " -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
} else {
    Write-Host "[*] El agente se instalo. Verifique el estado con: Get-Service NanoLabsAgent" -ForegroundColor Yellow
}
