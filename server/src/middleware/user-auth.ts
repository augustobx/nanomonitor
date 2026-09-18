import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
import { verifyUserAccessToken } from '../lib/crypto.js';
import { db } from '../lib/db.js';

export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected Bearer <token>',
    });
  }

  const token = authHeader.substring(7);
  const payload = verifyUserAccessToken(token);

  if (!payload) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired access token',
    });
  }

  // Quick lookup to ensure user is still active
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, tenantId: true, email: true, role: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'User account is inactive or not found',
    });
  }

  request.user = {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  };

  request.tenantId = user.tenantId;
}

export function requireRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

export type ActionPermission =
  | 'VIEW_DEVICE'
  | 'RUN_SAFE_ACTION'
  | 'RUN_SECURITY_ACTION'
  | 'RUN_SYSTEM_ACTION'
  | 'RUN_REBOOT'
  | 'ADMIN_ACTIONS';

export const ROLE_PERMISSIONS: Record<UserRole, ActionPermission[]> = {
  SUPER_ADMIN: [
    'VIEW_DEVICE',
    'RUN_SAFE_ACTION',
    'RUN_SECURITY_ACTION',
    'RUN_SYSTEM_ACTION',
    'RUN_REBOOT',
    'ADMIN_ACTIONS',
  ],
  ADMIN: [
    'VIEW_DEVICE',
    'RUN_SAFE_ACTION',
    'RUN_SECURITY_ACTION',
    'RUN_SYSTEM_ACTION',
    'RUN_REBOOT',
    'ADMIN_ACTIONS',
  ],
  TECHNICIAN: [
    'VIEW_DEVICE',
    'RUN_SAFE_ACTION',
    'RUN_SECURITY_ACTION',
    'RUN_SYSTEM_ACTION',
  ],
  VIEWER: ['VIEW_DEVICE'],
  CLIENT: ['VIEW_DEVICE'],
};

export function hasPermission(role: UserRole, permission: ActionPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getRequiredPermissionForAction(actionType: string): ActionPermission {
  switch (actionType) {
    case 'REBOOT_DEVICE':
    case 'SHUTDOWN_DEVICE':
      return 'RUN_REBOOT';

    case 'FORCE_SECURITY_SCAN':
    case 'DEFENDER_UPDATE_SIGNATURES':
    case 'DEFENDER_QUICK_SCAN':
    case 'DEFENDER_FULL_SCAN':
    case 'DEFENDER_ENABLE_PROTECTION':
      return 'RUN_SECURITY_ACTION';

    case 'WINDOWS_SFC_SCAN':
    case 'WINDOWS_DISM_CHECK':
    case 'WINDOWS_CHKDSK_SCAN':
    case 'RESTART_SERVICE':
    case 'WINDOWS_UPDATE_INSTALL_KB':
    case 'WINDOWS_UPDATE_INSTALL_APPROVED':
    case 'CLEAN_TEMP_FILES':
      return 'RUN_SYSTEM_ACTION';

    case 'WINDOWS_UPDATE_SCHEDULE_REBOOT':
      return 'RUN_REBOOT';

    case 'FORCE_HEARTBEAT':
    case 'FORCE_METRICS':
    case 'FORCE_INVENTORY':
    case 'FORCE_SMART_CHECK':
    case 'FORCE_WINDOWS_UPDATE':
    case 'FLUSH_DNS':
    case 'RENEW_DHCP':
    case 'QUERY_SERVICES':
    default:
      return 'RUN_SAFE_ACTION';
  }
}

export function requireActionPermission(permissionOrResolver: ActionPermission | ((req: FastifyRequest) => ActionPermission)) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const permission =
      typeof permissionOrResolver === 'function'
        ? permissionOrResolver(request)
        : permissionOrResolver;

    if (!hasPermission(request.user.role, permission)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Insufficient permissions. Required permission: ${permission}`,
      });
    }
  };
}

