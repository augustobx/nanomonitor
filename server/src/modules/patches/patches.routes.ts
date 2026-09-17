import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { db } from '../../lib/db.js';
import { authenticateUser } from '../../middleware/user-auth.js';
import { authenticateAgent } from '../../middleware/agent-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { PatchesService } from './patches.service.js';
import { ActionsService } from '../actions/actions.service.js';
import {
  upsertPatchPolicySchema,
  reportDevicePatchesSchema,
  installPatchesRequestSchema,
  scheduleRebootRequestSchema,
} from '../../schemas/patches.schema.js';

export const patchRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Apply JWT user authentication for dashboard/NOC endpoints
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/patches/compliance - Summary of fleet compliance
  fastify.get('/compliance', async (request, reply) => {
    const tenantId = getTenantId(request);
    const compliance = await PatchesService.getFleetCompliance(tenantId);
    return reply.send({ statusCode: 200, data: compliance });
  });

  // GET /api/v1/patches/policies - Get all configured policies
  fastify.get('/policies', async (request, reply) => {
    const tenantId = getTenantId(request);
    const policies = await PatchesService.getPolicies(tenantId);
    return reply.send({ statusCode: 200, data: policies });
  });

  // POST /api/v1/patches/policies - Create or update a policy
  fastify.post('/policies', async (request, reply) => {
    const tenantId = getTenantId(request);
    const role = request.user?.role;

    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Solo administradores pueden configurar políticas de parches.',
      });
    }

    const parsed = upsertPatchPolicySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Datos de política inválidos.',
        details: parsed.error.format(),
      });
    }

    const policy = await PatchesService.upsertPolicy(tenantId, parsed.data);
    return reply.send({ statusCode: 200, data: policy });
  });

  // GET /api/v1/patches/history - Get patch installation history
  fastify.get('/history', async (request, reply) => {
    const tenantId = getTenantId(request);
    const query = request.query as { deviceId?: string; limit?: string };
    const limit = query?.limit ? parseInt(query.limit, 10) : 50;

    const history = await PatchesService.getHistory(tenantId, query?.deviceId, limit);
    return reply.send({ statusCode: 200, data: history });
  });
};

export const devicePatchRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/devices/:id/patches - Get patches for device
  fastify.get('/:id/patches', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    try {
      const data = await PatchesService.getDevicePatches(tenantId, id);
      return reply.send({ statusCode: 200, data });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message,
      });
    }
  });

  // POST /api/v1/devices/:id/patches/scan - Trigger remote Windows Update scan
  fastify.post('/:id/patches/scan', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const user = request.user!;

    try {
      const device = await db.device.findFirst({
        where: { id, tenantId },
        select: { customerId: true },
      });

      if (!device) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Dispositivo no encontrado.',
        });
      }

      const action = await ActionsService.createAction({
        tenantId,
        customerId: device.customerId,
        deviceId: id,
        actionType: 'WINDOWS_UPDATE_SCAN',
        parameters: {},
        requestedById: user.userId,
        requestedBy: user.email,
        source: 'DASHBOARD_PATCH_SCAN',
        expiresInMinutes: 15,
      });

      return reply.send({
        statusCode: 201,
        message: 'Escaneo de actualizaciones encolado para el equipo.',
        data: action,
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  // POST /api/v1/devices/:id/patches/install - Install selected/approved patches
  fastify.post('/:id/patches/install', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const user = request.user!;
    const role = user.role;

    if (role === 'VIEWER' || role === 'CLIENT') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Permiso insuficiente para instalar parches.',
      });
    }

    const parsed = installPatchesRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Datos de instalación inválidos.',
        details: parsed.error.format(),
      });
    }

    try {
      const result = await PatchesService.triggerPatchInstall(
        tenantId,
        id,
        { id: user.userId, email: user.email },
        parsed.data
      );

      return reply.send({
        statusCode: 200,
        message: 'Orden de instalación encolada exitosamente.',
        data: result,
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  // POST /api/v1/devices/:id/patches/reboot - Schedule reboot
  fastify.post('/:id/patches/reboot', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const user = request.user!;
    const role = user.role;

    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Solo administradores pueden autorizar y programar reinicios.',
      });
    }

    const parsed = scheduleRebootRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Datos de programación de reinicio inválidos.',
        details: parsed.error.format(),
      });
    }

    try {
      const result = await PatchesService.scheduleReboot(
        tenantId,
        id,
        { id: user.userId, email: user.email },
        parsed.data.delayMinutes,
        parsed.data.message
      );

      return reply.send({
        statusCode: 200,
        message: 'Reinicio programado exitosamente.',
        data: result,
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message,
      });
    }
  });
};

export const agentPatchRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Apply HMAC agent authentication
  fastify.addHook('preHandler', authenticateAgent);

  // POST /agent/patches/report - Agent reports patch inventory results
  fastify.post('/report', async (request, reply) => {
    const { deviceId, tenantId } = request.agent!;

    const parsed = reportDevicePatchesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid patch report payload',
        details: parsed.error.format(),
      });
    }

    try {
      const res = await PatchesService.reportDevicePatches(tenantId, deviceId, parsed.data);
      return reply.send({
        status: 'ok',
        syncedPatches: res.count,
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });
};
