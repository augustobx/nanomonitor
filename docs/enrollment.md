# Flujo de Enrolamiento — NanoLabs Control Center

El flujo de enrolamiento vincula de forma segura e irrepudiable un agente Windows con un cliente y sucursal específicos dentro de la plataforma multi-tenant.

## Diagrama de Secuencia

```mermaid
sequenceDiagram
    participant Tech as Técnico / Administrador
    participant Web as Panel Control Center
    participant API as API Server Fastify
    participant DB as PostgreSQL + Redis
    participant Agent as NanoAgent Windows Service

    Tech->>Web: Solicitar token para Cliente X (Sucursal Y)
    Web->>API: POST /api/v1/enrollment/tokens
    API->>DB: Almacenar token (NL-ENRL-..., expiresAt: +24h, maxUses: 1)
    API-->>Web: Token generado
    Web-->>Tech: Comando de instalación listo

    Note over Tech,Agent: Instalación en PC Windows
    Tech->>Agent: nanoagent.exe /enroll /token=NL-ENRL-... /server=https://control-api.nanoapps.site

    Agent->>API: POST /enrollment/register { token, hostname, hardwareId, osInfo }
    API->>DB: Validar token (vigente, usos restantes < maxUses)
    API->>DB: Validar límite de dispositivos del plan del tenant
    API->>DB: Crear o vincular registro Device
    API->>DB: Generar agentId (UUID) y agentSecret (256-bit cryptorandom)
    API->>DB: Crear registro Agent (status: ACTIVE)
    API->>DB: Incrementar usedCount del token
    API->>DB: Registrar AuditLog ("device.enrolled")
    API-->>Agent: { agentId, agentSecret, deviceId, tenantId, config }

    Note over Agent: Almacena credenciales de forma segura (DPAPI)
    
    loop Cada 3 minutos (Heartbeat)
        Agent->>API: POST /agent/heartbeat con HMAC-SHA256
        API->>DB: Validar firma, nonce y timestamp; registrar telemetría
    end
```

## Garantías de Seguridad

1. **Tokens de un solo uso**: Por defecto `maxUses: 1`, evitando que un instalador sea reutilizado indebidamente en otra máquina no autorizada.
2. **Vencimiento estricto**: Cada token tiene un `expiresAt` configurable (por defecto 24 horas).
3. **No exposición de claves compartidas**: Los agentes nunca comparten claves de API. Cada PC recibe un par único (`agentId` + `agentSecret`).
4. **Almacenamiento protegido en el cliente**: El `agentSecret` se cifra mediante la API de Protección de Datos de Windows (DPAPI).
5. **Autenticación HMAC por petición**: Cada telemetría enviada por el agente lleva firma HMAC-SHA256 con hash del cuerpo (`rawBody`), timestamp y nonce aleatorio.
