# API Reference — NanoLabs Control Center

## Base URL

- Development: `http://localhost:4000`
- Production: `https://control-api.nanoapps.site`

## Autenticación

### 1. Endpoints de Agente (`/agent/*`)

Autenticación mediante firma criptográfica HMAC-SHA256 por cada petición:

```http
Authorization: NanoAgent <agentId>.<signature>
X-Nano-Timestamp: 1726400000
X-Nano-Nonce: 7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d
Content-Type: application/json
```

**Mecanismo de firma**:
1. `bodyHash = SHA256(rawBody).toHex()`
2. `message = timestamp + "\n" + bodyHash`
3. `signature = HMAC_SHA256(message, agentSecret).toHex()`

**Validaciones de seguridad del servidor**:
- **Clock drift**: El timestamp debe estar dentro de ±300 segundos del reloj del servidor.
- **Deduplicación de Nonce**: El nonce se valida y almacena en Redis (o fallback en memoria) con TTL de 600 segundos para impedir ataques de replay.
- **Aislamiento**: El agente solo puede modificar y consultar el dispositivo asociado a sus credenciales.

---

### 2. Endpoints de Usuario (`/api/v1/*`)

Autenticación JWT estándar para el panel web y técnicos:

```http
Authorization: Bearer <jwt_access_token>
```

- **AccessToken**: JWT con 15 minutos de vigencia, contiene `userId`, `tenantId`, `email`, `role`.
- **RefreshToken**: Hash criptográfico almacenado en base de datos, entregado en cookie HttpOnly `SameSite=Strict`, con rotación automática en cada refresco.

---

## Endpoints Implementados (F2)

### Enrolamiento de Agentes

#### Crear token de enrolamiento
`POST /api/v1/enrollment/tokens`
- **Permisos**: `SUPER_ADMIN`, `ADMIN`, `TECHNICIAN`
- **Body**:
  ```json
  {
    "customerId": "UUID",
    "siteId": "UUID (opcional)",
    "maxUses": 1,
    "expiresInHours": 24
  }
  ```
- **Response 201**:
  ```json
  {
    "statusCode": 201,
    "data": {
      "id": "UUID",
      "token": "NL-ENRL-A1B2C3D4...",
      "maxUses": 1,
      "usedCount": 0,
      "expiresAt": "2026-09-16T10:00:00.000Z"
    }
  }
  ```

#### Listar tokens activos
`GET /api/v1/enrollment/tokens`
- **Permisos**: `SUPER_ADMIN`, `ADMIN`, `TECHNICIAN`

#### Revocar token
`DELETE /api/v1/enrollment/tokens/:id`
- **Permisos**: `SUPER_ADMIN`, `ADMIN`

#### Registro de Agente (Enrollment)
`POST /enrollment/register` (y `/api/v1/enrollment/register`)
- **Público con Token válido**
- **Body**:
  ```json
  {
    "token": "NL-ENRL-A1B2C3D4...",
    "hostname": "PC-CONTABILIDAD",
    "hardwareId": "UUID-o-WMI-ID",
    "osInfo": {
      "caption": "Microsoft Windows 11 Pro",
      "version": "10.0.22631",
      "buildNumber": "22631",
      "osArchitecture": "64-bit",
      "manufacturer": "Dell Inc.",
      "model": "OptiPlex 7090",
      "serialNumber": "8H2K9L1"
    }
  }
  ```
- **Response 201**:
  ```json
  {
    "agentId": "UUID",
    "agentSecret": "64-hex-chars-secret",
    "deviceId": "UUID",
    "tenantId": "UUID",
    "config": {
      "heartbeatInterval": 180,
      "metricsInterval": 300,
      "inventoryInterval": 86400
    }
  }
  ```

---

### Ingesta de Telemetría (`/agent/*`)

Todos requieren cabeceras `Authorization: NanoAgent ...`, `X-Nano-Timestamp` y `X-Nano-Nonce`.

#### Heartbeat
`POST /agent/heartbeat`
- **Body**:
  ```json
  {
    "agentVersion": "0.1.0",
    "timestamp": "2026-09-15T11:00:00Z",
    "uptimeSeconds": 7200,
    "status": "healthy",
    "cpuPercent": 14.2,
    "ramUsedMb": 6144,
    "ramAvailMb": 10240,
    "diskSummary": []
  }
  ```
- **Response 200**: `{ "status": "ok", "serverTime": "..." }`

#### Métricas de Rendimiento
`POST /agent/metrics`
- **Body**:
  ```json
  {
    "timestamp": "2026-09-15T11:00:00Z",
    "cpuPercent": 18.5,
    "ramUsedMb": 6144,
    "ramAvailMb": 10240,
    "volumes": [
      {
        "letter": "C:",
        "totalBytes": 512000000000,
        "freeBytes": 320000000000,
        "usedPercent": 37.5
      }
    ]
  }
  ```
- **Response 200**: `{ "status": "ok" }`

#### Inventario de Hardware y SO
`POST /agent/inventory`
- **Body**:
  ```json
  {
    "identity": { ... },
    "hardware": { ... },
    "network": { ... }
  }
  ```
- **Response 200**: `{ "status": "ok", "checksum": "sha256-hash" }`

#### Eventos de Windows
`POST /agent/events`
- **Body**: Un evento o array de eventos con `dedupKey`, `severity`, `source`, `category`.
- **Response 200**: `{ "status": "ok", "processed": 1 }`

---

### Gestión y Administración (`/api/v1/*`)

#### Autenticación Web
- `POST /api/v1/auth/login` (email, password)
- `POST /api/v1/auth/refresh` (cookie HttpOnly o body)
- `POST /api/v1/auth/logout` (revocación de refresh token)
- `GET /api/v1/auth/me` (perfil del usuario y tenant)

#### Dispositivos
- `GET /api/v1/devices` (filtros: search, customerId, siteId, status, paginación)
- `GET /api/v1/devices/:id` (detalle con agente, inventario, métricas y alertas)
- `PATCH /api/v1/devices/:id` (actualización de displayName, siteId, estado)
- `DELETE /api/v1/devices/:id` (eliminación de dispositivo)

#### Clientes y Sucursales
- `GET /api/v1/customers` | `POST /api/v1/customers` | `GET /api/v1/customers/:id` | `PATCH /api/v1/customers/:id`
- `GET /api/v1/sites` | `POST /api/v1/sites` | `PATCH /api/v1/sites/:id`

#### Tenants (Multi-Tenant SuperAdmin)
- `GET /api/v1/tenants` | `POST /api/v1/tenants` | `GET /api/v1/tenants/:id` | `PATCH /api/v1/tenants/:id`
