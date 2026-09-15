# NanoLabs Control Center

Plataforma de monitoreo preventivo y administración de equipos Windows para clientes de NanoLabs.

## Arquitectura

| Componente | Tecnología | Directorio |
|---|---|---|
| **Agente Windows** | Go | `agent/` |
| **API Backend** | Fastify + TypeScript + Prisma | `server/` |
| **Panel Web** | Next.js 16 + TypeScript | `web/` |
| **Base de datos** | PostgreSQL 17 | via Docker |
| **Cola de jobs** | Redis + BullMQ | via Docker |
| **Infraestructura** | Docker Compose + Nginx Proxy Manager | `docker/` |

## Estructura del proyecto

```
nanomonitor/
├── agent/          # Agente Go para Windows
├── server/         # API backend (Fastify + TypeScript)
├── web/            # Panel web (Next.js 16)
├── docker/         # Docker Compose y configuración de producción
├── scripts/        # Scripts de backup, restore, setup
├── installer/      # Instalador Windows (futuro)
└── docs/           # Documentación técnica
```

## Requisitos

### Desarrollo
- Go 1.23+
- Node.js 22 LTS
- Docker + Docker Compose
- PostgreSQL 17 (via Docker)
- Redis 7 (via Docker)

### Producción
- Debian 13
- Docker + Docker Compose
- Nginx Proxy Manager
- Let's Encrypt (HTTPS)

## Inicio rápido (desarrollo)

```bash
# 1. Levantar servicios de infraestructura
cd docker
docker compose -f docker-compose.dev.yml up -d

# 2. Backend API
cd ../server
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev

# 3. Frontend
cd ../web
cp .env.example .env.local
npm install
npm run dev

# 4. Agente (compilar para Windows)
cd ../agent
go build -o bin/nanoagent.exe ./cmd/nanoagent
```

## Documentación

Consultar [`docs/`](docs/) para documentación detallada:

- [Arquitectura](docs/architecture.md)
- [Agente Windows](docs/agent.md)
- [API](docs/api.md)
- [Base de datos](docs/database.md)
- [Seguridad](docs/security.md)
- [Enrolamiento](docs/enrollment.md)
- [Telemetría](docs/telemetry.md)
- [Alertas](docs/alerts.md)
- [Health Score](docs/health-score.md)
- [Despliegue](docs/deployment.md)
- [Backup](docs/backup.md)
- [Disaster Recovery](docs/disaster-recovery.md)
- [Instalador Windows](docs/windows-installer.md)
- [Roadmap](docs/roadmap.md)

## Licencia

Propietario — NanoLabs. Todos los derechos reservados.
