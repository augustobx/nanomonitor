# NanoLabs Agent — Windows (Arquitectura Desacoplada)

## Descripción

Agente liviano de telemetría y prevención proactiva escrito en Go que opera como un Windows Service nativo (`NanoLabsAgent`). Recopila telemetría de salud, rendimiento, inventario y seguridad del endpoint y la transmite autenticada por HTTPS mediante HMAC-SHA256 al servidor central de NanoLabs Control Center.

## Principios de Diseño

1. **Separación Estricta de Responsabilidades:** No mezclar inventarios pesados (software/hardware) con la postura de seguridad ni con las métricas de rendimiento.
2. **Bajo Consumo de Recursos:** Memoria en reposo de ~10-15 MB RAM, uso imperceptible de CPU (<0.5%) y tráfico optimizado mediante diffs y fingerprints SHA-256.
3. **Detección Inmediata de Cambios Críticos:** Monitoreo local en tiempo real con `StateChangeDetector` que emite eventos `SECURITY_STATE_CHANGED` al instante cuando el antivirus o los perfiles de firewall cambian de estado.
4. **Resiliencia Offline:** Buffer persistente en disco (`buffer.db`) con cola de prioridades estricta que jamás descarta eventos críticos de seguridad antes que métricas ordinarias o inventario.
5. **Arranque Escalonado (Staggered Boot):** Ejecución secuencial de los recolectores pesados al arrancar el agente para no congestionar CPU ni disco.

---

## Collectors Desacoplados

| Collector | Responsabilidad / Datos | Frecuencia Definitiva | Jitter | Endpoint API |
|---|---|---|---|---|
| **EventCollector** | Revisa únicamente eventos nuevos en Event Viewer (Kernel-Power 41, BSOD BugCheck 1001, NTFS 55/98, DiskError 7/11/15/51, ServiceCrash 7034/7000). Watermark por `EventRecordID`. | **60 segundos** | Sin jitter | `POST /agent/events` |
| **HeartbeatCollector** | `deviceId`, `agentId`, `timestamp`, `uptime`, estado online, `serverLatencyMs`, `agentVersion`, estado básico del agente. | **180 segundos (3 min)** | Sin jitter | `POST /agent/heartbeat` |
| **SecurityCollector** | Estado del antivirus (producto, enabled/disabled, upToDate) y Firewall por perfiles (Domain, Private, Public). Se envía dentro del Heartbeat. | **180 segundos (3 min)** | Sin jitter | `POST /agent/heartbeat` |
| **PerformanceCollector** | Métricas operativas livianas: CPU %, RAM %, RAM usada/disponible, uso de volúmenes y espacio libre por letra (C:\, D:\). Sin inventario de software. | **300 segundos (5 min)** | ±10 seg | `POST /agent/metrics` |
| **SmartCollector** | Salud física de discos (MSFT_PhysicalDisk, Win32_DiskDrive, StorageReliabilityCounters), fallo predictivo SMART, temperatura y desgaste. Si degrada (OK → WARN/CRIT), genera evento inmediato. | **3600 segundos (60 min)** | ±60 seg | `POST /agent/inventory` (`smart`) |
| **WindowsUpdateCollector** | Parches instalados, actualizaciones acumulativas pendientes, indicador y motivo de reinicio pendiente (`RebootRequired`, `CBS RebootPending`, `PendingFileRenameOperations`). | **14400 segundos (4 horas)** + Inicio | ±120 seg | `POST /agent/inventory` (`windowsUpdate`) |
| **InventoryCollector** | Especificaciones de hardware fijas: CPU, núcleos, RAM instalada, modelo, fabricante, número de serie, interfaces de red fijas. | **86400 segundos (24 horas)** + Inicio | +300 seg | `POST /agent/inventory` |
| **SoftwareCollector** | Inventario de programas instalados (64-bit, 32-bit WOW6432Node, CurrentUser). Genera checksum SHA-256; si no hay cambios respecto al snapshot anterior, omite la retransmisión completa. | **86400 segundos (24 horas)** + Inicio | +300 seg | `POST /agent/software` |

---

## Detección de Cambios de Seguridad (`StateChangeDetector`)

El agente mantiene en memoria el último estado conocido de seguridad:
* **Antivirus:** `enabled` vs `disabled`
* **Firewall de Windows:** perfiles `domain`, `private`, `public` (`enabled` vs `disabled`)

