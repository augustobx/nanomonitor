import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

export interface HealthPenalty {
  code: string;
  category: 'performance' | 'storage' | 'security' | 'updates' | 'stability' | 'hardware';
  points: number;
  reason: string;
}

export interface HealthScoreResult {
  overall: number;
  performance: number;
  storage: number;
  security: number;
  updates: number;
  stability: number;
  hardware: number;
  status: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
  statusLabel: string;
  statusColor: string;
  penalties: HealthPenalty[];
}

export interface DeviceTelemetryInput {
  status?: string;
  lastSeenAt?: Date | string | null;
  cpuName?: string | null;
  cpuCores?: number | null;
  ramTotalMB?: number | null;
  latestMetric?: {
    cpuPercent?: number | null;
    ramUsedMB?: number | null;
    ramAvailMB?: number | null;
    uptimeSeconds?: number | null;
    volumes?: Array<{
      driveLetter?: string;
      label?: string;
      freeBytes?: number;
      totalBytes?: number;
      freePercent?: number;
    }> | null;
  } | null;
  latestInventory?: {
    storage?: {
      disks?: Array<{
        friendlyName?: string;
        healthStatus?: string;
        mediaType?: string;
        sizeGb?: number;
      }>;
    } | null;
    security?: {
      defenderActive?: boolean;
      firewallActive?: boolean;
      antivirusList?: Array<{
        displayName?: string;
        enabled?: boolean;
        upToDate?: boolean;
      }>;
    } | null;
    windowsUpdate?: {
      rebootPending?: boolean;
      rebootReason?: string;
      recentHotfixes?: Array<{
        hotfixId?: string;
        installedOn?: string;
      }>;
    } | null;
  } | null;
  recentEvents?: Array<{
    severity?: string;
    eventId?: number | null;
    occurrences?: number;
    timestamp?: Date | string;
  }> | null;
}

/**
 * Pure function to calculate health score based on 6 weighted categories (0 - 100).
 */
