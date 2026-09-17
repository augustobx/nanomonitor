import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { db } from '../../lib/db.js';
import { authenticateAgent } from '../../middleware/agent-auth.js';
import { evaluateDeviceAlerts } from '../alerts/alert-evaluator.js';
import { HardwareDiffer } from '../inventory/hardware-differ.js';
import { SoftwareComplianceService } from '../inventory/software-compliance.service.js';
import {
  agentEventsSchema,
  agentHeartbeatSchema,
  agentInventorySchema,
  agentMetricsSchema,
  agentSoftwareSchema,
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
    const { agentVersion, timestamp, uptimeSeconds, status, cpuPercent, ramUsedMb, ramAvailMb, diskSummary, security } =
      parsed.data;

    const eventDate = new Date(timestamp);

    // Save heartbeat in database
    await db.agentHeartbeat.create({
      data: {
        tenantId,
        deviceId,
        agentVersion,
        timestamp: isNaN(eventDate.getTime()) ? new Date() : eventDate,
        uptimeSeconds: BigInt(uptimeSeconds ?? 0),
        status,
        cpuPercent: cpuPercent ?? 0,
        ramUsedMB: ramUsedMb ?? 0,
        ramAvailMB: ramAvailMb ?? 0,
        diskSummary: diskSummary || undefined,
      },
    });

    // If lightweight security posture is included in heartbeat, persist to latest device inventory
    if (security) {
      const latestInv = await db.deviceInventory.findFirst({
        where: { deviceId },
        orderBy: { collectedAt: 'desc' },
      });

      if (latestInv) {
        await db.deviceInventory.update({
          where: { id: latestInv.id },
          data: {
            security: security as any,
          },
        });
      } else {
        await db.deviceInventory.create({
          data: {
            tenantId,
            deviceId,
            collectedAt: new Date(),
            hardware: {},
            network: {},
            security: security as any,
            checksum: 'security-hb-' + Date.now(),
          },
        });
      }

      // Re-evaluate alert rules with security state
      evaluateDeviceAlerts(deviceId, tenantId).catch(() => {});
    }

    // Update device status and lastSeenAt
    const device = await db.device.update({
      where: { id: deviceId },
      data: {
        status: 'ONLINE',
        lastSeenAt: new Date(),
      },
      select: {
        tamperProtectionEnabled: true,
        tamperKey: true,
      },
    });

    // Automatically sync agentVersion from live heartbeat telemetry
    if (agentVersion) {
      try {
        const cleanVer = agentVersion.replace(/^v/, '').trim();
        await db.agent.updateMany({
          where: { deviceId },
          data: {
            agentVersion: cleanVer,
            lastAuthAt: new Date(),
          },
        });
      } catch (err) {
        request.log.warn({ err }, 'Failed to sync agent version in heartbeat');
      }
    }

    // Check for pending actions as heartbeat piggybacking fallback (non-blocking)
    let pendingActionsCount = 0;
    try {
      pendingActionsCount = await db.remoteAction.count({
        where: {
          deviceId,
          tenantId,
          status: { in: ['PENDING', 'QUEUED'] },
          expiresAt: { gt: new Date() },
        },
      });
    } catch {
      // Non-blocking fallback
    }

    return reply.status(200).send({
      status: 'ok',
      serverTime: new Date().toISOString(),
      pendingActions: pendingActionsCount,
      tamperProtection: {
        enabled: device.tamperProtectionEnabled,
        key: device.tamperKey || null,
      },
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
    const security = parsed.data.security || undefined;
    const storage = parsed.data.storage || undefined;
    const windowsUpdate = parsed.data.windowsUpdate || undefined;

    // Store inventory snapshot
    await db.deviceInventory.create({
      data: {
        tenantId,
        deviceId,
        collectedAt: new Date(),
        hardware,
        os: identity.os || undefined,
        network,
        security,
        storage,
        windowsUpdate,
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

    // Evaluate hardware changes & detect physical tampering (e.g. RAM reduction)
    HardwareDiffer.evaluateHardwareChanges(tenantId, deviceId, {
      hardware,
      os: identity.os || undefined,
      network,
      storage,
    }).catch((err) => {
      request.log.error({ err, deviceId }, 'Failed to evaluate hardware changes');
    });

    return reply.status(200).send({ status: 'ok', checksum });
  });

  // POST /agent/software
  fastify.post('/software', async (request, reply) => {
    const parsed = agentSoftwareSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid software payload',
        details: parsed.error.format(),
      });
    }

    const { deviceId, tenantId } = request.agent!;
    const { checksum, items, changes } = parsed.data;

    // Store software snapshot
    await db.softwareInventory.create({
      data: {
        tenantId,
        deviceId,
        collectedAt: new Date(),
        software: items as any,
        checksum,
      },
    });

    // Store software delta changes if present
    if (changes && changes.length > 0) {
      const now = new Date();
      await db.softwareChange.createMany({
        data: changes.map((c) => ({
          tenantId,
          deviceId,
          detectedAt: now,
          changeType: c.action as any, // INSTALLED | REMOVED | UPDATED
          name: c.software.name,
          versionBefore: c.action === 'INSTALLED' ? null : (c.oldVersion || null),
          versionAfter: c.action === 'REMOVED' ? null : (c.software.version || null),
          publisher: c.software.publisher || null,
        })),
      });
    }

    // Update device lastSeenAt
    await db.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });

    // Check for unauthorized / blacklisted software violations
    SoftwareComplianceService.evaluateSoftwareCompliance(tenantId, deviceId, items).catch((err) => {
      request.log.error({ err, deviceId }, 'Failed to evaluate software compliance');
    });

    return reply.status(200).send({
      status: 'ok',
      checksum,
      recordedItems: items.length,
      recordedChanges: changes ? changes.length : 0,
    });
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

      // If this is a security state transition event, instantly reflect in deviceInventory security snapshot
      if (evt.category === 'Security' && evt.rawData) {
        const raw = evt.rawData as any;
        const latestInv = await db.deviceInventory.findFirst({
          where: { deviceId },
          orderBy: { collectedAt: 'desc' },
        });
        if (latestInv && latestInv.security) {
          const currentSec = { ...(latestInv.security as any) };
          if (raw.component === 'antivirus') {
            const isEnabled = raw.currentState === 'enabled';
            currentSec.defenderActive = isEnabled;
            if (Array.isArray(currentSec.antivirusList)) {
              currentSec.antivirusList.forEach((a: any) => { a.enabled = isEnabled; });
            }
          } else if (raw.component === 'firewall') {
            const isEnabled = raw.currentState === 'enabled';
            if (currentSec.firewallProfiles && raw.profile) {
              currentSec.firewallProfiles[raw.profile] = isEnabled;
            }
          }
          await db.deviceInventory.update({
            where: { id: latestInv.id },
            data: { security: currentSec },
          });
        }
      }

      processedCount++;
    }

    // Trigger alert evaluation asynchronously for this device
    evaluateDeviceAlerts(deviceId, tenantId).catch(() => {});

    return reply.status(200).send({ status: 'ok', processed: processedCount });
  });
};
