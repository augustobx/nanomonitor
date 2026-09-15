import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';
import { verifyAgentSignature } from '../lib/crypto.js';
import { cacheService } from '../lib/redis.js';
import { db } from '../lib/db.js';

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
  if (dotIndex === -1) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Malformed credentials format. Expected agentId.signature',
    });
  }

  const agentId = credentials.substring(0, dotIndex);
  const signature = credentials.substring(dotIndex + 1);

  const timestampHeader = request.headers['x-nano-timestamp'];
  const nonceHeader = request.headers['x-nano-nonce'];

  if (!timestampHeader || !nonceHeader) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing required security headers: X-Nano-Timestamp and X-Nano-Nonce',
    });
  }

  const timestampStr = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  const nonce = Array.isArray(nonceHeader) ? nonceHeader[0] : nonceHeader;

  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);

  if (isNaN(timestamp) || Math.abs(now - timestamp) > config.AGENT_TIMESTAMP_DRIFT_SECS) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Request timestamp is invalid or beyond allowed clock drift window',
    });
  }

  // Check and consume nonce to prevent replay attacks
  const isFreshNonce = await cacheService.checkAndSetNonce(nonce, 600);
  if (!isFreshNonce) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Duplicate or expired nonce detected (replay protection)',
    });
  }

  // Lookup agent
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

  // Verify HMAC signature
  const rawBody = (request as any).rawBody || (request.body ? JSON.stringify(request.body) : '');
  const isValid = verifyAgentSignature(rawBody, timestampStr, agent.secretHash, signature);

  if (!isValid) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid HMAC signature',
    });
  }

  // Set request context
  request.agent = {
    agentId: agent.id,
    deviceId: agent.deviceId,
    tenantId: agent.tenantId,
    agentVersion: agent.agentVersion,
  };
  request.tenantId = agent.tenantId;

  // Asynchronously record lastAuthAt
  db.agent.update({
    where: { id: agent.id },
    data: { lastAuthAt: new Date() },
  }).catch(() => {
    // Non-blocking update failure
  });
}
