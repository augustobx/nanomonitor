# Auditoría del Sistema (AuditLog) — NanoMonitor

## Entidad AuditLog
Todas las operaciones sensibles ejecutadas en NanoMonitor quedan registradas de manera inmutable en la tabla `audit_logs` con los siguientes datos:
- `id`: Identificador único (UUID).
- `tenantId`: Aislamiento multi-tenant.
- `userId`: Usuario autenticado que originó la petición.
- `agentId`: Agente Windows que reportó el estado (si aplica).
- `action`: Tipo de evento auditado.
- `entityType`: Entidad afectada (ej. `RemoteAction`, `Device`, `AlertRule`).
- `entityId`: Identificador del recurso afectado.
- `details`: Metadatos JSON (parámetros, duraciones, códigos de salida, errores).
- `ipAddress`: Dirección IP del solicitante.
- `userAgent`: Cliente o navegador.
- `createdAt`: Fecha y hora exacta con zona horaria.

## Eventos Auditados en Remote Actions
1. `ACTION_REQUESTED`: Encolamiento de una acción remota por parte de un operador.
2. `ACTION_DELIVERED`: Entrega exitosa del comando al agente en su consulta saliente.
3. `ACTION_STARTED`: Confirmación de inicio de ejecución en el endpoint.
4. `ACTION_SUCCESS`: Finalización exitosa con código de salida 0.
5. `ACTION_FAILED`: Finalización con error o código de salida distinto de 0.
6. `ACTION_CANCELLED`: Cancelación manual por parte del operador antes de ejecutarse.
