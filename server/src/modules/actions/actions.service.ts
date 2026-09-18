import { EventEmitter } from 'node:events';
import { ActionStatus, ActionType } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { logAudit } from '../../middleware/audit.js';

export const actionEvents = new EventEmitter();
// Increase listener limit to support multiple concurrent device polling loops
actionEvents.setMaxListeners(500);

const DELIVERY_LEASE_MS = 60 * 1000;

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
    // 1. Automatically mark expired actions
    const now = new Date();
    await db.remoteAction.updateMany({
      where: {
        tenantId,
        deviceId,
        status: { in: [ActionStatus.PENDING, ActionStatus.QUEUED, ActionStatus.DELIVERED] },
        expiresAt: { lt: now },
      },
      data: {
        status: ActionStatus.EXPIRED,
      },
    });

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

    await db.remoteAction.updateMany({
      where: {
        tenantId,
        deviceId,
        status: { in: [ActionStatus.PENDING, ActionStatus.QUEUED, ActionStatus.DELIVERED] },
        expiresAt: { lt: now },
      },
      data: { status: ActionStatus.EXPIRED },
    });

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
      take: 5,
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

    if (terminalStatuses.has(action.status)) {
      if (action.status === (status as ActionStatus)) {
        return { action, changed: false };
      }
      throw new Error(`Action "${actionId}" is already terminal with status ${action.status}`);
    }

    if (status === 'RUNNING' && !([
      ActionStatus.PENDING,
      ActionStatus.QUEUED,
      ActionStatus.DELIVERED,
      ActionStatus.RUNNING,
    ] as ActionStatus[]).includes(action.status)) {
      throw new Error(`Invalid transition ${action.status} -> RUNNING`);
    }

    if ((status === 'SUCCESS' || status === 'FAILED') && !([
      ActionStatus.DELIVERED,
      ActionStatus.RUNNING,
    ] as ActionStatus[]).includes(action.status)) {
      throw new Error(`Invalid transition ${action.status} -> ${status}`);
    }

    const dataUpdates: any = {
      status: status as ActionStatus,
    };

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

    return { action: updated, changed: true };
  }
}
