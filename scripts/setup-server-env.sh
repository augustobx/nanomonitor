#!/usr/bin/env bash
set -euo pipefail

cd /opt/apps/nanomonitor

echo "Regenerating production .env with cryptographically secure secrets..."

DB_PASS=$(openssl rand -hex 16)
REDIS_PASS=$(openssl rand -hex 16)
JWT_SEC=$(openssl rand -hex 32)

cat <<'EOF' > .env.new
# Production Environment for NanoLabs Control Center
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGIN=https://monitor.nanolabs.com.ar

DB_USER=nanomonitor_admin
DB_NAME=nanomonitor_prod
REDIS_HOST=nanomonitor-redis
REDIS_PORT=6379
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
AGENT_TIMESTAMP_DRIFT_SECS=300
ADMIN_INITIAL_PASSWORD=NanoLabs2026!MonitorAdmin
EOF

echo "DB_PASSWORD=${DB_PASS}" >> .env.new
echo "REDIS_PASSWORD=${REDIS_PASS}" >> .env.new
echo "JWT_SECRET=${JWT_SEC}" >> .env.new

mv .env.new .env
chmod 600 .env
echo "Production .env created successfully with restricted permissions (600)."
