import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { db } from '../../lib/db.js';
import {
  comparePassword,
  generateRandomString,
  hashPassword,
  signUserAccessToken,
} from '../../lib/crypto.js';
import { loginSchema, refreshTokenSchema } from '../../schemas/auth.schema.js';
import { authenticateUser } from '../../middleware/user-auth.js';
import { logAudit } from '../../middleware/audit.js';
import { config } from '../../config/index.js';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const { email, password } = parseResult.data;

    const user = await db.user.findFirst({
      where: { email: email.toLowerCase() },
      include: { tenant: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Generate JWT access token
    const accessToken = signUserAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    // Generate refresh token
    const rawRefreshToken = generateRandomString(48);
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await logAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'user.login',
      entityType: 'User',
      entityId: user.id,
      request,
    });

    // Set refresh token in HttpOnly cookie
    reply.setCookie('refreshToken', rawRefreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: expiresAt,
    });

    return reply.send({
      statusCode: 200,
      data: {
        accessToken,
        refreshToken: rawRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
          },
        },
      },
    });
  });

  // POST /api/v1/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const cookieToken = request.cookies.refreshToken;
    let rawToken = cookieToken;

    if (!rawToken && request.body) {
      const parsed = refreshTokenSchema.safeParse(request.body);
      if (parsed.success) {
        rawToken = parsed.data.refreshToken;
      }
    }

    if (!rawToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing refresh token',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const tokenRecord = await db.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { tenant: true } } },
    });

    if (
      !tokenRecord ||
      tokenRecord.revokedAt !== null ||
      tokenRecord.expiresAt < new Date() ||
      tokenRecord.user.status !== 'ACTIVE'
    ) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid, expired, or revoked refresh token',
      });
    }

    // Revoke used refresh token (Token rotation)
    await db.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    // Create new refresh token
    const newRawRefreshToken = generateRandomString(48);
    const newTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await db.refreshToken.create({
      data: {
        userId: tokenRecord.userId,
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      },
    });

    // Sign new access token
    const newAccessToken = signUserAccessToken({
      userId: tokenRecord.user.id,
      tenantId: tokenRecord.user.tenantId,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
    });

    reply.setCookie('refreshToken', newRawRefreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: newExpiresAt,
    });

    return reply.send({
      statusCode: 200,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
      },
    });
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', { preHandler: [authenticateUser] }, async (request, reply) => {
    const rawToken = request.cookies.refreshToken;
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await db.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    reply.clearCookie('refreshToken', { path: '/api/v1/auth' });

    if (request.user) {
      await logAudit({
        tenantId: request.user.tenantId,
        userId: request.user.userId,
        action: 'user.logout',
        entityType: 'User',
        entityId: request.user.userId,
        request,
      });
    }

    return reply.send({ statusCode: 200, message: 'Logged out successfully' });
  });

  // GET /api/v1/auth/me
  fastify.get('/me', { preHandler: [authenticateUser] }, async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ statusCode: 404, message: 'User not found' });
    }

    return reply.send({ statusCode: 200, data: user });
  });
};
