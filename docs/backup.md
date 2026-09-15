# Estrategia de Backup — NanoLabs Control Center

## 1. Copias de Seguridad de la Base de Datos

- **Motor**: PostgreSQL 17
- **Mecanismo**: `docker exec nanomonitor-postgres pg_dump` comprimido con `gzip`
- **Ruta en Servidor**: `/opt/backups/nanomonitor/`
- **Formato**: `nanomonitor_db_YYYYMMDD_HHMMSS.sql.gz`
- **Retención Local**: 30 días con purga automática.

## 2. Script de Backup (`scripts/backup.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/backups/nanomonitor"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/nanomonitor_db_${TIMESTAMP}.sql.gz"

docker exec nanomonitor-postgres pg_dump -U nanomonitor_admin -d nanomonitor_prod | gzip > "${FILENAME}"
find "${BACKUP_DIR}" -name "nanomonitor_db_*.sql.gz" -mtime +30 -delete
```

## 3. Restauración

Para restaurar una copia en caso de recuperación ante desastres:

```bash
# Descomprimir y restaurar sobre la base de datos de producción
gunzip -c /opt/backups/nanomonitor/nanomonitor_db_YYYYMMDD_HHMMSS.sql.gz | docker exec -i nanomonitor-postgres psql -U nanomonitor_admin -d nanomonitor_prod
```
