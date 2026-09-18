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
    const normalizedToken = token.trim();
    const normalizedHardwareId = hardwareId?.trim() || null;
    const normalizedSerial = osInfo?.serialNumber
      ? String(osInfo.serialNumber).trim()
      : null;
    const resolvedAgentVersion = parsed.data.agentVersion
      ? parsed.data.agentVersion.replace(/^v/, '').trim()
      : 'unknown';
    const agentSecret = generateAgentSecret();

    let enrollment: any = null;
    let lastSerializationError: any = null;

    // Token consumption, endpoint identity resolution and credential rotation are
    // one serializable transaction. This prevents two simultaneous requests from
    // consuming a one-shot token or creating duplicate endpoint identities.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        enrollment = await db.$transaction(
          async (tx: any) => {
            const now = new Date();
            const tokenRecord = await tx.enrollmentToken.findUnique({
              where: { token: normalizedToken },
              include: { tenant: true },
            });

            if (!tokenRecord) {
              throw new Error('ENROLLMENT_INVALID_TOKEN');
            }
            if (tokenRecord.expiresAt <= now) {
              throw new Error('ENROLLMENT_TOKEN_EXPIRED');
            }
            if (tokenRecord.usedCount >= tokenRecord.maxUses) {
              throw new Error('ENROLLMENT_TOKEN_EXHAUSTED');
            }
            if (tokenRecord.tenant.status !== 'ACTIVE') {
              throw new Error('ENROLLMENT_TENANT_INACTIVE');
            }

            if (tokenRecord.siteId) {
              const validSite = await tx.site.findFirst({
                where: {
                  id: tokenRecord.siteId,
                  tenantId: tokenRecord.tenantId,
                  customerId: tokenRecord.customerId,
                },
                select: { id: true },
              });
              if (!validSite) {
                throw new Error('ENROLLMENT_SITE_SCOPE_INVALID');
              }
            }

            // Atomic slot claim. The literal maxUses comes from the same
            // serializable snapshot; updateMany re-checks usedCount under the
            // database row lock before incrementing.
            const claim = await tx.enrollmentToken.updateMany({
              where: {
                id: tokenRecord.id,
                expiresAt: { gt: now },
                usedCount: { lt: tokenRecord.maxUses },
              },
              data: {
                usedCount: { increment: 1 },
                usedAt: now,
              },
            });
            if (claim.count !== 1) {
              throw new Error('ENROLLMENT_TOKEN_EXHAUSTED');
            }

            // Resolve the physical endpoint deterministically. MachineGUID is
            // primary identity; serial is secondary; hostname is last-resort.
            let device = null;

            if (normalizedHardwareId) {
              device = await tx.device.findFirst({
                where: {
                  tenantId: tokenRecord.tenantId,
                  customerId: tokenRecord.customerId,
                  hardwareId: normalizedHardwareId,
                },
              });
            }

            if (!device && normalizedSerial) {
              device = await tx.device.findFirst({
                where: {
                  tenantId: tokenRecord.tenantId,
                  customerId: tokenRecord.customerId,
                  serialNumber: normalizedSerial,
                },
              });
            }

            if (!device && !normalizedHardwareId && !normalizedSerial) {
              device = await tx.device.findFirst({
                where: {
                  tenantId: tokenRecord.tenantId,
                  customerId: tokenRecord.customerId,
                  hostname,
                },
              });
            }

            if (!device) {
              const currentDeviceCount = await tx.device.count({
                where: { tenantId: tokenRecord.tenantId },
              });
              if (currentDeviceCount >= tokenRecord.tenant.maxDevices) {
                throw new Error('ENROLLMENT_DEVICE_QUOTA');
              }

              device = await tx.device.create({
                data: {
                  tenantId: tokenRecord.tenantId,
                  customerId: tokenRecord.customerId,
                  siteId: tokenRecord.siteId,
                  hostname,
                  hardwareId: normalizedHardwareId,
                  serialNumber: normalizedSerial,
                  osEdition: osInfo?.caption || null,
                  osVersion: osInfo?.version || null,
                  osBuild: osInfo?.buildNumber || null,
                  architecture: osInfo?.osArchitecture || null,
                  manufacturer: osInfo?.manufacturer || null,
                  model: osInfo?.model || null,
                  status: 'OFFLINE',
                  lastSeenAt: null,
                },
              });
            } else {
              device = await tx.device.update({
                where: { id: device.id },
                data: {
                  hostname,
                  hardwareId: normalizedHardwareId || device.hardwareId,
                  serialNumber: normalizedSerial || device.serialNumber,
                  osEdition: osInfo?.caption || device.osEdition,
                  osVersion: osInfo?.version || device.osVersion,
                  osBuild: osInfo?.buildNumber || device.osBuild,
                  architecture: osInfo?.osArchitecture || device.architecture,
                  manufacturer: osInfo?.manufacturer || device.manufacturer,
                  model: osInfo?.model || device.model,
                  siteId: tokenRecord.siteId || device.siteId,
                  status: 'OFFLINE',
                  lastSeenAt: null,
                },
              });
            }

            const agent = await tx.agent.upsert({
              where: { deviceId: device.id },
              create: {
                tenantId: tokenRecord.tenantId,
                deviceId: device.id,
                agentVersion: resolvedAgentVersion,
                secretHash: agentSecret,
                status: 'ACTIVE',
              },
              update: {
                agentVersion: resolvedAgentVersion,
                secretHash: agentSecret,
                status: 'ACTIVE',
                revokedAt: null,
              },
            });

            await tx.enrollmentToken.update({
              where: { id: tokenRecord.id },
              data: { usedByDeviceId: device.id },
            });

            return { tokenRecord, device, agent };
          },
          { isolationLevel: 'Serializable' }
        );
        break;
      } catch (err: any) {
        // Prisma uses P2034 for serialization/deadlock retries.
        if (err?.code === 'P2034' && attempt < 2) {
          lastSerializationError = err;
          continue;
        }
        throw err;
      }
    }

    if (!enrollment) {
      request.log.error(
        { err: lastSerializationError },
        'Enrollment transaction could not be serialized after retries'
      );
      return reply.status(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Enrollment is temporarily busy; retry the installer.',
      });
    }

    const { tokenRecord, device, agent } = enrollment;

    await logAudit({
      tenantId: tokenRecord.tenantId,
      agentId: agent.id,
      action: 'device.enrolled',
      entityType: 'Device',
      entityId: device.id,
      details: {
        hostname,
        agentId: agent.id,
        enrollmentTokenId: tokenRecord.id,
      },
      request,
    });

    return reply.status(201).send({
      agentId: agent.id,
      agentSecret,
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
  fastify.post('/register', async (request, reply) => {
    try {
      return await handleRegister(request, reply);
    } catch (err: any) {
      const code = err?.message;
      if (code === 'ENROLLMENT_INVALID_TOKEN') {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid enrollment token' });
      }
      if (code === 'ENROLLMENT_TOKEN_EXPIRED') {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Enrollment token has expired' });
      }
      if (code === 'ENROLLMENT_TOKEN_EXHAUSTED') {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Enrollment token usage limit reached' });
      }
      if (code === 'ENROLLMENT_TENANT_INACTIVE') {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Tenant account is inactive' });
      }
      if (code === 'ENROLLMENT_DEVICE_QUOTA') {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Tenant device limit reached' });
      }
      if (code === 'ENROLLMENT_SITE_SCOPE_INVALID') {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'Enrollment token site no longer belongs to its customer' });
      }

      request.log.error({ err }, 'Unexpected enrollment failure');
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Enrollment failed',
      });
    }
  });
};
