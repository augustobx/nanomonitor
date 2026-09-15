import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DeviceStatus } from '@prisma/client';
import { db } from '../../lib/db.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { updateDeviceSchema } from '../../schemas/management.schema.js';
import { logAudit } from '../../middleware/audit.js';

export const devicesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/devices
  fastify.get('/', async (request, reply) => {
    const tenantId = getTenantId(request);
    const {
      search,
      customerId,
      siteId,
      status,
      page = '1',
      limit = '50',
    } = request.query as {
      search?: string;
      customerId?: string;
      siteId?: string;
      status?: DeviceStatus;
      page?: string;
      limit?: string;
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      tenantId,
      ...(customerId ? { customerId } : {}),
      ...(siteId ? { siteId } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { hostname: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
              { serialNumber: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, devices] = await Promise.all([
      db.device.count({ where }),
      db.device.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, code: true } },
          site: { select: { id: true, name: true } },
          agent: { select: { id: true, agentVersion: true, status: true, lastAuthAt: true } },
        },
        orderBy: { lastSeenAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    return reply.send({
      statusCode: 200,
      data: {
        devices,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  });

  // GET /api/v1/devices/:id
  fastify.get('/:id', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const device = await db.device.findFirst({
      where: { id, tenantId },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        site: { select: { id: true, name: true } },
        agent: {
          select: {
            id: true,
            agentVersion: true,
            status: true,
            lastAuthAt: true,
            enrolledAt: true,
          },
        },
        inventories: {
          take: 1,
          orderBy: { collectedAt: 'desc' },
        },
        metrics: {
          take: 1,
          orderBy: { timestamp: 'desc' },
        },
        events: {
          take: 10,
          orderBy: { timestamp: 'desc' },
        },
        alerts: {
          where: { status: 'OPEN' },
          orderBy: { firstSeenAt: 'desc' },
        },
      },
    });

    if (!device) {
      return reply.status(404).send({ statusCode: 404, message: 'Device not found' });
    }

    return reply.send({ statusCode: 200, data: device });
  });

  // PATCH /api/v1/devices/:id
  fastify.patch(
    '/:id',
    {
      preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const parsed = updateDeviceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const device = await db.device.findFirst({
        where: { id, tenantId },
      });

      if (!device) {
        return reply.status(404).send({ statusCode: 404, message: 'Device not found' });
      }

      const updated = await db.device.update({
        where: { id },
        data: parsed.data,
      });

      await logAudit({
        tenantId,
        action: 'device.updated',
        entityType: 'Device',
        entityId: id,
        details: parsed.data,
        request,
      });

      return reply.send({ statusCode: 200, data: updated });
    }
  );

  // DELETE /api/v1/devices/:id
  fastify.delete(
    '/:id',
    {
      preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const device = await db.device.findFirst({
        where: { id, tenantId },
      });

      if (!device) {
        return reply.status(404).send({ statusCode: 404, message: 'Device not found' });
      }

      await db.device.delete({
        where: { id },
      });

      await logAudit({
        tenantId,
        action: 'device.deleted',
        entityType: 'Device',
        entityId: id,
        request,
      });

      return reply.send({ statusCode: 200, message: 'Device deleted successfully' });
    }
  );
};
