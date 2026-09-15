import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { cacheService } from '../src/lib/redis.js';

describe('Server & Endpoints Lifecycle', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await cacheService.disconnect();
  });

  it('GET /health should return 200 with service info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('nanolabs-control-center-api');
    expect(body.timestamp).toBeDefined();
  });

  it('CacheService should prevent nonce replay', async () => {
    const nonce = 'test-nonce-1234567890abcdef';

    // First check should succeed
    const firstCheck = await cacheService.checkAndSetNonce(nonce, 60);
    expect(firstCheck).toBe(true);

    // Second check with same nonce must be rejected (replay attack)
    const secondCheck = await cacheService.checkAndSetNonce(nonce, 60);
    expect(secondCheck).toBe(false);
  });

  it('Agent telemetry endpoint /agent/heartbeat should reject request without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agent/heartbeat',
      payload: {
        agentVersion: '0.1.0',
        timestamp: new Date().toISOString(),
        uptimeSeconds: 120,
        status: 'healthy',
        cpuPercent: 10,
        ramUsedMb: 4000,
        ramAvailMb: 8000,
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
  });

  it('Protected user endpoint /api/v1/devices should reject unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
  });

  it('Protected user endpoint /api/v1/tenants should reject unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants',
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /enrollment/register should reject empty/invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/enrollment/register',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Bad Request');
  });
});
