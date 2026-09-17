# Remote Actions — NanoLabs Control Center / NanoMonitor

## Visión General
El subsistema de **Remote Actions** permite a los operadores ejecutar acciones remotas controladas sobre endpoints monitoreados sin abrir puertos de red entrantes en los dispositivos clientes.

## Principios de Seguridad
1. **Cero Ejecución Arbitraria**: No se permite terminal remota arbitraria, ejecución libre de scripts PowerShell, ni comandos tipo `eval`.
2. **Whitelist Estricta**: Cada acción está vinculada a un `ActionType` predefinido en el backend y en el agente.
3. **Whitelist de Servicios**: Para `RESTART_SERVICE`, el nombre del servicio debe pertenecer a la lista autorizada (`Spooler`, `wuauserv`, `LanmanWorkstation`, `LanmanServer`, `Dnscache`, `Dhcp`, `W32Time`, `Winmgmt`, `TermService`, `EventLog`, `NanoLabsAgent`).
4. **Acciones Destructivas Seguras**: `REBOOT_DEVICE` y `SHUTDOWN_DEVICE` requieren el rol `RUN_REBOOT` y confirmación explícita del operador en la interfaz. Notifican al usuario con un retardo de 10 segundos.
5. **Sanitización de Salida**: Todas las salidas son limitadas a 64 KB y almacenadas de forma segura.
6. **Autenticación Saliente HMAC-SHA256**: La comunicación es 100% saliente (Agente → NanoMonitor) utilizando credenciales del agente y nonces anti-replay.

## Catálogo de Acciones Iniciales

### 1. Sistema
- `REBOOT_DEVICE`: Reinicio controlado de Windows (`shutdown.exe /r /t 10`).
- `SHUTDOWN_DEVICE`: Apagado controlado de Windows (`shutdown.exe /s /t 10`).

### 2. Telemetría NanoMonitor
- `FORCE_HEARTBEAT`: Sincronización inmediata de latido y seguridad.
- `FORCE_METRICS`: Recolección inmediata de CPU, RAM y almacenamiento.
- `FORCE_SECURITY_SCAN`: Escaneo inmediato de antivirus y firewall.
- `FORCE_INVENTORY`: Recolección inmediata de hardware y software.
- `FORCE_SMART_CHECK`: Inspección física de salud SMART en discos.
- `FORCE_WINDOWS_UPDATE`: Comprobación de parches y reinicios pendientes.

### 3. Windows Defender
- `DEFENDER_UPDATE_SIGNATURES`: Actualización forzada de definiciones de amenazas.
- `DEFENDER_QUICK_SCAN`: Escaneo rápido de Windows Defender.
- `DEFENDER_FULL_SCAN`: Escaneo completo de Windows Defender.

### 4. Red & Conectividad
- `FLUSH_DNS`: Vaciado de la caché DNS local (`ipconfig /flushdns`).
- `RENEW_DHCP`: Renovación de la concesión DHCP (`ipconfig /renew`).

### 5. Integridad de Windows
- `WINDOWS_SFC_SCAN`: Comprobación y reparación de archivos de sistema (`sfc /scannow`).
- `WINDOWS_DISM_CHECK`: Verificación de la salud de la imagen de Windows (`dism /online /cleanup-image /checkhealth`).
- `WINDOWS_CHKDSK_SCAN`: Comprobación de disco en modo diagnóstico/solo lectura (`chkdsk C:`).

### 6. Servicios de Windows
- `QUERY_SERVICES`: Consulta del estado operativo de los servicios en whitelist.
- `RESTART_SERVICE`: Reinicio seguro de un servicio incluido en la whitelist.

## Máquina de Estados
```
PENDING ──► DELIVERED ──► RUNNING ──► SUCCESS
   │             │             └───► FAILED
   └──► CANCELLED └──► EXPIRED
```

- `PENDING`: Creada por el operador, en espera de recepción por el agente.
- `DELIVERED`: Entregada al agente durante su ciclo de sondeo.
- `RUNNING`: Agente reporta inicio de ejecución.
- `SUCCESS`: Finalizada exitosamente (código 0 y sin errores).
- `FAILED`: Fallida (código != 0 o error reportado).
- `EXPIRED`: No entregada dentro del tiempo de expiración (15 minutos por defecto).
- `CANCELLED`: Cancelada manualmente por el operador antes de su ejecución.
