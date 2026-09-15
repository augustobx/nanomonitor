import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';
import { createTenantSchema, updateTenantSchema } from '../../schemas/management.schema.js';
import { logAudit } from '../../middleware/audit.js';

export const tenantsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All tenant management requires SUPER_ADMIN
  fastify.addHook('preHandler', authenticateUser);
  fastify.addHook('preHandler', requireRole(['SUPER_ADMIN']));

  // GET /api/v1/tenants
  fastify.get('/', async (request, reply) => {
    const tenants = await db.tenant.findMany({
      include: {
        _count: {
          select: {
            customers: true,
            devices: true,
            users: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ statusCode: 200, data: tenants });
  });

  // POST /api/v1/tenants
  fastify.post('/', async (request, reply) => {
    const parsed = createTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const existingSlug = await db.tenant.findUnique({
      where: { slug: parsed.data.slug },
    });

    if (existingSlug) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'A tenant with this slug already exists',
      });
    }

    const tenant = await db.tenant.create({
      data: parsed.data,
    });

    await logAudit({
      tenantId: tenant.id,
      action: 'tenant.created',
      entityType: 'Tenant',
      entityId: tenant.id,
      details: parsed.data,
      request,
    });

    return reply.status(201).send({ statusCode: 201, data: tenant });
  });

  // GET /api/v1/tenants/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await db.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            customers: true,
            devices: true,
            users: true,
          },
        },
      },
    });

    if (!tenant) {
      return reply.status(404).send({ statusCode: 404, message: 'Tenant not found' });
    }

    return reply.send({ statusCode: 200, data: tenant });
  });

  // PATCH /api/v1/tenants/:id
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const updated = await db.tenant.update({
      where: { id },
      data: parsed.data,
    });

    await logAudit({
      tenantId: id,
      action: 'tenant.updated',
      entityType: 'Tenant',
      entityId: id,
      details: parsed.data,
      request,
    });

    return reply.send({ statusCode: 200, data: updated });
  });
};
