import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface RetentionCleanupReport {
  rawMetricsDeleted: number;
  heartbeatsDeleted: number;
  hourlyMetricsDeleted: number;
  dailyMetricsDeleted: number;
  eventsDeleted: number;
  inventoriesPruned: number;
  auditLogsDeleted: number;
  durationMs: number;
}

/**
 * Runs retention cleanup according to architectural retention policies:
 * - Raw Metrics: 7 days
 * - Raw Heartbeats: 7 days
 * - Hourly Metrics: 90 days
 * - Daily Metrics: 365 days
 * - Events: 90 days
 * - Device Inventories: keep only latest 30 snapshots per device
 * - Audit Logs: 365 days
 */
export async function runRetentionCleanup(): Promise<RetentionCleanupReport> {
  const startTime = Date.now();
  logger.info('Starting automated retention cleanup job');

  const now = Date.now();
  const cutoff7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const cutoff90Days = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const cutoff365Days = new Date(now - 365 * 24 * 60 * 60 * 1000);

  // 1. Delete raw metrics older than 7 days
  const metricsResult = await db.deviceMetric.deleteMany({
    where: {
      timestamp: {
        lt: cutoff7Days,
      },
    },
  });

  // 2. Delete raw heartbeats older than 7 days
  const heartbeatsResult = await db.agentHeartbeat.deleteMany({
    where: {
      timestamp: {
        lt: cutoff7Days,
      },
    },
  });

  // 3. Delete hourly rollups older than 90 days
  const hourlyResult = await db.deviceMetricHourly.deleteMany({
    where: {
      bucketHour: {
        lt: cutoff90Days,
      },
    },
  });

  // 4. Delete daily rollups older than 365 days
  const dailyResult = await db.deviceMetricDaily.deleteMany({
    where: {
      bucketDay: {
        lt: cutoff365Days,
      },
    },
  });

  // 5. Delete device events older than 90 days
  const eventsResult = await db.deviceEvent.deleteMany({
    where: {
      timestamp: {
        lt: cutoff90Days,
      },
    },
  });

  // 6. Prune device inventories (keep only latest 30 per device)
  let inventoriesPruned = 0;
  const devices = await db.device.findMany({
    select: { id: true },
  });

  for (const dev of devices) {
    const inventories = await db.deviceInventory.findMany({
      where: { deviceId: dev.id },
      select: { id: true },
      orderBy: { collectedAt: 'desc' },
      skip: 30, // skip the 30 latest
    });

    if (inventories.length > 0) {
      const idsToDelete = inventories.map((i) => i.id);
      const res = await db.deviceInventory.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      inventoriesPruned += res.count;
    }
  }

  // 7. Delete audit logs older than 365 days
  const auditLogsResult = await db.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoff365Days,
      },
    },
  });

  const durationMs = Date.now() - startTime;

  const report: RetentionCleanupReport = {
    rawMetricsDeleted: metricsResult.count,
    heartbeatsDeleted: heartbeatsResult.count,
    hourlyMetricsDeleted: hourlyResult.count,
    dailyMetricsDeleted: dailyResult.count,
    eventsDeleted: eventsResult.count,
    inventoriesPruned,
    auditLogsDeleted: auditLogsResult.count,
    durationMs,
  };

  logger.info(report, 'Retention cleanup job finished');
  return report;
}
