# API Reference — NanoLabs Control Center

> Se actualizará durante F2. Documento inicial.

## Base URL

```
https://control-api.nanoapps.site/api
```

## Authentication

### Agent endpoints
```
Authorization: NanoAgent <agentId>.<hmac>
X-Nano-Timestamp: <unix_timestamp>
X-Nano-Nonce: <random_string>
```

### Web endpoints
```
Authorization: Bearer <jwt_access_token>
```

## Endpoints (planned)

### Enrollment
- `POST /api/enrollment/tokens` — Create enrollment token (admin)
- `POST /api/enrollment/register` — Register device with token (agent)

### Agent
- `POST /api/agent/heartbeat` — Send heartbeat (agent)
- `POST /api/agent/metrics` — Send performance metrics (agent)
- `POST /api/agent/inventory` — Send inventory snapshot (agent)
- `POST /api/agent/events` — Send device events (agent)

### Tenants
- `GET /api/tenants` — List tenants (super_admin)
- `POST /api/tenants` — Create tenant (super_admin)

### Customers
- `GET /api/customers` — List customers
- `POST /api/customers` — Create customer
- `GET /api/customers/:id` — Get customer detail
- `PATCH /api/customers/:id` — Update customer

### Sites
- `GET /api/sites` — List sites
- `POST /api/sites` — Create site

### Devices
- `GET /api/devices` — List devices (filterable)
- `GET /api/devices/:id` — Device detail
- `GET /api/devices/:id/metrics` — Device metrics history
- `GET /api/devices/:id/events` — Device events
- `GET /api/devices/:id/inventory` — Latest inventory
- `GET /api/devices/:id/health` — Health score history

### Alerts
- `GET /api/alerts` — List alerts
- `PATCH /api/alerts/:id` — Acknowledge/resolve
- `GET /api/alert-rules` — List alert rules
- `POST /api/alert-rules` — Create alert rule

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh token
- `POST /api/auth/logout` — Logout
