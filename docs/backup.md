# Backup — NanoLabs Control Center
> Se actualizará durante F16. Documento inicial.
## Estrategia
- PostgreSQL: `pg_dump` cada 6 horas
- Retención local: 30 días
- Ruta: `/opt/backups/nanocontrol/`
- Compresión: gzip
- Naming: `nanocontrol_db_YYYYMMDD_HHMMSS.sql.gz`
