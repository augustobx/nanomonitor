import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AlertStatus, Severity } from '@prisma/client';
import { db } from '../../lib/db.js';
import { authenticateUser } from '../../middleware/user-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { evaluateAllDevicesAlerts, evaluateDeviceAlerts } from './alert-evaluator.js';

export const alertsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/alerts
  fastify.get('/', async (request, reply) => {
    const tenantId = getTenantId(request);
    const {
      status,
      severity,
      customerId,
      deviceId,
      search,
      page = '1',
      limit = '50',
    } = request.query as {
      status?: string;
      severity?: Severity;
      customerId?: string;
      deviceId?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Handle status filtering (including 'ACTIVE' virtual filter)
    let statusFilter: any = undefined;
    if (status) {
      if (status.toUpperCase() === 'ACTIVE') {
        statusFilter = { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] };
      } else if (Object.values(AlertStatus).includes(status.toUpperCase() as AlertStatus)) {
        statusFilter = status.toUpperCase() as AlertStatus;
      }
    }

    const where: any = {
      tenantId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(severity ? { severity } : {}),
      ...(customerId ? { customerId } : {}),
      ...(deviceId ? { deviceId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { device: { hostname: { contains: search, mode: 'insensitive' } } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, alerts] = await Promise.all([
      db.alert.count({ where }),
      db.alert.findMany({
        where,
        include: {
          device: {
            select: {
              id: true,
              hostname: true,
              displayName: true,
              status: true,
              lastSeenAt: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          rule: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          acknowledger: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: [
          { severity: 'asc' }, // CRITICAL first in enum order or handled in client
          { lastSeenAt: 'desc' },
        ],
        skip,
        take: limitNum,
      }),
    ]);

    return reply.status(200).send({
      data: alerts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  });

  // GET /api/v1/alerts/stats
  fastify.get('/stats', async (request, reply) => {
    const tenantId = getTenantId(request);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      activeCount,
      criticalCount,
      highCount,
      warningCount,
      infoCount,
      openCount,
      ackCount,
      resolvedTodayCount,
    ] = await Promise.all([
      // Total active (OPEN + ACKNOWLEDGED)
      db.alert.count({
        where: {
          tenantId,
          status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
        },
      }),
      // Active Critical
      db.alert.count({
        where: {
          tenantId,
          status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
          severity: Severity.CRITICAL,
        },
      }),
      // Active High
      db.alert.count({
        where: {
          tenantId,
          status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
          severity: Severity.HIGH,
        },
      }),
      // Active Warning
      db.alert.count({
        where: {
          tenantId,
          status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
          severity: Severity.WARNING,
        },
      }),
      // Active Info
      db.alert.count({
        where: {
          tenantId,
          status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
          severity: Severity.INFO,
        },
      }),
      // Open
      db.alert.count({
        where: {
          tenantId,
          status: AlertStatus.OPEN,
        },
      }),
      // Acknowledged
      db.alert.count({
        where: {
          tenantId,
          status: AlertStatus.ACKNOWLEDGED,
        },
      }),
      // Resolved today
      db.alert.count({
        where: {
          tenantId,
          status: AlertStatus.RESOLVED,
          resolvedAt: { gte: today },
        },
      }),
    ]);

    return reply.status(200).send({
      totalActive: activeCount,
      critical: criticalCount,
      high: highCount,
      warning: warningCount,
      info: infoCount,
      openCount,
      acknowledgedCount: ackCount,
      resolvedToday: resolvedTodayCount,
    });
  });

  // GET /api/v1/alerts/rules
  fastify.get('/rules', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { customerId } = request.query as { customerId?: string };

    // Fetch base general rules (customerId: null)
    const generalRules = await db.alertRule.findMany({
      where: { tenantId, customerId: null },
      orderBy: [{ category: 'asc' }, { severity: 'asc' }],
    });

    if (!customerId || customerId === 'ALL' || customerId === 'GENERAL') {
      return reply.status(200).send({
        data: generalRules.map((r) => ({
          ...r,
          isCustomerOverride: false,
          effectiveEnabled: r.enabled,
        })),
        isCustomerSpecific: false,
      });
    }

    // Fetch customer overrides for this specific customer
    const customerOverrides = await db.alertRule.findMany({
      where: { tenantId, customerId },
    });

    const overrideMap = new Map<string, typeof customerOverrides[0]>();
    for (const ov of customerOverrides) {
      overrideMap.set(ov.name, ov);
    }

    // Merge: for each general rule, overlay customer-specific settings if present
    const merged = generalRules.map((gr) => {
      const ov = overrideMap.get(gr.name);
      if (ov) {
        return {
          ...gr,
          id: ov.id, // the override record id
          baseRuleId: gr.id,
          enabled: ov.enabled,
          condition: ov.condition,
          severity: ov.severity,
          cooldownMin: ov.cooldownMin,
          isCustomerOverride: true,
          overrideId: ov.id,
        };
      }
      return {
        ...gr,
        baseRuleId: gr.id,
        isCustomerOverride: false,
        overrideId: null,
      };
    });

    return reply.status(200).send({
      data: merged,
      isCustomerSpecific: true,
      customerId,
    });
  });

  // PATCH /api/v1/alerts/rules/:id/toggle
  fastify.patch('/rules/:id/toggle', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const { customerId } = request.query as { customerId?: string };

    // If customerId is supplied, toggle/create customer override
    if (customerId && customerId !== 'ALL' && customerId !== 'GENERAL') {
      // Find base rule or current override
      const baseRule = await db.alertRule.findFirst({
        where: { id, tenantId },
      });

      if (!baseRule) {
        return reply.status(404).send({ error: 'Not Found', message: 'Alert rule not found' });
      }

      const existingOverride = await db.alertRule.findFirst({
        where: { tenantId, customerId, name: baseRule.name },
      });

      if (existingOverride) {
        const updated = await db.alertRule.update({
          where: { id: existingOverride.id },
          data: { enabled: !existingOverride.enabled },
        });
        return reply.status(200).send({ data: updated, isOverride: true });
      } else {
        // Create new customer override with inverted enabled state
        const created = await db.alertRule.create({
          data: {
            tenantId,
            customerId,
            name: baseRule.name,
            description: baseRule.description,
            category: baseRule.category,
            severity: baseRule.severity,
            cooldownMin: baseRule.cooldownMin,
            condition: baseRule.condition as any,
            enabled: !baseRule.enabled,
          },
        });
        return reply.status(200).send({ data: created, isOverride: true });
      }
    }

    // General rule toggle
    const rule = await db.alertRule.findFirst({
      where: { id, tenantId },
    });

    if (!rule) {
      return reply.status(404).send({ error: 'Not Found', message: 'Alert rule not found' });
    }

    const updated = await db.alertRule.update({
      where: { id },
      data: { enabled: !rule.enabled },
    });

    return reply.status(200).send({ data: updated, isOverride: false });
  });

  // POST /api/v1/alerts/rules/customer-override
  fastify.post('/rules/customer-override', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { baseRuleId, customerId, enabled, threshold } = (request.body || {}) as {
      baseRuleId: string;
      customerId: string;
      enabled?: boolean;
      threshold?: number;
    };

    if (!baseRuleId || !customerId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'baseRuleId and customerId are required' });
    }

    const baseRule = await db.alertRule.findFirst({
      where: { id: baseRuleId, tenantId },
    });

    if (!baseRule) {
      return reply.status(404).send({ error: 'Not Found', message: 'Base rule not found' });
    }

    const existingOverride = await db.alertRule.findFirst({
      where: { tenantId, customerId, name: baseRule.name },
    });

    const cond = (baseRule.condition || {}) as any;
    const newCondition = {
      ...cond,
      ...(threshold !== undefined ? { threshold: Number(threshold) } : {}),
    };

    let result;
    if (existingOverride) {
      result = await db.alertRule.update({
        where: { id: existingOverride.id },
        data: {
          enabled: enabled !== undefined ? enabled : existingOverride.enabled,
          condition: newCondition,
        },
      });
    } else {
      result = await db.alertRule.create({
        data: {
          tenantId,
          customerId,
          name: baseRule.name,
          description: baseRule.description,
          category: baseRule.category,
          severity: baseRule.severity,
          cooldownMin: baseRule.cooldownMin,
          condition: newCondition,
          enabled: enabled !== undefined ? enabled : baseRule.enabled,
        },
      });
    }

    return reply.status(200).send({ data: result, message: 'Regla particular para el cliente guardada' });
  });

  // DELETE /api/v1/alerts/rules/customer-override/:id
  fastify.delete('/rules/customer-override/:id', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const rule = await db.alertRule.findFirst({
      where: { id, tenantId, customerId: { not: null } },
    });

    if (!rule) {
      return reply.status(404).send({ error: 'Not Found', message: 'Customer rule override not found' });
    }

    await db.alertRule.delete({ where: { id } });
    return reply.status(200).send({ status: 'ok', message: 'Regla restablecida al valor general de la flota' });
  });

  // POST /api/v1/alerts/evaluate
  fastify.post('/evaluate', async (request, reply) => {
    const { deviceId } = (request.body || {}) as { deviceId?: string };
    const tenantId = getTenantId(request);

    if (deviceId) {
      const res = await evaluateDeviceAlerts(deviceId, tenantId);
      return reply.status(200).send({ data: res });
    } else {
      const res = await evaluateAllDevicesAlerts();
      return reply.status(200).send({ data: res });
    }
  });

  // GET /api/v1/alerts/:id
  fastify.get('/:id', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const alert = await db.alert.findFirst({
      where: { id, tenantId },
      include: {
        device: true,
        customer: true,
        rule: true,
        acknowledger: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!alert) {
      return reply.status(404).send({ error: 'Not Found', message: 'Alert not found' });
    }

    return reply.status(200).send({ data: alert });
  });

  // PATCH /api/v1/alerts/:id/ack
  fastify.patch('/:id/ack', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const userId = request.user?.userId;

    const alert = await db.alert.findFirst({
      where: { id, tenantId },
    });

    if (!alert) {
      return reply.status(404).send({ error: 'Not Found', message: 'Alert not found' });
    }

    const updated = await db.alert.update({
      where: { id },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedBy: userId || null,
      },
      include: {
        device: { select: { hostname: true } },
        customer: { select: { name: true } },
        acknowledger: { select: { name: true, email: true } },
      },
    });

    return reply.status(200).send({ data: updated, message: 'Alerta reconocida por el técnico' });
  });

  // PATCH /api/v1/alerts/:id/resolve
  fastify.patch('/:id/resolve', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const { note } = (request.body || {}) as { note?: string };

    const alert = await db.alert.findFirst({
      where: { id, tenantId },
    });

    if (!alert) {
      return reply.status(404).send({ error: 'Not Found', message: 'Alert not found' });
    }

    const resolvedDesc = note
      ? `${alert.description} — [Resuelto por técnico: ${note}]`
      : alert.description;

    const updated = await db.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        description: resolvedDesc,
      },
      include: {
        device: { select: { hostname: true } },
        customer: { select: { name: true } },
      },
    });

    return reply.status(200).send({ data: updated, message: 'Alerta resuelta con éxito' });
  });

  // PATCH /api/v1/alerts/:id/ignore
  fastify.patch('/:id/ignore', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const alert = await db.alert.findFirst({
      where: { id, tenantId },
    });

    if (!alert) {
      return reply.status(404).send({ error: 'Not Found', message: 'Alert not found' });
    }

    const updated = await db.alert.update({
      where: { id },
      data: {
        status: AlertStatus.IGNORED,
      },
    });

    return reply.status(200).send({ data: updated, message: 'Alerta ignorada / archivada' });
  });
};
