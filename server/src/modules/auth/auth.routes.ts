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
  fastify.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
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

    const candidates = await db.user.findMany({
      where: {
        email: email.toLowerCase(),
        status: 'ACTIVE',
        tenant: { status: 'ACTIVE' },
      },
      include: { tenant: true },
      take: 10,
    });

    const passwordMatches = await Promise.all(
      candidates.map(async (candidate) => ({
        user: candidate,
        matches: await comparePassword(password, candidate.passwordHash),
      }))
    );
    const matchedUsers = passwordMatches.filter((entry) => entry.matches);

    // Email is tenant-scoped in the data model. Never let findFirst choose an
    // arbitrary organization when the same email exists in multiple tenants.
    if (matchedUsers.length !== 1) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const user = matchedUsers[0].user;

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
    }
  );

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
      tokenRecord.user.status !== 'ACTIVE' ||
      tokenRecord.user.tenant.status !== 'ACTIVE'
    ) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid, expired, or revoked refresh token',
      });
    }

    // Rotate refresh tokens with compare-and-set semantics. Two concurrent
    // refresh requests must never mint two valid descendants from one token.
    const newRawRefreshToken = generateRandomString(48);
    const newTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    const rotationNow = new Date();

    const rotated = await db.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: {
          id: tokenRecord.id,
          revokedAt: null,
          expiresAt: { gt: rotationNow },
        },
        data: { revokedAt: rotationNow },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          userId: tokenRecord.userId,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      });
      return true;
    });

    if (!rotated) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Refresh token was already used or revoked',
      });
    }

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
