import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { DeviceStatus } from '@prisma/client';
import { db } from '../../lib/db.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { updateDeviceSchema } from '../../schemas/management.schema.js';
import { logAudit } from '../../middleware/audit.js';
import { calculateAndPersistDeviceHealthScore } from '../health/health-scorer.js';

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
          healthScores: { take: 1, orderBy: { calculatedAt: 'desc' } },
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
        healthScores: {
          take: 1,
          orderBy: { calculatedAt: 'desc' },
        },
        inventories: {
          take: 1,
          orderBy: { collectedAt: 'desc' },
        },
        softwareInventories: {
          take: 1,
          orderBy: { collectedAt: 'desc' },
        },
        softwareChanges: {
          take: 50,
          orderBy: { detectedAt: 'desc' },
        },
        hardwareChanges: {
          take: 50,
          orderBy: { detectedAt: 'desc' },
        },
        metrics: {
          take: 50,
          orderBy: { timestamp: 'desc' },
        },
        events: {
          take: 50,
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

    if (!device.tamperKey) {
      device.tamperKey = generateTamperKey();
      device.tamperKeyUpdatedAt = new Date();
      db.device.update({
        where: { id: device.id },
        data: { tamperKey: device.tamperKey, tamperKeyUpdatedAt: device.tamperKeyUpdatedAt },
      }).catch(() => {});
    }

    return reply.send({ statusCode: 200, data: device });
  });

  // GET /api/v1/devices/:id/health
  fastify.get('/:id/health', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const device = await db.device.findFirst({
      where: { id, tenantId },
      select: { id: true, tenantId: true },
    });

    if (!device) {
      return reply.status(404).send({ statusCode: 404, message: 'Device not found' });
    }

    let latest = await db.healthScore.findFirst({
      where: { deviceId: id, tenantId },
      orderBy: { calculatedAt: 'desc' },
    });

    if (!latest) {
      const computed = await calculateAndPersistDeviceHealthScore(id);
      if (computed) {
        latest = await db.healthScore.findUnique({ where: { id: computed.id } });
      }
    }

    const history = await db.healthScore.findMany({
      where: { deviceId: id, tenantId },
      orderBy: { calculatedAt: 'desc' },
      take: 30,
    });

    return reply.send({
      statusCode: 200,
      data: {
        current: latest,
        history: history.reverse(),
      },
    });
  });

  // POST /api/v1/devices/:id/health (Recalculate health score)
  fastify.post('/:id/health', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const device = await db.device.findFirst({
      where: { id, tenantId },
      select: { id: true, tenantId: true },
    });

    if (!device) {
      return reply.status(404).send({ statusCode: 404, message: 'Device not found' });
    }

    const computed = await calculateAndPersistDeviceHealthScore(id);
    let latest = computed ? await db.healthScore.findUnique({ where: { id: computed.id } }) : null;
    if (!latest) {
      latest = await db.healthScore.findFirst({
        where: { deviceId: id, tenantId },
        orderBy: { calculatedAt: 'desc' },
      });
    }

    return reply.send({
      statusCode: 200,
      data: {
        current: latest,
      },
    });
  });

  // GET /api/v1/devices/:id/metrics
  fastify.get('/:id/metrics', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string };
    const limitNum = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));

    const metrics = await db.deviceMetric.findMany({
      where: { deviceId: id, tenantId },
      orderBy: { timestamp: 'desc' },
      take: limitNum,
    });

    return reply.send({
      statusCode: 200,
      data: metrics.reverse(),
    });
  });

  // GET /api/v1/devices/:id/events
  fastify.get('/:id/events', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const query = request.query as {
      limit?: string;
      offset?: string;
      severity?: string;
      category?: string;
      search?: string;
    };

    const limitNum = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offsetNum = Math.max(0, parseInt(query.offset || '0', 10));

    const where: any = {
      tenantId,
      deviceId: id,
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { dedupKey: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, events] = await Promise.all([
      db.deviceEvent.count({ where }),
      db.deviceEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: offsetNum,
        take: limitNum,
      }),
    ]);

    return reply.send({
      statusCode: 200,
      data: {
        events,
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
        },
      },
    });
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

      if (parsed.data.customerId) {
        const customer = await db.customer.findFirst({
          where: { id: parsed.data.customerId, tenantId },
        });
        if (!customer) {
          return reply.status(404).send({ statusCode: 404, message: 'Target customer not found in tenant' });
        }
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

  function generateTamperKey(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) p1 += chars[crypto.randomInt(0, chars.length)];
    for (let i = 0; i < 4; i++) p2 += chars[crypto.randomInt(0, chars.length)];
    return `NL-${p1}-${p2}`;
  }

  // GET /api/v1/devices/:id/tamper-key
  fastify.get(
    '/:id/tamper-key',
    {
      preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const device = await db.device.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          hostname: true,
          tamperProtectionEnabled: true,
          tamperKey: true,
          tamperKeyUpdatedAt: true,
        },
      });

      if (!device) {
        return reply.status(404).send({ statusCode: 404, message: 'Device not found' });
      }

      let key = device.tamperKey;
      let updatedAt = device.tamperKeyUpdatedAt;
      if (!key) {
        key = generateTamperKey();
        updatedAt = new Date();
        await db.device.update({
          where: { id },
          data: {
            tamperKey: key,
            tamperKeyUpdatedAt: updatedAt,
          },
        });
      }

      return reply.send({
        statusCode: 200,
        data: {
          deviceId: device.id,
          hostname: device.hostname,
          tamperProtectionEnabled: device.tamperProtectionEnabled,
          tamperKey: key,
          tamperKeyUpdatedAt: updatedAt,
        },
      });
    }
  );

  // POST /api/v1/devices/:id/tamper-key/regenerate
  fastify.post(
    '/:id/tamper-key/regenerate',
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

      const newKey = generateTamperKey();
      const now = new Date();

      await db.device.update({
        where: { id },
        data: {
          tamperKey: newKey,
          tamperKeyUpdatedAt: now,
          tamperProtectionEnabled: true,
        },
      });

      await logAudit({
        tenantId,
        action: 'device.tamper_key_regenerated',
        entityType: 'Device',
        entityId: id,
        details: { newKeyGenerated: true },
        request,
      });

      return reply.send({
        statusCode: 200,
        data: {
          deviceId: device.id,
          hostname: device.hostname,
          tamperProtectionEnabled: true,
          tamperKey: newKey,
          tamperKeyUpdatedAt: now,
        },
      });
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
