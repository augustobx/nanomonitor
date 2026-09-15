import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { enrollmentRoutes } from './modules/enrollment/enrollment.routes.js';
import { agentRoutes } from './modules/agent/agent.routes.js';
import { tenantsRoutes } from './modules/tenants/tenants.routes.js';
import { customersRoutes } from './modules/customers/customers.routes.js';
import { sitesRoutes } from './modules/sites/sites.routes.js';
import { devicesRoutes } from './modules/devices/devices.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : config.NODE_ENV === 'development'
          ? {
              transport: {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                  ignore: 'pid,hostname',
                },
              },
            }
          : true,
  });

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  // Custom JSON parser to preserve exact rawBody for HMAC-SHA256 verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      const rawString = body.toString('utf-8');
      (req as any).rawBody = rawString;
      const json = rawString.trim().length > 0 ? JSON.parse(rawString) : {};
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Global Healthcheck
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'nanolabs-control-center-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Register API Routes
  // 1. Agent Direct Endpoints (compatibility with Go agent default paths)
  await app.register(enrollmentRoutes, { prefix: '/enrollment' });
  await app.register(agentRoutes, { prefix: '/agent' });

  // 2. Versioned API Endpoints
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(enrollmentRoutes, { prefix: '/api/v1/enrollment' });
  await app.register(agentRoutes, { prefix: '/api/v1/agent' });
  await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
  await app.register(customersRoutes, { prefix: '/api/v1/customers' });
  await app.register(sitesRoutes, { prefix: '/api/v1/sites' });
  await app.register(devicesRoutes, { prefix: '/api/v1/devices' });

  // Centralized Error Handler
  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 && config.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : error.message || 'Unknown error occurred';

    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message,
    });
  });

  return app;
}
