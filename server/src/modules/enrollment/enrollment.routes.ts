import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { generateAgentSecret, generateEnrollmentToken } from '../../lib/crypto.js';
import { createTokenSchema, registerAgentSchema } from '../../schemas/enrollment.schema.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { logAudit } from '../../middleware/audit.js';

export const enrollmentRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/v1/enrollment/tokens - Create enrollment token (Admin / Tech)
  fastify.post(
    '/tokens',
    {
      preHandler: [authenticateUser, requireRole(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const parsed = createTokenSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const { customerId, siteId, maxUses, expiresInHours } = parsed.data;

      // Verify customer belongs to tenant
      const customer = await db.customer.findFirst({
        where: { id: customerId, tenantId },
      });

      if (!customer) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Customer not found in this tenant',
        });
      }

      if (siteId) {
        const site = await db.site.findFirst({
          where: { id: siteId, customerId, tenantId },
        });
        if (!site) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Site not found for this customer',
          });
        }
      }

      const tokenString = generateEnrollmentToken();
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

      const token = await db.enrollmentToken.create({
        data: {
          tenantId,
          customerId,
          siteId: siteId || null,
          token: tokenString,
          maxUses,
          expiresAt,
        },
        include: {
          customer: { select: { name: true, code: true } },
          site: { select: { name: true } },
        },
      });

      await logAudit({
        tenantId,
        action: 'enrollment.token_created',
        entityType: 'EnrollmentToken',
        entityId: token.id,
        details: { customerId, siteId, maxUses, expiresAt },
        request,
      });

      return reply.status(201).send({
        statusCode: 201,
        data: {
          id: token.id,
          token: token.token,
          maxUses: token.maxUses,
          usedCount: token.usedCount,
          expiresAt: token.expiresAt,
          customer: token.customer,
          site: token.site,
        },
      });
    }
  );

  // GET /api/v1/enrollment/tokens - List active tokens
  fastify.get(
    '/tokens',
    {
      preHandler: [authenticateUser, requireRole(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);

      const tokens = await db.enrollmentToken.findMany({
        where: {
          tenantId,
          expiresAt: { gt: new Date() },
        },
        include: {
          customer: { select: { id: true, name: true, code: true } },
          site: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ statusCode: 200, data: tokens });
    }
  );

  // DELETE /api/v1/enrollment/tokens/:id - Revoke token
  fastify.delete(
    '/tokens/:id',
    {
      preHandler: [authenticateUser, requireRole(['SUPER_ADMIN', 'ADMIN'])],
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const token = await db.enrollmentToken.findFirst({
        where: { id, tenantId },
      });

      if (!token) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Token not found',
        });
      }

      await db.enrollmentToken.update({
        where: { id: token.id },
        data: { expiresAt: new Date(0) }, // expire immediately
      });

      await logAudit({
        tenantId,
        action: 'enrollment.token_revoked',
        entityType: 'EnrollmentToken',
        entityId: token.id,
        request,
      });

      return reply.send({ statusCode: 200, message: 'Token revoked successfully' });
    }
  );

  // Registration handler reusable for both /enrollment/register and /api/v1/enrollment/register
  const handleRegister = async (request: any, reply: any) => {
    const parsed = registerAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid enrollment request payload',
        details: parsed.error.format(),
      });
    }

    const { token, hostname, hardwareId, osInfo } = parsed.data;

    // Find and validate token
    const tokenRecord = await db.enrollmentToken.findUnique({
      where: { token: token.trim() },
      include: {
        tenant: true,
      },
    });

    if (!tokenRecord) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid enrollment token',
      });
    }

    if (tokenRecord.expiresAt < new Date()) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Enrollment token has expired',
      });
    }

    if (tokenRecord.usedCount >= tokenRecord.maxUses) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Enrollment token usage limit reached',
      });
    }

    if (tokenRecord.tenant.status !== 'ACTIVE') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tenant account is inactive',
      });
    }

    // Check device count limit for tenant
    const currentDeviceCount = await db.device.count({
      where: { tenantId: tokenRecord.tenantId },
    });

    if (currentDeviceCount >= tokenRecord.tenant.maxDevices) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Tenant device limit (${tokenRecord.tenant.maxDevices}) reached. Upgrade plan to enroll more devices.`,
      });
    }

    // Check if an existing device with same serial number or hardware ID exists for this customer
    let device = null;
    if (hardwareId || osInfo?.serialNumber) {
      device = await db.device.findFirst({
        where: {
          tenantId: tokenRecord.tenantId,
          customerId: tokenRecord.customerId,
          OR: [
            ...(osInfo?.serialNumber ? [{ serialNumber: osInfo.serialNumber }] : []),
            { hostname: hostname },
          ],
        },
      });
    }

    if (!device) {
      device = await db.device.create({
        data: {
          tenantId: tokenRecord.tenantId,
          customerId: tokenRecord.customerId,
          siteId: tokenRecord.siteId,
          hostname,
          serialNumber: osInfo?.serialNumber || null,
          osEdition: osInfo?.caption || null,
          osVersion: osInfo?.version || null,
          osBuild: osInfo?.buildNumber || null,
          architecture: osInfo?.osArchitecture || null,
          manufacturer: osInfo?.manufacturer || null,
          model: osInfo?.model || null,
          status: 'ONLINE',
          lastSeenAt: new Date(),
        },
      });
    } else {
      // Update existing device
      device = await db.device.update({
        where: { id: device.id },
        data: {
          hostname,
          serialNumber: osInfo?.serialNumber || device.serialNumber,
          osEdition: osInfo?.caption || device.osEdition,
          osVersion: osInfo?.version || device.osVersion,
          osBuild: osInfo?.buildNumber || device.osBuild,
          architecture: osInfo?.osArchitecture || device.architecture,
          manufacturer: osInfo?.manufacturer || device.manufacturer,
          model: osInfo?.model || device.model,
          siteId: tokenRecord.siteId || device.siteId,
          status: 'ONLINE',
          lastSeenAt: new Date(),
        },
      });
    }

    // Generate agent credentials
    const agentSecret = generateAgentSecret();

    // Revoke any previous agent for this device if re-enrolling
    await db.agent.updateMany({
      where: { deviceId: device.id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    const agent = await db.agent.create({
      data: {
        tenantId: tokenRecord.tenantId,
        deviceId: device.id,
        agentVersion: '0.1.0',
        secretHash: agentSecret, // Direct secret for HMAC-SHA256 signature verification
        status: 'ACTIVE',
      },
    });

    // Increment token usage
    await db.enrollmentToken.update({
      where: { id: tokenRecord.id },
      data: {
        usedCount: { increment: 1 },
        usedAt: new Date(),
        usedByDeviceId: device.id,
      },
    });

    await logAudit({
      tenantId: tokenRecord.tenantId,
      agentId: agent.id,
      action: 'device.enrolled',
      entityType: 'Device',
      entityId: device.id,
      details: {
        hostname,
        agentId: agent.id,
        token: tokenRecord.token,
      },
      request,
    });

    return reply.status(201).send({
      agentId: agent.id,
      agentSecret: agentSecret,
      deviceId: device.id,
      tenantId: tokenRecord.tenantId,
      config: {
        heartbeatInterval: 180,
        metricsInterval: 300,
        inventoryInterval: 86400,
      },
    });
  };

  // POST /enrollment/register (and /api/v1/enrollment/register)
  fastify.post('/register', handleRegister);
};