export function calculateDeviceHealthScore(input: DeviceTelemetryInput): HealthScoreResult {
  const penalties: HealthPenalty[] = [];

  let performanceScore = 100;
  let storageScore = 100;
  let securityScore = 100;
  let updatesScore = 100;
  let stabilityScore = 100;
  let hardwareScore = 100;

  // 1. Performance & Load (Weight: 20%)
  const metric = input.latestMetric;
  if (metric) {
    const cpu = metric.cpuPercent ?? 0;
    if (cpu > 85) {
      performanceScore -= 50;
      penalties.push({
        code: 'CPU_CRITICAL_LOAD',
        category: 'performance',
        points: 10,
        reason: `Carga crítica de CPU (${Math.round(cpu)}%): el procesador está al límite de su capacidad`,
      });
    } else if (cpu > 70) {
      performanceScore -= 25;
      penalties.push({
        code: 'CPU_HIGH_LOAD',
        category: 'performance',
        points: 5,
        reason: `Carga de CPU elevada (${Math.round(cpu)}%): posible proceso con consumo anómalo`,
      });
    }

    if (metric.ramUsedMB != null && metric.ramAvailMB != null) {
      const totalRam = metric.ramUsedMB + metric.ramAvailMB;
      if (totalRam > 0) {
        const freeRamPct = (metric.ramAvailMB / totalRam) * 100;
        if (freeRamPct < 10) {
          performanceScore -= 50;
          penalties.push({
            code: 'RAM_CRITICAL',
            category: 'performance',
            points: 10,
            reason: `Memoria RAM crítica (solo ${(metric.ramAvailMB / 1024).toFixed(1)} GB libres, ${Math.round(freeRamPct)}%)`,
          });
        } else if (freeRamPct < 20) {
          performanceScore -= 25;
          penalties.push({
            code: 'RAM_LOW',
            category: 'performance',
            points: 5,
            reason: `Memoria RAM baja (${Math.round(freeRamPct)}% libre)`,
          });
        }
      }
    }
  }

  // 2. Storage & SMART (Weight: 20%)
  const inv = input.latestInventory;
  if (inv && inv.storage && Array.isArray(inv.storage.disks)) {
    const unhealthyDisks = inv.storage.disks.filter((d) => {
      const status = (d.healthStatus || '').toLowerCase();
      return status === 'degraded' || status === 'warning' || status === 'unhealthy' || status === 'predfail';
    });
    if (unhealthyDisks.length > 0) {
      storageScore -= 70;
      penalties.push({
        code: 'SMART_DEGRADED',
        category: 'storage',
        points: 15,
        reason: `Alerta predictiva SMART: la unidad "${unhealthyDisks[0].friendlyName || 'Disco'}" reporta degradación`,
      });
    }
  }

  // Check Volume C: free space
  if (metric && Array.isArray(metric.volumes)) {
    const cDrive = metric.volumes.find((v) => (v.driveLetter || '').toUpperCase().startsWith('C')) || metric.volumes[0];
    if (cDrive) {
      let freePct = cDrive.freePercent;
      if (freePct == null && cDrive.freeBytes != null && cDrive.totalBytes && cDrive.totalBytes > 0) {
        freePct = (cDrive.freeBytes / cDrive.totalBytes) * 100;
      }
      if (freePct != null) {
        if (freePct < 10) {
          storageScore -= 50;
          penalties.push({
            code: 'DISK_CRITICAL_SPACE',
            category: 'storage',
            points: 10,
            reason: `Espacio crítico en disco ${cDrive.driveLetter || 'C:'} (menos de ${Math.round(freePct)}% disponible)`,
          });
        } else if (freePct < 15) {
          storageScore -= 25;
          penalties.push({
            code: 'DISK_LOW_SPACE',
            category: 'storage',
            points: 5,
            reason: `Espacio reducido en disco ${cDrive.driveLetter || 'C:'} (${Math.round(freePct)}% disponible)`,
          });
        }
      }
    }
  }

  // 3. Endpoint Security (Weight: 20%)
  if (inv && inv.security) {
    const sec = inv.security;
    const isAvActive = sec.defenderActive || (sec.antivirusList && sec.antivirusList.some((av) => av.enabled));
    if (!isAvActive) {
      securityScore -= 75;
      penalties.push({
        code: 'AV_DISABLED',
        category: 'security',
        points: 15,
        reason: 'Protección antivirus en tiempo real desactivada',
      });
    }

    if (sec.firewallActive === false) {
      securityScore -= 25;
      penalties.push({
        code: 'FIREWALL_DISABLED',
        category: 'security',
        points: 5,
        reason: 'Firewall de Windows desactivado en todos los perfiles',
      });
    }
  }

  // 4. Windows Updates & Reboot (Weight: 15%)
  if (inv && inv.windowsUpdate) {
    const wu = inv.windowsUpdate;
    if (wu.rebootPending) {
      updatesScore -= 65;
      penalties.push({
        code: 'REBOOT_PENDING',
        category: 'updates',
        points: 10,
        reason: `Reinicio del sistema pendiente por actualizaciones (${wu.rebootReason || 'archivos en espera'})`,
      });
    }

    const hotfixes = wu.recentHotfixes || [];
    if (hotfixes.length === 0) {
      updatesScore -= 35;
      penalties.push({
        code: 'UPDATES_STALE',
        category: 'updates',
        points: 5,
        reason: 'Sin parches acumulativos recientes de Windows Update detectados',
      });
    }
  }

  // 5. Stability & Events (Weight: 15%)
  const isOnline = input.status === 'ONLINE';
  if (!isOnline) {
    stabilityScore -= 80;
    penalties.push({
      code: 'DEVICE_OFFLINE',
      category: 'stability',
      points: 15,
      reason: 'Equipo desconectado de la red / sin reporte reciente del agente',
    });
  }

  const events = input.recentEvents || [];
  const critEvents = events.filter((e) => e.severity === 'CRITICAL');
  if (critEvents.length >= 2) {
    stabilityScore -= 60;
    penalties.push({
      code: 'MULTIPLE_CRITICAL_EVENTS',
      category: 'stability',
      points: 10,
      reason: `${critEvents.length} incidentes críticos detectados en Windows Event Viewer en las últimas 24h`,
    });
  } else if (critEvents.length === 1) {
    stabilityScore -= 30;
    penalties.push({
      code: 'CRITICAL_SYSTEM_EVENT',
      category: 'stability',
      points: 5,
      reason: `Incidente crítico registrado en Windows Event Viewer (EventID ${critEvents[0].eventId || '-'})`,
    });
  }

  // 6. Hardware Capacity (Weight: 10%)
  if (input.ramTotalMB != null && input.ramTotalMB < 4096) {
    hardwareScore -= 50;
    penalties.push({
      code: 'LOW_PHYSICAL_RAM',
      category: 'hardware',
      points: 5,
      reason: `Memoria física insuficiente (${Math.round(input.ramTotalMB / 1024)} GB): se recomiendan al menos 8 GB para Windows 11`,
    });
  }

  if (input.cpuCores != null && input.cpuCores < 2) {
    hardwareScore -= 50;
    penalties.push({
      code: 'LOW_CPU_CORES',
      category: 'hardware',
      points: 5,
      reason: 'Procesador con un solo núcleo físico: cuello de botella de rendimiento general',
    });
  }

  // Ensure subscores are clamped between 0 and 100
  performanceScore = Math.max(0, Math.min(100, performanceScore));
  storageScore = Math.max(0, Math.min(100, storageScore));
  securityScore = Math.max(0, Math.min(100, securityScore));
  updatesScore = Math.max(0, Math.min(100, updatesScore));
  stabilityScore = Math.max(0, Math.min(100, stabilityScore));
  hardwareScore = Math.max(0, Math.min(100, hardwareScore));

  // Weighted overall calculation:
  // Performance: 20% | Storage: 20% | Security: 20% | Updates: 15% | Stability: 15% | Hardware: 10%
  const overall = Math.round(
    performanceScore * 0.2 +
    storageScore * 0.2 +
    securityScore * 0.2 +
    updatesScore * 0.15 +
    stabilityScore * 0.15 +
    hardwareScore * 0.1
  );

  let status: 'OPTIMAL' | 'WARNING' | 'CRITICAL' = 'OPTIMAL';
  let statusLabel = 'ÓPTIMO';
  let statusColor = '#10b981';

  if (overall < 70 || !isOnline) {
    status = 'CRITICAL';
    statusLabel = 'CRÍTICO';
    statusColor = '#ef4444';
  } else if (overall < 90) {
    status = 'WARNING';
    statusLabel = 'ADVERTENCIA';
    statusColor = '#f59e0b';
  }

  return {
    overall,
    performance: performanceScore,
    storage: storageScore,
    security: securityScore,
    updates: updatesScore,
    stability: stabilityScore,
    hardware: hardwareScore,
    status,
    statusLabel,
    statusColor,
    penalties,
  };
}

