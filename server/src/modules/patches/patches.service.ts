import { db } from '../../lib/db.js';
import { ActionsService } from '../actions/actions.service.js';
import { applyDevicePresence } from '../../lib/device-presence.js';
import {
  UpsertPatchPolicyInput,
  ReportDevicePatchesInput,
  InstallPatchesRequestInput,
  PatchCategory,
  PatchSeverity,
  PatchStatus,
} from '../../schemas/patches.schema.js';

export class PatchesService {
  /**
   * Calculates high-level Patch Compliance metrics across the tenant's entire fleet
   */
  static async getFleetCompliance(tenantId: string) {
    const totalDevices = await db.device.count({
      where: { tenantId },
    });

    const rebootRequiredDevices = await db.device.count({
      where: {
        tenantId,
        OR: [
          { rebootState: 'REBOOT_REQUIRED' },
          { rebootState: 'REBOOT_SCHEDULED' },
        ],
      },
    });

    const criticalPendingCount = await db.devicePatch.count({
      where: {
        tenantId,
        status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
        category: 'CRITICAL',
      },
    });

    const securityPendingCount = await db.devicePatch.count({
      where: {
        tenantId,
        status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
        category: 'SECURITY',
      },
    });

    const devicesWithPendingPatches = await db.device.count({
      where: {
        tenantId,
        patches: {
          some: {
            status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
          },
        },
      },
    });

    const upToDateDevices = Math.max(0, totalDevices - devicesWithPendingPatches);
    const compliancePct = totalDevices > 0 ? Math.round((upToDateDevices / totalDevices) * 100) : 100;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const failedInstallsCount = await db.patchHistory.count({
      where: {
        tenantId,
        status: 'FAILED',
        appliedAt: { gte: sevenDaysAgo },
      },
    });

    const totalMissingPatches = await db.devicePatch.count({
      where: {
        tenantId,
        status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
      },
    });

    const devices = await db.device.findMany({
      where: { tenantId },
      select: {
        id: true,
        hostname: true,
        status: true,
        lastSeenAt: true,
        rebootState: true,
        patchLastScanAt: true,
        customerId: true,
        customer: { select: { name: true } },
        agent: { select: { agentVersion: true } },
        heartbeats: {
          take: 1,
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true, agentVersion: true },
        },
        inventories: {
          take: 1,
          orderBy: { collectedAt: 'desc' },
          select: { network: true, os: true },
        },
        patches: {
          select: {
            id: true,
            category: true,
            severity: true,
            status: true,
            requiresReboot: true,
            lastScannedAt: true,
          },
        },
      },
      orderBy: { hostname: 'asc' },
    });

    const deviceBreakdown = devices.map((d: any) => {
      const runtime = applyDevicePresence(d);
      const missing = d.patches.filter((p: any) => p.status === 'MISSING' || p.status === 'PENDING_DOWNLOAD' || p.status === 'DOWNLOADED');
      const criticalOrSecurity = missing.filter((p: any) => p.category === 'CRITICAL' || p.category === 'SECURITY' || p.severity === 'CRITICAL' || p.severity === 'IMPORTANT');

      let resolvedIp = '-';
      let resolvedOs = '';
      if (d.inventories && d.inventories.length > 0) {
        const inv = d.inventories[0];
        if (inv.network && Array.isArray(inv.network.interfaces)) {
          for (const iface of inv.network.interfaces) {
            if (iface.ipAddresses && Array.isArray(iface.ipAddresses) && iface.ipAddresses.length > 0) {
              const found = iface.ipAddresses.find((a: string) => a && !a.startsWith('127.') && !a.startsWith('169.254.') && a.includes('.'));
              if (found) {
                resolvedIp = found;
                break;
              }
            }
          }
        }
        if (inv.os && inv.os.caption) {
          resolvedOs = inv.os.caption;
        }
      }

      return {
        deviceId: d.id,
        hostname: d.hostname,
        ipAddress: resolvedIp,
        osName: resolvedOs,
        status: runtime.status,
        customerName: d.customer?.name || 'NanoLabs',
        agentVersion: runtime.runtimeAgentVersion || 'unknown',
        missingCount: missing.length,
        missingCriticalOrSecurity: criticalOrSecurity.length,
        rebootState: d.rebootState,
        isCompliant: missing.length === 0,
        lastScanAt:
          d.patches.reduce(
            (latest: Date | null, p: any) =>
              !latest || p.lastScannedAt > latest ? p.lastScannedAt : latest,
            null
          ) || d.patchLastScanAt || runtime.lastHeartbeatAt,
      };
    });

