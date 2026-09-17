import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HardwareComponent, Severity, SoftwareChangeType, UserRole } from '@prisma/client';
import { db } from '../../lib/db.js';
import { authenticateUser, requireRole } from '../../middleware/user-auth.js';
import { getTenantId } from '../../middleware/tenant-isolation.js';
import { SoftwareComplianceService } from './software-compliance.service.js';

const createBlacklistRuleSchema = z.object({
  name: z.string().min(2),
  pattern: z.string().min(2),
  category: z.string().min(2),
  severity: z.nativeEnum(Severity).optional(),
  description: z.string().optional(),
  customerId: z.string().uuid().optional(),
});

export const inventoryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', authenticateUser);

  // GET /api/v1/inventory/software/global - Aggregated software catalog across the fleet
  fastify.get('/software/global', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { search, limit = '100' } = request.query as { search?: string; limit?: string };
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));

    // Fetch latest software inventory per device
    const devices = await db.device.findMany({
      where: { tenantId },
      select: {
        id: true,
        hostname: true,
        customerId: true,
        customer: { select: { id: true, name: true, code: true } },
        softwareInventories: {
          take: 1,
          orderBy: { collectedAt: 'desc' },
          select: { software: true, collectedAt: true },
        },
      },
    });

    const catalogMap = new Map<string, {
      name: string;
      publisher: string;
      versions: Set<string>;
      deviceCount: number;
      devices: Array<{ id: string; hostname: string; customerName: string; version: string }>;
    }>();

    const queryLower = search ? search.toLowerCase().trim() : '';

    for (const d of devices) {
      const inv = d.softwareInventories[0];
      if (!inv || !inv.software) continue;

      const items: any[] = Array.isArray(inv.software) ? inv.software : [];
      for (const item of items) {
        const name = (item.name || '').trim();
        if (!name) continue;

        if (queryLower && !name.toLowerCase().includes(queryLower) && !(item.publisher || '').toLowerCase().includes(queryLower)) {
          continue;
        }

        const key = name.toLowerCase();
        let entry = catalogMap.get(key);
        if (!entry) {
          entry = {
            name,
            publisher: (item.publisher || '-').trim(),
            versions: new Set<string>(),
            deviceCount: 0,
            devices: [],
          };
          catalogMap.set(key, entry);
        }

        const ver = (item.version || '-').trim();
        entry.versions.add(ver);
        entry.deviceCount++;
        if (entry.devices.length < 15) {
          entry.devices.push({
            id: d.id,
            hostname: d.hostname,
            customerName: d.customer?.name || 'NanoLabs',
            version: ver,
          });
        }
      }
    }

    const catalog = Array.from(catalogMap.values())
      .sort((a, b) => b.deviceCount - a.deviceCount)
      .slice(0, limitNum)
      .map((c) => ({
        name: c.name,
        publisher: c.publisher,
        versions: Array.from(c.versions),
        deviceCount: c.deviceCount,
        sampleDevices: c.devices,
      }));

    return reply.send({
      statusCode: 200,
      data: {
        totalUniqueApps: catalogMap.size,
        returnedApps: catalog.length,
        catalog,
      },
    });
  });

  // GET /api/v1/inventory/software/changes - Global or filtered software change audit trail
  fastify.get('/software/changes', async (request, reply) => {
    const tenantId = getTenantId(request);
    const {
      deviceId,
      changeType,
      search,
      limit = '50',
      page = '1',
    } = request.query as {
      deviceId?: string;
      changeType?: SoftwareChangeType;
      search?: string;
      limit?: string;
      page?: string;
    };

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      tenantId,
      ...(deviceId ? { deviceId } : {}),
      ...(changeType ? { changeType } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { publisher: { contains: search, mode: 'insensitive' } },
              { device: { hostname: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, changes] = await Promise.all([
      db.softwareChange.count({ where }),
      db.softwareChange.findMany({
        where,
        include: {
          device: {
            select: { id: true, hostname: true, customer: { select: { id: true, name: true } } },
          },
        },
        orderBy: { detectedAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    return reply.send({
      statusCode: 200,
      data: {
        changes,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  });

  // GET /api/v1/inventory/hardware/changes - Global or filtered hardware change audit trail
  fastify.get('/hardware/changes', async (request, reply) => {
    const tenantId = getTenantId(request);
    const {
      deviceId,
      component,
      limit = '50',
      page = '1',
    } = request.query as {
      deviceId?: string;
      component?: HardwareComponent;
      limit?: string;
      page?: string;
    };

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      tenantId,
      ...(deviceId ? { deviceId } : {}),
      ...(component ? { component } : {}),
    };

    const [total, changes] = await Promise.all([
      db.hardwareChange.count({ where }),
      db.hardwareChange.findMany({
        where,
        include: {
          device: {
            select: { id: true, hostname: true, customer: { select: { id: true, name: true } } },
          },
        },
        orderBy: { detectedAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    return reply.send({
      statusCode: 200,
      data: {
        changes,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  });

  // GET /api/v1/inventory/software/blacklist - List blacklist rules
  fastify.get('/software/blacklist', async (request, reply) => {
    const tenantId = getTenantId(request);
    const rules = await SoftwareComplianceService.getBlacklistRules(tenantId);
    return reply.send({ statusCode: 200, data: rules });
  });

  // POST /api/v1/inventory/software/blacklist - Create blacklist rule
  fastify.post(
    '/software/blacklist',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const parsed = createBlacklistRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Datos de regla de lista negra inválidos',
          issues: parsed.error.issues,
        });
      }

      const rule = await SoftwareComplianceService.createBlacklistRule(tenantId, parsed.data);
      return reply.send({ statusCode: 201, data: rule });
    }
  );

  // DELETE /api/v1/inventory/software/blacklist/:id - Delete blacklist rule
  fastify.delete(
    '/software/blacklist/:id',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };
      await SoftwareComplianceService.deleteBlacklistRule(id, tenantId);
      return reply.send({ statusCode: 200, message: 'Regla de lista negra eliminada con éxito.' });
    }
  );

  // GET /api/v1/inventory/devices/:id/software/export - Export device software to CSV
  fastify.get('/devices/:id/software/export', async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const device = await db.device.findFirst({
      where: { id, tenantId },
      include: {
        softwareInventories: {
          take: 1,
          orderBy: { collectedAt: 'desc' },
        },
      },
    });

    if (!device) {
      return reply.status(404).send({ statusCode: 404, message: 'Device not found' });
    }

    const items: any[] = device.softwareInventories[0]?.software
      ? (device.softwareInventories[0].software as any[])
      : [];

    const headers = ['Aplicacion', 'Version', 'Fabricante', 'FechaInstalacion', 'Arquitectura'];
    const rows = items.map((s) => [
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${(s.version || '').replace(/"/g, '""')}"`,
      `"${(s.publisher || '').replace(/"/g, '""')}"`,
      `"${(s.installDate || '').replace(/"/g, '""')}"`,
      `"${(s.architecture || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="software-${device.hostname}.csv"`)
      .send(csvContent);
  });
};
