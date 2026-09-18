import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { authenticateUser, getRequiredPermissionForAction, requireActionPermission } from '../../middleware/user-auth.js';
import { authenticateAgent } from '../../middleware/agent-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import {
  createActionSchema,
  updateActionStatusSchema,
  cancelActionSchema,
  ACTION_CONTRACT_HASH,
} from '../../schemas/actions.schema.js';
import { ActionsService } from './actions.service.js';
import { RemediationService } from '../remediation/remediation.service.js';

export const deviceActionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Apply user authentication to all /api/v1/devices/:id/actions endpoints
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/devices/:id/actions - List actions for a device
  fastify.get(
    '/:id/actions',
    { preHandler: [requireActionPermission('VIEW_DEVICE')] },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id: deviceId } = request.params as { id: string };
      const { limit = '50' } = request.query as { limit?: string };

      // Ensure device exists and belongs to tenant
      const device = await db.device.findFirst({
        where: { id: deviceId, tenantId },
        select: { id: true, hostname: true, status: true },
      });

      if (!device) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Device not found',
        });
      }

      const actions = await ActionsService.getDeviceActions(
        tenantId,
        deviceId,
        parseInt(limit, 10) || 50
      );

      return reply.send({
        statusCode: 200,
        data: actions,
      });
    }
  );

  // POST /api/v1/devices/:id/actions - Dispatch a remote action
  fastify.post(
    '/:id/actions',
    {
      preHandler: [
        requireActionPermission((req) => {
          const body = req.body as any;
          return getRequiredPermissionForAction(body?.actionType);
        }),
      ],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id: deviceId } = request.params as { id: string };

      // Validate body
      const parsed = createActionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid action parameters',
          details: parsed.error.format(),
        });
      }

      // Check device existence and tenancy
      const device = await db.device.findFirst({
        where: { id: deviceId, tenantId },
        include: {
          customer: { select: { id: true, name: true } },
          agent: { select: { id: true, status: true } },
        },
      });

      if (!device) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Device not found in your organization',
        });
      }

      if (!device.agent || device.agent.status !== 'ACTIVE') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Device does not have an active agent enrolled',
        });
      }

      const user = request.user!;
      const action = await ActionsService.createAction({
        tenantId,
        customerId: device.customerId,
        deviceId,
        actionType: parsed.data.actionType,
        parameters: parsed.data.parameters,
        requestedById: user.userId,
        requestedBy: user.email,
        expiresInMinutes: parsed.data.expiresInMinutes,
        source: 'DASHBOARD',
        requestIp: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(201).send({
        statusCode: 201,
        message: `Action ${action.actionType} successfully queued for device ${device.hostname}`,
        data: action,
      });
    }
  );

  // POST /api/v1/devices/:id/actions/:actionId/cancel - Cancel pending action
  fastify.post(
    '/:id/actions/:actionId/cancel',
    { preHandler: [requireActionPermission('RUN_SYSTEM_ACTION')] },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id: deviceId, actionId } = request.params as { id: string; actionId: string };
      const parsed = cancelActionSchema.safeParse(request.body || {});
      const reason = parsed.success ? parsed.data.reason : undefined;

      try {
        const cancelled = await ActionsService.cancelAction(
          tenantId,
          deviceId,
          actionId,
          request.user?.userId,
          request.user?.email || 'operator',
          reason
        );

        if (!cancelled) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Action not found for this device',
          });
        }

        return reply.send({
          statusCode: 200,
          message: 'Action cancelled successfully',
          data: cancelled,
        });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message,
        });
      }
    }
  );
};

export const agentActionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Apply HMAC agent authentication to all /agent/actions/* endpoints
  fastify.addHook('preHandler', authenticateAgent);

  // POST /agent/actions/poll - Agent polls for pending actions (with long-poll wait)
  fastify.post('/poll', async (request, reply) => {
    const { deviceId, tenantId } = request.agent!;
    const query = request.query as { wait?: string };
    const waitMs = query?.wait ? parseInt(query.wait, 10) : 0;

    const actions = await ActionsService.pollActionsForAgent(tenantId, deviceId, waitMs);

    return reply.status(200).send({
      status: 'ok',
      actions,
      actionContractHash: ACTION_CONTRACT_HASH,
      serverTime: new Date().toISOString(),
    });
  });

  // POST /agent/actions/:actionId/status - Agent reports action status update or final result
  fastify.post('/:actionId/status', async (request, reply) => {
    const { agentId, deviceId, tenantId } = request.agent!;
    const { actionId } = request.params as { actionId: string };

    const parsed = updateActionStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid action status payload',
        details: parsed.error.format(),
      });
    }

    try {
      const { action: updated, changed } = await ActionsService.updateActionStatus({
        actionId,
        agentId,
        deviceId,
        tenantId,
        status: parsed.data.status,
        startedAt: parsed.data.startedAt,
        finishedAt: parsed.data.finishedAt,
        exitCode: parsed.data.exitCode,
        output: parsed.data.output,
        error: parsed.data.error,
        result: parsed.data.result,
      });

      // Notify Auto-Remediation engine if action was linked to a remediation execution
      if (changed && (parsed.data.status === 'SUCCESS' || parsed.data.status === 'FAILED')) {
        RemediationService.handleRemoteActionCompletion(
          actionId,
          tenantId,
          parsed.data.status,
          parsed.data.exitCode ?? (parsed.data.status === 'SUCCESS' ? 0 : 1),
          parsed.data.output,
          parsed.data.error,
          parsed.data.result
        ).catch((err) => {
          request.log.error({ err, actionId }, 'Failed to process auto-remediation completion');
        });
      }

      return reply.status(200).send({
        status: 'ok',
        actionId: updated.id,
        currentStatus: updated.status,
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message,
      });
    }
  });
};