Ante cualquier transición:
1. Se genera un payload `DeviceEventPayload` de categoría `Security` y severidad `CRITICAL` o `INFO`.
2. Se despacha **inmediatamente** a `POST /agent/events` a través de `sendEventImmediate`.
3. Si la conexión HTTPS falla, el evento se encola con `PrioritySecurity` (Prioridad 1) en el buffer offline.

---

## Buffer Offline Priorizado (`PriorityBuffer`)

El buffer reside en `C:\ProgramData\NanoLabs\NanoMonitor\buffer.db` (formato JSON estructurado y transaccional).
Cuando el agente no tiene conectividad hacia internet, almacena las cargas según su importancia:

1. **Prioridad 1 (`PrioritySecurity`):** Eventos de cambio de estado de antivirus y firewall (`SECURITY_STATE_CHANGED`).
2. **Prioridad 2 (`PriorityCriticalEvent`):** BSOD, Kernel-Power, NTFS corrupto, degradación crítica SMART.
3. **Prioridad 3 (`PriorityAlert`):** Cierres de aplicación, fallas de servicio, warnings.
4. **Prioridad 4 (`PriorityHeartbeat`):** Heartbeats periódicos.
5. **Prioridad 5 (`PriorityMetrics`):** Métricas de rendimiento de CPU/RAM.
6. **Prioridad 6 (`PriorityInventory`):** Inventarios pesados de hardware y software.

**Política de Descarte ante Buffer Lleno (10 MB):**
Si el almacenamiento alcanza el límite configurado (`bufferMaxSizeMb`), se descartan primero los registros más antiguos de **Prioridad 6 (Inventario)**, luego **Prioridad 5 (Métricas)**. **Bajo ninguna circunstancia se eliminan eventos de seguridad (Prioridad 1) o críticos (Prioridad 2) mientras existan métricas o inventarios en cola.**

Al restablecerse la conectividad, el scheduler vacía la cola en orden ascendente de prioridad (1 primero, luego 2, etc.).

---

## Secuencia de Arranque Escalonado (Staggered Startup)

Para prevenir saturación del sistema operativo durante el arranque del equipo:

```
[T+0s]  Carga de configuración e identidad DPAPI
[T+0s]  Primer Heartbeat inmediato + Security State Liviano (Reflejo en consola)
[T+5s]  Consulta liviana de Windows Update y reinicios pendientes
[T+10s] Inspección física de almacenamiento y SMART
[T+15s] Inventario general (Hardware + Software con checksum)
[T+20s] Vaciado de buffer offline previo si hubiere datos remanentes
[T+60s+] Comienzo regular de los bucles desacoplados independientes
```

---

## Centralización de Configuración (`config.yaml`)

Ubicación: `C:\ProgramData\NanoLabs\NanoMonitor\config.yaml`

| Campo | Tipo | Valor por Defecto | Configurable | Descripción |
|---|---|---|---|---|
| `apiUrl` | string | `https://monitor.nanolabs.com.ar` | Sí | URL base del servidor NanoLabs |
| `heartbeatInterval` | int | `180` (segundos) | Sí | Cadencia del latido del agente y estado básico |
| `securityInterval` | int | `180` (segundos) | Sí | Cadencia de verificación de antivirus y firewall |
| `metricsInterval` | int | `300` (segundos) | Sí | Cadencia de métricas de CPU, RAM y volúmenes |
| `smartInterval` | int | `3600` (segundos) | Sí | Cadencia de análisis físico SMART de discos |
| `windowsUpdateInterval` | int | `14400` (segundos) | Sí | Cadencia de parches y estado de reinicio |
| `inventoryInterval` | int | `86400` (segundos) | Sí | Cadencia de inventario pesado de hardware y software |
| `eventCheckInterval` | int | `60` (segundos) | Sí | Cadencia de lectura de nuevos eventos críticos en Event Viewer |
| `logLevel` | string | `info` | Sí | Nivel de logs (`debug`, `info`, `warn`, `error`) |
| `logFile` | string | `C:\ProgramData\NanoLabs\NanoMonitor\logs\agent.log` | Sí | Archivo de registro del agente |
| `bufferDbPath` | string | `C:\ProgramData\NanoLabs\NanoMonitor\buffer.db` | Sí | Ruta del archivo de buffer offline |
| `bufferMaxSizeMb` | int | `10` | Sí | Tamaño máximo del buffer en megabytes |
