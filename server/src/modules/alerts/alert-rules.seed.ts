import { ActionType, RemediationMode, Severity } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

export interface PredefinedRule {
  code: string;
  name: string;
  description: string;
  category: string;
  severity: Severity;
  cooldownMin: number;
  condition: {
    type: 'STORAGE' | 'SMART' | 'CPU' | 'RAM' | 'OFFLINE' | 'DEFENDER' | 'FIREWALL' | 'KERNEL_EVENT' | 'DISK_EVENT' | 'APP_CRASH';
    threshold?: number;
    durationMins?: number;
    driveLetter?: string;
  };
  remediationMode?: RemediationMode;
  remediationAction?: ActionType;
  remediationParams?: any;
  maxAttempts?: number;
  cooldownSec?: number;
}

export const PREDEFINED_RULES: PredefinedRule[] = [
  {
    code: 'STORAGE_CRITICAL_C',
    name: 'Espacio Crítico en Disco C: (< 10%)',
    description: 'La partición principal del sistema C: tiene menos del 10% de espacio disponible, lo que pone en riesgo la estabilidad del sistema.',
    category: 'storage',
    severity: Severity.CRITICAL,
    cooldownMin: 60,
    condition: {
      type: 'STORAGE',
      threshold: 10,
      driveLetter: 'C:',
    },
    remediationMode: RemediationMode.MANUAL_APPROVAL,
    remediationAction: ActionType.CLEAN_TEMP_FILES,
    remediationParams: { maxAgeHours: 1 },
    maxAttempts: 3,
    cooldownSec: 600,
  },
  {
    code: 'STORAGE_LOW_C',
    name: 'Espacio Reducido en Disco C: (< 15%)',
    description: 'La partición del sistema C: se encuentra por debajo del 15% de espacio libre recomendado.',
    category: 'storage',
    severity: Severity.WARNING,
    cooldownMin: 120,
    condition: {
      type: 'STORAGE',
      threshold: 15,
      driveLetter: 'C:',
    },
    remediationMode: RemediationMode.MANUAL_APPROVAL,
    remediationAction: ActionType.CLEAN_TEMP_FILES,
    remediationParams: { maxAgeHours: 1 },
    maxAttempts: 3,
    cooldownSec: 1800,
  },
  {
    code: 'SMART_DISK_PREDFAIL',
    name: 'Fallo Predictivo SMART en Almacenamiento',
    description: 'Se detectaron fallos predictivos SMART o sectores defectuosos en una o más unidades de disco físico.',
    category: 'hardware',
    severity: Severity.CRITICAL,
    cooldownMin: 1440, // 24 hours
    condition: {
      type: 'SMART',
    },
  },
  {
    code: 'CPU_HIGH_LOAD_SUSTAINED',
    name: 'Saturación Crítica de CPU (> 90%)',
    description: 'El procesador se encuentra con uso continuo superior al 90%, afectando la operatividad del usuario.',
    category: 'performance',
    severity: Severity.HIGH,
    cooldownMin: 30,
    condition: {
      type: 'CPU',
      threshold: 90,
    },
  },
  {
    code: 'RAM_EXHAUSTION_CRITICAL',
    name: 'Agotamiento Crítico de Memoria RAM (< 10%)',
    description: 'La estación de trabajo dispone de menos del 10% de memoria RAM libre para ejecutar procesos.',
    category: 'performance',
    severity: Severity.HIGH,
    cooldownMin: 30,
    condition: {
      type: 'RAM',
      threshold: 10,
    },
  },
  {
    code: 'DEVICE_OFFLINE_CRITICAL',
    name: 'Estación de Trabajo Desconectada (> 10 min)',
    description: 'El agente de monitoreo ha dejado de enviar latidos y telemetría por más de 10 minutos.',
    category: 'availability',
    severity: Severity.HIGH,
    cooldownMin: 60,
    condition: {
      type: 'OFFLINE',
      threshold: 10, // 10 minutes
    },
  },
  {
    code: 'AV_PROTECTION_DISABLED',
    name: 'Protección Antivirus en Tiempo Real Desactivada',
    description: 'Windows Defender u otro antivirus del endpoint tiene la protección activa apagada o desactualizada.',
    category: 'security',
    severity: Severity.CRITICAL,
    cooldownMin: 60,
    condition: {
      type: 'DEFENDER',
    },
    remediationMode: RemediationMode.MANUAL_APPROVAL,
    remediationAction: ActionType.DEFENDER_UPDATE_SIGNATURES,
    maxAttempts: 3,
    cooldownSec: 600,
  },
  {
    code: 'FIREWALL_DISABLED',
    name: 'Firewall de Windows Desactivado',
    description: 'El cortafuegos de Windows se encuentra deshabilitado para uno o más perfiles de red.',
    category: 'security',
    severity: Severity.WARNING,
    cooldownMin: 120,
    condition: {
      type: 'FIREWALL',
    },
  },
  {
    code: 'KERNEL_POWER_BSOD',
    name: 'Reinicio Abrupto o Pantalla Azul (BSOD)',
    description: 'Se registró un evento de reinicio inesperado o falla de alimentación crítica (Kernel-Power 41 / BugCheck).',
    category: 'system',
    severity: Severity.CRITICAL,
    cooldownMin: 360,
    condition: {
      type: 'KERNEL_EVENT',
    },
  },
  {
    code: 'DISK_IO_CORRUPTION',
    name: 'Error de E/S o Corrupción de Sistema de Archivos',
    description: 'Se detectaron eventos críticos del subsistema de disco (NTFS, Disk 51, Bad Blocks).',
    category: 'storage',
    severity: Severity.CRITICAL,
    cooldownMin: 360,
    condition: {
      type: 'DISK_EVENT',
    },
  },
  {
    code: 'APP_CRASH_LOOP',
    name: 'Caídas Repetidas de Aplicaciones',
    description: 'Múltiples cierres inesperados de aplicaciones en ejecución detectados en el visor de eventos.',
    category: 'software',
    severity: Severity.WARNING,
    cooldownMin: 180,
    condition: {
      type: 'APP_CRASH',
    },
  },
];

