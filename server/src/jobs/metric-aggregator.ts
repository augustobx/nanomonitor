import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface HourlyAggregationResult {
  bucketHour: Date;
  processedCount: number;
  devicesAggregated: number;
}

/**
 * Aggregates raw DeviceMetric records into DeviceMetricHourly.
 * @param targetHour Specific hour to aggregate (defaults to previous full hour)
 */
export async function aggregateHourlyMetrics(targetHour?: Date): Promise<HourlyAggregationResult> {
  const date = targetHour ? new Date(targetHour) : new Date(Date.now() - 60 * 60 * 1000);
  
  // Truncate to start of hour
  date.setMinutes(0, 0, 0);
  const bucketHour = new Date(date);
  
  const nextHour = new Date(bucketHour.getTime() + 60 * 60 * 1000);

  logger.info({ bucketHour: bucketHour.toISOString() }, 'Starting hourly metric aggregation');

  // Fetch all raw metrics within this hour window
  const rawMetrics = await db.deviceMetric.findMany({
    where: {
      timestamp: {
        gte: bucketHour,
        lt: nextHour,
      },
    },
    select: {
      tenantId: true,
      deviceId: true,
      cpuPercent: true,
      ramUsedMB: true,
      ramAvailMB: true,
      volumes: true,
      timestamp: true,
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  if (rawMetrics.length === 0) {
    logger.info({ bucketHour: bucketHour.toISOString() }, 'No raw metrics found for this hour');
    return { bucketHour, processedCount: 0, devicesAggregated: 0 };
  }

  // Group by tenantId + deviceId
  type DeviceGroup = {
    tenantId: string;
    deviceId: string;
    cpuSamples: number[];
    ramUsedSamples: number[];
    latestVolumes: any;
  };

  const groups = new Map<string, DeviceGroup>();

  for (const metric of rawMetrics) {
    const key = `${metric.tenantId}:${metric.deviceId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        tenantId: metric.tenantId,
        deviceId: metric.deviceId,
        cpuSamples: [],
        ramUsedSamples: [],
        latestVolumes: null,
      };
      groups.set(key, group);
    }

    if (metric.cpuPercent !== null && metric.cpuPercent !== undefined) {
      group.cpuSamples.push(metric.cpuPercent);
    }
    if (metric.ramUsedMB !== null && metric.ramUsedMB !== undefined) {
      group.ramUsedSamples.push(metric.ramUsedMB);
    }
    if (metric.volumes) {
      group.latestVolumes = metric.volumes;
    }
  }

  let processedCount = 0;

  for (const group of groups.values()) {
    const sampleCount = group.cpuSamples.length;
    if (sampleCount === 0) continue;

    const cpuSum = group.cpuSamples.reduce((a, b) => a + b, 0);
    const cpuAvg = Math.round((cpuSum / sampleCount) * 10) / 10;
    const cpuMax = Math.round(Math.max(...group.cpuSamples) * 10) / 10;

    const ramAvgMB =
      group.ramUsedSamples.length > 0
        ? Math.round(group.ramUsedSamples.reduce((a, b) => a + b, 0) / group.ramUsedSamples.length)
        : null;
    const ramMaxMB =
      group.ramUsedSamples.length > 0 ? Math.max(...group.ramUsedSamples) : null;

    await db.deviceMetricHourly.upsert({
      where: {
        tenantId_deviceId_bucketHour: {
          tenantId: group.tenantId,
          deviceId: group.deviceId,
          bucketHour,
        },
      },
      create: {
        tenantId: group.tenantId,
        deviceId: group.deviceId,
        bucketHour,
        cpuAvg,
        cpuMax,
        ramAvgMB,
        ramMaxMB,
        volumeSnapshots: group.latestVolumes ? group.latestVolumes : undefined,
        sampleCount,
      },
      update: {
        cpuAvg,
        cpuMax,
        ramAvgMB,
        ramMaxMB,
        volumeSnapshots: group.latestVolumes ? group.latestVolumes : undefined,
        sampleCount,
      },
    });

    processedCount++;
  }

  logger.info(
    { bucketHour: bucketHour.toISOString(), devicesAggregated: processedCount, totalRaw: rawMetrics.length },
    'Hourly metric aggregation completed successfully'
  );

  return {
    bucketHour,
    processedCount: rawMetrics.length,
    devicesAggregated: processedCount,
  };
}
