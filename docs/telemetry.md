# Telemetry — NanoLabs Control Center

> Se actualizará durante F1-F3. Documento inicial.

## Tipos de datos

| Tipo | Frecuencia | Tamaño aprox. |
|---|---|---|
| Heartbeat | 3 min | ~500 bytes |
| Métricas | 5 min | ~1 KB |
| Inventario | 24h + on change | ~5-20 KB |
| Software | 24h + on change | ~10-50 KB |
| Eventos | Inmediato / batch 15 min | ~200 bytes c/u |

## Detección de cambios

El inventario y software usan checksum (SHA-256 del payload). Solo se envía al servidor si el checksum cambió respecto al último envío.

## Offline buffer

- SQLite local en `C:\ProgramData\NanoLabs\Agent\buffer.db`
- Límite total: 10 MB
- Prioridad de descarte: heartbeats > métricas > eventos (críticos último)
- Flush al reconectar: eventos críticos primero, luego inventario, métricas, heartbeats
