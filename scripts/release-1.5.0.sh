#!/usr/bin/env bash
set -euo pipefail

VERSION="1.5.0"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMMIT="$(git rev-parse --short HEAD)"
BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

echo "====================================================="
echo " NanoMonitor v$VERSION hardened release"
echo " commit: $COMMIT"
echo " build:  $BUILD_DATE"
echo "====================================================="

echo "=== 0/7 PREFLIGHT ==="
test -f compose.yml
test -f server/package.json
test -f agent/go.mod
test -f installer/go.mod
test -f thermal-helper/NanoThermal.csproj
test -f thermal-helper/Program.cs
test -f third_party/THIRD_PARTY_NOTICES.txt
command -v curl >/dev/null
docker compose config -q

echo "=== 1/7 SERVER BUILD + TYPESCRIPT + CONTRACT VALIDATION ==="
# Dockerfile runs npm ci, prisma generate and npm run build.
# No production container is replaced if this build fails.
docker compose build nanomonitor-server

echo "=== 2/8 NANOTHERMAL + VERIFIED PAWNIO PROVIDER ==="
mkdir -p .build-phase3
rm -rf .build-phase3/thermal-publish

docker run --rm \
  -v "$ROOT":/src \
  -w /src/thermal-helper \
  mcr.microsoft.com/dotnet/sdk:8.0 \
  sh -lc '
    set -e
    dotnet restore NanoThermal.csproj
    dotnet publish NanoThermal.csproj \
      -c Release \
      -r win-x64 \
      --self-contained true \
      -p:PublishSingleFile=true \
      -p:IncludeNativeLibrariesForSelfExtract=true \
      -p:IncludeAllContentForSelfExtract=true \
      -p:PublishTrimmed=false \
      -o /src/.build-phase3/thermal-publish
  '

\cp -f .build-phase3/thermal-publish/nanothermal.exe .build-phase3/nanothermal.exe
test -s .build-phase3/nanothermal.exe

PAWNIO_VERSION="2.2.0"
PAWNIO_SHA256="1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032"
PAWNIO_URL="https://github.com/namazso/PawnIO.Setup/releases/download/$PAWNIO_VERSION/PawnIO_setup.exe"

curl --fail --location --retry 3 --retry-delay 2 \
  "$PAWNIO_URL" \
  -o .build-phase3/PawnIO_setup.exe

echo "$PAWNIO_SHA256  .build-phase3/PawnIO_setup.exe" | sha256sum -c -

echo "=== 3/8 WINDOWS AGENT + TRAY BUILD ==="

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

    LDFLAGS="-s -w \
      -X github.com/nanolabs/nanomonitor/agent/internal/version.Version=$VERSION \
      -X github.com/nanolabs/nanomonitor/agent/internal/version.Commit=$COMMIT \
      -X github.com/nanolabs/nanomonitor/agent/internal/version.BuildDate=$BUILD_DATE"

    go build \
      -buildvcs=false \
      -trimpath \
      -ldflags "$LDFLAGS" \
      -o /src/.build-phase3/nanoagent.exe \
      ./cmd/nanoagent

    go build \
      -buildvcs=false \
      -trimpath \
      -ldflags "$LDFLAGS -H=windowsgui" \
      -o /src/.build-phase3/nanotray.exe \
      ./cmd/nanotray
  '

echo "=== 4/8 INSTALLER BUILD ==="
rm -rf installer/cmd/installer/embedded
mkdir -p installer/cmd/installer/embedded

\cp -f .build-phase3/nanoagent.exe installer/cmd/installer/embedded/nanoagent.exe
\cp -f .build-phase3/nanotray.exe installer/cmd/installer/embedded/nanotray.exe
\cp -f .build-phase3/nanothermal.exe installer/cmd/installer/embedded/nanothermal.exe
\cp -f .build-phase3/PawnIO_setup.exe installer/cmd/installer/embedded/PawnIO_setup.exe
\cp -f third_party/THIRD_PARTY_NOTICES.txt installer/cmd/installer/embedded/THIRD_PARTY_NOTICES.txt

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
      -o /src/.build-phase3/NanoMonitor-Setup.exe \
      ./cmd/installer
  '

echo "=== 5/8 PUBLISH DOWNLOAD ARTIFACTS ==="
mkdir -p downloads
\cp -f .build-phase3/NanoMonitor-Setup.exe downloads/NanoMonitor-Setup.exe
\cp -f .build-phase3/nanoagent.exe downloads/nanoagent.exe
\cp -f .build-phase3/nanotray.exe downloads/nanotray.exe
\cp -f .build-phase3/nanothermal.exe downloads/nanothermal.exe

cat > downloads/release.json <<EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "buildDate": "$BUILD_DATE",
  "installer": "NanoMonitor-Setup.exe",
  "agent": "nanoagent.exe",
  "tray": "nanotray.exe",
  "thermalHelper": "nanothermal.exe",
  "thermalProvider": "LibreHardwareMonitorLib 0.9.6 + PawnIO 2.2.0",
  "pawnioSha256": "1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032"
}
EOF

echo "=== 6/8 DEPLOY SERVER + SAFE ADDITIVE SCHEMA SYNC ==="
# Container startup runs prisma db push before starting the API.
# Always recreate the API after a fresh image build so production cannot keep the previous image.
docker compose up -d --force-recreate nanomonitor-server

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
  docker logs --tail 200 nanomonitor-server
  exit 1
fi

echo "=== 7/8 RUNNING CONTAINERS ==="
docker ps --filter name=nanomonitor --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"

echo "=== 8/8 RELEASE HASHES ==="
sha256sum \
  .build-phase3/nanoagent.exe \
  .build-phase3/nanotray.exe \
  .build-phase3/nanothermal.exe \
  .build-phase3/PawnIO_setup.exe \
  .build-phase3/NanoMonitor-Setup.exe \
  downloads/NanoMonitor-Setup.exe

echo
echo "NanoMonitor v$VERSION publicado correctamente."
echo "Installer: https://monitor.nanolabs.com.ar/downloads/NanoMonitor-Setup.exe"
echo "Metadata:  $ROOT/downloads/release.json"
