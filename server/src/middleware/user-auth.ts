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
