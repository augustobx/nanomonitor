# Telemetría — NanoLabs Control Center

## Especificación de Frecuencias y Flujos de Telemetría

La arquitectura de telemetría de NanoLabs Agent se encuentra completamente desacoplada en 7 canales independientes para optimizar consumo de red, CPU y responder en segundos ante incidentes de seguridad.

### Tabla de Frecuencias Definitivas

| Flujo | Frecuencia | Jitter | Tamaño Aprox. | Propósito Operativo |
|---|---|---|---|---|
| **Eventos Críticos** | **60 segundos** | 0 seg (exacto) | ~500 B | Detección de caídas abruptas (BSOD, Kernel-Power, fallas NTFS o servicios críticos). Cursor bookmark por `EventRecordID`. |
| **Heartbeat + Seguridad** | **180 segundos (3 min)** | 0 seg (exacto) | ~1.2 KB | Latido de conectividad, uptime, latencia hacia la API y postura de protección activa (Antivirus + Perfiles Firewall). |
| **Métricas de Rendimiento** | **300 segundos (5 min)** | ±10 seg | ~1.5 KB | Consumo de CPU, memoria física (utilizada/disponible) y ocupación de discos lógicos (C:\, D:\, etc.). |
| **SMART / Salud de Discos** | **3600 segundos (60 min)** | ±60 seg | ~2.0 KB | Predicción de fallos físicos, desgaste (wear level) y temperatura de unidades SSD, NVMe y mecánicas. Si degrada a WARNING/CRITICAL, genera evento inmediato. |
| **Windows Update** | **14400 segundos (4 horas)** + Inicio | ±120 seg | ~1.0 KB | Estado de parches acumulativos, indicador de reinicio pendiente y motivos de reinicio en el registro. |
| **Inventario General** | **86400 segundos (24 horas)** + Inicio | +300 seg | ~5-15 KB | Especificaciones fijas de la máquina: CPU, RAM instalada, placas de red, número de serie, placa madre. |
| **Inventario de Software** | **86400 segundos (24 horas)** + Inicio | +300 seg | ~10-40 KB | Catálogo de programas instalados. Optimizado mediante fingerprint SHA-256: solo se envía si hay cambios respecto al snapshot anterior. |

---

## Mecanismos de Optimización de Tráfico

### 1. Cursor de Event Viewer (`EventRecordID`)
Para evitar reescanear el log de eventos de Windows (que puede contener cientos de miles de entradas históricas), el agente obtiene al iniciar el `EventRecordID` más alto en los canales `System` y `Application`. Cada 60 segundos, ejecuta una consulta XPath filtrada exclusivamente por `EventRecordID > {último_id}` y severidades críticas/errores.

### 2. Fingerprint y Diff de Software (SHA-256)
El agente indexa las ramas de registro de 64 bits, 32 bits y CurrentUser. Genera un hash determinista SHA-256 de todas las aplicaciones y versiones ordenadas alfabéticamente.
* Si el hash coincide con el del ciclo anterior: **omite el envío**.
* Si el hash difiere: calcula el delta (`INSTALLED`, `REMOVED`, `UPDATED`) y transmite la actualización junto al nuevo hash.

### 3. Jitter Anti-Congestión
En entornos con cientos o miles de agentes, las tareas no críticas aplican una fluctuación pseudo-aleatoria alrededor del intervalo base:
$$\text{IntervaloEfectivo} = \text{IntervaloBase} \pm \text{Jitter}$$
Esto previene el fenómeno de "estampida de peticiones" (*thundering herd*) contra el balanceador Nginx Proxy Manager.

---

## Buffer Offline y Prioridades de Transmisión

En caso de corte de suministro de internet o indisponibilidad del servidor central, las cargas se acumulan en el archivo local `buffer.db`.

### Orden de Prioridad de Transmisión y Descarte
1. `PrioritySecurity` (Prioridad 1): Eventos inmediatos `SECURITY_STATE_CHANGED`.
2. `PriorityCriticalEvent` (Prioridad 2): BSOD, Kernel-Power, corrupción de disco, fallos predictivos SMART.
3. `PriorityAlert` (Prioridad 3): Cierres inesperados de aplicaciones, fallas de servicio.
4. `PriorityHeartbeat` (Prioridad 4): Latidos periódicos de presencia.
5. `PriorityMetrics` (Prioridad 5): Métricas históricas de CPU/RAM.
6. `PriorityInventory` (Prioridad 6): Snapshots de inventario general y software.

**Regla de Oro de Descarte:** Si el buffer llega a su límite máximo configurado (10 MB), los primeros elementos en descartarse son los de menor prioridad (Prioridad 6 y 5). Los eventos de seguridad y críticos jamás se descartan mientras exista telemetría ordinaria en el buffer.
