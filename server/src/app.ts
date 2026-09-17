import fastify, { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
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
import { alertsRoutes } from './modules/alerts/alerts.routes.js';
import { deviceActionRoutes, agentActionRoutes } from './modules/actions/actions.routes.js';
import { patchRoutes, devicePatchRoutes, agentPatchRoutes } from './modules/patches/patches.routes.js';
import { remediationRoutes } from './modules/remediation/remediation.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { ensureDefaultAlertRules } from './modules/alerts/alert-rules.seed.js';
import { SoftwareComplianceService } from './modules/inventory/software-compliance.service.js';
import { authenticateUser } from './middleware/user-auth.js';
import { db } from './lib/db.js';
import { getLandingHtml } from './views/landing.html.js';
import { generateRandomString } from './lib/crypto.js';

// Global BigInt JSON serialization polyfill
if (!('toJSON' in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

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

  // Ensure default alert rules exist for all active tenants
  ensureDefaultAlertRules().catch((err) => {
    app.log.error({ err }, 'Failed to seed default alert rules');
  });

  // Ensure default software blacklist rules exist
  SoftwareComplianceService.ensureDefaultBlacklistRules().catch((err) => {
    app.log.error({ err }, 'Failed to seed default software blacklist rules');
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
      let customers: any[] = [];
      let recentEvents: any[] = [];
      let activeAlerts: any[] = [];
      try {
        devices = await db.device.findMany({
          include: {
            customer: { select: { id: true, name: true, code: true } },
            site: { select: { id: true, name: true } },
            agent: { select: { id: true, agentVersion: true, status: true, lastAuthAt: true } },
            inventories: { take: 1, orderBy: { collectedAt: 'desc' } },
            softwareInventories: { take: 1, orderBy: { collectedAt: 'desc' } },
            metrics: { take: 15, orderBy: { timestamp: 'desc' } },
            events: { take: 20, orderBy: { timestamp: 'desc' } },
            healthScores: { take: 1, orderBy: { calculatedAt: 'desc' } },
          },
          orderBy: { lastSeenAt: 'desc' },
        });

        customers = await db.customer.findMany({
          include: {
            sites: { select: { id: true, name: true } },
            enrollmentTokens: {
              select: { id: true, token: true, expiresAt: true },
              where: { expiresAt: { gt: new Date() } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            _count: {
              select: {
                devices: true,
                sites: true,
                alerts: { where: { status: 'OPEN' } },
              },
            },
          },
          orderBy: { name: 'asc' },
        });

        // Ensure every customer has a dedicated enrollment token
        for (const cust of customers) {
          if (!cust.enrollmentTokens || cust.enrollmentTokens.length === 0) {
            const cleanCode = cust.code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const tokenStr = `NL-${cleanCode}-${generateRandomString(8).toUpperCase()}`;
            const newToken = await db.enrollmentToken.create({
              data: {
                tenantId: cust.tenantId,
                customerId: cust.id,
                token: tokenStr,
                maxUses: 500,
                expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
              },
              select: { id: true, token: true, expiresAt: true },
            });
            cust.enrollmentTokens = [newToken];
          }
        }

        recentEvents = await db.deviceEvent.findMany({
          take: 8,
          orderBy: { timestamp: 'desc' },
          include: {
            device: { select: { id: true, hostname: true } },
          },
        });

        activeAlerts = await db.alert.findMany({
          where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          include: {
            device: { select: { id: true, hostname: true, displayName: true } },
            customer: { select: { id: true, name: true, code: true } },
            rule: { select: { id: true, name: true, category: true } },
            acknowledger: { select: { id: true, name: true, email: true } },
          },
          orderBy: [
            { severity: 'asc' },
            { lastSeenAt: 'desc' },
          ],
          take: 100,
        });
      } catch (err) {
        request.log.error(err, 'Failed to fetch dashboard data for landing');
      }

      const html = getLandingHtml({
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString(),
        version: '1.3.0',
        env: config.NODE_ENV,
        devices,
        customers,
        recentEvents,
        alerts: activeAlerts,
      });
      return reply
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .type('text/html; charset=utf-8')
        .send(html);
    }

    return reply.send({
      name: 'NanoLabs Control Center',
      version: '1.3.0',
      status: 'operational',
      health: '/health',
      docs: 'https://monitor.nanolabs.com.ar',
      timestamp: new Date().toISOString(),
    });
  });

  // Live data endpoint for real-time dashboard auto-refresh (Protected with authenticateUser)
  app.get('/api/v1/public/live', { preHandler: [authenticateUser] }, async (request, reply) => {
    let devices: any[] = [];
    let customers: any[] = [];
    let recentEvents: any[] = [];
    let activeAlerts: any[] = [];
    try {
      devices = await db.device.findMany({
        include: {
          customer: { select: { id: true, name: true, code: true } },
          site: { select: { id: true, name: true } },
          agent: { select: { id: true, agentVersion: true, status: true, lastAuthAt: true } },
          inventories: { take: 1, orderBy: { collectedAt: 'desc' } },
          softwareInventories: { take: 1, orderBy: { collectedAt: 'desc' } },
          metrics: { take: 15, orderBy: { timestamp: 'desc' } },
          events: { take: 20, orderBy: { timestamp: 'desc' } },
          healthScores: { take: 1, orderBy: { calculatedAt: 'desc' } },
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      customers = await db.customer.findMany({
        include: {
          sites: { select: { id: true, name: true } },
          enrollmentTokens: {
            select: { id: true, token: true, expiresAt: true },
            where: { expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              devices: true,
              sites: true,
              alerts: { where: { status: 'OPEN' } },
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Ensure every customer has a dedicated enrollment token
      for (const cust of customers) {
        if (!cust.enrollmentTokens || cust.enrollmentTokens.length === 0) {
          const cleanCode = cust.code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
          const tokenStr = `NL-${cleanCode}-${generateRandomString(8).toUpperCase()}`;
          const newToken = await db.enrollmentToken.create({
            data: {
              tenantId: cust.tenantId,
              customerId: cust.id,
              token: tokenStr,
              maxUses: 500,
              expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
            },
            select: { id: true, token: true, expiresAt: true },
          });
          cust.enrollmentTokens = [newToken];
        }
      }

      recentEvents = await db.deviceEvent.findMany({
        take: 8,
        orderBy: { timestamp: 'desc' },
        include: {
          device: { select: { id: true, hostname: true } },
        },
      });

      activeAlerts = await db.alert.findMany({
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        include: {
          device: { select: { id: true, hostname: true, displayName: true } },
          customer: { select: { id: true, name: true, code: true } },
          rule: { select: { id: true, name: true, category: true } },
          acknowledger: { select: { id: true, name: true, email: true } },
        },
        orderBy: [
          { severity: 'asc' },
          { lastSeenAt: 'desc' },
        ],
        take: 100,
      });
    } catch (err) {
      request.log.error(err, 'Failed to fetch live dashboard telemetry');
    }

    return reply
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .send({
        status: 'ok',
        devices,
        customers,
        recentEvents,
        alerts: activeAlerts,
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

  // Downloads & Deployment Scripts
  const serveInstaller = async (request: any, reply: any) => {
    const candidatePaths = [
      path.join(process.cwd(), 'downloads', 'NanoMonitor-Setup.exe'),
      path.join(process.cwd(), '..', 'downloads', 'NanoMonitor-Setup.exe'),
      path.join(process.cwd(), '..', 'installer', 'bin', 'NanoMonitor-Setup.exe'),
      '/app/downloads/NanoMonitor-Setup.exe',
    ];

    let foundPath = '';
    for (const p of candidatePaths) {
      try {
        await fs.promises.access(p);
        foundPath = p;
        break;
      } catch {
        // continue
      }
    }

    if (!foundPath) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'NanoMonitor-Setup.exe not found on server',
      });
    }

    const stat = await fs.promises.stat(foundPath);
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', 'attachment; filename="NanoMonitor-Setup.exe"')
      .header('Content-Length', stat.size);
    return reply.send(fs.createReadStream(foundPath));
  };

  const servePs1 = async (request: any, reply: any) => {
    const query = (request.query || {}) as { token?: string; api_url?: string };
    const candidatePaths = [
      path.join(process.cwd(), 'downloads', 'install.ps1'),
      path.join(process.cwd(), '..', 'scripts', 'install.ps1'),
      path.join(process.cwd(), '..', 'downloads', 'install.ps1'),
      '/app/downloads/install.ps1',
    ];

    let content = '';
    for (const p of candidatePaths) {
      try {
        content = await fs.promises.readFile(p, 'utf-8');
        break;
      } catch {
        // continue
      }
    }

    if (!content) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'install.ps1 script not found on server',
      });
    }

    if (query.token) {
      const sanitizedToken = query.token.replace(/["'`$\\]/g, '');
      content = content.replace(
        '[string]$Token = ""',
        `[string]$Token = "${sanitizedToken}"`
      );
    }

    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .send(content);
  };

  app.get('/downloads/NanoMonitor-Setup.exe', serveInstaller);
  app.get('/api/v1/downloads/NanoMonitor-Setup.exe', serveInstaller);

  app.get('/downloads/install.ps1', servePs1);
  app.get('/api/v1/downloads/install.ps1', servePs1);
  app.get('/install.ps1', servePs1);

  // Register API Routes
  // 1. Agent Direct Endpoints (compatibility with Go agent default paths)
  await app.register(enrollmentRoutes, { prefix: '/enrollment' });
  await app.register(agentRoutes, { prefix: '/agent' });
  await app.register(agentActionRoutes, { prefix: '/agent/actions' });
  await app.register(agentPatchRoutes, { prefix: '/agent/patches' });

  // 2. Versioned API Endpoints
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(enrollmentRoutes, { prefix: '/api/v1/enrollment' });
  await app.register(agentRoutes, { prefix: '/api/v1/agent' });
  await app.register(agentActionRoutes, { prefix: '/api/v1/agent/actions' });
  await app.register(agentPatchRoutes, { prefix: '/api/v1/agent/patches' });
  await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
  await app.register(customersRoutes, { prefix: '/api/v1/customers' });
  await app.register(sitesRoutes, { prefix: '/api/v1/sites' });
  await app.register(devicesRoutes, { prefix: '/api/v1/devices' });
  await app.register(deviceActionRoutes, { prefix: '/api/v1/devices' });
  await app.register(devicePatchRoutes, { prefix: '/api/v1/devices' });
  await app.register(patchRoutes, { prefix: '/api/v1/patches' });
  await app.register(alertsRoutes, { prefix: '/api/v1/alerts' });
  await app.register(remediationRoutes, { prefix: '/api/v1/remediations' });
  await app.register(inventoryRoutes, { prefix: '/api/v1/inventory' });

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
