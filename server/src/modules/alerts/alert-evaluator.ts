import { AlertStatus, Severity } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { ensureDefaultAlertRules } from './alert-rules.seed.js';
import { RemediationService } from '../remediation/remediation.service.js';

export interface EvaluationResult {
  deviceId: string;
  hostname: string;
  alertsCreated: number;
  alertsUpdated: number;
  alertsResolved: number;
}

interface CrashEvidence {
  appName: string;
  appVersion: string;
  faultingModule: string;
  faultingModuleVersion: string;
  exceptionCode: string;
  faultOffset: string;
  processId: string;
  appPath: string;
  modulePath: string;
}

function firstText(raw: any, keys: string[]): string {
  for (const key of keys) {
    const value = raw?.[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text && text !== '<nil>') return text;
  }
  return '';
}

function extractCrashEvidence(event: any): CrashEvidence {
  const raw = (event?.rawData || {}) as any;
  return {
    appName: firstText(raw, ['appName', 'AppName', 'ApplicationName', 'FaultingApplicationName', 'param1', 'P1']) || 'Aplicación desconocida',
    appVersion: firstText(raw, ['appVersion', 'AppVersion', 'ApplicationVersion', 'FaultingApplicationVersion', 'param2', 'P2']),
    faultingModule: firstText(raw, ['faultingModule', 'ModuleName', 'FaultingModuleName', 'FaultingModule', 'param4', 'P4']),
    faultingModuleVersion: firstText(raw, ['faultingModuleVersion', 'ModuleVersion', 'FaultingModuleVersion', 'param5', 'P5']),
    exceptionCode: firstText(raw, ['exceptionCode', 'ExceptionCode', 'ExceptionCodeString', 'param7', 'P7']),
    faultOffset: firstText(raw, ['faultOffset', 'FaultingOffset', 'FaultOffset', 'param8', 'P8']),
    processId: firstText(raw, ['processId', 'ProcessId', 'FaultingProcessId', 'param9']),
    appPath: firstText(raw, ['appPath', 'AppPath', 'ApplicationPath', 'FaultingApplicationPath', 'param11']),
    modulePath: firstText(raw, ['modulePath', 'ModulePath', 'FaultingModulePath', 'param12']),
  };
}

function crashSignature(event: any): string {
  const evidence = extractCrashEvidence(event);
  return [
    evidence.appName,
    evidence.faultingModule || 'module-unknown',
    evidence.exceptionCode || 'exception-unknown',
    String(event?.eventId || 0),
  ]
    .map((value) => value.toLowerCase().trim())
    .join('|');
}

function stableCrashHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function describeCrashGroup(events: any[], realCount: number): string {
  const newest = events[0];
  const evidence = extractCrashEvidence(newest);

  const lines = [
    `Aplicación: ${evidence.appName}`,
    evidence.appVersion ? `Versión: ${evidence.appVersion}` : '',
    evidence.faultingModule ? `Módulo con fallas: ${evidence.faultingModule}` : '',
    evidence.faultingModuleVersion ? `Versión del módulo: ${evidence.faultingModuleVersion}` : '',
    evidence.exceptionCode ? `Código de excepción: ${evidence.exceptionCode}` : '',
    evidence.faultOffset ? `Offset de falla: ${evidence.faultOffset}` : '',
    evidence.processId ? `Proceso/PID: ${evidence.processId}` : '',
    evidence.appPath ? `Ruta de aplicación: ${evidence.appPath}` : '',
    evidence.modulePath ? `Ruta del módulo: ${evidence.modulePath}` : '',
    `Eventos reales: ${realCount} en las últimas 24 horas`,
    `Última falla registrada: ${new Date(newest.timestamp).toLocaleString('es-AR')}`,
    `Evento principal: ID ${newest.eventId || '-'} · ${newest.title || 'Application Error'}`,
  ].filter(Boolean);

  return lines.join('\n');
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

  const device = await db.device.findFirst({
    where: { id: deviceId, tenantId },
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

  // Fetch general base rules for this tenant (customerId: null)
  const generalRules = await db.alertRule.findMany({
    where: {
      tenantId,
      customerId: null,
      enabled: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Fetch customer-specific rules if device belongs to a customer
  const customerOverrides = device.customerId
    ? await db.alertRule.findMany({
        where: {
          tenantId,
          customerId: device.customerId,
        },
      })
    : [];

  const overrideMap = new Map<string, typeof customerOverrides[0]>();
  for (const ov of customerOverrides) {
    overrideMap.set(ov.name, ov);
  }

  // Build effective rules:
  // 1. For each general rule: apply customer override (or skip if customer disabled it)
  const effectiveRules: typeof generalRules = [];
  for (const gr of generalRules) {
    const ov = overrideMap.get(gr.name);
    if (ov) {
      if (ov.enabled) {
        effectiveRules.push(ov);
      }
      // If customer override has enabled: false, this rule is muted for this customer
    } else {
      effectiveRules.push(gr);
    }
  }

  // 2. Include any customer-specific rules that aren't overrides of a general rule
  for (const ov of customerOverrides) {
    if (ov.enabled && !generalRules.some((gr) => gr.name === ov.name)) {
      effectiveRules.push(ov);
    }
  }

  const rules = effectiveRules;

  if (rules.length === 0) return result;

  // Fetch latest metric
  const latestMetric = await db.deviceMetric.findFirst({
    where: { deviceId, tenantId },
    orderBy: { timestamp: 'desc' },
  });

  // Fetch latest inventory snapshot
  const latestInventory = await db.deviceInventory.findFirst({
    where: { deviceId, tenantId },
    orderBy: { collectedAt: 'desc' },
  });

  // Fetch recent events in the last 24 hours
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentEvents = await db.deviceEvent.findMany({
    where: {
      deviceId,
      tenantId,
      timestamp: { gte: since24h },
    },
    orderBy: { timestamp: 'desc' },
    take: 250,
  });

  // Fetch currently active alerts (OPEN or ACKNOWLEDGED) for this device
  const activeAlerts = await db.alert.findMany({
    where: {
      deviceId,
      tenantId,
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

    if (ruleType === 'APP_CRASH') {
      const threshold = Math.max(2, Number(condition.threshold ?? 3));
      const primaryCrashEvents = recentEvents.filter((e) => {
        const category = String(e.category || '').toLowerCase();
        const title = String(e.title || '').toLowerCase();
        const isCrash =
          category.includes('appcrash') ||
          title.includes('cierre inesperado') ||
          title.includes('aplicación bloqueada') ||
          title.includes('appcrash');
        if (!isCrash) return false;

        // Event 1001 is Windows Error Reporting and often accompanies Event 1000.
        // Keep it as supporting evidence in Device Events, but never count it as another crash.
        return e.eventId !== 1001;
      });

      const groups = new Map<string, typeof primaryCrashEvents>();
      for (const crashEvent of primaryCrashEvents) {
        const signature = crashSignature(crashEvent);
        const group = groups.get(signature) || [];
        group.push(crashEvent);
        groups.set(signature, group);
      }

      const qualifyingGroups = Array.from(groups.entries())
        .map(([signature, events]) => {
          const sortedEvents = events.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          // One DeviceEvent row equals one distinct Windows crash event.
          // Never reuse the legacy occurrences column here: older agents incremented
          // that field when the same event signature was observed again, which can
          // massively inflate counts (for example x1351 for only a few real crashes).
          const realCount = sortedEvents.length;
          return { signature, events: sortedEvents, realCount };
        })
        .filter((group) => group.realCount >= threshold)
        .sort((a, b) => b.realCount - a.realCount);

      const legacyAlert = activeAlerts.find(
        (a) =>
          a.ruleId === rule.id &&
          (
            a.source === 'engine:APP_CRASH' ||
            a.source === `engine:${rule.category}` ||
            a.title === rule.name
          )
      );
      let legacyConsumed = false;
      const matchedAlertIds = new Set<string>();

      for (const group of qualifyingGroups) {
        const newest = group.events[0];
        const evidence = extractCrashEvidence(newest);
        const source = `engine:APP_CRASH:${stableCrashHash(group.signature)}`;
        const title = `Caídas repetidas: ${evidence.appName}`;
        const description = describeCrashGroup(group.events, group.realCount);

        let existingCrashAlert = activeAlerts.find(
          (a) => a.ruleId === rule.id && a.source === source
        );

        // Upgrade one legacy aggregate alert in-place so bogus evaluator counts such
        // as x1326 disappear as soon as this evaluator runs.
        if (!existingCrashAlert && legacyAlert && !legacyConsumed) {
          existingCrashAlert = legacyAlert;
          legacyConsumed = true;
        }

        if (existingCrashAlert) {
          await db.alert.update({
            where: { id: existingCrashAlert.id },
            data: {
              title,
              description,
              source,
              occurrences: group.realCount,
              lastSeenAt: new Date(newest.timestamp),
            },
          });
          matchedAlertIds.add(existingCrashAlert.id);
          result.alertsUpdated++;
        } else {
          const createdCrashAlert = await db.alert.create({
            data: {
              tenantId,
              deviceId,
              customerId: device.customerId,
              ruleId: rule.id,
              severity: rule.severity,
              status: AlertStatus.OPEN,
              title,
              description,
              source,
              firstSeenAt: new Date(newest.timestamp),
              lastSeenAt: new Date(newest.timestamp),
              occurrences: group.realCount,
            },
          });
          matchedAlertIds.add(createdCrashAlert.id);
          result.alertsCreated++;
        }
      }

      // A crash-loop alert represents a rolling 24 h condition. If its signature
      // no longer reaches the threshold, close it instead of leaving a stale xN alert.
      const staleCrashAlerts = activeAlerts.filter(
        (a) =>
          a.ruleId === rule.id &&
          (
            a.source === 'engine:APP_CRASH' ||
            a.source.startsWith('engine:APP_CRASH:') ||
            a.source === `engine:${rule.category}` ||
            a.title === rule.name
          ) &&
          !matchedAlertIds.has(a.id)
      );

      for (const staleAlert of staleCrashAlerts) {
        await db.alert.update({
          where: { id: staleAlert.id },
          data: {
            status: AlertStatus.RESOLVED,
            resolvedAt: now,
            autoResolved: true,
            description:
              staleAlert.description +
              '\nEstado: auto-resuelta; la firma ya no alcanza el umbral de repetición dentro de las últimas 24 horas.',
          },
        });
        result.alertsResolved++;
      }

      continue;
    }

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
        const storageObj = latestInventory?.storage as any;
        const smartObj = (latestInventory as any)?.smart as any;
        const disks = storageObj?.disks || storageObj?.physicalDisks || smartObj?.disks || [];
        const unhealthyDisk = disks.find((d: any) => {
          const h = String(d.healthStatus || d.health || d.status || d.operationalStatus || '').toLowerCase();
          return (
            d.predictFailure === true ||
            h.includes('degrad') ||
            h.includes('warn') ||
            h.includes('unhealthy') ||
            h.includes('predfail') ||
            h.includes('caution') ||
            h.includes('bad') ||
            h.includes('critical') ||
            h.includes('fail')
          );
        });
        if (unhealthyDisk) {
          isTriggered = true;
          dynamicDescription = `Fallo predictivo SMART detectado en la unidad física "${unhealthyDisk.friendlyName || unhealthyDisk.model || 'Disco'}" (Estado: ${unhealthyDisk.healthStatus || unhealthyDisk.operationalStatus || 'No saludable'}). Se recomienda respaldo preventivo inmediato.`;
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

      case 'THERMAL': {
        canAutoHeal = true;
        const threshold = condition.threshold ?? 90;
        const thermal = latestMetric?.thermal as any;

        if (!thermal || thermal.available !== true) {
          isTriggered = false;
          break;
        }

        const readings: Array<{ name: string; tempC: number; kind: string }> = [];

        if (thermal.cpu && Number.isFinite(Number(thermal.cpu.temperatureC))) {
          readings.push({
            name: String(thermal.cpu.name || 'CPU'),
            tempC: Number(thermal.cpu.temperatureC),
            kind: 'CPU',
          });
        }

        if (Array.isArray(thermal.gpus)) {
          for (const gpu of thermal.gpus) {
            if (gpu && Number.isFinite(Number(gpu.temperatureC))) {
              readings.push({
                name: String(gpu.name || 'GPU'),
                tempC: Number(gpu.temperatureC),
                kind: 'GPU',
              });
            }
          }
        }

        if (readings.length === 0) {
          isTriggered = false;
          break;
        }

        readings.sort((a, b) => b.tempC - a.tempC);
        const hottest = readings[0];

        if (hottest.tempC >= threshold) {
          isTriggered = true;
          dynamicDescription =
            `Temperatura crítica detectada en ${hottest.kind} "${hottest.name}": ${hottest.tempC.toFixed(1)} °C (umbral: >= ${threshold} °C). Lectura provista por un sensor real disponible en el endpoint.`;
        } else if (hottest.tempC <= threshold - 5) {
          isTriggered = false;
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
          const isEnabled =
            sec.defenderActive === true ||
            (Array.isArray(sec.antivirusList) && sec.antivirusList.some((av: any) => av.enabled === true)) ||
            (Array.isArray(sec.antivirus) && sec.antivirus.some((av: any) => av.enabled === true || av.realTimeProtection === true));

          if (!isEnabled) {
            // Persistence window (default 5 minutes)
            const persistenceMinutes = condition.persistenceMinutes ?? 5;
            const persistenceMs = persistenceMinutes * 60 * 1000;
            const existingAlert = activeAlertMap.get(rule.id) || activeAlertMap.get(rule.name);

            if (existingAlert) {
              // Condition still active, keep alert open
              isTriggered = true;
              dynamicDescription = `La protección antivirus en tiempo real se encuentra desactivada en el endpoint.`;
            } else {
              // Find when this disabled state started (from security transition events or inventory snapshot)
              const disabledEvt = recentEvents.find(
                (e) =>
                  e.category === 'Security' &&
                  (e.dedupKey.includes('Antivirus:disabled') ||
                    (e.title && e.title.toLowerCase().includes('antivirus desactivado')) ||
                    (e.rawData && (e.rawData as any).currentState === 'disabled'))
              );
              const detectedAt = disabledEvt
                ? new Date(disabledEvt.timestamp).getTime()
                : new Date(latestInventory.collectedAt).getTime();
              const elapsedMs = now.getTime() - detectedAt;

              if (elapsedMs >= persistenceMs) {
                isTriggered = true;
                const elapsedMins = Math.round(elapsedMs / 60000);
                dynamicDescription = `La protección antivirus en tiempo real se encuentra desactivada desde hace ${elapsedMins} minutos (ventana de persistencia: ${persistenceMinutes} min).`;
              } else {
                // In grace/persistence window (< 5m): do not open alert yet to prevent false positives
                isTriggered = false;
                logger.debug(
                  { deviceId, elapsedMs, persistenceMs },
                  'Antivirus is disabled but within persistence window (delaying alert)'
                );
              }
            }
          } else {
            isTriggered = false;
          }
        }
        break;
      }

      case 'FIREWALL': {
        canAutoHeal = true;
        if (latestInventory?.security) {
          const sec = latestInventory.security as any;
          let anyDisabled = false;
          let disabledProfiles: string[] = [];

          if (sec.firewallProfiles) {
            if (sec.firewallProfiles.domain === false) disabledProfiles.push('Dominio');
            if (sec.firewallProfiles.private === false) disabledProfiles.push('Privado');
            if (sec.firewallProfiles.public === false) disabledProfiles.push('Público');
            anyDisabled = disabledProfiles.length > 0;
          } else if (Array.isArray(sec.firewallList)) {
            anyDisabled = sec.firewallList.some((f: any) => f.enabled === false);
          } else if (Array.isArray(sec.firewall)) {
            anyDisabled = sec.firewall.some((fw: any) => fw.enabled === false);
          } else if (sec.firewallActive === false) {
            anyDisabled = true;
          }

          if (anyDisabled) {
            const persistenceMinutes = condition.persistenceMinutes ?? 5;
            const persistenceMs = persistenceMinutes * 60 * 1000;
            const existingAlert = activeAlertMap.get(rule.id) || activeAlertMap.get(rule.name);

            if (existingAlert) {
              isTriggered = true;
              const profileMsg = disabledProfiles.length > 0 ? ` (Perfiles: ${disabledProfiles.join(', ')})` : '';
              dynamicDescription = `El Firewall de Windows se encuentra desactivado para uno o más perfiles de red${profileMsg}.`;
            } else {
              const disabledEvt = recentEvents.find(
                (e) =>
                  e.category === 'Security' &&
                  (e.dedupKey.includes('Firewall') ||
                    (e.title && e.title.toLowerCase().includes('firewall')))
              );
              const detectedAt = disabledEvt
                ? new Date(disabledEvt.timestamp).getTime()
                : new Date(latestInventory.collectedAt).getTime();
              const elapsedMs = now.getTime() - detectedAt;

              if (elapsedMs >= persistenceMs) {
                isTriggered = true;
                const elapsedMins = Math.round(elapsedMs / 60000);
                const profileMsg = disabledProfiles.length > 0 ? ` (${disabledProfiles.join(', ')})` : '';
                dynamicDescription = `El Firewall de Windows se encuentra desactivado${profileMsg} desde hace ${elapsedMins} minutos (ventana de persistencia: ${persistenceMinutes} min).`;
              } else {
                isTriggered = false;
              }
            }
          } else {
            isTriggered = false;
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

        // Evaluate auto-remediation on recurring alert if within policy
        RemediationService.handleAlertRemediation({
          id: existingAlert.id,
          tenantId: existingAlert.tenantId,
          deviceId: existingAlert.deviceId,
          customerId: existingAlert.customerId,
          ruleId: existingAlert.ruleId,
          title: existingAlert.title,
        }).catch((err) => {
          logger.error({ err, alertId: existingAlert.id }, 'Failed to evaluate remediation for recurring alert');
        });
      } else {
        // Create new Alert
        const newAlert = await db.alert.create({
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

        // Trigger auto-remediation if configured on rule
        RemediationService.handleAlertRemediation({
          id: newAlert.id,
          tenantId: newAlert.tenantId,
          deviceId: newAlert.deviceId,
          customerId: newAlert.customerId,
          ruleId: newAlert.ruleId,
          title: newAlert.title,
        }).catch((err) => {
          logger.error({ err, alertId: newAlert.id }, 'Failed to trigger remediation for new alert');
        });
      }
    } else if (canAutoHeal && existingAlert) {
      // Auto-healing: condition normalized, mark resolved!
      const durationSec = Math.round((now.getTime() - existingAlert.firstSeenAt.getTime()) / 1000);
      const durationText = durationSec >= 60 ? `${Math.round(durationSec / 60)} min` : `${durationSec} seg`;
      await db.alert.update({
        where: { id: existingAlert.id },
        data: {
          status: AlertStatus.RESOLVED,
          resolvedAt: now,
          description: `${existingAlert.description} — [Auto-resuelto tras ${durationText} de persistencia por telemetría normalizada a las ${now.toLocaleTimeString()}]`,
        },
      });
      result.alertsResolved++;
      logger.info(
        { deviceId, hostname: device.hostname, rule: rule.name, durationSec },
        `✅ Alert auto-resolved: ${rule.name} on ${device.hostname} (Duración: ${durationText})`
      );
    }
  }

  return result;
}

/**
 * Evaluates alerts across all active devices in the database.
 * Used by the background job scheduler.
 */
export async function evaluateAllDevicesAlerts(tenantId?: string): Promise<{
  totalDevices: number;
  totalCreated: number;
  totalUpdated: number;
  totalResolved: number;
  durationMs: number;
}> {
  const start = Date.now();
  const devices = await db.device.findMany({
    where: tenantId ? { tenantId } : undefined,
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
