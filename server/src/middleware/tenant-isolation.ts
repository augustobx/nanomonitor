import { FastifyRequest } from 'fastify';

/**
 * Resolves the trusted tenantId for the current request.
 * Normal users are strictly restricted to their own tenantId.
 * SuperAdmins can optionally scope to another tenant via X-Tenant-Id header.
 */
export function getTenantId(request: FastifyRequest): string {
  if (request.agent) {
    return request.agent.tenantId;
  }

  if (request.user) {
    if (request.user.role === 'SUPER_ADMIN') {
      const headerTenant = request.headers['x-tenant-id'];
      if (typeof headerTenant === 'string' && headerTenant.trim().length > 0) {
        return headerTenant.trim();
      }
    }
    return request.user.tenantId;
  }

  if (request.tenantId) {
    return request.tenantId;
  }

  throw new Error('Tenant context missing from authenticated request');
}