let seedingPromise: Promise<number> | null = null;

/**
 * Ensures all default predefined rules exist for every active tenant in the database.
 * Thread-safe: prevents duplicate runs if invoked concurrently.
 */
export async function ensureDefaultAlertRules(targetTenantId?: string): Promise<number> {
  if (seedingPromise) {
    return seedingPromise;
  }

  seedingPromise = (async () => {
    try {
      const tenants = targetTenantId
        ? [{ id: targetTenantId }]
        : await db.tenant.findMany({ select: { id: true } });

      let rulesCreated = 0;

      for (const tenant of tenants) {
        for (const rule of PREDEFINED_RULES) {
          const existing = await db.alertRule.findFirst({
            where: {
              tenantId: tenant.id,
              name: rule.name,
            },
          });

          if (!existing) {
            await db.alertRule.create({
              data: {
                tenantId: tenant.id,
                name: rule.name,
                description: rule.description,
                category: rule.category,
                severity: rule.severity,
                cooldownMin: rule.cooldownMin,
                condition: rule.condition as any,
                enabled: true,
                remediationMode: rule.remediationMode || RemediationMode.MONITOR_ONLY,
                remediationAction: rule.remediationAction || null,
                remediationParams: rule.remediationParams || undefined,
                maxAttempts: rule.maxAttempts || 3,
                cooldownSec: rule.cooldownSec || 300,
              },
            });
            rulesCreated++;
          } else if (rule.remediationMode && existing.remediationMode === RemediationMode.MONITOR_ONLY && !existing.remediationAction) {
            await db.alertRule.update({
              where: { id: existing.id },
              data: {
                remediationMode: rule.remediationMode,
                remediationAction: rule.remediationAction,
                remediationParams: rule.remediationParams || undefined,
                maxAttempts: rule.maxAttempts || 3,
                cooldownSec: rule.cooldownSec || 300,
              },
            });
          }
        }
      }

      if (rulesCreated > 0) {
        logger.info({ rulesCreated }, `🛡️ Initialized ${rulesCreated} default alert rules`);
      }

      return rulesCreated;
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}
