import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/lib/db.js';
import { cacheService } from '../src/lib/redis.js';

describe('Agent Ingestion & End-to-End HMAC Flow', () => {
  let app: FastifyInstance;

  const mockTenant = {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'NanoLabs Tenant Test',
    slug: 'nanolabs-test',
    status: 'ACTIVE',
    plan: 'ENTERPRISE',
    maxDevices: 100,
    contactEmail: 'admin@nanolabs.test',
  };

  const mockCustomer = {
    id: 'c0000000-0000-0000-0000-000000000001',
    tenantId: mockTenant.id,
    name: 'Cliente Demo SA',
    code: 'DEMO',
  };

  const mockToken = {
    id: 't0000000-0000-0000-0000-000000000001',
    tenantId: mockTenant.id,
    customerId: mockCustomer.id,
    siteId: null,
    token: 'NL-ENRL-TESTTOKEN1234567890ABCDEF',
    maxUses: 5,
    usedCount: 0,
    expiresAt: new Date(Date.now() + 86400000),
    tenant: mockTenant,
  };

  const mockDevice = {
    id: 'd0000000-0000-0000-0000-000000000001',
    tenantId: mockTenant.id,
    customerId: mockCustomer.id,
    siteId: null,
    hostname: 'DESKTOP-TEST-PC',
    status: 'ONLINE',
    lastSeenAt: new Date(),
  };

  const mockAgentSecret = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const mockAgent = {
    id: 'ag000000-0000-0000-0000-000000000001',
    tenantId: mockTenant.id,
    deviceId: mockDevice.id,
    agentVersion: '0.1.0',
    secretHash: mockAgentSecret,
    status: 'ACTIVE',
    lastAuthAt: null,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await cacheService.disconnect();
    vi.restoreAllMocks();
  });

  // Helper to sign request matching Go agent logic
  function createHmacHeaders(agentId: string, secret: string, bodyString: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
    const message = `${timestamp}\n${bodyHash}`;
    const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    return {
      'content-type': 'application/json',
      authorization: `NanoAgent ${agentId}.${signature}`,
      'x-nano-timestamp': timestamp,
      'x-nano-nonce': nonce,
    };
  }

  it('Agent Enrollment (POST /enrollment/register) creates device and returns agent credentials', async () => {
    // Mock database lookups for enrollment
    vi.spyOn(db.enrollmentToken, 'findUnique').mockResolvedValue(mockToken as any);
    vi.spyOn(db.device, 'count').mockResolvedValue(1);
    vi.spyOn(db.device, 'findFirst').mockResolvedValue(null);
    vi.spyOn(db.device, 'create').mockResolvedValue(mockDevice as any);
    vi.spyOn(db.agent, 'updateMany').mockResolvedValue({ count: 0 });
    vi.spyOn(db.agent, 'create').mockResolvedValue(mockAgent as any);
    vi.spyOn(db.enrollmentToken, 'update').mockResolvedValue({ ...mockToken, usedCount: 1 } as any);
    vi.spyOn(db.auditLog, 'create').mockResolvedValue({} as any);

    const payload = {
      token: mockToken.token,
      hostname: 'DESKTOP-TEST-PC',
      osInfo: {
        caption: 'Microsoft Windows 11 Pro',
        version: '10.0.22631',
        buildNumber: '22631',
        osArchitecture: '64-bit',
        manufacturer: 'Gigabyte Technology Co., Ltd.',
        model: 'H510M H',
        serialNumber: 'Default string',
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/enrollment/register',
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.agentId).toBe(mockAgent.id);
    expect(body.agentSecret).toBeDefined();
    expect(body.deviceId).toBe(mockDevice.id);
    expect(body.tenantId).toBe(mockTenant.id);
    expect(body.config).toBeDefined();
    expect(body.config.heartbeatInterval).toBe(180);
  });

  it('Agent Heartbeat (POST /agent/heartbeat) with valid HMAC signature succeeds', async () => {
    vi.spyOn(db.agent, 'findUnique').mockResolvedValue(mockAgent as any);
    vi.spyOn(db.agent, 'update').mockResolvedValue(mockAgent as any);
    vi.spyOn(db.agentHeartbeat, 'create').mockResolvedValue({} as any);
    vi.spyOn(db.device, 'update').mockResolvedValue(mockDevice as any);

    const payload = {
      agentVersion: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 7200,
      status: 'healthy',
      cpuPercent: 8.4,
      ramUsedMb: 5120,
      ramAvailMb: 11264,
      diskSummary: [{ letter: 'C:', freeGB: 120, totalGB: 500 }],
    };

    const rawBody = JSON.stringify(payload);
    const headers = createHmacHeaders(mockAgent.id, mockAgentSecret, rawBody);

    const response = await app.inject({
      method: 'POST',
      url: '/agent/heartbeat',
      headers,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.serverTime).toBeDefined();
  });

  it('Agent Metrics (POST /agent/metrics) with valid HMAC signature succeeds', async () => {
    vi.spyOn(db.agent, 'findUnique').mockResolvedValue(mockAgent as any);
    vi.spyOn(db.deviceMetric, 'create').mockResolvedValue({} as any);
    vi.spyOn(db.device, 'update').mockResolvedValue(mockDevice as any);

    const payload = {
      timestamp: new Date().toISOString(),
      uptimeSeconds: 7200,
      cpuPercent: 15.2,
      ramUsedMb: 6144,
      ramAvailMb: 10240,
      ramPercent: 37.5,
      volumes: [
        {
          letter: 'C:',
          label: 'Windows',
          fileSystem: 'NTFS',
          totalBytes: 500000000000,
          freeBytes: 250000000000,
          usedBytes: 250000000000,
          usedPercent: 50.0,
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const headers = createHmacHeaders(mockAgent.id, mockAgentSecret, rawBody);

    const response = await app.inject({
      method: 'POST',
      url: '/agent/metrics',
      headers,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('Agent Inventory (POST /agent/inventory) with valid HMAC signature updates specs', async () => {
    vi.spyOn(db.agent, 'findUnique').mockResolvedValue(mockAgent as any);
    vi.spyOn(db.deviceInventory, 'create').mockResolvedValue({} as any);
    vi.spyOn(db.device, 'update').mockResolvedValue(mockDevice as any);

    const payload = {
      identity: {
        hostname: 'DESKTOP-TEST-PC',
        system: {
          manufacturer: 'Gigabyte Technology Co., Ltd.',
          model: 'H510M H',
          serialNumber: 'Default string',
        },
        os: {
          caption: 'Microsoft Windows 11 Pro',
          version: '10.0.22631',
          buildNumber: '22631',
        },
      },
      hardware: {
        cpu: {
          name: '11th Gen Intel(R) Core(TM) i5-11400 @ 2.60GHz',
          cores: 6,
        },
        ram: {
          totalMb: 16384,
        },
      },
      network: {
        serverLatencyMs: 12,
      },
    };

    const rawBody = JSON.stringify(payload);
    const headers = createHmacHeaders(mockAgent.id, mockAgentSecret, rawBody);

    const response = await app.inject({
      method: 'POST',
      url: '/agent/inventory',
      headers,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.checksum).toBeDefined();
  });

  it('Agent Events (POST /agent/events) with valid HMAC signature processes events', async () => {
    vi.spyOn(db.agent, 'findUnique').mockResolvedValue(mockAgent as any);
    vi.spyOn(db.deviceEvent, 'findFirst').mockResolvedValue(null);
    vi.spyOn(db.deviceEvent, 'create').mockResolvedValue({} as any);

    const payload = [
      {
        timestamp: new Date().toISOString(),
        source: 'EventViewer',
        category: 'KernelPower',
        severity: 'CRITICAL',
        eventId: 41,
        title: 'System rebooted without cleanly shutting down first',
        dedupKey: 'EventViewer:KernelPower:41',
      },
    ];

    const rawBody = JSON.stringify(payload);
    const headers = createHmacHeaders(mockAgent.id, mockAgentSecret, rawBody);

    const response = await app.inject({
      method: 'POST',
      url: '/agent/events',
      headers,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.processed).toBe(1);
  });
});
