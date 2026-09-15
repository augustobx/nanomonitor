# Security — NanoLabs Control Center

> Se actualizará durante F15. Documento inicial.

## Principios

1. V1 es READ-ONLY — el agente no ejecuta comandos remotos
2. Cada agente tiene identidad y secretos propios
3. Tenant isolation en toda query de base de datos
4. Nunca confiar en datos del cliente para determinar permisos
5. Defense in depth — múltiples capas de protección

## Autenticación

### Agentes
- HMAC-SHA256 con `agentSecret` por dispositivo
- Protección anti-replay: timestamp ±5 min + nonce en Redis
- Body integrity: HMAC incluye hash del body
- Credenciales almacenadas con DPAPI en Windows

### Usuarios
- Argon2id para password hashing
- JWT access token (15 min) + refresh token (7 días, HttpOnly cookie)
- Revocación de sesiones en DB
- CSRF: SameSite=Strict + CSRF token

## Modelo de amenazas

| Amenaza | Control |
|---|---|
| Token de enrolamiento robado | Expiración 24h, uso único |
| Agent secret comprometido | Revocación individual, DPAPI |
| Replay | Timestamp + nonce |
| Spoofing deviceId | Asignado por servidor |
| Payload manipulation | HMAC del body |
| SQL injection | Prisma (prepared statements) |
| XSS | React escaping, CSP headers |
| CSRF | SameSite cookies, CSRF token |
| Tenant isolation breach | Middleware obligatorio |
| API abuse | Rate limiting |
| Secretos en logs | Pino redaction |
| DB expuesta | Red interna Docker |

## Roles

| Rol | Alcance |
|---|---|
| SUPER_ADMIN | Cross-tenant, plataforma |
| ADMIN | Tenant completo |
| TECHNICIAN | Alertas, incidentes, dispositivos |
| VIEWER | Solo lectura |
| CLIENT | Solo sus dispositivos (futuro) |