/**
 * Calculates and persists health score in the database for a specific device.
 */
export async function calculateAndPersistDeviceHealthScore(deviceId: string) {
  try {
    const device = await db.device.findUnique({
      where: { id: deviceId },
      include: {
        metrics: {
          take: 1,
          orderBy: { timestamp: 'desc' },
        },
        inventories: {
          take: 1,
          orderBy: { collectedAt: 'desc' },
        },
        events: {
          where: {
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
          take: 10,
        },
      },
    });

    if (!device) return null;

    const latestMetric = device.metrics[0] || null;
    const latestInv = device.inventories[0] || null;

    const result = calculateDeviceHealthScore({
      status: device.status,
      lastSeenAt: device.lastSeenAt,
      cpuName: device.cpuName,
      cpuCores: device.cpuCores,
      ramTotalMB: device.ramTotalMB,
      latestMetric: latestMetric ? {
        cpuPercent: latestMetric.cpuPercent,
        ramUsedMB: latestMetric.ramUsedMB,
        ramAvailMB: latestMetric.ramAvailMB,
        uptimeSeconds: latestMetric.uptimeSeconds ? Number(latestMetric.uptimeSeconds) : null,
        volumes: latestMetric.volumes as any,
      } : null,
      latestInventory: latestInv ? {
        storage: latestInv.storage as any,
        security: latestInv.security as any,
        windowsUpdate: latestInv.windowsUpdate as any,
      } : null,
      recentEvents: device.events.map((e) => ({
        severity: e.severity,
        eventId: e.eventId,
        occurrences: e.occurrences,
        timestamp: e.timestamp,
      })),
    });

    const persisted = await db.healthScore.create({
      data: {
        tenantId: device.tenantId,
        deviceId: device.id,
        calculatedAt: new Date(),
        overall: result.overall,
        performance: result.performance,
        storage: result.storage,
        security: result.security,
        updates: result.updates,
        stability: result.stability,
        hardware: result.hardware,
        penalties: result.penalties as any,
      },
    });

    return {
      ...result,
      id: persisted.id,
      calculatedAt: persisted.calculatedAt,
    };
  } catch (err) {
    logger.error({ err, deviceId }, 'Failed to calculate and persist device health score');
    return null;
  }
}
