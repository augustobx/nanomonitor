# NanoLabs Agent — Windows

> Se actualizará durante F1. Documento inicial.

## Descripción

Agente liviano escrito en Go que se ejecuta como Windows Service. Recopila telemetría del equipo y la envía por HTTPS al servidor central de NanoLabs Control Center.

## Requisitos

- Windows 10/11 (x64)
- Permisos de administrador para instalación
- Acceso HTTPS saliente al servidor NanoLabs

## Características

- Binario estático único (~15-20 MB)
- Consumo de RAM: ~10-15 MB idle
- Auto-start con Windows
- Reinicio automático ante fallas
- Funciona sin usuario logueado
- No abre puertos
- Almacenamiento seguro de credenciales (DPAPI)
- Buffer offline (SQLite)

## Collectors

| Collector | Datos | Frecuencia |
|---|---|---|
| Identity | Hostname, UUID, OS, manufacturer, serial | Enrollment + on change |
| Hardware | CPU model, cores, RAM total, discos | Inventory (24h) |
| Performance | CPU%, RAM%, disco%, uptime | Heartbeat (3min) + Metrics (5min) |
| Network | Interfaces, IP, gateway, DNS, latencia | Inventory (24h) |
| Security | Defender, firewall, AV status | Inventory (24h) + Events |
| Updates | Windows Update, pending, reboot | Inventory (24h) |
| Storage | SMART, health, temp | Inventory (24h) + Events |
| Software | Installed software list | Inventory (24h) + on change |
| Events | Event Viewer filtered | Immediate (critical) / batch |

## Instalación

```powershell
# Instalación con token de enrolamiento
NanoLabsAgent.exe /install /token=NL-ENRL-xxxx /silent

# Verificar servicio
Get-Service NanoLabsAgent

# Logs
Get-Content C:\ProgramData\NanoLabs\Agent\logs\agent.log
```
