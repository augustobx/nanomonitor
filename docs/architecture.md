# Arquitectura del Sistema — NanoLabs Control Center

## Visión General de la Infraestructura

```
[Endpoint Windows]
  ├── NanoLabsAgent (Windows Service en Go)
  │    ├── EventCollector           (60s, watermark EventRecordID)
  │    ├── HeartbeatCollector       (180s, latido + latencia)
  │    ├── SecurityCollector        (180s, AV + Firewall perfiles)
  │    ├── StateChangeDetector      (Disparo instantáneo ante eventos de seguridad)
  │    ├── PerformanceCollector     (300s ± 10s jitter, CPU/RAM/Volúmenes)
  │    ├── SmartCollector           (3600s ± 60s jitter, salud física discos)
  │    ├── WindowsUpdateCollector   (14400s ± 120s jitter + boot)
  │    ├── InventoryCollector       (86400s + 300s jitter, hardware)
  │    ├── SoftwareCollector        (86400s + 300s jitter, SHA-256 diff)
  │    └── PriorityBuffer           (Cola priorizada en disco de 10 MB)
  │
  ▼ [HTTPS + HMAC-SHA256 Auth]
[Nginx Proxy Manager / SSL Termination]
  ▼
[NanoMonitor Server (Fastify + TypeScript)]
  ├── Ingestion Routes (/heartbeat, /metrics, /inventory, /software, /events)
  ├── AlertEvaluator Engine (Evaluación con ventana de persistencia de 5 min)
  ├── HealthScore Engine (Puntaje integral 0-100 por categorías)
  └── SSR Landing & Real-time Console (SSR + Vanilla JS / CSS)
  ▼
[Bases de Datos & Caché]
  ├── PostgreSQL 17 (Esquema relacional + snapshots de inventario y eventos)
  └── Redis 7 (Tokens anti-replay, rate limiters, colas en background)
```

---

## Arquitectura de Collectors Desacoplados

A diferencia de modelos heredados donde se disparaba un inventario pesado cada vez que se requería conocer el estado de seguridad, NanoLabs Agent separa estrictamente cada dominio:

1. **Canal de Alta Frecuencia (60s):** Eventos del sistema operativo (Kernel-Power, pantallas azules BSOD, errores NTFS de disco, fallos de servicios). Utiliza consultas XPath incrementales a través de `wevtutil` para no releer el histórico.
2. **Canal Operativo y de Seguridad (180s / 3 min):** Heartbeat liviano combinado con la lectura rápida de antivirus y perfiles de firewall mediante APIs nativas de WMI y registro.
3. **Canal de Rendimiento (300s / 5 min):** Muestreo de CPU, memoria física y uso de volúmenes lógicos, sin inventarios de software ni llamadas pesadas a WMI.
4. **Canal de Almacenamiento Físico (3600s / 60 min):** Diagnóstico predictivo SMART de discos duros y unidades de estado sólido.
5. **Canal de Mantenimiento de Sistema (14400s / 4h):** Estado de parches acumulativos y reinicios pendientes.
6. **Canal de Inventario Pasivo (86400s / 24h):** Especificaciones de hardware y catálogo de software. Implementa hash SHA-256 para evitar retransmisiones innecesarias cuando no hubo instalaciones o desinstalaciones.

---

## Ciclo de Vida del Agente y Tolerancia a Fallos

### 1. Arranque Escalonado
Para evitar que el agente consuma picos de I/O al iniciar Windows:
* **T+0s:** Envío del primer Heartbeat + Security State (el equipo se marca ONLINE en la consola inmediatamente).
* **T+5s:** Windows Update.
* **T+10s:** SMART de discos.
* **T+15s:** Hardware y software inventory.
* **T+20s:** Drenaje de buffer offline si existieren datos previos.
* **T+60s+:** Activación de bucles regulares independientes.

### 2. Detección Local de Transiciones (`StateChangeDetector`)
Las transiciones críticas de seguridad (como la desactivación de Defender o del firewall público) se detectan localmente y generan una notificación inmediata a la API, sin esperar el vencimiento del ciclo de 3 minutos.

### 3. Buffer Priorizado
Ante pérdida de conectividad, los datos se almacenan en `buffer.db`. La expulsión ante saturación sigue un orden estricto de menor a mayor importancia: se descarta primero inventario y métricas, preservando intactos los eventos críticos y los registros de cambio de seguridad.
