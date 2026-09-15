import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedAgent {
  agentId: string;
  deviceId: string;
  tenantId: string;
  agentVersion: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    agent?: AuthenticatedAgent;
    tenantId?: string;
    rawBody?: string;
  }
}
