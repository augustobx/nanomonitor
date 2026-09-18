import { EventEmitter } from 'node:events';
import { ActionStatus, ActionType } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { logAudit } from '../../middleware/audit.js';

export const actionEvents = new EventEmitter();
// Increase listener limit to support multiple concurrent device polling loops
actionEvents.setMaxListeners(500);

const DELIVERY_LEASE_MS = 60 * 1000;
const MAX_RUNNING_AGE_MS = 2 * 60 * 60 * 1000;

export interface CreateActionParams {
  tenantId: string;
  customerId: string;
  deviceId: string;
  actionType: ActionType;
  parameters?: Record<string, unknown>;
  requestedById?: string | null;
  requestedBy: string;
  expiresInMinutes?: number;
  source?: string;
  requestIp?: string;
  userAgent?: string;
}

export interface UpdateActionStatusParams {
  actionId: string;
  agentId: string;
  deviceId: string;
  tenantId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  output?: string;
  error?: string;
  result?: Record<string, unknown>;
}

export class ActionsService {
  private static async reconcileNeverExecutedAction(action: any, reason: string) {
    if (
      action.actionType === ActionType.WINDOWS_UPDATE_INSTALL_KB ||
      action.actionType === ActionType.WINDOWS_UPDATE_INSTALL_APPROVED
    ) {
      const ids = Array.isArray(action.parameters?.kbArticleIds)
        ? action.parameters.kbArticleIds
            .filter((v: unknown): v is string => typeof v === 'string')
            .map((v: string) => v.trim().toUpperCase())
        : [];

      if (ids.length > 0) {
        await db.devicePatch.updateMany({
          where: {
            tenantId: action.tenantId,
            deviceId: action.deviceId,
            kbArticleId: { in: ids },
            status: 'INSTALLING',
          },
          data: { status: 'MISSING' },
        });

        await db.patchHistory.updateMany({
          where: {
            tenantId: action.tenantId,
            deviceId: action.deviceId,
            kbArticleId: { in: ids },
            status: 'IN_PROGRESS',
          },
          data: {
            status: 'FAILED',
            exitCode: 1,
            errorDetails: reason,
          },
        });
      }
    }

    if (action.actionType === ActionType.WINDOWS_UPDATE_SCHEDULE_REBOOT) {
      await db.device.updateMany({
        where: {
          id: action.deviceId,
          tenantId: action.tenantId,
          rebootState: 'REBOOT_SCHEDULED',
        },
        data: {
          rebootState: 'REBOOT_REQUIRED',
          rebootScheduledAt: null,
        },
      });
    }
  }

  private static async expirePendingActions(tenantId: string, deviceId: string, now: Date) {
    const expiring = await db.remoteAction.findMany({
      where: {
        tenantId,
        deviceId,
        status: { in: [ActionStatus.PENDING, ActionStatus.QUEUED, ActionStatus.DELIVERED] },
        expiresAt: { lt: now },
      },
    });

    for (const action of expiring) {
      const changed = await db.remoteAction.updateMany({
        where: {
          id: action.id,
          tenantId,
          deviceId,
          status: { in: [ActionStatus.PENDING, ActionStatus.QUEUED, ActionStatus.DELIVERED] },
        },
        data: {
          status: ActionStatus.EXPIRED,
          finishedAt: now,
        },
      });

      if (changed.count === 1) {
        await this.reconcileNeverExecutedAction(
          action,
          'La acción expiró antes de comenzar su ejecución en el agente.'
        );
      }
    }

    // A process can die after RUNNING is acknowledged but before a durable
    // terminal report exists. Close each stale action conditionally so its
    // related patch/remediation state is reconciled exactly once.
    const staleRunningBefore = new Date(now.getTime() - MAX_RUNNING_AGE_MS);
    const staleRunning = await db.remoteAction.findMany({
      where: {
        tenantId,
        deviceId,
        status: ActionStatus.RUNNING,
        startedAt: { lt: staleRunningBefore },
      },
    });

    for (const action of staleRunning) {
      const reason =
        'Execution lease expired: the agent did not return a terminal result within 2 hours.';

      const changed = await db.remoteAction.updateMany({
        where: {
          id: action.id,
          tenantId,
          deviceId,
          status: ActionStatus.RUNNING,
          startedAt: { lt: staleRunningBefore },
        },
        data: {
          status: ActionStatus.FAILED,
          finishedAt: now,
          error: reason,
          auditMetadata: { executionLeaseExpired: true },
        },
      });

      if (changed.count !== 1) continue;

      await this.reconcileNeverExecutedAction(action, reason);

      await db.remediationExecution.updateMany({
        where: {
          tenantId,
          remoteActionId: action.id,
          status: {
            in: ['QUEUED', 'EXECUTING', 'VALIDATING'] as any,
          },
        },
        data: {
          status: 'FAILED',
          completedAt: now,
          error: reason,
          savedIntervention: false,
        },
      });

      logger.warn(
        { tenantId, deviceId, actionId: action.id, actionType: action.actionType },
        'Closed stale RUNNING remote action after execution lease expiry'
      );
    }
  }

