# Gestión de Inventario, Control de Cambios & Cumplimiento de Software — NanoLabs Control Center

## 1. Visión General & Propósito

El módulo de **Gestión de Inventario y Control de Cambios** (Fase 4 del plan de ingeniería RMM) dota a NanoLabs Control Center de trazabilidad forense continua sobre los activos de hardware y software desplegados en toda la flota gestionada.

Permite responder de forma inmediata a preguntas críticas de seguridad y operaciones:
- ¿Qué software se instaló, actualizó o desinstaló recientemente en un equipo y en qué fecha exacta?
- ¿Se ha producido algún cambio físico no autorizado de hardware (ej. extracción o degradación de módulos de memoria RAM, cambio de microprocesador o sustitución de discos)?
- ¿Existen aplicaciones no autorizadas o peligrosas (clientes Torrent, software de acceso remoto sin supervisión corporativa, minería de criptomonedas o juegos) instaladas en la infraestructura corporativa?
- ¿Cuál es el catálogo global consolidado de aplicaciones en todas las máquinas y cómo exportar el inventario para auditorías o compliance?

---

## 2. Arquitectura de Control de Cambios

El agente ligero en Go (`nanomonitor-agent`) reporta periódicamente dos inventarios principales sin sobrecargar el equipo:
1. **Inventario de Hardware (`POST /api/v1/agent/inventory`):** CPU, memoria RAM física total, discos, adaptadores de red, versión de BIOS y build del sistema operativo Windows.
2. **Inventario de Software (`POST /api/v1/agent/software`):** Lista exhaustiva de aplicaciones instaladas recolectadas del Registro de Windows (claves de 64-bit `HKLM\...\Uninstall`, 32-bit `HKLM\...\WOW6432Node\...\Uninstall`, y por usuario `HKCU\...\Uninstall`).

```
[AGENTE WINDOWS] ──(HMAC Signed JSON)──► [/api/v1/agent/inventory]
                                                 │
                                                 ▼
                                     [HardwareDiffer Module]
                                                 │
                             ┌───────────────────┴───────────────────┐
                             ▼                                       ▼
                  [Comparación Snapshot]                 [Generación Historial]
                  - RAM: Δ < -512MB ──► [ALERTA CRÍTICA]       HardwareChange
                  - CPU: Modelo / Cores                      (Tipo: ADDED,
                  - DISCO: Serial / Capacidad                 REMOVED, MODIFIED)
                  - RED: MAC / Interfaces
                  - OS: Build / Versión

[AGENTE WINDOWS] ──(HMAC Signed JSON)──► [/api/v1/agent/software]
                                                 │
                                                 ▼
                                     [Software Delta Engine]
                                                 │
                             ┌───────────────────┴───────────────────┐
                             ▼                                       ▼
                  [Detección de Cambios]                [Compliance Engine]
                  - INSTALLED                                        │
                  - UPDATED                             [Evaluar Blacklist Rules]
                  - REMOVED                               (Regex Pattern Match)
                             │                                       │
                             ▼                                       ▼
                       SoftwareChange                    [ALERTA DE SEGURIDAD]
                       (Audit Trail)                 SOFTWARE_UNAUTHORIZED_DETECTED
```

---

## 3. Motor de Diferencias de Hardware (`HardwareDiffer`)

El servicio `HardwareDiffer` intercepta la carga de inventario y compara el estado reportado contra el registro previo almacenado en la base de datos:

### 3.1 Detecciones Implementadas:
- **Memoria RAM (`RAM`):**
  - **Ampliación:** Registro de `MODIFIED` informando la nueva capacidad detectada.
  - **Reducción / Manipulación Física:** Si la memoria total disminuye en más de 512 MB respecto al último reporte válido, se registra el cambio y se emite inmediatamente una **Alerta Crítica (`HARDWARE_RAM_REDUCED`)** con severidad `CRITICAL` en el NOC para alertar sobre robo de hardware o fallo de un módulo físico.
- **Microprocesador (`CPU`):**
  - Detecta reemplazo de CPU, cambio de modelo o variación en el número de núcleos/hilos lógicos.
- **Almacenamiento / Discos (`STORAGE`):**
  - Identifica nuevos discos añadidos (`ADDED`), discos retirados o desconectados (`REMOVED`), y cambios sustanciales en particiones (`MODIFIED`).
- **Interfaces de Red (`NETWORK`):**
  - Detecta nuevas tarjetas físicas o virtuales (`ADDED`) o eliminación de interfaces de red (`REMOVED`).
