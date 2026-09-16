# NanoLabs Monitor — Script de Instalación Automatizada para Windows
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
Write-Host "   NanoLabs Control Center — Agente de Monitoreo     " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Verificar privilegios de Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Este instalador requiere ejecutarse como Administrador." -ForegroundColor Red
    Write-Host "[!] Por favor abra PowerShell como Administrador e intente nuevamente." -ForegroundColor Yellow
    exit 1
}

# 2. Descargar instalador unificado
$tempDir = [System.IO.Path]::GetTempPath()
$installerPath = Join-Path $tempDir "NanoMonitor-Setup.exe"
$downloadUrl = "$ApiUrl/downloads/NanoMonitor-Setup.exe"

Write-Host "[1/3] Descargando instalador de NanoLabs Monitor..." -ForegroundColor Yellow
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "      Descarga completada con éxito." -ForegroundColor Green
} catch {
    Write-Host "[!] Error descargando el instalador desde $downloadUrl: $_" -ForegroundColor Red
    exit 1
}

# 3. Ejecutar instalación desatendida
Write-Host "[2/3] Instalando servicio de monitoreo e icono de bandeja..." -ForegroundColor Yellow
$args = @("-api-url=$ApiUrl", "-silent")
if ($Token) {
    $args += "-token=$Token"
}

try {
    $process = Start-Process -FilePath $installerPath -ArgumentList $args -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Host "[!] El instalador finalizó con código de error $($process.ExitCode)." -ForegroundColor Red
        exit $process.ExitCode
    }
} catch {
    Write-Host "[!] Error ejecutando el instalador: $_" -ForegroundColor Red
    exit 1
}

# 4. Verificar servicio
Write-Host "[3/3] Verificando servicio de Windows..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$svc = Get-Service -Name "NanoLabsAgent" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "  [✓] ¡NanoLabs Monitor instalado exitosamente!      " -ForegroundColor Green
    Write-Host "  Servicio: En ejecución continua                    " -ForegroundColor Green
    Write-Host "  Bandeja:  Icono activo en la barra de tareas       " -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
} else {
    Write-Host "[*] El agente se instaló. Verifique el estado con: Get-Service NanoLabsAgent" -ForegroundColor Yellow
}
