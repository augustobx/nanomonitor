import { AlertStatus, Severity } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { ensureDefaultAlertRules } from './alert-rules.seed.js';

export interface EvaluationResult {
  deviceId: string;
  hostname: string;
  alertsCreated: number;
  alertsUpdated: number;
  alertsResolved: number;
}

/**
 * Evaluates all alert rules for a single device, creating new alerts,
 * incrementing occurrences for persistent conditions, and auto-resolving
 * alerts whose conditions have normalized.
 */
export async function evaluateDeviceAlerts(
  deviceId: string,
  tenantId: string
): Promise<EvaluationResult> {
  const result: EvaluationResult = {
    deviceId,
    hostname: '',
    alertsCreated: 0,
    alertsUpdated: 0,
    alertsResolved: 0,
  };

  const device = await db.device.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      hostname: true,
      customerId: true,
      tenantId: true,
      status: true,
      lastSeenAt: true,
    },
  });

  if (!device) return result;
  result.hostname = device.hostname;

  // Ensure default rules exist for this tenant
  await ensureDefaultAlertRules(tenantId);

  // Fetch active alert rules for this tenant and deduplicate by name
  const rawRules = await db.alertRule.findMany({
    where: {
      tenantId,
      enabled: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const ruleMapByName = new Map<string, typeof rawRules[0]>();
  for (const r of rawRules) {
    if (!ruleMapByName.has(r.name)) {
      ruleMapByName.set(r.name, r);
    }
  }
  const rules = Array.from(ruleMapByName.values());

  if (rules.length === 0) return result;

  // Fetch latest metric
  const latestMetric = await db.deviceMetric.findFirst({
    where: { deviceId },
    orderBy: { timestamp: 'desc' },
  });

  // Fetch latest inventory snapshot
  const latestInventory = await db.deviceInventory.findFirst({
    where: { deviceId },
    orderBy: { collectedAt: 'desc' },
  });

  // Fetch recent events in the last 24 hours
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentEvents = await db.deviceEvent.findMany({
    where: {
      deviceId,
      timestamp: { gte: since24h },
    },
    orderBy: { timestamp: 'desc' },
    take: 50,
  });

  // Fetch currently active alerts (OPEN or ACKNOWLEDGED) for this device
  const activeAlerts = await db.alert.findMany({
    where: {
      deviceId,
      status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
    },
    orderBy: { firstSeenAt: 'asc' },
  });

  const activeAlertMap = new Map<string, typeof activeAlerts[0]>();
  for (const a of activeAlerts) {
    if (a.ruleId) {
      activeAlertMap.set(a.ruleId, a);
    }
    if (a.title) {
      activeAlertMap.set(a.title, a);
    }
  }

  const now = new Date();

  // Evaluate each rule
  for (const rule of rules) {
    const condition = (rule.condition || {}) as any;
    const ruleType = condition.type;
    let isTriggered = false;
    let canAutoHeal = false;
    let dynamicDescription = rule.description || rule.name;

    switch (ruleType) {
      case 'STORAGE': {
        canAutoHeal = true;
        const threshold = condition.threshold ?? 10;
        let cDriveFreePercent: number | null = null;
        let cDriveFreeGb = 0;
        let cDriveTotalGb = 0;

        // Check metrics volumes
        const metricVolumes = latestMetric?.volumes as any[] | null;
        if (metricVolumes && Array.isArray(metricVolumes)) {
          const cVol = metricVolumes.find((v: any) =>
            v?.drive?.toUpperCase().startsWith('C') || v?.mountPoint?.toUpperCase().startsWith('C')
          );
          if (cVol) {
            cDriveFreeGb = Number(cVol.freeGB ?? cVol.freeGb ?? 0);
            cDriveTotalGb = Number(cVol.totalGB ?? cVol.totalGb ?? 0);
            if (cDriveTotalGb > 0) {
              cDriveFreePercent = Number(cVol.freePercent ?? ((cDriveFreeGb / cDriveTotalGb) * 100));
            }
          }
        }

        // Fallback to inventory storage
        if (cDriveFreePercent === null && (latestInventory?.storage as any)?.logicalVolumes) {
          const vols = (latestInventory?.storage as any).logicalVolumes;
          const cVol = vols.find((v: any) => v.driveLetter?.toUpperCase().startsWith('C'));
          if (cVol && cVol.sizeBytes > 0) {
            cDriveTotalGb = cVol.sizeBytes / (1024 * 1024 * 1024);
            cDriveFreeGb = (cVol.freeBytes || 0) / (1024 * 1024 * 1024);
            cDriveFreePercent = (cDriveFreeGb / cDriveTotalGb) * 100;
          }
        }

        if (cDriveFreePercent !== null) {
          if (cDriveFreePercent < threshold) {
            isTriggered = true;
            dynamicDescription = `Partición C: con sólo ${cDriveFreePercent.toFixed(1)}% libre (${cDriveFreeGb.toFixed(1)} GB disponibles de ${cDriveTotalGb.toFixed(1)} GB totales). Umbral de alerta: < ${threshold}%.`;
          } else if (cDriveFreePercent >= threshold + 2) {
            // Hysteresis: cleared
            isTriggered = false;
          }
        }
        break;
      }

      case 'SMART': {
        canAutoHeal = false; // Physical disk damage requires technician clearance
        if ((latestInventory?.storage as any)?.physicalDisks) {
          const disks = (latestInventory?.storage as any).physicalDisks;
          const unhealthyDisk = disks.find((d: any) => {
            const h = String(d.health || d.status || '').toLowerCase();
            return (
              h.includes('degrad') ||
              h.includes('warn') ||
              h.includes('unhealthy') ||
              h.includes('predfail') ||
              h.includes('caution') ||
              h.includes('bad')
            );
          });
          if (unhealthyDisk) {
            isTriggered = true;
            dynamicDescription = `Fallo predictivo SMART detectado en la unidad física "${unhealthyDisk.model || 'Disco'}" (Estado: ${unhealthyDisk.health || unhealthyDisk.status || 'No saludable'}). Se recomienda respaldo preventivo inmediato.`;
          }
        }
        break;
      }

      case 'CPU': {
        canAutoHeal = true;
        const threshold = condition.threshold ?? 90;
        if (latestMetric && latestMetric.cpuPercent != null) {
          if (latestMetric.cpuPercent > threshold) {
            isTriggered = true;
            dynamicDescription = `Saturación de CPU al ${latestMetric.cpuPercent.toFixed(1)}% sostenido (umbral de alerta: > ${threshold}%).`;
          } else if (latestMetric.cpuPercent <= threshold - 10) {
            isTriggered = false;
          }
        }
        break;
      }

      case 'RAM': {
        canAutoHeal = true;
        const threshold = condition.threshold ?? 10;
        if (latestMetric && latestMetric.ramUsedMB != null && latestMetric.ramAvailMB != null) {
          const totalRam = latestMetric.ramUsedMB + latestMetric.ramAvailMB;
          if (totalRam > 0) {
            const freePercent = (latestMetric.ramAvailMB / totalRam) * 100;
            if (freePercent < threshold) {
              isTriggered = true;
              dynamicDescription = `Memoria RAM en estado crítico: sólo ${freePercent.toFixed(1)}% disponible (${(latestMetric.ramAvailMB / 1024).toFixed(1)} GB libres de ${(totalRam / 1024).toFixed(1)} GB totales).`;
            } else if (freePercent >= threshold + 5) {
              isTriggered = false;
            }
          }
        }
        break;
      }

      case 'OFFLINE': {
        canAutoHeal = true;
        const thresholdMinutes = condition.threshold ?? 10;
        const thresholdMs = thresholdMinutes * 60 * 1000;
        const isOffline =
          device.status === 'OFFLINE' ||
          !device.lastSeenAt ||
          now.getTime() - new Date(device.lastSeenAt).getTime() > thresholdMs;

        if (isOffline) {
          isTriggered = true;
          const minsOffline = device.lastSeenAt
            ? Math.floor((now.getTime() - new Date(device.lastSeenAt).getTime()) / 60000)
            : thresholdMinutes;
          dynamicDescription = `La estación de trabajo lleva más de ${minsOffline} minutos sin reportar telemetría ni latidos al NOC.`;
        } else {
          isTriggered = false;
        }
        break;
      }

      case 'DEFENDER': {
        canAutoHeal = true;
        if (latestInventory?.security) {
          const sec = latestInventory.security as any;
          if (sec.antivirus && Array.isArray(sec.antivirus) && sec.antivirus.length > 0) {
            const hasActiveAv = sec.antivirus.some(
              (av: any) => av.enabled === true || av.realTimeProtection === true
            );
            if (!hasActiveAv) {
              isTriggered = true;
              dynamicDescription = `La protección antivirus en tiempo real se encuentra desactivada en el endpoint.`;
            } else {
              isTriggered = false;
            }
          }
        }
        break;
      }

      case 'FIREWALL': {
        canAutoHeal = true;
        if (latestInventory?.security) {
          const sec = latestInventory.security as any;
          if (sec.firewall && Array.isArray(sec.firewall) && sec.firewall.length > 0) {
            const anyDisabled = sec.firewall.some((fw: any) => fw.enabled === false);
            if (anyDisabled) {
              isTriggered = true;
              dynamicDescription = `El Firewall de Windows se encuentra desactivado para uno o más perfiles de red.`;
            } else {
              isTriggered = false;
            }
          }
        }
        break;
      }

      case 'KERNEL_EVENT': {
        canAutoHeal = false;
        const kernelEvt = recentEvents.find(
          (e) =>
            e.eventId === 41 ||
            e.source.toLowerCase().includes('kernel-power') ||
            (e.title && e.title.toLowerCase().includes('bugcheck')) ||
            (e.description && e.description.toLowerCase().includes('pantalla azul'))
        );
        if (kernelEvt) {
          isTriggered = true;
          dynamicDescription = `Evento de reinicio inesperado o falla de alimentación registrado: "${kernelEvt.title}" (${kernelEvt.timestamp.toLocaleDateString()} ${kernelEvt.timestamp.toLocaleTimeString()}).`;
        }
        break;
      }

      case 'DISK_EVENT': {
        canAutoHeal = false;
        const diskEvt = recentEvents.find(
          (e) =>
            e.source.toLowerCase().includes('ntfs') ||
            e.source.toLowerCase().includes('disk') ||
            e.category.toLowerCase().includes('disk') ||
            (e.title && e.title.toLowerCase().includes('bad block')) ||
            (e.title && e.title.toLowerCase().includes('diskerror'))
        );
        if (diskEvt) {
          isTriggered = true;
          dynamicDescription = `Error del subsistema de almacenamiento registrado en Windows: "${diskEvt.title}" (${diskEvt.timestamp.toLocaleDateString()} ${diskEvt.timestamp.toLocaleTimeString()}).`;
        }
        break;
      }

      case 'APP_CRASH': {
        canAutoHeal = false;
        const crashEvents = recentEvents.filter(
          (e) =>
            e.category.toLowerCase().includes('crash') ||
            (e.title && e.title.toLowerCase().includes('appcrash')) ||
            (e.title && e.title.toLowerCase().includes('bloqueada'))
        );
        if (crashEvents.length >= 3) {
          isTriggered = true;
          dynamicDescription = `Se detectaron ${crashEvents.length} cierres inesperados de aplicaciones en las últimas 24 horas. Última falla: "${crashEvents[0].title}".`;
        }
        break;
      }

      default:
        break;
    }

    const existingAlert = activeAlertMap.get(rule.id) || activeAlertMap.get(rule.name);

    if (isTriggered) {
      if (existingAlert) {
        // De-duplication: update existing active alert
        await db.alert.update({
          where: { id: existingAlert.id },
          data: {
            occurrences: { increment: 1 },
            lastSeenAt: now,
            description: dynamicDescription,
          },
        });
        result.alertsUpdated++;
      } else {
        // Create new Alert
        await db.alert.create({
          data: {
            tenantId,
            deviceId,
            customerId: device.customerId,
            ruleId: rule.id,
            severity: rule.severity,
            status: AlertStatus.OPEN,
            title: rule.name,
            description: dynamicDescription,
            source: `engine:${rule.category}`,
            firstSeenAt: now,
            lastSeenAt: now,
            occurrences: 1,
          },
        });
        result.alertsCreated++;
        logger.warn(
          { deviceId, hostname: device.hostname, rule: rule.name, severity: rule.severity },
          `🚨 Alert triggered: [${rule.severity}] ${rule.name} on ${device.hostname}`
        );
      }
    } else if (canAutoHeal && existingAlert) {
      // Auto-healing: condition normalized, mark resolved!
      await db.alert.update({
        where: { id: existingAlert.id },
        data: {
          status: AlertStatus.RESOLVED,
          resolvedAt: now,
          description: `${existingAlert.description} — [Auto-resuelto por telemetría normalizada a las ${now.toLocaleTimeString()}]`,
        },
      });
      result.alertsResolved++;
      logger.info(
        { deviceId, hostname: device.hostname, rule: rule.name },
        `✅ Alert auto-resolved: ${rule.name} on ${device.hostname}`
      );
    }
  }

  return result;
}

/**
 * Evaluates alerts across all active devices in the database.
 * Used by the background job scheduler.
 */
export async function evaluateAllDevicesAlerts(): Promise<{
  totalDevices: number;
  totalCreated: number;
  totalUpdated: number;
  totalResolved: number;
  durationMs: number;
}> {
  const start = Date.now();
  const devices = await db.device.findMany({
    select: { id: true, tenantId: true },
  });

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalResolved = 0;

  for (const d of devices) {
    try {
      const res = await evaluateDeviceAlerts(d.id, d.tenantId);
      totalCreated += res.alertsCreated;
      totalUpdated += res.alertsUpdated;
      totalResolved += res.alertsResolved;
    } catch (err) {
      logger.error({ err, deviceId: d.id }, 'Error evaluating alerts for device');
    }
  }

  const durationMs = Date.now() - start;
  if (totalCreated > 0 || totalResolved > 0) {
    logger.info(
      { totalDevices: devices.length, totalCreated, totalUpdated, totalResolved, durationMs },
      `🛡️ Alert evaluation finished: +${totalCreated} new, ~${totalUpdated} updated, -${totalResolved} auto-resolved (${durationMs}ms)`
    );
  }

  return {
    totalDevices: devices.length,
    totalCreated,
    totalUpdated,
    totalResolved,
    durationMs,
  };
}