    return {
      totalDevices,
      upToDateDevices,
      compliantDevices: upToDateDevices,
      devicesWithPendingPatches,
      compliancePct,
      complianceRate: compliancePct,
      totalMissingPatches,
      totalCriticalOrSecurityMissing: criticalPendingCount + securityPendingCount,
      totalPendingReboot: rebootRequiredDevices,
      criticalPendingCount,
      securityPendingCount,
      rebootRequiredDevices,
      failedInstallsCount,
      deviceBreakdown,
    };
  }

  /**
   * Fetches patches for a specific device
   */
  static async getDevicePatches(tenantId: string, deviceId: string) {
    const device = await db.device.findFirst({
      where: { id: deviceId, tenantId },
      select: {
        id: true,
        hostname: true,
        customerId: true,
        rebootState: true,
        rebootScheduledAt: true,
      },
    });

    if (!device) {
      throw new Error(`Dispositivo no encontrado o no pertenece a esta organización.`);
    }

    const patches = await db.devicePatch.findMany({
      where: { tenantId, deviceId, status: { not: 'SUPERSEDED' } },
      orderBy: [
        { status: 'asc' },
        { category: 'asc' },
        { severity: 'asc' },
        { publishedAt: 'desc' },
      ],
    });

    // Check effective policy (customer override or default global)
    const policy = await this.getEffectivePolicy(tenantId, device.customerId);

    return {
      device,
      patches,
      effectivePolicy: policy,
    };
  }

  /**
   * Sincroniza el inventario de parches reportado por el agente
   */
  static async reportDevicePatches(tenantId: string, deviceId: string, report: ReportDevicePatchesInput) {
    const device = await db.device.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new Error(`Dispositivo no encontrado.`);
    }

    const scanAt = report.scannedAt ? new Date(report.scannedAt) : new Date();

    // Device-level watermark also protects empty scans. Buffered reports older
    // than the latest accepted scan are acknowledged but never applied.
    if (device.patchLastScanAt && scanAt.getTime() <= device.patchLastScanAt.getTime()) {
      return { success: true, count: 0, stale: true };
    }

    const hasRebootFlag = report.rebootPending;

    const activeInstallActions = await db.remoteAction.findMany({
      where: {
        tenantId,
        deviceId,
        actionType: { in: ['WINDOWS_UPDATE_INSTALL_KB', 'WINDOWS_UPDATE_INSTALL_APPROVED'] as any },
        status: { in: ['PENDING', 'QUEUED', 'DELIVERED', 'RUNNING'] as any },
      },
      select: { parameters: true },
    });

    const activelyInstallingIds = new Set<string>();
    for (const action of activeInstallActions) {
      const ids = Array.isArray((action.parameters as any)?.kbArticleIds)
        ? ((action.parameters as any).kbArticleIds as unknown[])
        : [];
      for (const id of ids) {
        if (typeof id === 'string' && id.trim()) {
          activelyInstallingIds.add(id.toUpperCase());
        }
      }
    }

    // Process patches in batch transaction
    await db.$transaction(async (tx: any) => {
      const reportedIds = report.patches.map((p) => p.kbArticleId);

      // A fresh WUA scan is authoritative for what is currently pending.
      // Anything that was pending previously but disappeared from the scan is
      // no longer advertised as missing. We mark it SUPERSEDED rather than
      // guessing that it was installed externally.
      await tx.devicePatch.updateMany({
        where: {
          tenantId,
          deviceId,
          status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
          ...(reportedIds.length > 0
            ? { kbArticleId: { notIn: reportedIds } }
            : {}),
        },
        data: {
          status: 'SUPERSEDED',
          lastScannedAt: scanAt,
        },
      });

      const staleInstalling = await tx.devicePatch.findMany({
        where: {
          tenantId,
          deviceId,
          status: 'INSTALLING',
          ...(reportedIds.length > 0
            ? { kbArticleId: { notIn: reportedIds } }
            : {}),
        },
        select: { kbArticleId: true },
      });

      const staleInstallingIds = staleInstalling
        .map((p: any) => String(p.kbArticleId).toUpperCase())
        .filter((id: string) => !activelyInstallingIds.has(id));

      if (staleInstallingIds.length > 0) {
        await tx.devicePatch.updateMany({
          where: {
            tenantId,
            deviceId,
            status: 'INSTALLING',
            kbArticleId: { in: staleInstallingIds },
          },
          data: {
            status: 'SUPERSEDED',
            lastScannedAt: scanAt,
          },
        });
      }

      for (const p of report.patches) {
        await tx.devicePatch.upsert({
          where: {
            deviceId_kbArticleId: {
              deviceId,
              kbArticleId: p.kbArticleId,
            },
          },
          create: {
            tenantId,
            deviceId,
            kbArticleId: p.kbArticleId,
            title: p.title,
            description: p.description,
            category: p.category as any,
            severity: p.severity as any,
            status: p.status as any,
            sizeBytes: p.sizeBytes != null ? BigInt(p.sizeBytes) : null,
            publishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
            installedAt: p.installedAt ? new Date(p.installedAt) : null,
            requiresReboot: p.requiresReboot,
            lastScannedAt: scanAt,
          },
          update: {
            title: p.title,
            description: p.description,
            category: p.category as any,
            severity: p.severity as any,
            status: p.status as any,
            sizeBytes: p.sizeBytes != null ? BigInt(p.sizeBytes) : null,
            installedAt: p.installedAt ? new Date(p.installedAt) : undefined,
            requiresReboot: p.requiresReboot,
            lastScannedAt: scanAt,
          },
        });
      }

      // Keep reboot state aligned with the fresh Windows report.
      if (hasRebootFlag) {
        if (device.rebootState !== 'REBOOT_SCHEDULED') {
          await tx.device.update({
            where: { id: deviceId },
            data: {
              rebootState: 'REBOOT_REQUIRED',
              patchLastScanAt: scanAt,
            },
          });
        }
      } else if (device.rebootState !== 'NONE') {
        await tx.device.update({
          where: { id: deviceId },
          data: {
            rebootState: 'NONE',
            rebootScheduledAt: null,
            patchLastScanAt: scanAt,
          },
        });
      }
    });

    // REBOOT_SCHEDULED intentionally remains untouched above, but the scan
    // watermark must still advance.
    await db.device.update({
      where: { id: deviceId },
      data: { patchLastScanAt: scanAt },
    });

    return { success: true, count: report.patches.length, stale: false };
  }

  /**
   * Obtiene la política efectiva para un cliente o global
   */
  static async getEffectivePolicy(tenantId: string, customerId?: string | null) {
    if (customerId) {
      const customerPolicy = await db.patchPolicy.findFirst({
        where: { tenantId, customerId },
      });
      if (customerPolicy) return customerPolicy;
    }

    const globalPolicy = await db.patchPolicy.findFirst({
      where: { tenantId, customerId: null },
    });

    if (globalPolicy) return globalPolicy;

    // Return virtual default policy
    return {
      id: 'default',
      name: 'Política Estándar NanoLabs',
      isDefault: true,
      criticalApproval: 'AUTO',
      securityApproval: 'AUTO',
      importantApproval: 'MANUAL',
      optionalApproval: 'IGNORE',
      driverApproval: 'MANUAL',
      featureApproval: 'MANUAL',
      maintenanceDays: ['Sunday'],
      startTime: '02:00',
      endTime: '05:00',
      timezone: 'America/Argentina/Buenos_Aires',
      allowReboot: false,
      rebootDeadlineHours: 24,
      notificationDelayMin: 15,
    };
  }

  /**
   * Retorna todas las políticas configuradas para el tenant
   */
  static async getPolicies(tenantId: string) {
    return db.patchPolicy.findMany({
      where: { tenantId },
      include: {
        customer: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Crea o actualiza una política de parches
   */
  static async upsertPolicy(tenantId: string, input: UpsertPatchPolicyInput) {
    const customerId = input.customerId || null;

    const existing = await db.patchPolicy.findFirst({
      where: {
        tenantId,
        customerId: customerId,
      },
    });

    const dataPayload = {
      name: input.name,
      description: input.description,
      isDefault: input.isDefault ?? (customerId === null),
      criticalApproval: input.criticalApproval as any,
      securityApproval: input.securityApproval as any,
      importantApproval: input.importantApproval as any,
      optionalApproval: input.optionalApproval as any,
      driverApproval: input.driverApproval as any,
      featureApproval: input.featureApproval as any,
      maintenanceDays: input.maintenanceDays,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      allowReboot: input.allowReboot,
      rebootDeadlineHours: input.rebootDeadlineHours,
      notificationDelayMin: input.notificationDelayMin,
    };

    if (existing) {
      return db.patchPolicy.update({
        where: { id: existing.id },
        data: dataPayload,
      });
    }

    return db.patchPolicy.create({
      data: {
        tenantId,
        customerId,
        ...dataPayload,
      },
    });
  }

  /**
   * Obtiene el historial de parcheo
   */
  static async getHistory(tenantId: string, deviceId?: string, limit = 50) {
    return db.patchHistory.findMany({
      where: {
        tenantId,
        ...(deviceId ? { deviceId } : {}),
      },
      include: {
        device: { select: { id: true, hostname: true } },
      },
      orderBy: { appliedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Inicia una orden de instalación de parches en un dispositivo
   */
  static async triggerPatchInstall(
    tenantId: string,
    deviceId: string,
    requestedBy: { id?: string; email: string },
    input: InstallPatchesRequestInput
  ) {
    const device = await db.device.findFirst({
      where: { id: deviceId, tenantId },
      include: { customer: true },
    });

    if (!device) {
      throw new Error('Dispositivo no encontrado.');
    }

    let targetKBs: string[] = [];

    if (input.mode === 'SELECTED_KBS') {
      targetKBs = input.kbArticleIds;
      if (targetKBs.length === 0) {
        throw new Error('Debes seleccionar al menos un artículo KB para instalar.');
      }
    } else if (input.mode === 'CRITICAL_ONLY') {
      const patches = await db.devicePatch.findMany({
        where: {
          deviceId,
          tenantId,
          category: 'CRITICAL',
          status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
        },
      });
      targetKBs = patches.map((p: any) => p.kbArticleId);
    } else if (input.mode === 'SECURITY_ONLY') {
      const patches = await db.devicePatch.findMany({
        where: {
          deviceId,
          tenantId,
          category: { in: ['CRITICAL', 'SECURITY'] },
          status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
        },
      });
      targetKBs = patches.map((p: any) => p.kbArticleId);
    } else if (input.mode === 'ALL_APPROVED') {
      const policy = await this.getEffectivePolicy(tenantId, device.customerId);
      const approvedCategories: string[] = [];
      if (policy.criticalApproval === 'AUTO') approvedCategories.push('CRITICAL');
      if (policy.securityApproval === 'AUTO') approvedCategories.push('SECURITY');
      if (policy.importantApproval === 'AUTO') approvedCategories.push('IMPORTANT');
      if (policy.optionalApproval === 'AUTO') approvedCategories.push('OPTIONAL');
      if (policy.driverApproval === 'AUTO') approvedCategories.push('DRIVER');
      if (policy.featureApproval === 'AUTO') approvedCategories.push('FEATURE_UPDATE');

      const patches = await db.devicePatch.findMany({
        where: {
          deviceId,
          tenantId,
          category: { in: approvedCategories as any },
          status: { in: ['MISSING', 'PENDING_DOWNLOAD', 'DOWNLOADED'] },
        },
      });
      targetKBs = patches.map((p: any) => p.kbArticleId);
    }

    if (targetKBs.length === 0) {
      return {
        success: true,
        message: 'No hay actualizaciones pendientes para los criterios seleccionados.',
        queuedKBs: [],
      };
    }

    // Mark target patches as INSTALLING in database
    await db.devicePatch.updateMany({
      where: {
        deviceId,
        kbArticleId: { in: targetKBs },
      },
      data: {
        status: 'INSTALLING',
      },
    });

    // Enqueue RemoteAction
    const action = await ActionsService.createAction({
      tenantId,
      customerId: device.customerId,
      deviceId: device.id,
      actionType: 'WINDOWS_UPDATE_INSTALL_KB',
      parameters: {
        kbArticleIds: targetKBs,
        allowReboot: input.allowReboot,
      },
      requestedById: requestedBy.id,
      requestedBy: requestedBy.email,
      source: 'DASHBOARD_PATCH_MANAGER',
      expiresInMinutes: 60, // Patch installations can take longer
    });

    // Record initial history entries
    for (const kb of targetKBs) {
      await db.patchHistory.create({
        data: {
          tenantId,
          deviceId,
          kbArticleId: kb,
          title: `Instalación solicitada de ${kb}`,
          actionType: 'INSTALL',
          status: 'IN_PROGRESS',
          source: requestedBy.id ? 'MANUAL_TECHNICIAN' : 'AUTO_POLICY',
          appliedBy: requestedBy.email,
        },
      });
    }

    return {
      success: true,
      actionId: action.id,
      queuedKBs: targetKBs,
      status: action.status,
    };
  }

  /**
   * Programa un reinicio seguro para aplicar parches
   */
  static async scheduleReboot(
    tenantId: string,
    deviceId: string,
    requestedBy: { id?: string; email: string },
    delayMinutes: number,
    message: string
  ) {
    const device = await db.device.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new Error('Dispositivo no encontrado.');
    }

    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    const action = await ActionsService.createAction({
      tenantId,
      customerId: device.customerId,
      deviceId: device.id,
      actionType: 'WINDOWS_UPDATE_SCHEDULE_REBOOT',
      parameters: {
        delaySeconds: delayMinutes * 60,
        message,
      },
      requestedById: requestedBy.id,
      requestedBy: requestedBy.email,
      source: 'PATCH_MANAGER_REBOOT',
      expiresInMinutes: 30,
    });

    await db.device.update({
      where: { id: deviceId },
      data: {
        rebootState: 'REBOOT_SCHEDULED',
        rebootScheduledAt: scheduledAt,
      },
    });

    return {
      success: true,
      actionId: action.id,
      scheduledAt,
    };
  }
}
