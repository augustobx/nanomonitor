# Seguridad del Endpoint — NanoLabs Control Center

## Arquitectura de Monitoreo de Seguridad

La postura de seguridad del puesto de trabajo se evalúa en ciclos de 3 minutos e incorpora detección inmediata de transiciones a través del `StateChangeDetector`.

---

## Proveedores de Seguridad (`SecurityProvider`)

El collector de seguridad está diseñado sobre una abstracción desacoplada que permite incorporar proveedores adicionales según el sistema operativo o antivirus de terceros:

```
                  +--------------------------------+
                  |    SecurityCollector           |
                  +--------------------------------+
                                  |
         +------------------------+------------------------+
         |                                                 |
+-----------------------------------+             +----------------------------------+
| WindowsSecurityCenterProvider     |             | WindowsFirewallProfilesProvider  |
| (root\SecurityCenter2)            |             | (Registro de Windows)            |
| - Decodifica bitfield de estado   |             | - DomainProfile: EnableFirewall  |
| - Detecta AV activo / firmas      |             | - StandardProfile (Privado)      |
+-----------------------------------+             | - PublicProfile (Público)        |
         |                                        +----------------------------------+
+-----------------------------------+
| WindowsDefenderRegistryProvider   |
| (Fallback en Windows Server / W11)|
+-----------------------------------+
```

### 1. Antivirus
* Detecta producto primario y registrados.
* Decodifica el bitfield `ProductState` de Windows SecurityCenter:
  * Bit 0x1000 = Protección en tiempo real habilitada (`enabled = true`).
  * Bit 0x0010 = Definiciones de virus actualizadas (`upToDate = true`).
* En Windows Server o entornos sin SecurityCenter2, consulta la configuración de Microsoft Defender en el registro del sistema (`SOFTWARE\Microsoft\Windows Defender\Real-Time Protection`).

### 2. Firewall por Perfiles
No se reduce a un único booleano genérico. Inspecciona los 3 perfiles nativos de Windows en `HKLM\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy`:
* **Domain Profile (Red de Dominio):** `enabled` / `disabled`.
* **Standard / Private Profile (Red Privada):** `enabled` / `disabled`.
* **Public Profile (Red Pública):** `enabled` / `disabled`.

---

## Detección Inmediata de Cambios (`SECURITY_STATE_CHANGED`)

El agente mantiene en memoria el último snapshot de seguridad. Ante cualquier transición significativa:
* Antivirus: `ON → OFF` o `OFF → ON`
* Firewall: cualquiera de sus perfiles `ON → OFF` o `OFF → ON`

El agente **no espera** al próximo ciclo de 3 minutos. Genera y despacha inmediatamente un evento:

```json
{
  "source": "SecurityStateDetector",
  "category": "Security",
  "severity": "CRITICAL",
  "title": "¡Antivirus desactivado!: Windows Defender",
  "description": "El estado de protección en tiempo real pasó de enabled a disabled.",
  "dedupKey": "SecurityState:Antivirus:disabled",
  "rawData": {
    "component": "antivirus",
    "previousState": "enabled",
    "currentState": "disabled",
    "product": "Windows Defender",
    "detectedAt": "2026-09-16T20:00:00Z"
  }
}
```

El servidor recibe este evento e impacta de inmediato el estado en la consola para reflejar la vulnerabilidad en tiempo real.

---

## Diferencia entre Estado Operativo y Alerta (Ventana de Persistencia)

### Principio Preventivo vs Falsos Positivos
* **Estado en Consola:** Se actualiza inmediatamente (< 3 minutos o al instante vía evento). Si Defender pasa de ON a OFF, la consola muestra de inmediato `Sin AV Residente` o `Firewall a revisar`.
* **Apertura de Alerta en NOC:** Requiere una **ventana de persistencia** (por defecto **5 minutos**). Esto evita falsos positivos producidos por reinicios breves de servicios, actualizaciones de motor o reinicios controlados de la máquina.

### Comportamiento del Motor de Reglas (`AlertEvaluator`)

1. **Condición Desactivada (< 5 min):** La consola muestra el estado desactivado. El evaluador calcula `elapsedMs = now - detectedAt`. Si `elapsedMs < 5 min`, **no abre alerta todavía**.
2. **Persistencia Sostenida (≥ 5 min):** Si la protección continúa desactivada transcurridos los 5 minutos de gracia, el motor abre una **Alerta Crítica en el NOC** indicando los minutos de persistencia.
3. **Auto-Resolución:** Si el antivirus o firewall vuelve a activarse antes o después de la apertura de la alerta:
   * La alerta se marca como `RESOLVED`.
   * Se registra la fecha de resolución (`resolvedAt`).
   * Se calcula y registra la duración exacta de la afectación (ejemplo: `[Auto-resuelto tras 6 min de persistencia por telemetría normalizada]`).
