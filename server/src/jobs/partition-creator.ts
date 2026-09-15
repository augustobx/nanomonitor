import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface PartitionDefinition {
  name: string;
  tableName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Calculates start and end dates (Monday to Monday) for a given date's ISO week.
 */
export function getISOWeekRange(date: Date): { year: number; week: number; start: Date; end: Date } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1 = Monday, 7 = Sunday
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  // Get Monday of this week
  const monday = new Date(date);
  const currentDay = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (currentDay - 1));
  monday.setUTCHours(0, 0, 0, 0);

  // Next Monday
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  return {
    year: d.getUTCFullYear(),
    week: weekNo,
    start: monday,
    end: nextMonday,
  };
}

/**
 * Generates partition definitions for device_metrics and agent_heartbeats
 * for the current week and up to `weeksAhead` in the future.
 */
export function generateUpcomingPartitions(weeksAhead = 2): PartitionDefinition[] {
  const partitions: PartitionDefinition[] = [];
  const baseDate = new Date();

  for (let i = 0; i <= weeksAhead; i++) {
    const targetDate = new Date(baseDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const { year, week, start, end } = getISOWeekRange(targetDate);
    const weekStr = week.toString().padStart(2, '0');
    const startIso = start.toISOString().split('T')[0];
    const endIso = end.toISOString().split('T')[0];

    // Partition for device_metrics
    partitions.push({
      name: `device_metrics_${year}_w${weekStr}`,
      tableName: 'device_metrics_partitioned',
      startDate: startIso,
      endDate: endIso,
    });

    // Partition for agent_heartbeats
    partitions.push({
      name: `agent_heartbeats_${year}_w${weekStr}`,
      tableName: 'agent_heartbeats_partitioned',
      startDate: startIso,
      endDate: endIso,
    });
  }

  return partitions;
}

/**
 * Ensures upcoming weekly partitions exist in PostgreSQL database.
 */
export async function ensurePartitionsExist(weeksAhead = 2): Promise<string[]> {
  const upcoming = generateUpcomingPartitions(weeksAhead);
  const created: string[] = [];

  for (const p of upcoming) {
    try {
      const sql = `CREATE TABLE IF NOT EXISTS "${p.name}" PARTITION OF "${p.tableName}" FOR VALUES FROM ('${p.startDate}') TO ('${p.endDate}');`;
      await db.$executeRawUnsafe(sql);
      created.push(p.name);
      logger.debug({ partition: p.name, from: p.startDate, to: p.endDate }, 'Partition verified/created');
    } catch (err: any) {
      // If table doesn't exist yet (e.g. standard prisma table before raw partition migration), log and continue
      logger.warn({ partition: p.name, error: err.message }, 'Could not execute partition DDL (table might not be partitioned yet)');
      created.push(p.name);
    }
  }

  logger.info({ totalPartitions: created.length }, 'Upcoming weekly partitions checked');
  return created;
}
