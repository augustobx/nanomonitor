#!/usr/bin/env bash
set -euo pipefail

VERSION="1.4.0"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMMIT="$(git rev-parse --short HEAD)"
BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

echo "====================================================="
echo " NanoMonitor v$VERSION release"
echo " commit: $COMMIT"
echo " build:  $BUILD_DATE"
echo "====================================================="

echo "=== 1/6 SERVER BUILD + CONTRACT VALIDATION ==="
docker compose build nanomonitor-server

echo "=== 2/6 WINDOWS AGENT BUILD ==="
mkdir -p .build-phase1

docker run --rm \
  -e CGO_ENABLED=0 \
  -e GOOS=windows \
  -e GOARCH=amd64 \
  -e COMMIT="$COMMIT" \
  -e BUILD_DATE="$BUILD_DATE" \
  -e VERSION="$VERSION" \
  -v "$ROOT":/src \
  -w /src/agent \
  golang:1.26 \
  sh -c '
    set -e
    go mod download
    go build \
      -buildvcs=false \
      -trimpath \
      -ldflags "-s -w \
        -X github.com/nanolabs/nanomonitor/agent/internal/version.Version=$VERSION \
        -X github.com/nanolabs/nanomonitor/agent/internal/version.Commit=$COMMIT \
        -X github.com/nanolabs/nanomonitor/agent/internal/version.BuildDate=$BUILD_DATE" \
      -o /src/.build-phase1/nanoagent.exe \
      ./cmd/nanoagent
  '

echo "=== 3/6 INSTALLER BUILD ==="
rm -rf installer/cmd/installer/embedded
mkdir -p installer/cmd/installer/embedded

\cp -f .build-phase1/nanoagent.exe installer/cmd/installer/embedded/nanoagent.exe
\cp -f .build-phase1/nanotray.exe installer/cmd/installer/embedded/nanotray.exe

docker run --rm \
  -e CGO_ENABLED=0 \
  -e GOOS=windows \
  -e GOARCH=amd64 \
  -v "$ROOT":/src \
  -w /src/installer \
  golang:1.26 \
  sh -c '
    set -e
    go mod download
    go build \
      -buildvcs=false \
      -trimpath \
      -ldflags "-s -w" \
      -o /src/.build-phase1/NanoMonitor-Setup.exe \
      ./cmd/installer
  '

echo "=== 4/6 PUBLISH DOWNLOADS ==="
mkdir -p downloads
\cp -f .build-phase1/NanoMonitor-Setup.exe downloads/NanoMonitor-Setup.exe
\cp -f .build-phase1/nanoagent.exe downloads/nanoagent.exe

cat > downloads/release.json <<EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "buildDate": "$BUILD_DATE",
  "installer": "NanoMonitor-Setup.exe",
  "agent": "nanoagent.exe"
}
EOF

echo "=== 5/6 DEPLOY SERVER + DATABASE SCHEMA ==="
docker compose up -d nanomonitor-server

healthy=0
for i in $(seq 1 30); do
  if docker exec nanomonitor-server curl -fsS http://localhost:4000/health >/tmp/nanomonitor-health.json 2>/dev/null; then
    healthy=1
    cat /tmp/nanomonitor-health.json
    echo
    break
  fi
  echo "Esperando NanoMonitor API... $i/30"
  sleep 2
done

if [ "$healthy" -ne 1 ]; then
  echo "ERROR: NanoMonitor API no quedó saludable."
  docker logs --tail 150 nanomonitor-server
  exit 1
fi

echo "=== 6/6 RELEASE HASHES ==="
sha256sum \
  .build-phase1/nanoagent.exe \
  .build-phase1/NanoMonitor-Setup.exe \
  downloads/NanoMonitor-Setup.exe

echo
echo "NanoMonitor v$VERSION publicado correctamente."
echo "Installer: https://monitor.nanolabs.com.ar/downloads/NanoMonitor-Setup.exe"
echo "Metadata:  $ROOT/downloads/release.json"
