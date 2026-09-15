# Database — NanoLabs Control Center

> Se actualizará durante F2/F3. Documento inicial.

## Motor

PostgreSQL 17 Alpine (via Docker)

## Estrategia de partitioning

Las tablas de alta frecuencia (`device_metrics`, `agent_heartbeats`) usan partitioning nativo de PostgreSQL por rango de timestamp.

### Particiones

- **Semanales** para métricas raw
- Creadas automáticamente por job `partition-creator` (7 días adelante)
- Eliminadas automáticamente por job `retention-cleanup`

## Retención

| Tipo | Retención | Método de limpieza |
|---|---|---|
| Métricas raw | 7 días | DROP PARTITION |
| Heartbeats raw | 7 días | DROP PARTITION |
| Métricas hourly | 90 días | DELETE |
| Métricas daily | 365 días | DELETE |
| Eventos | 90 días | DELETE |
| Inventarios | 30 últimos por device | DELETE |
| Health scores | 365 días | DELETE |
| Audit logs | 365 días | Archivable |

## Índices principales

- `(tenant_id, device_id, timestamp)` en todas las tablas de telemetría
- `(tenant_id, status)` en alerts y devices
- `(tenant_id, customer_id)` en devices
- `(tenant_id, email)` UNIQUE en users
- `(tenant_id, code)` UNIQUE en customers

## Volumen estimado

Para 100 dispositivos: ~500 MB/mes efectivos con retención y agregaciones.
