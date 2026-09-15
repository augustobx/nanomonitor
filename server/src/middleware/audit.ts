import { FastifyRequest } from 'fastify';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface AuditLogOptions {
  tenantId: string;
  userId?: string | null;
  agentId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  request?: FastifyRequest;
}

export async function logAudit(options: AuditLogOptions): Promise<void> {
  try {
    const ipAddress = options.request?.ip || options.request?.headers['x-forwarded-for']?.toString();
    const userAgent = options.request?.headers['user-agent'];

    await db.auditLog.create({
      data: {
        tenantId: options.tenantId,
        userId: options.userId || options.request?.user?.userId || null,
        agentId: options.agentId || options.request?.agent?.agentId || null,
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId || null,
        details: (options.details as any) || undefined,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  } catch (error) {
    logger.error({ error, action: options.action }, 'Failed to write audit log entry');
  }
}
