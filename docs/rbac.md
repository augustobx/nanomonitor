# Control de Acceso Basado en Roles (RBAC) — NanoMonitor

## Roles de Usuario
El sistema define los siguientes roles a nivel tenant:
- `SUPER_ADMIN`: Administrador global con control total sobre todos los recursos y tenants.
- `ADMIN`: Administrador de la organización/tenant con control total sobre dispositivos y configuración.
- `TECHNICIAN`: Técnico operador con capacidad de diagnóstico, telemetría y ejecución de acciones seguras.
- `VIEWER`: Usuario de solo lectura sobre el estado y telemetría de los dispositivos.
- `CLIENT`: Vista restringida para clientes finales.

## Matriz de Permisos de Remote Actions

| Permiso | Descripción | Roles Autorizados |
|---|---|---|
| `VIEW_DEVICE` | Ver estado, telemetría e historial de acciones | `SUPER_ADMIN`, `ADMIN`, `TECHNICIAN`, `VIEWER`, `CLIENT` |
| `RUN_SAFE_ACTION` | Forzar telemetría, Flush DNS, Query Services | `SUPER_ADMIN`, `ADMIN`, `TECHNICIAN` |
| `RUN_SECURITY_ACTION` | Actualización de Defender, Quick Scan, Full Scan | `SUPER_ADMIN`, `ADMIN`, `TECHNICIAN` |
| `RUN_SYSTEM_ACTION` | SFC /scannow, DISM Check, CHKDSK, Restart Service | `SUPER_ADMIN`, `ADMIN`, `TECHNICIAN` |
| `RUN_REBOOT` | Reiniciar y apagar equipos remotamente | `SUPER_ADMIN`, `ADMIN` |
| `ADMIN_ACTIONS` | Cancelar acciones pendientes de otros operadores | `SUPER_ADMIN`, `ADMIN` |
