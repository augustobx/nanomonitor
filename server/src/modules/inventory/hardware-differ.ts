import { AlertStatus, HardwareChangeType, HardwareComponent, Severity } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

export interface HardwareDiffResult {
  changesDetected: number;
  criticalTamperingDetected: boolean;
  changes: Array<{
    component: HardwareComponent;
    changeType: HardwareChangeType;
    componentName: string;
    oldValue: string | null;
    newValue: string | null;
    details?: any;
  }>;
}

export class HardwareDiffer {
  /**
   * Compares the newly ingested DeviceInventory against the previous snapshot,
   * detects component additions, removals, or upgrades, records HardwareChange audit entries,
   * and generates security alerts if critical components (such as RAM modules) are removed.
   */
  static async evaluateHardwareChanges(
    tenantId: string,
    deviceId: string,
    currentSnapshot: {
      hardware?: any;
      os?: any;
      network?: any;
      storage?: any;
    }
  ): Promise<HardwareDiffResult> {
    const result: HardwareDiffResult = {
      changesDetected: 0,
      criticalTamperingDetected: false,
      changes: [],
    };

    // Find previous inventory snapshot (skip the one just inserted)
    const previousInventory = await db.deviceInventory.findFirst({
      where: { tenantId, deviceId },
      orderBy: { collectedAt: 'desc' },
      skip: 1,
    });

    if (!previousInventory) {
      // First baseline inventory, nothing to compare
      return result;
    }

    const prevHw = (previousInventory.hardware as any) || {};
    const currHw = currentSnapshot.hardware || {};

    const prevOS = (previousInventory.os as any) || {};
    const currOS = currentSnapshot.os || {};

    const prevStorage = (previousInventory.storage as any) || {};
    const currStorage = currentSnapshot.storage || {};

    const prevNetwork = (previousInventory.network as any) || {};
    const currNetwork = currentSnapshot.network || {};

    // 1. RAM CAPACITY & MODULE COMPARISON
    const prevRAM = Number(prevHw.ram?.totalMb || 0);
    const currRAM = Number(currHw.ram?.totalMb || 0);

    if (prevRAM > 0 && currRAM > 0 && prevRAM !== currRAM) {
      const diffMB = currRAM - prevRAM;

      if (diffMB >= 512) {
        // Upgrade / Addition of RAM
        result.changes.push({
          component: HardwareComponent.RAM,
          changeType: HardwareChangeType.ADDED,
          componentName: 'Memoria RAM del Sistema',
          oldValue: `${prevRAM} MB (${(prevRAM / 1024).toFixed(1)} GB)`,
          newValue: `${currRAM} MB (${(currRAM / 1024).toFixed(1)} GB)`,
          details: { diffMB, upgrade: true },
        });
      } else if (diffMB <= -512) {
        // Downgrade / Removal / Failure of RAM
        result.criticalTamperingDetected = true;
        result.changes.push({
          component: HardwareComponent.RAM,
          changeType: HardwareChangeType.REMOVED,
          componentName: 'Memoria RAM del Sistema',
          oldValue: `${prevRAM} MB (${(prevRAM / 1024).toFixed(1)} GB)`,
          newValue: `${currRAM} MB (${(currRAM / 1024).toFixed(1)} GB)`,
          details: { diffMB, downgrade: true, alertRequired: true },
        });
      }
    }

    // 2. CPU PROCESSOR COMPARISON
    const prevCPU = prevHw.cpu?.name?.trim();
    const currCPU = currHw.cpu?.name?.trim();

    if (prevCPU && currCPU && prevCPU !== currCPU) {
      result.changes.push({
        component: HardwareComponent.CPU,
        changeType: HardwareChangeType.MODIFIED,
        componentName: 'Procesador Principal',
        oldValue: prevCPU,
        newValue: currCPU,
        details: {
          prevCores: prevHw.cpu?.cores,
          currCores: currHw.cpu?.cores,
        },
      });
    }

    // 3. PHYSICAL DISKS & STORAGE COMPARISON
    const prevDisks: any[] = Array.isArray(prevStorage.disks) ? prevStorage.disks : [];
    const currDisks: any[] = Array.isArray(currStorage.disks) ? currStorage.disks : [];

    if (prevDisks.length > 0 && currDisks.length > 0) {
      const prevDiskNames = new Set(prevDisks.map((d) => (d.model || d.name || `Disk-${d.index}`).trim()));
      const currDiskNames = new Set(currDisks.map((d) => (d.model || d.name || `Disk-${d.index}`).trim()));

      // Disks added
      for (const d of currDisks) {
        const diskId = (d.model || d.name || `Disk-${d.index}`).trim();
        if (!prevDiskNames.has(diskId)) {
          const sizeGB = d.sizeBytes ? Math.round(d.sizeBytes / (1024 * 1024 * 1024)) : undefined;
          result.changes.push({
            component: HardwareComponent.STORAGE,
            changeType: HardwareChangeType.ADDED,
            componentName: `Disco Físico: ${diskId}`,
            oldValue: null,
            newValue: sizeGB ? `${diskId} (${sizeGB} GB)` : diskId,
            details: d,
          });
        }
      }

      // Disks removed
      for (const d of prevDisks) {
        const diskId = (d.model || d.name || `Disk-${d.index}`).trim();
        if (!currDiskNames.has(diskId)) {
          const sizeGB = d.sizeBytes ? Math.round(d.sizeBytes / (1024 * 1024 * 1024)) : undefined;
          result.changes.push({
            component: HardwareComponent.STORAGE,
            changeType: HardwareChangeType.REMOVED,
            componentName: `Disco Físico: ${diskId}`,
            oldValue: sizeGB ? `${diskId} (${sizeGB} GB)` : diskId,
            newValue: null,
            details: d,
          });
        }
      }
    }

    // 4. NETWORK ADAPTERS COMPARISON
    const prevAdapters: any[] = Array.isArray(prevNetwork.adapters) ? prevNetwork.adapters : [];
    const currAdapters: any[] = Array.isArray(currNetwork.adapters) ? currNetwork.adapters : [];

    if (prevAdapters.length > 0 && currAdapters.length > 0) {
      const prevMacs = new Set(prevAdapters.map((a) => (a.mac || a.name || '').toLowerCase()).filter(Boolean));
      const currMacs = new Set(currAdapters.map((a) => (a.mac || a.name || '').toLowerCase()).filter(Boolean));

      for (const a of currAdapters) {
        const key = (a.mac || a.name || '').toLowerCase();
        if (key && !prevMacs.has(key)) {
          result.changes.push({
            component: HardwareComponent.NETWORK,
            changeType: HardwareChangeType.ADDED,
            componentName: `Adaptador de Red: ${a.name || 'NIC'}`,
            oldValue: null,
            newValue: `MAC: ${a.mac || '-'} | IP: ${Array.isArray(a.ips) ? a.ips.join(', ') : a.ip || '-'}`,
            details: a,
          });
        }
      }

      for (const a of prevAdapters) {
        const key = (a.mac || a.name || '').toLowerCase();
        if (key && !currMacs.has(key)) {
          result.changes.push({
            component: HardwareComponent.NETWORK,
            changeType: HardwareChangeType.REMOVED,
            componentName: `Adaptador de Red: ${a.name || 'NIC'}`,
            oldValue: `MAC: ${a.mac || '-'} | IP: ${Array.isArray(a.ips) ? a.ips.join(', ') : a.ip || '-'}`,
            newValue: null,
            details: a,
          });
        }
      }
    }

    // 5. OPERATING SYSTEM BUILD OR EDITION UPGRADE
    const prevEdition = (prevOS.caption || prevOS.name || '').trim();
    const currEdition = (currOS.caption || currOS.name || '').trim();
    const prevBuild = (prevOS.buildNumber || prevOS.build || '').trim();
    const currBuild = (currOS.buildNumber || currOS.build || '').trim();

    if ((prevEdition && currEdition && prevEdition !== currEdition) || (prevBuild && currBuild && prevBuild !== currBuild)) {
      result.changes.push({
        component: HardwareComponent.OS,
        changeType: HardwareChangeType.MODIFIED,
        componentName: 'Sistema Operativo / Build',
        oldValue: `${prevEdition} (Build ${prevBuild || '-'})`,
        newValue: `${currEdition} (Build ${currBuild || '-'})`,
        details: { prevOS, currOS },
      });
    }

    // Persist changes to database
    if (result.changes.length > 0) {
      const now = new Date();
      await db.hardwareChange.createMany({
        data: result.changes.map((c) => ({
          tenantId,
          deviceId,
          detectedAt: now,
          component: c.component,
          changeType: c.changeType,
          componentName: c.componentName,
          oldValue: c.oldValue,
          newValue: c.newValue,
          details: c.details || undefined,
        })),
      });

      result.changesDetected = result.changes.length;

      logger.info(
        { deviceId, changesCount: result.changes.length },
        `🔧 Hardware changes recorded for device: ${result.changes.map((c) => c.componentName).join(', ')}`
      );

      // Create an alert if critical tampering / hardware reduction is detected
      if (result.criticalTamperingDetected) {
        const device = await db.device.findFirst({
          where: { id: deviceId, tenantId },
          select: { hostname: true, customerId: true },
        });

        if (device) {
          const alertTitle = `Disminución Inesperada de Memoria RAM en ${device.hostname}`;
          const alertDesc = `Se detectó una reducción no programada de memoria RAM en ${device.hostname}: de ${prevRAM} MB a ${currRAM} MB. Puede deberse a falla física de banco o sustracción de módulo.`;

          await db.alert.create({
            data: {
              tenantId,
              deviceId,
              customerId: device.customerId,
              severity: Severity.CRITICAL,
              status: AlertStatus.OPEN,
              title: alertTitle,
              description: alertDesc,
              source: 'engine:hardware_tampering',
              firstSeenAt: now,
              lastSeenAt: now,
              occurrences: 1,
            },
          });

          logger.warn({ deviceId, hostname: device.hostname }, `🚨 Security Alert: RAM tampering/reduction detected!`);
        }
      }
    }

    return result;
  }
}
