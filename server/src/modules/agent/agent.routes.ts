import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { db } from '../../lib/db.js';
import { authenticateAgent } from '../../middleware/agent-auth.js';
import {
  agentEventsSchema,
  agentHeartbeatSchema,
  agentInventorySchema,
  agentMetricsSchema,
} from '../../schemas/agent.schema.js';

export const agentRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Apply HMAC agent authentication to all /agent/* endpoints
  fastify.addHook('preHandler', authenticateAgent);

  // POST /agent/heartbeat
  fastify.post('/heartbeat', async (request, reply) => {
    const parsed = agentHeartbeatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid heartbeat payload',
        details: parsed.error.format(),
      });
    }

    const { agentId, deviceId, tenantId } = request.agent!;
    const { agentVersion, timestamp, uptimeSeconds, status, cpuPercent, ramUsedMb, ramAvailMb, diskSummary } =
      parsed.data;

    const eventDate = new Date(timestamp);

    // Save heartbeat in database
    await db.agentHeartbeat.create({
      data: {
        tenantId,
        deviceId,
        agentVersion,
        timestamp: isNaN(eventDate.getTime()) ? new Date() : eventDate,
        uptimeSeconds: BigInt(uptimeSeconds),
        status,
        cpuPercent,
        ramUsedMB: ramUsedMb,
        ramAvailMB: ramAvailMb,
        diskSummary: diskSummary || undefined,
      },
    });

    // Update device status and lastSeenAt
    await db.device.update({
      where: { id: deviceId },
      data: {
        status: 'ONLINE',
        lastSeenAt: new Date(),
      },
    });

    return reply.status(200).send({
      status: 'ok',
      serverTime: new Date().toISOString(),
    });
  });

  // POST /agent/metrics
  fastify.post('/metrics', async (request, reply) => {
    const parsed = agentMetricsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid metrics payload',
        details: parsed.error.format(),
      });
    }

    const { deviceId, tenantId } = request.agent!;
    const { timestamp, uptimeSeconds, uptimeSecs, cpuPercent, ramUsedMb, ramAvailMb, volumes } = parsed.data;

    const uptime = uptimeSeconds ?? uptimeSecs ?? 0;
    const eventDate = new Date(timestamp);

    await db.deviceMetric.create({
      data: {
        tenantId,
        deviceId,
        timestamp: isNaN(eventDate.getTime()) ? new Date() : eventDate,
        cpuPercent,
        ramUsedMB: ramUsedMb ?? null,
        ramAvailMB: ramAvailMb ?? null,
        volumes: volumes ? (volumes as any) : undefined,
        uptimeSeconds: BigInt(uptime),
      },
    });

    // Update device lastSeenAt
    await db.device.update({
      where: { id: deviceId },
      data: {
        lastSeenAt: new Date(),
      },
    });

    return reply.status(200).send({ status: 'ok' });
  });

  // POST /agent/inventory
  fastify.post('/inventory', async (request, reply) => {
    const parsed = agentInventorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid inventory payload',
        details: parsed.error.format(),
      });
    }

    const { deviceId, tenantId } = request.agent!;
    const rawBody = (request as any).rawBody || JSON.stringify(parsed.data);
    const checksum = crypto.createHash('sha256').update(rawBody).digest('hex');

    const identity = parsed.data.identity || {};
    const hardware = parsed.data.hardware || {};
    const network = parsed.data.network || {};

    // Store inventory snapshot
    await db.deviceInventory.create({
      data: {
        tenantId,
        deviceId,
        collectedAt: new Date(),
        hardware,
        os: identity.os || undefined,
        network,
        checksum,
      },
    });

    // Update Device specs in DB if available
    const deviceUpdates: any = {
      lastSeenAt: new Date(),
    };

    if (hardware.cpu?.name) deviceUpdates.cpuName = hardware.cpu.name;
    if (hardware.cpu?.cores) deviceUpdates.cpuCores = hardware.cpu.cores;
    if (hardware.ram?.totalMb) deviceUpdates.ramTotalMB = hardware.ram.totalMb;
    if (identity.os?.caption) deviceUpdates.osEdition = identity.os.caption;
    if (identity.os?.version) deviceUpdates.osVersion = identity.os.version;
    if (identity.os?.buildNumber) deviceUpdates.osBuild = identity.os.buildNumber;
    if (identity.system?.manufacturer) deviceUpdates.manufacturer = identity.system.manufacturer;
    if (identity.system?.model) deviceUpdates.model = identity.system.model;
    if (identity.system?.serialNumber) deviceUpdates.serialNumber = identity.system.serialNumber;

    await db.device.update({
      where: { id: deviceId },
      data: deviceUpdates,
    });

    return reply.status(200).send({ status: 'ok', checksum });
  });

  // POST /agent/events
  fastify.post('/events', async (request, reply) => {
    const parsed = agentEventsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid events payload',
        details: parsed.error.format(),
      });
    }

    const { deviceId, tenantId } = request.agent!;
    const eventsList = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    let processedCount = 0;

    for (const evt of eventsList) {
      const eventDate = new Date(evt.timestamp);

      // Check if duplicate event exists within the last 24h
      const existing = await db.deviceEvent.findFirst({
        where: {
          tenantId,
          deviceId,
          dedupKey: evt.dedupKey,
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (existing) {
        // Increment occurrences
        await db.deviceEvent.update({
          where: { id: existing.id },
          data: {
            occurrences: { increment: 1 },
            timestamp: isNaN(eventDate.getTime()) ? new Date() : eventDate,
          },
        });
      } else {
        // Insert new event
        await db.deviceEvent.create({
          data: {
            tenantId,
            deviceId,
            timestamp: isNaN(eventDate.getTime()) ? new Date() : eventDate,
            source: evt.source,
            category: evt.category,
            severity: evt.severity,
            eventId: evt.eventId || null,
            title: evt.title,
            description: evt.description || null,
            rawData: evt.rawData || undefined,
            dedupKey: evt.dedupKey,
            occurrences: 1,
          },
        });
      }

      processedCount++;
    }

    return reply.status(200).send({ status: 'ok', processed: processedCount });
  });
};
