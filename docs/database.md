# Base de Datos y Retención — NanoLabs Control Center

## 1. Motor y Almacenamiento

- **Motor**: PostgreSQL 17 Alpine
- **Caché y Mensajería**: Redis 7 Alpine
- **ORM / Query Builder**: Prisma ORM v6 con extensiones SQL nativas para particionamiento.

---

## 2. Estrategia de Particionamiento Nativo (PostgreSQL 17)

Las tablas de telemetría de alta frecuencia (`device_metrics` y `agent_heartbeats`) reciben cientos de miles de registros diarios. Para evitar degradación por fragmentación, bloqueos de vacuum e índices sobredimensionados, se implementa **particionamiento por rango temporal semanal (`RANGE (timestamp)`)**.

### Nomenclatura de Particiones

Formato ISO de semana:
- `device_metrics_YYYY_wWW` (ejemplo: `device_metrics_2026_w38`)
- `agent_heartbeats_YYYY_wWW` (ejemplo: `agent_heartbeats_2026_w38`)

Cada partición abarca desde el lunes 00:00:00 UTC hasta el lunes siguiente 00:00:00 UTC.

### Ventajas de Rendimiento

1. **Partition Pruning**: PostgreSQL descarta particiones completas al consultar rangos específicos de fechas, acelerando drásticamente las consultas del Dashboard.
2. **Borrado O(1)**: La expiración de datos viejos se realiza con `DROP TABLE` de la partición en lugar de costosos `DELETE` masivos que generan dead tuples y bloat.
3. **Índices BRIN (Block Range Index)**: Índice ultra compacto en la columna `timestamp` (~miles de veces más liviano que B-Tree para series temporales ordenadas).

---

## 3. Políticas de Retención de Datos

| Entidad | Granularidad | Retención | Mecanismo de Limpieza |
|---|---|---|---|
| **`device_metrics` (raw)** | Cada 5 min | **7 días** | `DROP PARTITION` / delete |
| **`agent_heartbeats` (raw)** | Cada 3 min | **7 días** | `DROP PARTITION` / delete |
| **`device_metrics_hourly`** | 1 hora rollup | **90 días** | Batch delete programado |
| **`device_metrics_daily`** | 24 horas rollup | **365 días (1 año)** | Batch delete programado |
| **`device_events`** | Por evento | **90 días** | Batch delete programado |
| **`device_inventories`** | Snapshots completos | **30 últimos por device** | Pruning ordenado por `collectedAt` |
| **`audit_logs`** | Por acción | **365 días** | Archivo / delete de seguridad |

---

## 4. Jobs y Agregadores Periódicos (`server/src/jobs/`)

### `metric-aggregator`
- **Frecuencia**: Cada hora (o intervalo configurable).
- **Entrada**: Registros raw de `device_metrics` de la última hora completa.
- **Cálculo**:
  - `cpuAvg`: Promedio aritmético ponderado.
  - `cpuMax`: Pico máximo de CPU en la hora.
  - `ramAvgMB`: Promedio de uso de memoria RAM.
  - `ramMaxMB`: Pico máximo de uso de memoria RAM.
  - `volumeSnapshots`: Último estado de los volúmenes de almacenamiento.
  - `sampleCount`: Cantidad de muestras tomadas.
- **Destino**: `device_metrics_hourly` (upsert atómico por `[tenantId, deviceId, bucketHour]`).

### `daily-aggregator`
- **Frecuencia**: Cada 24 horas (a las 00:15 UTC).
- **Entrada**: Las 24 entradas horarias de `device_metrics_hourly` del día anterior.
- **Cálculo**: Promedios ponderados por `sampleCount`, máximos diarios y suma de muestras.
- **Destino**: `device_metrics_daily` (upsert atómico por `[tenantId, deviceId, bucketDay]`).

### `retention-cleanup`
- **Frecuencia**: Cada 6 horas.
- **Acción**: Ejecuta las políticas de purga según los umbrales de retención:
  - Elimina telemetría raw anterior a 7 días.
  - Elimina rollups horarios anteriores a 90 días.
  - Elimina rollups diarios anteriores a 365 días.
  - Elimina eventos anteriores a 90 días.
  - Poda snapshots de inventario reteniendo únicamente los 30 más recientes por PC.

### `partition-creator`
- **Frecuencia**: Diario (a las 04:00 UTC).
- **Acción**: Calcula proactivamente las semanas de los próximos 14 días y asegura la existencia de las particiones PostgreSQL (`CREATE TABLE IF NOT EXISTS ... PARTITION OF ...`).

---

## 5. Ejecución y Comandos CLI

El backend permite operar los jobs en dos modalidades:

### Modo Daemon / Worker en segundo plano:
```bash
npm run worker
```

### Ejecución directa por CLI (para crontab del servidor Linux o mantenimiento manual):
```bash
# Ejecutar agregación horaria inmediata
npm run job:hourly

# Ejecutar consolidación diaria
npm run job:daily

# Ejecutar limpieza y retención
npm run job:cleanup

# Crear/verificar particiones futuras
npm run job:partitions

# Ejecutar ciclo completo de mantenimiento
npm run job:all
```
