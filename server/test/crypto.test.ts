import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  hashPassword,
  comparePassword,
  generateEnrollmentToken,
  generateAgentSecret,
  verifyAgentSignature,
  signUserAccessToken,
  verifyUserAccessToken,
} from '../src/lib/crypto.js';

describe('Cryptographic Utilities', () => {
  it('should hash and verify passwords with bcrypt', async () => {
    const password = 'SuperSecretPassword2026!';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);

    const isValid = await comparePassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await comparePassword('wrong-password', hash);
    expect(isInvalid).toBe(false);
  });

  it('should generate properly formatted enrollment tokens', () => {
    const token = generateEnrollmentToken();
    expect(token).toMatch(/^NL-ENRL-[A-F0-9]{32}$/);
  });

  it('should generate secure 64-hex-char agent secrets', () => {
    const secret = generateAgentSecret();
    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should verify HMAC-SHA256 signature matching Go agent implementation', () => {
    const agentSecret = 'b6d4c82e3f1a0987654321fedcba0987654321fedcba0987654321fedcba0987';
    const timestamp = '1726400000';
    const body = JSON.stringify({
      agentVersion: '0.1.0',
      uptimeSeconds: 3600,
      cpuPercent: 12.5,
    });

    // Simulating Go agent signature calculation:
    // bodyHash = sha256(body)
    // message = timestamp + "\n" + bodyHash
    // signature = hmac_sha256(message, secret)
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
    const message = `${timestamp}\n${bodyHash}`;
    const validSignature = crypto.createHmac('sha256', agentSecret).update(message).digest('hex');

    // Verification must succeed
    const isValid = verifyAgentSignature(body, timestamp, agentSecret, validSignature);
    expect(isValid).toBe(true);

    // Tampered body must fail
    const tamperedBody = JSON.stringify({
      agentVersion: '0.1.0',
      uptimeSeconds: 3600,
      cpuPercent: 99.9, // altered
    });
    expect(verifyAgentSignature(tamperedBody, timestamp, agentSecret, validSignature)).toBe(false);

    // Altered timestamp must fail
    expect(verifyAgentSignature(body, '1726400001', agentSecret, validSignature)).toBe(false);

    // Wrong secret must fail
    expect(
      verifyAgentSignature(
        body,
        timestamp,
        '0000000000000000000000000000000000000000000000000000000000000000',
        validSignature
      )
    ).toBe(false);

    // Bogus signature must fail
    expect(verifyAgentSignature(body, timestamp, agentSecret, 'badsignature1234567890abcdef')).toBe(false);
  });

  it('should sign and verify User JWT tokens with role and tenantId', () => {
    const payload = {
      userId: '11111111-2222-3333-4444-555555555555',
      tenantId: '66666666-7777-8888-9999-000000000000',
      email: 'admin@nanolabs.com.ar',
      role: 'ADMIN',
    };

    const token = signUserAccessToken(payload);
    expect(token).toBeDefined();

    const verified = verifyUserAccessToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(payload.userId);
    expect(verified?.tenantId).toBe(payload.tenantId);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.role).toBe(payload.role);

    // Malformed token must return null
    expect(verifyUserAccessToken('invalid.token.here')).toBeNull();
  });
});
