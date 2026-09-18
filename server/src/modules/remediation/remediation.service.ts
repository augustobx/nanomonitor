import { ActionType, AlertStatus, RemediationMode, RemediationStatus } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { logAudit } from '../../middleware/audit.js';
import { ActionsService } from '../actions/actions.service.js';
import { createActionSchema } from '../../schemas/actions.schema.js';

export interface RemediationStats {
  totalAttempted: number;
  successful: number;
  failed: number;
  pendingApproval: number;
  inProgress: number;
  circuitBroken: number;
  savedInterventions: number;
  successRate: number;
}

export class RemediationService {
  private static validateRemediationContract(actionType: ActionType, parameters: any) {
    const parsed = createActionSchema.safeParse({
      actionType,
      parameters: parameters || {},
      expiresInMinutes: 15,
    });

    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'action'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Contrato de remediación inválido para ${actionType}: ${details}`);
    }

    return parsed.data;
  }

  /**
   * Evaluates whether an alert should trigger auto-remediation or manual approval,
   * taking into account cooldowns, circuit breakers, and rule configuration.
   */
  static async handleAlertRemediation(alert: {
    id: string;
    tenantId: string;
    deviceId: string;
    customerId: string;
    ruleId?: string | null;
    title: string;
  }): Promise<void> {
    if (!alert.ruleId) return;

    const rule = await db.alertRule.findUnique({
      where: { id: alert.ruleId },
    });

    if (!rule || !rule.enabled || !rule.remediationAction) return;
    if (rule.remediationMode === RemediationMode.MONITOR_ONLY) return;

    const actionType = rule.remediationAction as ActionType;
    this.validateRemediationContract(actionType, rule.remediationParams || {});

    // 1. Circuit Breaker Check: Check consecutive failures in the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentFailures = await db.remediationExecution.count({
      where: {
        tenantId: alert.tenantId,
        deviceId: alert.deviceId,
        ruleId: rule.id,
        status: RemediationStatus.FAILED,
        createdAt: { gte: twoHoursAgo },
      },
    });

    if (recentFailures >= rule.maxAttempts) {
      // Check if already marked as circuit broken to avoid spamming
      const existingCb = await db.remediationExecution.findFirst({
        where: {
          tenantId: alert.tenantId,
          deviceId: alert.deviceId,
          ruleId: rule.id,
          status: RemediationStatus.CIRCUIT_BROKEN,
          createdAt: { gte: twoHoursAgo },
        },
      });

      if (!existingCb) {
        await db.remediationExecution.create({
          data: {
            tenantId: alert.tenantId,
            alertId: alert.id,
            ruleId: rule.id,
            deviceId: alert.deviceId,
            actionType,
            status: RemediationStatus.CIRCUIT_BROKEN,
            error: `Circuit Breaker abierto: Se superó el límite de ${rule.maxAttempts} intentos fallidos consecutivos. Requiere intervención técnica manual.`,
          },
        });
        logger.warn(
          { deviceId: alert.deviceId, ruleId: rule.id, recentFailures },
          '🛑 Auto-Remediation Circuit Breaker TRIPPED for device and rule'
        );
      }
      return;
    }

    // 2. Cooldown & In-Progress Check: ensure no duplicate remediation is running
    const cooldownPeriod = (rule.cooldownSec || 300) * 1000;
    const activeOrRecent = await db.remediationExecution.findFirst({
      where: {
        tenantId: alert.tenantId,
        alertId: alert.id,
        status: {
          in: [
            RemediationStatus.PENDING_APPROVAL,
            RemediationStatus.QUEUED,
            RemediationStatus.EXECUTING,
            RemediationStatus.VALIDATING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeOrRecent) {
      const elapsed = Date.now() - activeOrRecent.createdAt.getTime();
      if (elapsed < cooldownPeriod) {
        // Still in progress or within cooldown
        return;
      }
    }

    // 3. Determine execution mode
    if (rule.remediationMode === RemediationMode.MANUAL_APPROVAL) {
      await db.remediationExecution.create({
        data: {
          tenantId: alert.tenantId,
          alertId: alert.id,
          ruleId: rule.id,
          deviceId: alert.deviceId,
          actionType,
          parameters: rule.remediationParams || undefined,
          status: RemediationStatus.PENDING_APPROVAL,
          maxAttempts: rule.maxAttempts,
        },
      });
      logger.info(
        { deviceId: alert.deviceId, rule: rule.name, actionType },
        '🛡️ Remediation created in PENDING_APPROVAL status'
      );
      return;
    }

    if (rule.remediationMode === RemediationMode.AUTO_REMEDIATE) {
      const execution = await db.remediationExecution.create({
        data: {
          tenantId: alert.tenantId,
          alertId: alert.id,
          ruleId: rule.id,
          deviceId: alert.deviceId,
          actionType,
          parameters: rule.remediationParams || undefined,
          status: RemediationStatus.QUEUED,
          maxAttempts: rule.maxAttempts,
        },
      });

      await this.dispatchRemediationAction(execution.id, alert.customerId);
    }
  }

  /**
   * Dispatches the underlying RemoteAction to the device
   */
  static async dispatchRemediationAction(
    remediationId: string,
    customerId: string
  ): Promise<void> {
    const execution = await db.remediationExecution.findUnique({
      where: { id: remediationId },
      include: { rule: true, alert: true },
    });

    if (!execution) return;

    try {
      const validated = this.validateRemediationContract(
        execution.actionType,
        execution.parameters || {}
      );

      const remoteAction = await ActionsService.createAction({
        tenantId: execution.tenantId,
        customerId,
        deviceId: execution.deviceId,
        actionType: validated.actionType as ActionType,
        parameters: validated.parameters,
        requestedBy: 'NanoMonitor Auto-Remediation Engine',
        requestedById: null,
        source: 'AUTO_REMEDIATION',
        expiresInMinutes: 15,
      });

      await db.remediationExecution.update({
        where: { id: execution.id },
        data: {
          status: RemediationStatus.EXECUTING,
          remoteActionId: remoteAction.id,
          startedAt: new Date(),
        },
      });

      logger.info(
        {
          remediationId: execution.id,
          remoteActionId: remoteAction.id,
          actionType: execution.actionType,
          deviceId: execution.deviceId,
        },
        '⚡ Dispatched RemoteAction for Auto-Remediation'
      );
    } catch (err: any) {
      logger.error(
        { err: err.message, remediationId: execution.id },
        'Failed to dispatch auto-remediation remote action'
      );
      await db.remediationExecution.update({
        where: { id: execution.id },
        data: {
          status: RemediationStatus.FAILED,
          error: `Error al crear RemoteAction: ${err.message}`,
        },
      });
    }
  }

  /**
   * Approves a pending remediation execution (Technician / Operator 1-click action)
   */
  static async approveRemediation(
    remediationId: string,
    userId: string,
    tenantId: string
  ): Promise<any> {
    const execution = await db.remediationExecution.findFirst({
      where: { id: remediationId, tenantId },
      include: { alert: true },
    });

    if (!execution) {
      throw new Error('Remediación no encontrada');
    }

    if (execution.status !== RemediationStatus.PENDING_APPROVAL) {
      throw new Error(`La remediación no está en estado pendiente de aprobación (estado actual: ${execution.status})`);
    }

    await db.remediationExecution.update({
      where: { id: execution.id },
      data: {
        status: RemediationStatus.QUEUED,
        approvedById: userId,
      },
    });

    await this.dispatchRemediationAction(execution.id, execution.alert.customerId);

    await logAudit({
      tenantId,
      userId,
      action: 'APPROVE_AUTO_REMEDIATION',
      entityType: 'RemediationExecution',
      entityId: execution.id,
      details: {
        actionType: execution.actionType,
        deviceId: execution.deviceId,
        alertId: execution.alertId,
      },
    });

    return {
      success: true,
      message: 'Remediación aprobada y enviada a ejecución.',
      executionId: execution.id,
    };
  }

  /**
   * Handles completion of a remote action linked to a remediation execution
   */
  static async handleRemoteActionCompletion(
    remoteActionId: string,
    exitCode: number,
    output?: string,
    error?: string,
    resultData?: any
  ): Promise<void> {
    const execution = await db.remediationExecution.findFirst({
      where: { remoteActionId },
      include: { alert: true, rule: true },
    });

    if (!execution) return;

    const isSuccess = exitCode === 0 && (!resultData || resultData.success !== false);

    if (isSuccess) {
      // 1. Mark remediation successful with saved intervention
      await db.remediationExecution.update({
        where: { id: execution.id },
        data: {
          status: RemediationStatus.SUCCESS,
          completedAt: new Date(),
          validatedAt: new Date(),
          output: output || 'Ejecutado y verificado con éxito.',
          savedIntervention: true,
        },
      });

      // 2. Auto-resolve the alert if still open
      if (execution.alert && execution.alert.status !== AlertStatus.RESOLVED) {
        const resolutionMsg = `\n\n[⚡ AUTO-REMEDIACIÓN EXITOSA (${new Date().toLocaleString('es-AR')}): La acción "${execution.actionType}" fue ejecutada de forma autónoma con éxito. Incidente remediado sin requerir intervención manual.]`;

        await db.alert.update({
          where: { id: execution.alert.id },
          data: {
            status: AlertStatus.RESOLVED,
            autoResolved: true,
            resolvedAt: new Date(),
            description: execution.alert.description + resolutionMsg,
          },
        });

        logger.info(
          { alertId: execution.alert.id, remediationId: execution.id },
          '🎉 Alert AUTO-RESOLVED via Auto-Remediation Engine'
        );
      }
    } else {
      // Failed execution
      await db.remediationExecution.update({
        where: { id: execution.id },
        data: {
          status: RemediationStatus.FAILED,
          completedAt: new Date(),
          output,
          error: error || 'La acción remota finalizó con código de salida no exitoso.',
        },
      });

      logger.warn(
        { remediationId: execution.id, exitCode, error },
        'Auto-Remediation RemoteAction reported failure'
      );
    }
  }

  /**
   * Aggregates key performance indicators for Auto-Remediation
   */
  static async getRemediationStats(tenantId: string): Promise<RemediationStats> {
    const [totalAttempted, successful, failed, pendingApproval, inProgress, circuitBroken] =
      await Promise.all([
        db.remediationExecution.count({ where: { tenantId } }),
        db.remediationExecution.count({ where: { tenantId, status: RemediationStatus.SUCCESS } }),
        db.remediationExecution.count({ where: { tenantId, status: RemediationStatus.FAILED } }),
        db.remediationExecution.count({ where: { tenantId, status: RemediationStatus.PENDING_APPROVAL } }),
        db.remediationExecution.count({
          where: {
            tenantId,
            status: { in: [RemediationStatus.QUEUED, RemediationStatus.EXECUTING, RemediationStatus.VALIDATING] },
          },
        }),
        db.remediationExecution.count({ where: { tenantId, status: RemediationStatus.CIRCUIT_BROKEN } }),
      ]);

    const resolvedAttempts = successful + failed;
    const successRate = resolvedAttempts > 0 ? Math.round((successful / resolvedAttempts) * 100) : 100;

    return {
      totalAttempted,
      successful,
      failed,
      pendingApproval,
      inProgress,
      circuitBroken,
      savedInterventions: successful,
      successRate,
    };
  }

  /**
   * Returns recent remediation execution history
   */
  static async getRemediationHistory(
    tenantId: string,
    limit = 50
  ): Promise<any[]> {
    const executions = await db.remediationExecution.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        device: { select: { id: true, hostname: true } },
        rule: { select: { id: true, name: true, category: true } },
        alert: { select: { id: true, title: true, severity: true, status: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return executions.map((e) => ({
      id: e.id,
      deviceId: e.deviceId,
      hostname: e.device.hostname,
      alertId: e.alertId,
      alertTitle: e.alert.title,
      alertSeverity: e.alert.severity,
      ruleName: e.rule?.name || 'Regla del Sistema',
      actionType: e.actionType,
      parameters: e.parameters,
      status: e.status,
      attempt: e.attempt,
      maxAttempts: e.maxAttempts,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      savedIntervention: e.savedIntervention,
      output: e.output,
      error: e.error,
      approvedByName: e.approvedBy?.name || null,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Configures auto-remediation settings on an alert rule
   */
  static async configureRuleRemediation(
    ruleId: string,
    tenantId: string,
    data: {
      remediationMode: RemediationMode;
      remediationAction?: string | null;
      remediationParams?: any;
      validationMethod?: string | null;
      maxAttempts?: number;
      cooldownSec?: number;
    },
    userId?: string
  ): Promise<any> {
    const rule = await db.alertRule.findFirst({
      where: { id: ruleId, tenantId },
    });

    if (!rule) {
      throw new Error('Regla de alerta no encontrada');
    }

    if (data.remediationMode !== RemediationMode.MONITOR_ONLY) {
      const candidateAction = (data.remediationAction ?? rule.remediationAction) as ActionType | null;
      if (!candidateAction) {
        throw new Error('Una remediación activa requiere remediationAction.');
      }
      this.validateRemediationContract(
        candidateAction,
        data.remediationParams ?? rule.remediationParams ?? {}
      );
    }

    const updated = await db.alertRule.update({
      where: { id: rule.id },
      data: {
        remediationMode: data.remediationMode,
        remediationAction: data.remediationAction ?? rule.remediationAction,
        remediationParams: data.remediationParams ?? rule.remediationParams ?? undefined,
        validationMethod: data.validationMethod ?? rule.validationMethod,
        maxAttempts: data.maxAttempts ?? rule.maxAttempts,
        cooldownSec: data.cooldownSec ?? rule.cooldownSec,
      },
    });

    if (userId) {
      await logAudit({
        tenantId,
        userId,
        action: 'UPDATE_ALERT_RULE_REMEDIATION',
        entityType: 'AlertRule',
        entityId: rule.id,
        details: data,
      });
    }

    return updated;
  }
}