  /**
   * Enqueue a new remote action for a device
   */
  static async createAction(params: CreateActionParams) {
    const {
      tenantId,
      customerId,
      deviceId,
      actionType,
      parameters = {},
      requestedById,
      requestedBy,
      expiresInMinutes = 15,
      source = 'DASHBOARD',
      requestIp,
      userAgent,
    } = params;

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const targetDevice = await db.device.findFirst({
      where: {
        id: deviceId,
        tenantId,
        customerId,
      },
      select: { id: true },
    });
    if (!targetDevice) {
      throw new Error('Target device does not belong to the requested tenant/customer scope');
    }

    const action = await db.remoteAction.create({
      data: {
        tenantId,
        customerId,
        deviceId,
        actionType,
        parameters: parameters as any,
        status: ActionStatus.PENDING,
        requestedById,
        requestedBy,
        requestedAt: new Date(),
        expiresAt,
        source,
      },
      include: {
        device: { select: { hostname: true } },
      },
    });

    // Record audit entry
    await logAudit({
      tenantId,
      userId: requestedById || undefined,
      action: 'ACTION_REQUESTED',
      entityType: 'RemoteAction',
      entityId: action.id,
      details: {
        actionType,
        deviceId,
        hostname: action.device.hostname,
        parameters,
        expiresAt: expiresAt.toISOString(),
        source,
      },
    });

    // Notify any waiting long-poll listeners for this device
    actionEvents.emit(`action:${deviceId}`, action);

    return action;
  }

