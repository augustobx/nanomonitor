# Motor de Auto-Remediación & Aprobación Operativa — NanoLabs Control Center

## 1. Visión General & Propósito

El **Motor de Auto-Remediación** de NanoLabs Control Center (Fase 3 del plan de evolución) automatiza la contención y resolución proactiva de incidentes técnicos detectados por las sondas de telemetría de los agentes Windows. Su propósito principal es reducir drásticamente el tiempo medio de resolución (MTTR) y minimizar la carga operativa manual de los técnicos mediante la ejecución autónoma o autorizada con 1-clic de acciones de mitigación seguras.

---

## 2. Pipeline Obligatorio de Detección y Remediación

Todo flujo de corrección sigue estrictamente la siguiente secuencia auditable:

```
[TELEMETRÍA] ──► [DETECCIÓN] ──► [PERSISTENCIA] ──► [ALERTA]
                                                       │
                                                       ▼
                                            [EVALUACIÓN REGLA]
                                          ┌────────────┴────────────┐
                                          ▼                         ▼
                                    [AUTO_REMEDIATE]       [MANUAL_APPROVAL]
                                          │                         │
                                   (Disparo directo)       (Espera 1-clic en NOC)
                                          │                         │
                                          └────────────┬────────────┘
                                                       ▼
                                             [CIRCUIT BREAKER]
                                          (Fallos en 2h < maxAttempts?)
                                          ┌────────────┴────────────┐
                                         SÍ                        NO (Tripped)
                                          │                         │
                                          ▼                         ▼
                                 [REMEDIATION_EXEC]         [ESTADO: CIRCUIT_BROKEN]
                                   status: QUEUED             (Alerta NOC Técnico)
                                          │
                                          ▼
                                   [REMOTE_ACTION]
                                source: AUTO_REMEDIATION
                                          │
                                          ▼
                                   [AGENTE WINDOWS]
                                  (Ejecución segura)
                                          │
                                          ▼
                                    [VALIDACIÓN]
                               (exitCode == 0 + Output)
                                          │
                                ┌─────────┴─────────┐
                                ▼                   ▼
                            [SUCCESS]            [FAILED]
                                │                   │
                    savedIntervention: true    (Registra error)
                                │                   │
                                ▼                   ▼
                        [AUTO-RESOLUCIÓN]      [CIRCUIT COUNTER +1]
                     (Alert: RESOLVED)
```

---

## 3. Modos de Ejecución por Regla (`RemediationMode`)

Cada regla de alerta (`AlertRule`) puede configurarse independientemente con uno de los tres modos:

1. **`MONITOR_ONLY` (Por defecto):**
   - La alerta se genera y notifica en el Centro de Alertas y NOC sin disparar ninguna acción automática ni requerir autorización.
2. **`MANUAL_APPROVAL`:**
   - La alerta genera un registro `RemediationExecution` en estado `PENDING_APPROVAL`.
   - En el Centro de Alertas aparece un botón destacado **"⚡ Aprobar"** (1-clic).
   - Hasta que un operador con rol `SUPER_ADMIN`, `ADMIN` o `TECHNICIAN` no presiona "Aprobar", la acción remota no se envía a la cola del equipo.
3. **`AUTO_REMEDIATE`:**
   - Si se cumplen las condiciones de seguridad (cooldown y circuit breaker), la acción correctiva se encola y despacha de manera 100% autónoma al agente.

---

## 4. Catálogo Inicial de Acciones Seguras de Bajo Riesgo

| Acción (`ActionType`) | Alcance & Implementación | Reglas Asociadas |
|---|---|---|
| `RESTART_SERVICE` | Reinicio de servicios Windows pre-aprobados en lista blanca (Spooler de impresión, servicios de cola). | Fallos de servicios críticos |
| `DEFENDER_UPDATE_SIGNATURES` | Actualización de firmas y definiciones de Windows Defender (`Update-MpSignature`). | Antivirus desactualizado / Desactivado |
| `FLUSH_DNS` | Vaciado de caché DNS local (`ipconfig /flushdns`) y renovación de sockets. | Fallos de resolución o conectividad de red |
| `CLEAN_TEMP_FILES` | Limpieza controlada de archivos temporales del sistema (`C:\Windows\Temp`, colas WER de error reporting, descargas expiradas). | Espacio crítico en C: (< 10%), Almacenamiento reducido (< 15%) |

### ⚠️ Reglas de Seguridad Críticas para `CLEAN_TEMP_FILES`:
- **Estricto alcance a carpetas del sistema:** Solo se permite limpiar dentro de prefijos de sistema autorizados:
  - `C:\Windows\Temp`
  - `C:\ProgramData\Microsoft\Windows\WER\ReportQueue`
  - `C:\Windows\SoftwareDistribution\Download`
- **Exclusión total de datos de usuario:** NUNCA se tocan `Escritorio`, `Descargas`, `Documentos`, perfiles de usuarios (`C:\Users\*`), copias de seguridad o bases de datos.
- **Protección de archivos en uso:** Se omiten archivos creados o modificados en la última hora (`time.Since(info.ModTime()) < 1h`).
- **Recálculo post-limpieza:** Inmediatamente tras limpiar, el agente ejecuta el gancho de inventario de almacenamiento para actualizar la telemetría del disco en la base de datos.

---

## 5. Circuit Breaker & Prevención de Bucles Infinitos

Para evitar loops destructivos (como reiniciar indefinidamente un servicio que tiene binarios corruptos o intentar limpiar archivos bloqueados):

1. **Límite de Intentos (`maxAttempts`):**
   - Configurable por regla (por defecto 3).
   - Si un equipo acumula `>= maxAttempts` fallidos para una misma regla en las últimas 2 horas, el **Circuit Breaker se abre (`CIRCUIT_BROKEN`)**.
2. **Efecto de Circuit Breaker Abierto:**
   - Se suspenden de inmediato nuevas remediaciones automáticas para ese equipo y regla.
   - Se emite una advertencia en el NOC y registro de auditoría alertando que el incidente requiere inspección técnica presencial/manual.
3. **Cooldown entre Ejecuciones (`cooldownSec`):**
   - Intervalo mínimo obligatorio (por defecto 300 - 1800 segundos) entre intentos de remediación para la misma alerta.

---

## 6. Métricas y KPIs de Auto-Remediación

El NOC y Centro de Alertas reportan en tiempo real:
- **⚡ Intervenciones Ahorradas (`savedInterventions`):** Contador de incidentes resueltos exitosamente sin intervención humana.
- **🎯 Tasa de Éxito (`successRate`):** Porcentaje de ejecuciones que concluyeron con código de salida `0` y validación positiva.
- **🛡️ Pendientes de Aprobación (`pendingApproval`):** Tareas esperando autorización de 1-clic por el operador.
- **🛑 Circuit Breakers (`circuitBroken`):** Incidentes detenidos por superar el umbral de seguridad.
- **⚙️ Total Ejecutadas (`totalAttempted`):** Volumen global de correcciones procesadas.

---

## 7. Endpoints de la API (`/api/v1/remediations`)

- `GET /api/v1/remediations/stats`: Métricas globales agregadas de remediación para el tenant.
- `GET /api/v1/remediations/history?limit=50`: Historial cronológico detallado de ejecuciones.
- `POST /api/v1/remediations/:id/approve`: Aprobación de 1-clic para ejecuciones en estado `PENDING_APPROVAL`.
- `POST /api/v1/remediations/rules/:id/config`: Configuración de modo, parámetros, intentos máximos y cooldown por regla.
