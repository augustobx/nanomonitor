import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateRandomString(bytesLength = 32): string {
  return crypto.randomBytes(bytesLength).toString('hex');
}

export function generateEnrollmentToken(): string {
  return `NL-ENRL-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

export function generateAgentSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashAgentSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function verifyAgentSecret(providedSecret: string, storedHash: string): boolean {
  const hash = hashAgentSecret(providedSecret);
  const hashBuf = Buffer.from(hash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (hashBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, storedBuf);
}

/**
 * Verifies HMAC-SHA256 signature produced by NanoAgent
 * Message format: timestamp + "\n" + sha256_hex(body)
 */
export function verifyAgentSignature(
  rawBody: string | Buffer,
  timestamp: string,
  secret: string,
  providedSignature: string
): boolean {
  try {
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const message = `${timestamp}\n${bodyHash}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const providedBuf = Buffer.from(providedSignature, 'hex');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

/**
 * HMAC v2 binds the signature to the exact request semantics, preventing a
 * captured signature from being replayed against another endpoint or with a
 * replacement nonce.
 *
 * Message:
 * v2 + "\n" + METHOD + "\n" + requestTarget + "\n" + timestamp +
 * "\n" + nonce + "\n" + sha256_hex(body)
 */
export function verifyAgentSignatureV2(
  rawBody: string | Buffer,
  method: string,
  requestTarget: string,
  timestamp: string,
  nonce: string,
  secret: string,
  providedSignature: string
): boolean {
  try {
    if (!/^[a-f0-9]{64}$/i.test(providedSignature)) return false;

    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const message = [
      'v2',
      method.toUpperCase(),
      requestTarget,
      timestamp,
      nonce,
      bodyHash,
    ].join('\n');

    const expectedSignature = crypto.createHmac('sha256', secret).update(message).digest('hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const providedBuf = Buffer.from(providedSignature, 'hex');

    return (
      expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf)
    );
  } catch {
    return false;
  }
}

export interface UserJwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

export function signUserAccessToken(payload: UserJwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyUserAccessToken(token: string): UserJwtPayload | null {
  try {
    return jwt.verify(token, config.JWT_SECRET) as UserJwtPayload;
  } catch {
    return null;
  }
}
