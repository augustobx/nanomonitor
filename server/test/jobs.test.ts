import { describe, it, expect, vi, afterEach } from 'vitest';
import { db } from '../src/lib/db.js';
import { aggregateHourlyMetrics } from '../src/jobs/metric-aggregator.js';
import { aggregateDailyMetrics } from '../src/jobs/daily-aggregator.js';
import { runRetentionCleanup } from '../src/jobs/retention-cleanup.js';
import { getISOWeekRange, generateUpcomingPartitions } from '../src/jobs/partition-creator.js';

describe('Database & Retention Jobs (F3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Hourly Metric Aggregator', () => {
    it('should aggregate raw metrics into hourly averages and maximums', async () => {
      const tenantId = 't0000000-0000-0000-0000-000000000001';
      const deviceId = 'd0000000-0000-0000-0000-000000000001';
      const targetHour = new Date('2026-09-15T14:00:00.000Z');

      const mockRawMetrics = [
        {
          tenantId,
          deviceId,
          cpuPercent: 20.0,
          ramUsedMB: 4000,
          ramAvailMB: 12000,
          volumes: [{ letter: 'C:', usedGB: 100 }],
          timestamp: new Date('2026-09-15T14:05:00.000Z'),
        },
        {
          tenantId,
          deviceId,
          cpuPercent: 40.0,
          ramUsedMB: 6000,
          ramAvailMB: 10000,
          volumes: [{ letter: 'C:', usedGB: 102 }],
          timestamp: new Date('2026-09-15T14:35:00.000Z'),
        },
        {
          tenantId,
          deviceId,
          cpuPercent: 60.0,
          ramUsedMB: 8000,
          ramAvailMB: 8000,
          volumes: [{ letter: 'C:', usedGB: 105 }],
          timestamp: new Date('2026-09-15T14:55:00.000Z'),
        },
      ];

      vi.spyOn(db.deviceMetric, 'findMany').mockResolvedValue(mockRawMetrics as any);
      const upsertSpy = vi.spyOn(db.deviceMetricHourly, 'upsert').mockResolvedValue({} as any);

      const result = await aggregateHourlyMetrics(targetHour);

      expect(result.processedCount).toBe(3);
      expect(result.devicesAggregated).toBe(1);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      const upsertArgs = upsertSpy.mock.calls[0][0];

      // Average CPU: (20 + 40 + 60) / 3 = 40.0
      // Max CPU: 60.0
      // Average RAM: (4000 + 6000 + 8000) / 3 = 6000
      // Max RAM: 8000
      expect(upsertArgs.create.cpuAvg).toBe(40.0);
      expect(upsertArgs.create.cpuMax).toBe(60.0);
      expect(upsertArgs.create.ramAvgMB).toBe(6000);
      expect(upsertArgs.create.ramMaxMB).toBe(8000);
      expect(upsertArgs.create.sampleCount).toBe(3);
    });

    it('should return 0 processed if no raw metrics found', async () => {
      vi.spyOn(db.deviceMetric, 'findMany').mockResolvedValue([]);
      const result = await aggregateHourlyMetrics(new Date());

      expect(result.processedCount).toBe(0);
      expect(result.devicesAggregated).toBe(0);
    });
  });

  describe('Daily Metric Aggregator', () => {
    it('should aggregate 24 hourly buckets into daily summaries with weighted averages', async () => {
      const tenantId = 't0000000-0000-0000-0000-000000000001';
      const deviceId = 'd0000000-0000-0000-0000-000000000001';
      const targetDay = new Date('2026-09-14T00:00:00.000Z');

      const mockHourlyRecords = [
        {
          tenantId,
          deviceId,
          bucketHour: new Date('2026-09-14T02:00:00.000Z'),
          cpuAvg: 20.0,
          cpuMax: 35.0,
          ramAvgMB: 4000,
          ramMaxMB: 4500,
          volumeSnapshots: null,
          sampleCount: 10,
        },
        {
          tenantId,
          deviceId,
          bucketHour: new Date('2026-09-14T14:00:00.000Z'),
          cpuAvg: 50.0,
          cpuMax: 85.0,
          ramAvgMB: 6000,
          ramMaxMB: 7500,
          volumeSnapshots: [{ letter: 'C:', usedGB: 110 }],
          sampleCount: 20,
        },
      ];

      vi.spyOn(db.deviceMetricHourly, 'findMany').mockResolvedValue(mockHourlyRecords as any);
      const upsertSpy = vi.spyOn(db.deviceMetricDaily, 'upsert').mockResolvedValue({} as any);

      const result = await aggregateDailyMetrics(targetDay);

      expect(result.devicesAggregated).toBe(1);
      expect(result.totalHourlyBuckets).toBe(2);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      const upsertArgs = upsertSpy.mock.calls[0][0];

      // Weighted CPU avg: (20 * 10 + 50 * 20) / (10 + 20) = (200 + 1000) / 30 = 40.0
      // Max CPU: max(35, 85) = 85.0
      // Total samples: 10 + 20 = 30
      expect(upsertArgs.create.cpuAvg).toBe(40.0);
      expect(upsertArgs.create.cpuMax).toBe(85.0);
      expect(upsertArgs.create.sampleCount).toBe(30);
    });
  });

  describe('Retention Cleanup Job', () => {
    it('should delete expired raw metrics, heartbeats, events and prune inventories to 30', async () => {
      vi.spyOn(db.deviceMetric, 'deleteMany').mockResolvedValue({ count: 1500 });
      vi.spyOn(db.agentHeartbeat, 'deleteMany').mockResolvedValue({ count: 900 });
      vi.spyOn(db.deviceMetricHourly, 'deleteMany').mockResolvedValue({ count: 50 });
      vi.spyOn(db.deviceMetricDaily, 'deleteMany').mockResolvedValue({ count: 10 });
      vi.spyOn(db.deviceEvent, 'deleteMany').mockResolvedValue({ count: 25 });
      vi.spyOn(db.auditLog, 'deleteMany').mockResolvedValue({ count: 5 });

      // Simulate device with 35 inventories (should prune 5 oldest)
      vi.spyOn(db.device, 'findMany').mockResolvedValue([{ id: 'dev-1' }] as any);
      vi.spyOn(db.deviceInventory, 'findMany').mockResolvedValue([
        { id: 'inv-31' },
        { id: 'inv-32' },
        { id: 'inv-33' },
        { id: 'inv-34' },
        { id: 'inv-35' },
      ] as any);
      vi.spyOn(db.deviceInventory, 'deleteMany').mockResolvedValue({ count: 5 });

      const report = await runRetentionCleanup();

      expect(report.rawMetricsDeleted).toBe(1500);
      expect(report.heartbeatsDeleted).toBe(900);
      expect(report.hourlyMetricsDeleted).toBe(50);
      expect(report.dailyMetricsDeleted).toBe(10);
      expect(report.eventsDeleted).toBe(25);
      expect(report.inventoriesPruned).toBe(5);
      expect(report.auditLogsDeleted).toBe(5);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Partition Creator & ISO Week Helper', () => {
    it('should accurately calculate Monday-to-Monday week ranges', () => {
      // 2026-09-15 is a Tuesday
      const tuesday = new Date('2026-09-15T15:30:00.000Z');
      const { year, week, start, end } = getISOWeekRange(tuesday);

      expect(year).toBe(2026);
      expect(week).toBe(38);
      // Monday of that week is 2026-09-14
      expect(start.toISOString().split('T')[0]).toBe('2026-09-14');
      // Next Monday is 2026-09-21
      expect(end.toISOString().split('T')[0]).toBe('2026-09-21');
    });

    it('should generate upcoming partition definitions for metrics and heartbeats', () => {
      const partitions = generateUpcomingPartitions(2);

      // Current week + 2 weeks ahead = 3 weeks * 2 tables = 6 partitions
      expect(partitions).toHaveLength(6);

      const metricPartitions = partitions.filter((p) => p.tableName === 'device_metrics_partitioned');
      const heartbeatPartitions = partitions.filter((p) => p.tableName === 'agent_heartbeats_partitioned');

      expect(metricPartitions).toHaveLength(3);
      expect(heartbeatPartitions).toHaveLength(3);

      for (const p of metricPartitions) {
        expect(p.name).toMatch(/^device_metrics_\d{4}_w\d{2}$/);
        expect(p.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(p.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });
});
