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
import { db } from './lib/db.js';
import { getLandingHtml } from './views/landing.html.js';

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

  // Security plugins — CSP must allow inline scripts/styles for the SSR landing console
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
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

  // Root Landing & Status Page
  app.get('/', async (request, reply) => {
    const accept = request.headers.accept || '';
    if (accept.includes('text/html')) {
      let devices: any[] = [];
      try {
        devices = await db.device.findMany({
          include: {
            customer: { select: { id: true, name: true, code: true } },
            site: { select: { id: true, name: true } },
            inventories: { take: 1, orderBy: { collectedAt: 'desc' } },
            softwareInventories: { take: 1, orderBy: { collectedAt: 'desc' } },
            metrics: { take: 1, orderBy: { timestamp: 'desc' } },
            events: { take: 20, orderBy: { timestamp: 'desc' } },
          },
          orderBy: { lastSeenAt: 'desc' },
        });
      } catch (err) {
        request.log.error(err, 'Failed to fetch devices for landing');
      }

      const html = getLandingHtml({
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString(),
        version: '0.1.0',
        env: config.NODE_ENV,
        devices,
      });
      return reply.type('text/html; charset=utf-8').send(html);
    }

    return reply.send({
      name: 'NanoLabs Control Center',
      version: '0.1.0',
      status: 'operational',
      health: '/health',
      docs: 'https://monitor.nanolabs.com.ar',
      timestamp: new Date().toISOString(),
    });
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
