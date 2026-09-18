import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { createCustomerSchema, updateCustomerSchema } from '../../schemas/management.schema.js';
import { logAudit } from '../../middleware/audit.js';
import { generateEnrollmentToken } from '../../lib/crypto.js';

export const customersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/customers
  fastify.get('/', async (request, reply) => {
    const tenantId = getTenantId(request);

    const customers = await db.customer.findMany({
      where: { tenantId },
      include: {
        sites: { select: { id: true, name: true } },
        _count: {
          select: {
            sites: true,
            devices: true,
            alerts: { where: { status: 'OPEN' } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return reply.send({ statusCode: 200, data: customers });
  });

  // POST /api/v1/customers
  fastify.post(
    '/',
    {
      preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const parsed = createCustomerSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const existingCode = await db.customer.findFirst({
        where: { tenantId, code: parsed.data.code },
      });

      if (existingCode) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'A customer with this code already exists in your tenant',
        });
      }

      const customer = await db.customer.create({
        data: {
          ...parsed.data,
          tenantId,
        },
      });

      // Automatically create default 'Principal' site
      const site = await db.site.create({
        data: {
          tenantId,
          customerId: customer.id,
          name: 'Casa Central / Principal',
        },
      });

      await logAudit({
        tenantId,
        action: 'customer.created',
        entityType: 'Customer',
        entityId: customer.id,
        details: parsed.data,
        request,
      });

      return reply.status(201).send({
        statusCode: 201,
        data: {
          ...customer,
          sites: [site],
        },
      });
    }
  );

  // GET /api/v1/customers/:id/token - Create a one-time compatibility enrollment token
  fastify.get(
    '/:id/token',
    { preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'])] },
    async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const customer = await db.customer.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!customer) {
      return reply.status(404).send({ statusCode: 404, message: 'Customer not found' });
    }

    const token = await db.enrollmentToken.create({
      data: {
        tenantId,
        customerId: customer.id,
        token: generateEnrollmentToken(),
        maxUses: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { id: true, token: true, expiresAt: true, maxUses: true },
    });

    return reply
      .header('Cache-Control', 'no-store')
      .send({ statusCode: 200, data: token });
    }
  );

  // GET /api/v1/customers/:id
  fastify.get('/:id', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const customer = await db.customer.findFirst({
      where: { id, tenantId },
      include: {
        sites: true,
        _count: {
          select: {
            devices: true,
            alerts: { where: { status: 'OPEN' } },
            incidents: { where: { status: 'OPEN' } },
          },
        },
      },
    });

    if (!customer) {
      return reply.status(404).send({ statusCode: 404, message: 'Customer not found' });
    }

    return reply.send({ statusCode: 200, data: customer });
  });

  // PATCH /api/v1/customers/:id
  fastify.patch(
    '/:id',
    {
      preHandler: [requireRole(['SUPER_ADMIN', 'ADMIN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const parsed = updateCustomerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const customer = await db.customer.findFirst({
        where: { id, tenantId },
      });

      if (!customer) {
        return reply.status(404).send({ statusCode: 404, message: 'Customer not found' });
      }

      const updated = await db.customer.update({
        where: { id },
        data: parsed.data,
      });

      await logAudit({
        tenantId,
        action: 'customer.updated',
        entityType: 'Customer',
        entityId: id,
        details: parsed.data,
        request,
      });

      return reply.send({ statusCode: 200, data: updated });
    }
  );
};