  /**
   * Get active and past actions for a device
   */
  static async getDeviceActions(tenantId: string, deviceId: string, limit = 50) {
    // 1. Expire and reconcile actions that never began.
    const now = new Date();
    await this.expirePendingActions(tenantId, deviceId, now);

    // 2. Query recent actions
    const actions = await db.remoteAction.findMany({
      where: {
        tenantId,
        deviceId,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });

    return actions;
  }

  /**
   * Cancel an action before execution
   */
  static async cancelAction(
    tenantId: string,
    deviceId: string,
    actionId: string,
    userId: string | undefined,
    userEmail: string,
    reason?: string
  ) {
    const action = await db.remoteAction.findFirst({
      where: { id: actionId, tenantId, deviceId },
    });

    if (!action) {
      return null;
    }

    if (
      action.status === ActionStatus.SUCCESS ||
      action.status === ActionStatus.FAILED ||
      action.status === ActionStatus.RUNNING
    ) {
      throw new Error(`Cannot cancel action in status "${action.status}"`);
    }

    const updated = await db.remoteAction.update({
      where: { id: actionId },
      data: {
        status: ActionStatus.CANCELLED,
        auditMetadata: {
          cancelledBy: userEmail,
          cancelledAt: new Date().toISOString(),
          reason: reason || 'Cancelled by operator',
        },
      },
    });

    await this.reconcileNeverExecutedAction(
      action,
      reason || 'La acción fue cancelada antes de ejecutarse.'
    );

    await logAudit({
      tenantId,
      userId,
      action: 'ACTION_CANCELLED',
      entityType: 'RemoteAction',
      entityId: action.id,
      details: {
        actionType: action.actionType,
        deviceId,
        reason: reason || 'Cancelled by operator',
      },
    });

    return updated;
  }

  /**
   * Poll pending actions for an agent.
   * If no action is available and waitMs > 0, waits up to waitMs before returning empty list.
   */
  static async pollActionsForAgent(
    tenantId: string,
    deviceId: string,
    waitMs = 0
  ): Promise<any[]> {
    const now = new Date();
    const deliveryLeaseCutoff = new Date(now.getTime() - DELIVERY_LEASE_MS);

    await this.expirePendingActions(tenantId, deviceId, now);

    const availableWhere: any = {
      tenantId,
      deviceId,
      expiresAt: { gt: now },
      OR: [
        { status: { in: [ActionStatus.PENDING, ActionStatus.QUEUED] } },
        {
          status: ActionStatus.DELIVERED,
          deliveredAt: { lt: deliveryLeaseCutoff },
        },
      ],
    };

    const pendingActions = await db.remoteAction.findMany({
      where: availableWhere,
      orderBy: { createdAt: 'asc' },
      take: 1,
    });

    if (pendingActions.length > 0) {
      const deliveredAt = new Date();
      const ids = pendingActions.map((a) => a.id);

      await db.remoteAction.updateMany({
        where: {
          id: { in: ids },
          tenantId,
          deviceId,
          expiresAt: { gt: deliveredAt },
          OR: [
            { status: { in: [ActionStatus.PENDING, ActionStatus.QUEUED] } },
            { status: ActionStatus.DELIVERED, deliveredAt: { lt: deliveryLeaseCutoff } },
          ],
        },
        data: {
          status: ActionStatus.DELIVERED,
          deliveredAt,
        },
      });

      const claimed = await db.remoteAction.findMany({
        where: {
          id: { in: ids },
          tenantId,
          deviceId,
          status: ActionStatus.DELIVERED,
          deliveredAt,
        },
        orderBy: { createdAt: 'asc' },
      });

      return claimed.map((a) => ({
        id: a.id,
        actionType: a.actionType,
        parameters: a.parameters || {},
        issuedAt: a.requestedAt.toISOString(),
        expiresAt: a.expiresAt.toISOString(),
        requestedBy: a.requestedBy,
      }));
    }

    if (waitMs > 0) {
      const timeoutCap = Math.min(waitMs, 25000);
      return new Promise<any[]>((resolve) => {
        let timer: NodeJS.Timeout | null = null;

        const onActionEmitted = async (action: any) => {
          if (timer) clearTimeout(timer);
          actionEvents.off(`action:${deviceId}`, onActionEmitted);

          try {
            const deliveredAt = new Date();
            const claim = await db.remoteAction.updateMany({
              where: {
                id: action.id,
                tenantId,
                deviceId,
                status: { in: [ActionStatus.PENDING, ActionStatus.QUEUED] },
                expiresAt: { gt: deliveredAt },
              },
              data: {
                status: ActionStatus.DELIVERED,
                deliveredAt,
              },
            });

            if (claim.count !== 1) {
              resolve([]);
              return;
            }

            const delivered = await db.remoteAction.findUnique({ where: { id: action.id } });
            if (!delivered) {
              resolve([]);
              return;
            }

            resolve([
              {
                id: delivered.id,
                actionType: delivered.actionType,
                parameters: delivered.parameters || {},
                issuedAt: delivered.requestedAt.toISOString(),
                expiresAt: delivered.expiresAt.toISOString(),
                requestedBy: delivered.requestedBy,
              },
            ]);
          } catch {
            resolve([]);
          }
        };

        timer = setTimeout(() => {
          actionEvents.off(`action:${deviceId}`, onActionEmitted);
          resolve([]);
        }, timeoutCap);

        actionEvents.once(`action:${deviceId}`, onActionEmitted);
      });
    }

    return [];
  }

  /**
   * Update action execution status reported by the agent
   */
  static async updateActionStatus(params: UpdateActionStatusParams) {
    const {
      actionId,
      agentId,
      deviceId,
      tenantId,
      status,
      startedAt,
      finishedAt,
      exitCode,
      output,
      error,
      result,
    } = params;

    const action = await db.remoteAction.findFirst({
      where: { id: actionId, tenantId, deviceId },
    });

    if (!action) {
      throw new Error(`Action "${actionId}" not found for this device`);
    }

    const terminalStatuses = new Set<ActionStatus>([
      ActionStatus.SUCCESS,
      ActionStatus.FAILED,
      ActionStatus.EXPIRED,
      ActionStatus.CANCELLED,
    ]);

    // A stale RUNNING action may have been provisionally force-closed by the
    // server. A later durable terminal report from the agent is authoritative,
    // even when both provisional and real states are FAILED. Compute this
    // before the ordinary same-status idempotency shortcut.
    const metadata = (action.auditMetadata || {}) as any;
    const recoveringExecutionLease =
      action.status === ActionStatus.FAILED &&
      metadata.executionLeaseExpired === true &&
      (status === 'SUCCESS' || status === 'FAILED');

    if (terminalStatuses.has(action.status)) {
      if (action.status === (status as ActionStatus) && !recoveringExecutionLease) {
        return { action, changed: false };
      }

      // Agent checks expiresAt before any side effect. If the server expired the
      // record first, its FAILED "not executed because expired" report is an
      // idempotent acknowledgement, not a conflicting transition.
      if (action.status === ActionStatus.EXPIRED && status === 'FAILED') {
        return { action, changed: false };
      }

      if (!recoveringExecutionLease) {
        throw new Error(`Action "${actionId}" is already terminal with status ${action.status}`);
      }
    }

    if (status === 'RUNNING' && !([
      ActionStatus.PENDING,
      ActionStatus.QUEUED,
      ActionStatus.DELIVERED,
      ActionStatus.RUNNING,
    ] as ActionStatus[]).includes(action.status)) {
      throw new Error(`Invalid transition ${action.status} -> RUNNING`);
    }

    if (
      (status === 'SUCCESS' || status === 'FAILED') &&
      !recoveringExecutionLease &&
      !([ActionStatus.DELIVERED, ActionStatus.RUNNING] as ActionStatus[]).includes(action.status)
    ) {
      throw new Error(`Invalid transition ${action.status} -> ${status}`);
    }

    const dataUpdates: any = {
      status: status as ActionStatus,
    };
    if (recoveringExecutionLease) {
      dataUpdates.auditMetadata = {
        ...((action.auditMetadata || {}) as any),
        executionLeaseExpired: false,
        lateTerminalResultAcceptedAt: new Date().toISOString(),
      };
    }

    if (startedAt) {
      dataUpdates.startedAt = new Date(startedAt);
    } else if (status === 'RUNNING' && !action.startedAt) {
      dataUpdates.startedAt = new Date();
    }

    if (finishedAt) {
      dataUpdates.finishedAt = new Date(finishedAt);
    } else if (status === 'SUCCESS' || status === 'FAILED') {
      dataUpdates.finishedAt = new Date();
    }

    if (typeof exitCode === 'number') {
      dataUpdates.exitCode = exitCode;
    }

    if (typeof output === 'string') {
      dataUpdates.output = output.length > 65536 ? output.slice(0, 65536) + '\n[Truncated...]' : output;
    }

    if (typeof error === 'string') {
      dataUpdates.error = error.length > 16384 ? error.slice(0, 16384) + '\n[Truncated...]' : error;
    }

    if (result) {
      dataUpdates.result = result as any;
    }

    const updated = await db.remoteAction.update({
      where: { id: actionId },
      data: dataUpdates,
    });

    await logAudit({
      tenantId,
      agentId,
      action: status === 'RUNNING' ? 'ACTION_STARTED' : `ACTION_${status}`,
      entityType: 'RemoteAction',
      entityId: action.id,
      details: {
        actionType: action.actionType,
        deviceId,
        status,
        exitCode,
        durationMs:
          updated.finishedAt && updated.startedAt
            ? updated.finishedAt.getTime() - updated.startedAt.getTime()
            : undefined,
        error: error || undefined,
      },
    });

    if (
      (status === 'SUCCESS' || status === 'FAILED') &&
      (action.actionType === ActionType.WINDOWS_UPDATE_INSTALL_KB ||
        action.actionType === ActionType.WINDOWS_UPDATE_INSTALL_APPROVED)
    ) {
      const actionResult = (result || {}) as any;
      const outcomes = Array.isArray(actionResult.outcomes) ? actionResult.outcomes : [];
      const now = new Date();

      const fallbackTargets = Array.isArray((action.parameters as any)?.kbArticleIds)
        ? ((action.parameters as any).kbArticleIds as unknown[])
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.toUpperCase())
        : [];

      const outcomeIds = new Set<string>();

      for (const outcome of outcomes) {
        const identifier =
          typeof outcome?.identifier === 'string' ? outcome.identifier.toUpperCase() : '';
        if (!identifier) continue;

        outcomeIds.add(identifier);
        const installed = outcome.installed === true;
        const patchStatus = installed ? 'INSTALLED' : 'FAILED';

        await db.devicePatch.updateMany({
          where: {
            tenantId,
            deviceId,
            kbArticleId: identifier,
          },
          data: {
            status: patchStatus,
            installedAt: installed ? now : null,
            lastScannedAt: now,
          },
        });

        await db.patchHistory.updateMany({
          where: {
            tenantId,
            deviceId,
            kbArticleId: identifier,
            status: 'IN_PROGRESS',
          },
          data: {
            status: installed ? 'SUCCESS' : 'FAILED',
            exitCode:
              typeof outcome.resultCode === 'number'
                ? outcome.resultCode
                : installed
                  ? 0
                  : 1,
            errorDetails: installed
              ? null
              : `Windows Update no confirmó la instalación. ResultCode=${outcome.resultCode ?? 'N/A'}, HResult=${outcome.hResult ?? 'N/A'}`,
          },
        });
      }

      for (const identifier of fallbackTargets) {
        if (outcomeIds.has(identifier)) continue;

        await db.devicePatch.updateMany({
          where: {
            tenantId,
            deviceId,
            kbArticleId: identifier,
            status: 'INSTALLING',
          },
          data: {
            status: 'FAILED',
            installedAt: null,
            lastScannedAt: now,
          },
        });

        await db.patchHistory.updateMany({
          where: {
            tenantId,
            deviceId,
            kbArticleId: identifier,
            status: 'IN_PROGRESS',
          },
          data: {
            status: 'FAILED',
            exitCode: exitCode ?? 1,
            errorDetails:
              error ||
              'El agente no devolvió verificación individual para este parche; no se marca como instalado.',
          },
        });
      }

      if (actionResult.rebootRequired === true) {
        await db.device.update({
          where: { id: deviceId },
          data: { rebootState: 'REBOOT_REQUIRED' },
        });
      }
    }

    if (
      (status === 'SUCCESS' || status === 'FAILED') &&
      action.actionType === ActionType.WINDOWS_UPDATE_SCHEDULE_REBOOT &&
      status === 'FAILED'
    ) {
      await db.device.update({
        where: { id: deviceId },
        data: {
          rebootState: 'REBOOT_REQUIRED',
          rebootScheduledAt: null,
        },
      });
    }

    return { action: updated, changed: true };
  }
}
