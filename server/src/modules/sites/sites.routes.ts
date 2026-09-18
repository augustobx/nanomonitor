import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { createSiteSchema, updateSiteSchema } from '../../schemas/management.schema.js';
import { logAudit } from '../../middleware/audit.js';

export const sitesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/sites?customerId=...
  fastify.get('/', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { customerId } = request.query as { customerId?: string };

    const sites = await db.site.findMany({
      where: {
        tenantId,
        ...(customerId ? { customerId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        _count: { select: { devices: true } },
      },
      orderBy: { name: 'asc' },
    });

    return reply.send({ statusCode: 200, data: sites });
  });

  // POST /api/v1/sites
  fastify.post(
    '/',
    {
      preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const parsed = createSiteSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      // Verify customer exists in tenant
      const customer = await db.customer.findFirst({
        where: { id: parsed.data.customerId, tenantId },
      });

      if (!customer) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Customer not found in tenant',
        });
      }

      const site = await db.site.create({
        data: {
          ...parsed.data,
          tenantId,
        },
      });

      await logAudit({
        tenantId,
        action: 'site.created',
        entityType: 'Site',
        entityId: site.id,
        details: parsed.data,
        request,
      });

      return reply.status(201).send({ statusCode: 201, data: site });
    }
  );

  // PATCH /api/v1/sites/:id
  fastify.patch(
    '/:id',
    {
      preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const parsed = updateSiteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const site = await db.site.findFirst({
        where: { id, tenantId },
      });

      if (!site) {
        return reply.status(404).send({ statusCode: 404, message: 'Site not found' });
      }

      if (parsed.data.customerId && parsed.data.customerId !== site.customerId) {
        const targetCustomer = await db.customer.findFirst({
          where: { id: parsed.data.customerId, tenantId },
          select: { id: true },
        });
        if (!targetCustomer) {
          return reply.status(404).send({
            statusCode: 404,
            message: 'Target customer not found in tenant',
          });
        }

        const attachedDevices = await db.device.count({
          where: { tenantId, siteId: site.id },
        });
        if (attachedDevices > 0) {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Cannot move a site to another customer while devices are attached',
          });
        }
      }

      const updated = await db.site.update({
        where: { id },
        data: parsed.data,
      });

      await logAudit({
        tenantId,
        action: 'site.updated',
        entityType: 'Site',
        entityId: id,
        details: parsed.data,
        request,
      });

      return reply.send({ statusCode: 200, data: updated });
    }
  );
};
