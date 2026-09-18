import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';
import { verifyAgentSignature, verifyAgentSignatureV2 } from '../lib/crypto.js';
import { cacheService } from '../lib/redis.js';
import { db } from '../lib/db.js';

const HMAC_V2_REQUIRED_FROM = '1.4.1';

function versionAtLeast(value: string | null | undefined, minimum: string): boolean {
  const parse = (input: string | null | undefined): number[] | null => {
    if (!input) return null;
    const match = input.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };

  const current = parse(value);
  const required = parse(minimum);
  if (!current || !required) return false;

  for (let i = 0; i < 3; i++) {
    if (current[i] > required[i]) return true;
    if (current[i] < required[i]) return false;
  }
  return true;
}

export async function authenticateAgent(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('NanoAgent ')) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected NanoAgent <agentId>.<signature>',
    });
  }

  const credentials = authHeader.substring(10).trim();
  const dotIndex = credentials.indexOf('.');
  if (dotIndex <= 0) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Malformed credentials format. Expected agentId.signature',
    });
  }

  const agentId = credentials.substring(0, dotIndex);
  const signature = credentials.substring(dotIndex + 1);

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Malformed HMAC signature',
    });
  }

  const timestampHeader = request.headers['x-nano-timestamp'];
  const nonceHeader = request.headers['x-nano-nonce'];
  const signatureVersionHeader = request.headers['x-nano-signature-version'];

  if (!timestampHeader || !nonceHeader) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing required security headers: X-Nano-Timestamp and X-Nano-Nonce',
    });
  }

  const timestampStr = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  const nonce = Array.isArray(nonceHeader) ? nonceHeader[0] : nonceHeader;
  const signatureVersion = Array.isArray(signatureVersionHeader)
    ? signatureVersionHeader[0]
    : signatureVersionHeader;

  if (!/^\d{9,12}$/.test(timestampStr) || !/^[a-f0-9]{32}$/i.test(nonce)) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Malformed agent security headers',
    });
  }

  const timestamp = Number(timestampStr);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > config.AGENT_TIMESTAMP_DRIFT_SECS) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Request timestamp is invalid or beyond allowed clock drift window',
    });
  }

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      deviceId: true,
      tenantId: true,
      agentVersion: true,
      secretHash: true,
      status: true,
    },
  });

  if (!agent || agent.status !== 'ACTIVE') {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Agent not found, inactive or revoked',
    });
  }

  const rawBody = (request as any).rawBody || (request.body ? JSON.stringify(request.body) : '');
  const requestTarget = request.raw.url || request.url;
  let isValid = false;

  if (signatureVersion === '2') {
    isValid = verifyAgentSignatureV2(
      rawBody,
      request.method,
      requestTarget,
      timestampStr,
      nonce,
      agent.secretHash,
      signature
    );
  } else {
    // Transitional compatibility only for agents older than the hardened
    // release. Once an endpoint has reported >= 1.4.1 it can no longer fall
    // back to the weaker v1 signature.
    if (versionAtLeast(agent.agentVersion, HMAC_V2_REQUIRED_FROM)) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Agent must use HMAC signature v2',
      });
    }
    isValid = verifyAgentSignature(rawBody, timestampStr, agent.secretHash, signature);
  }

  if (!isValid) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid HMAC signature',
    });
  }

  // Consume the nonce only after the request has authenticated successfully.
  const isFreshNonce = await cacheService.checkAndSetNonce(`${agent.id}:${nonce}`, 600);
  if (!isFreshNonce) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Duplicate nonce detected (replay protection)',
    });
  }

  request.agent = {
    agentId: agent.id,
    deviceId: agent.deviceId,
    tenantId: agent.tenantId,
    agentVersion: agent.agentVersion,
  };
  request.tenantId = agent.tenantId;

  db.agent.update({
    where: { id: agent.id },
    data: { lastAuthAt: new Date() },
  }).catch(() => {
    // Non-blocking update failure
  });
}
