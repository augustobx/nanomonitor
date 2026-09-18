import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { generateTamperKey } from '../../lib/crypto.js';
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
        where: { tenantId, deviceId },
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

    // Existing pre-hardening devices may not have a tamper key yet.
    // Provision it with a conditional write so concurrent heartbeats cannot
    // generate two different credentials and leave the agent/server divergent.
    let effectiveTamperKey = device.tamperKey;
    if (device.tamperProtectionEnabled && !effectiveTamperKey) {
      const candidateKey = generateTamperKey();
      const generatedAt = new Date();

      await db.device.updateMany({
        where: {
          id: deviceId,
          tenantId,
          tamperKey: null,
          tamperProtectionEnabled: true,
        },
        data: {
          tamperKey: candidateKey,
          tamperKeyUpdatedAt: generatedAt,
        },
      });

      const authoritative = await db.device.findFirst({
        where: { id: deviceId, tenantId },
        select: { tamperKey: true },
      });
      effectiveTamperKey = authoritative?.tamperKey || null;
    }

    // Automatically sync agentVersion from live heartbeat telemetry
    if (agentVersion) {
      try {
        const cleanVer = agentVersion.replace(/^v/, '').trim();
        await db.agent.update({
          where: { id: agentId },
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

    return reply
      .header('Cache-Control', 'no-store')
      .status(200)
      .send({
        status: 'ok',
        serverTime: new Date().toISOString(),
        pendingActions: pendingActionsCount,
        tamperProtection: {
          enabled: device.tamperProtectionEnabled,
          key: device.tamperProtectionEnabled ? (effectiveTamperKey || null) : null,
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
    const { timestamp, uptimeSeconds, uptimeSecs, cpuPercent, ramUsedMb, ramAvailMb, volumes, thermal } = parsed.data;

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
        thermal: thermal ? (thermal as any) : undefined,
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

    // Evaluate CPU/RAM/thermal rules immediately from this fresh metric sample.
    evaluateDeviceAlerts(deviceId, tenantId).catch(() => {});

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
    const hasCollectionTime = typeof parsed.data.collectedAt === 'string';
    const collectedAt = hasCollectionTime ? new Date(parsed.data.collectedAt!) : new Date();

    const latestInventory = await db.deviceInventory.findFirst({
      where: { tenantId, deviceId },
      orderBy: { collectedAt: 'desc' },
    });

    // Buffered inventory may arrive after a newer live snapshot. Acknowledge it
    // without letting old state become authoritative.
    if (
      hasCollectionTime &&
      latestInventory &&
      collectedAt.getTime() <= latestInventory.collectedAt.getTime()
    ) {
      return reply.status(200).send({
        status: 'ok',
        stale: true,
        ignored: true,
        collectedAt: collectedAt.toISOString(),
      });
    }

    const identity = parsed.data.identity || {};
    const hardware =
      parsed.data.hardware !== undefined
        ? parsed.data.hardware
        : (latestInventory?.hardware || {});
    const network =
      parsed.data.network !== undefined
        ? parsed.data.network
        : (latestInventory?.network || {});
    const security =
      parsed.data.security !== undefined
        ? parsed.data.security
        : (latestInventory?.security || undefined);
    const storage =
      parsed.data.storage !== undefined
        ? parsed.data.storage
        : (latestInventory?.storage || undefined);
    const smart =
      parsed.data.smart !== undefined
        ? parsed.data.smart
        : (latestInventory?.smart || undefined);
    const windowsUpdate =
      parsed.data.windowsUpdate !== undefined
        ? parsed.data.windowsUpdate
        : (latestInventory?.windowsUpdate || undefined);
    const os =
      identity.os !== undefined
        ? identity.os
        : (latestInventory?.os || undefined);

    // Every accepted snapshot is complete by carrying forward sections that
    // were not part of a partial SMART/Windows Update report.
    const mergedSnapshot = {
      hardware,
      os,
      network,
      security,
      storage,
      smart,
      windowsUpdate,
    };
    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(mergedSnapshot))
      .digest('hex');

    await db.deviceInventory.create({
      data: {
        tenantId,
        deviceId,
        collectedAt,
        hardware: hardware as any,
        os: os as any,
        network: network as any,
        security: security as any,
        storage: storage as any,
        smart: smart as any,
        windowsUpdate: windowsUpdate as any,
        checksum,
      },
    });

    // Only fields actually present in this report may alter canonical device
    // identity/spec metadata.
    const deviceUpdates: any = {
      lastSeenAt: new Date(),
    };

    const incomingHardware: any = parsed.data.hardware;
    if (incomingHardware?.cpu?.name) deviceUpdates.cpuName = incomingHardware.cpu.name;
    if (incomingHardware?.cpu?.cores) deviceUpdates.cpuCores = incomingHardware.cpu.cores;
    if (incomingHardware?.ram?.totalMb) deviceUpdates.ramTotalMB = incomingHardware.ram.totalMb;
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

    // Hardware diffing is meaningful only when physical/general inventory was
    // actually collected, not for a partial SMART or Windows Update snapshot.
    if (
      parsed.data.hardware !== undefined ||
      parsed.data.network !== undefined ||
      parsed.data.storage !== undefined ||
      parsed.data.identity !== undefined
    ) {
      HardwareDiffer.evaluateHardwareChanges(tenantId, deviceId, {
        hardware,
        os,
        network,
        storage,
      }).catch((err) => {
        request.log.error({ err, deviceId }, 'Failed to evaluate hardware changes');
      });
    }

    return reply.status(200).send({
      status: 'ok',
      checksum,
      stale: false,
      collectedAt: collectedAt.toISOString(),
    });
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
    const hasCollectionTime = typeof parsed.data.collectedAt === 'string';
    const collectedAt = hasCollectionTime ? new Date(parsed.data.collectedAt!) : new Date();

    const latestSoftware = await db.softwareInventory.findFirst({
      where: { tenantId, deviceId },
      orderBy: { collectedAt: 'desc' },
      select: { collectedAt: true },
    });

    if (
      hasCollectionTime &&
      latestSoftware &&
      collectedAt.getTime() <= latestSoftware.collectedAt.getTime()
    ) {
      return reply.status(200).send({
        status: 'ok',
        stale: true,
        ignored: true,
        checksum,
      });
    }

    await db.softwareInventory.create({
      data: {
        tenantId,
        deviceId,
        collectedAt,
        software: items as any,
        checksum,
      },
    });

    if (changes && changes.length > 0) {
      await db.softwareChange.createMany({
        data: changes.map((change) => ({
          tenantId,
          deviceId,
          detectedAt: collectedAt,
          changeType: change.action as any,
          name: change.software.name,
          versionBefore: change.action === 'INSTALLED' ? null : (change.oldVersion || null),
          versionAfter: change.action === 'REMOVED' ? null : (change.software.version || null),
          publisher: change.software.publisher || null,
        })),
      });
    }

    await db.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });

    SoftwareComplianceService.evaluateSoftwareCompliance(tenantId, deviceId, items).catch((err) => {
      request.log.error({ err, deviceId }, 'Failed to evaluate software compliance');
    });

    return reply.status(200).send({
      status: 'ok',
      stale: false,
      checksum,
      recordedItems: items.length,
      recordedChanges: changes ? changes.length : 0,
      collectedAt: collectedAt.toISOString(),
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
          where: { tenantId, deviceId },
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
