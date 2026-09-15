import { aggregateHourlyMetrics } from './metric-aggregator.js';
import { aggregateDailyMetrics } from './daily-aggregator.js';
import { runRetentionCleanup } from './retention-cleanup.js';
import { ensurePartitionsExist } from './partition-creator.js';
import { db } from '../lib/db.js';
import { cacheService } from '../lib/redis.js';

async function main() {
  const task = process.argv[2] || 'all';

  console.log(`[JobRunner] Executing task: ${task}`);

  try {
    switch (task) {
      case 'hourly':
        await aggregateHourlyMetrics();
        break;
      case 'daily':
        await aggregateDailyMetrics();
        break;
      case 'cleanup':
        await runRetentionCleanup();
        break;
      case 'partitions':
        await ensurePartitionsExist(2);
        break;
      case 'all':
        console.log('--- 1. Partitions ---');
        await ensurePartitionsExist(2);
        console.log('--- 2. Hourly Metrics ---');
        await aggregateHourlyMetrics();
        console.log('--- 3. Daily Metrics ---');
        await aggregateDailyMetrics();
        console.log('--- 4. Retention Cleanup ---');
        await runRetentionCleanup();
        break;
      default:
        console.error(`Unknown job task: ${task}. Valid options: hourly, daily, cleanup, partitions, all`);
        process.exit(1);
    }

    console.log(`[JobRunner] Task ${task} finished successfully.`);
  } catch (error) {
    console.error(`[JobRunner] Task ${task} failed:`, error);
    process.exit(1);
  } finally {
    await cacheService.disconnect();
    await db.$disconnect();
  }
}

main();
