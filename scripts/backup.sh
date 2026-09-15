#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NanoLabs Control Center - Automated Backup Script
# Destination: /opt/backups/nanomonitor/
# ==============================================================================

BACKUP_DIR="/opt/backups/nanomonitor"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/nanomonitor_db_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting PostgreSQL backup for nanomonitor..."

# Perform pg_dump inside postgres container and compress with gzip
docker exec nanomonitor-postgres pg_dump -U nanomonitor_admin -d nanomonitor_prod | gzip > "${FILENAME}"

echo "[$(date)] Backup completed successfully: ${FILENAME} ($(du -h "${FILENAME}" | cut -f1))"

# Keep last 30 days of backups (retention)
find "${BACKUP_DIR}" -name "nanomonitor_db_*.sql.gz" -mtime +30 -delete
echo "[$(date)] Old backups purged (retention: 30 days)."