- **Sistema Operativo (`OS`):**
  - Detecta actualizaciones mayores de compilación o versión de Windows (`BuildNumber`).

---

## 4. Motor de Cumplimiento y Lista Negra de Software (`SoftwareComplianceService`)

El servicio evalúa automáticamente cada aplicación reportada contra las reglas de lista negra configuradas por tenant o globales:

### 4.1 Categorías y Reglas por Defecto:
1. **P2P & Torrents (`P2P_TORRENT`):**
   - Patrón: `\b(uTorrent|BitTorrent|qBittorrent|Transmission|Deluge|eMule)\b`
   - Severidad: `HIGH`
2. **Herramientas de Acceso Remoto No Autorizadas (`UNAUTHORIZED_REMOTE`):**
   - Patrón: `\b(AnyDesk|TeamViewer|UltraVNC|TightVNC|LogMeIn|Ammyy)\b`
   - Severidad: `MEDIUM` (alerta si se detecta software de soporte paralelo no aprobado).
3. **Minería de Criptomonedas (`CRYPTO_MINER`):**
   - Patrón: `\b(XMRig|NiceHash|Claymore|PhoenixMiner|Ethminer|MinerGate)\b`
   - Severidad: `CRITICAL`
4. **Juegos y Entretenimiento no Laboral (`GAMING_ENTERTAINMENT`):**
   - Patrón: `\b(Steam|Epic Games|Battle\.net|Riot Client|Roblox|Minecraft|Origin)\b`
   - Severidad: `LOW`

### 4.2 Disparo de Alertas:
Cuando una aplicación coincide con una regla activa de la lista negra, el sistema:
1. Genera una alerta `SOFTWARE_UNAUTHORIZED_DETECTED` en el Centro de Alertas vinculada al dispositivo, con detalles del nombre del programa, versión y fabricante.
2. Destaca visualmente la fila en la tabla de software instalado del cliente con un badge de advertencia rojo (**No Autorizado**).

---

## 5. Endpoints de la API REST (`/api/v1/inventory`)

| Método | Endpoint | Descripción | Roles Requeridos |
|---|---|---|---|
| `GET` | `/api/v1/inventory/software/global` | Catálogo consolidado de aplicaciones de toda la flota con conteo de instalaciones y lista de equipos asociados. | SuperAdmin, Admin, Technician, Viewer |
| `GET` | `/api/v1/inventory/software/changes` | Registro cronológico global de cambios de software (instalaciones, actualizaciones, desinstalaciones). Permite filtro por `deviceId`. | SuperAdmin, Admin, Technician, Viewer |
| `GET` | `/api/v1/inventory/hardware/changes` | Registro cronológico de variaciones de componentes físicos de hardware. Permite filtro por `deviceId`. | SuperAdmin, Admin, Technician, Viewer |
| `GET` | `/api/v1/inventory/devices/:id/software/export` | Exportación en formato CSV descargable de todo el software instalado en un dispositivo específico. | SuperAdmin, Admin, Technician, Viewer |
| `GET` | `/api/v1/inventory/software/blacklist` | Listado de reglas de lista negra de software activas en el tenant. | SuperAdmin, Admin, Technician |
| `POST` | `/api/v1/inventory/software/blacklist` | Creación de una nueva regla de cumplimiento de software. | SuperAdmin, Admin |
| `DELETE` | `/api/v1/inventory/software/blacklist/:id` | Eliminación o desactivación de una regla de lista negra. | SuperAdmin, Admin |

---

## 6. Integración en el Panel NOC & Ficha del Dispositivo

En la interfaz web interactiva de NanoLabs Control Center:
- **Pestaña Software:**
  - Subtab **"Software Instalado"**: buscador en tiempo real, conteo de paquetes, versión, fabricante, fecha de instalación y alertas de cumplimiento.
  - Subtab **"Historial de Cambios (Delta)"**: auditoría con badges por tipo (`Instalado`, `Actualizado`, `Desinstalado`).
  - Botón **"Exportar CSV"** en la barra superior para generar reportes en 1-clic.
- **Pestaña Hardware:**
  - Subtab **"Especificaciones"**: resumen de hardware con microprocesador, memoria RAM, discos y adaptadores de red.
  - Subtab **"Modificaciones Físicas"**: historial de adiciones, sustituciones o reducciones de componentes con marcas temporales y valores anteriores vs nuevos.
