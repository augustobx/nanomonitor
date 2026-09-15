import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface DailyAggregationResult {
  bucketDay: Date;
  devicesAggregated: number;
  totalHourlyBuckets: number;
}

/**
 * Aggregates DeviceMetricHourly records into DeviceMetricDaily for long-term retention.
 * @param targetDay Specific day to aggregate (defaults to yesterday)
 */
export async function aggregateDailyMetrics(targetDay?: Date): Promise<DailyAggregationResult> {
  const date = targetDay ? new Date(targetDay) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Truncate to start of day (00:00:00.000 UTC)
  date.setUTCHours(0, 0, 0, 0);
  const bucketDay = new Date(date);

  const nextDay = new Date(bucketDay.getTime() + 24 * 60 * 60 * 1000);

  logger.info({ bucketDay: bucketDay.toISOString() }, 'Starting daily metric aggregation');

  const hourlyRecords = await db.deviceMetricHourly.findMany({
    where: {
      bucketHour: {
        gte: bucketDay,
        lt: nextDay,
      },
    },
    orderBy: {
      bucketHour: 'asc',
    },
  });

  if (hourlyRecords.length === 0) {
    logger.info({ bucketDay: bucketDay.toISOString() }, 'No hourly metrics found for this day');
    return { bucketDay, devicesAggregated: 0, totalHourlyBuckets: 0 };
  }

  type DailyGroup = {
    tenantId: string;
    deviceId: string;
    cpuAvgs: { avg: number; weight: number }[];
    cpuMaxes: number[];
    ramAvgs: { avg: number; weight: number }[];
    ramMaxes: number[];
    latestVolumes: any;
    totalSamples: number;
  };

  const groups = new Map<string, DailyGroup>();

  for (const record of hourlyRecords) {
    const key = `${record.tenantId}:${record.deviceId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        tenantId: record.tenantId,
        deviceId: record.deviceId,
        cpuAvgs: [],
        cpuMaxes: [],
        ramAvgs: [],
        ramMaxes: [],
        latestVolumes: null,
        totalSamples: 0,
      };
      groups.set(key, group);
    }

    const weight = record.sampleCount || 1;
    group.totalSamples += weight;

    if (record.cpuAvg !== null) {
      group.cpuAvgs.push({ avg: record.cpuAvg, weight });
    }
    if (record.cpuMax !== null) {
      group.cpuMaxes.push(record.cpuMax);
    }
    if (record.ramAvgMB !== null) {
      group.ramAvgs.push({ avg: record.ramAvgMB, weight });
    }
    if (record.ramMaxMB !== null) {
      group.ramMaxes.push(record.ramMaxMB);
    }
    if (record.volumeSnapshots) {
      group.latestVolumes = record.volumeSnapshots;
    }
  }

  let aggregatedCount = 0;

  for (const group of groups.values()) {
    if (group.totalSamples === 0) continue;

    // Weighted CPU average
    const totalCpuWeight = group.cpuAvgs.reduce((sum, item) => sum + item.weight, 0);
    const cpuAvg =
      totalCpuWeight > 0
        ? Math.round((group.cpuAvgs.reduce((sum, item) => sum + item.avg * item.weight, 0) / totalCpuWeight) * 10) / 10
        : null;

    const cpuMax = group.cpuMaxes.length > 0 ? Math.round(Math.max(...group.cpuMaxes) * 10) / 10 : null;

    // Weighted RAM average
    const totalRamWeight = group.ramAvgs.reduce((sum, item) => sum + item.weight, 0);
    const ramAvgMB =
      totalRamWeight > 0
        ? Math.round(group.ramAvgs.reduce((sum, item) => sum + item.avg * item.weight, 0) / totalRamWeight)
        : null;

    const ramMaxMB = group.ramMaxes.length > 0 ? Math.max(...group.ramMaxes) : null;

    await db.deviceMetricDaily.upsert({
      where: {
        tenantId_deviceId_bucketDay: {
          tenantId: group.tenantId,
          deviceId: group.deviceId,
          bucketDay,
        },
      },
      create: {
        tenantId: group.tenantId,
        deviceId: group.deviceId,
        bucketDay,
        cpuAvg,
        cpuMax,
        ramAvgMB,
        ramMaxMB,
        volumeSnapshots: group.latestVolumes ? group.latestVolumes : undefined,
        sampleCount: group.totalSamples,
      },
      update: {
        cpuAvg,
        cpuMax,
        ramAvgMB,
        ramMaxMB,
        volumeSnapshots: group.latestVolumes ? group.latestVolumes : undefined,
        sampleCount: group.totalSamples,
      },
    });

    aggregatedCount++;
  }

  logger.info(
    { bucketDay: bucketDay.toISOString(), devicesAggregated: aggregatedCount, hourlyBuckets: hourlyRecords.length },
    'Daily metric aggregation completed successfully'
  );

  return {
    bucketDay,
    devicesAggregated: aggregatedCount,
    totalHourlyBuckets: hourlyRecords.length,
  };
}
