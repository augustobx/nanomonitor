# Arquitectura — NanoLabs Control Center

> Documento generado en Fase 0. Se actualizará con cada fase de implementación.

## Visión general

```
PC Windows → NanoLabs Agent (Go) → HTTPS → Nginx Proxy Manager → API (Fastify) → PostgreSQL
                                                                  → Redis (BullMQ)
                                                                  → Worker (alertas, agregaciones)
                                                                  → Web (Next.js 16)
```

## Componentes

### 1. NanoLabs Agent (Go)
- Binario estático único (~15-20 MB)
- Windows Service con auto-start
- Collectors modulares: identity, hardware, performance, network, security, updates, storage, software, events
- Scheduler con intervalos configurables por tipo de dato
- HTTP client con retry y exponential backoff
- SQLite offline buffer
- DPAPI para almacenamiento seguro de credenciales

### 2. API Server (Fastify + TypeScript)
- Endpoints separados: enrollment, heartbeat, metrics, inventory, events
- Auth dual: JWT (usuarios) + HMAC (agentes)
- Middleware obligatorio de tenant isolation
- Rate limiting por agentId/userId/IP
- Audit logging automático
- Structured logging con Pino

### 3. Worker (BullMQ)
- Alert evaluator
- Metric aggregator (hourly/daily)
- Retention cleanup
- Health scorer
- Trend analyzer (post-MVP)

### 4. Web Frontend (Next.js 16)
- Dashboard con estado global
- Gestión de clientes, sitios, dispositivos
- Ficha de dispositivo con tabs y gráficos
- Alertas e incidentes
- RBAC en UI

### 5. PostgreSQL 17
- Tablas particionadas para métricas (PARTITION BY RANGE)
- Agregaciones horarias y diarias
- Retención automática por DROP PARTITION

### 6. Redis 7
- BullMQ queues
- Nonce cache (anti-replay)
- Rate limiting counters
- Session cache

## Principios

1. El agente NUNCA abre puertos — toda comunicación es outbound.
2. V1 es READ-ONLY — sin ejecución remota de comandos.
3. Tenant isolation obligatorio en toda query.
4. Cada agente tiene identidad y secretos propios.
5. Separación API / UI / Worker como servicios independientes.
