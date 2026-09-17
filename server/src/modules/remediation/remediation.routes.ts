import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RemediationMode, UserRole } from '@prisma/client';
import { RemediationService } from './remediation.service.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';

const configureRuleRemediationSchema = z.object({
  remediationMode: z.nativeEnum(RemediationMode),
  remediationAction: z.string().nullable().optional(),
  remediationParams: z.record(z.any()).nullable().optional(),
  validationMethod: z.string().nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  cooldownSec: z.number().int().min(30).max(86400).optional(),
});

export async function remediationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/remediations/stats
  fastify.get(
    '/stats',
    { preHandler: [authenticateUser] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const stats = await RemediationService.getRemediationStats(tenantId);
      return reply.send({ success: true, data: stats });
    }
  );

  // GET /api/v1/remediations/history
  fastify.get(
    '/history',
    { preHandler: [authenticateUser] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;

      const history = await RemediationService.getRemediationHistory(tenantId, limit);
      return reply.send({ success: true, data: history });
    }
  );

  // POST /api/v1/remediations/:id/approve (1-click Approval)
  fastify.post(
    '/:id/approve',
    { preHandler: [authenticateUser, requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TECHNICIAN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      try {
        const result = await RemediationService.approveRemediation(id, user.userId, user.tenantId);
        return reply.send({ success: true, data: result });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message,
        });
      }
    }
  );

  // POST /api/v1/remediations/rules/:id/config
  fastify.post(
    '/rules/:id/config',
    { preHandler: [authenticateUser, requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      const parsed = configureRuleRemediationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Datos de configuración de auto-remediación inválidos',
          issues: parsed.error.issues,
        });
      }

      try {
        const updated = await RemediationService.configureRuleRemediation(
          id,
          user.tenantId,
          parsed.data,
          user.userId
        );
        return reply.send({ success: true, data: updated });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message,
        });
      }
    }
  );
}
