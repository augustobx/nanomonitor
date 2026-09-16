import { aggregateHourlyMetrics } from './metric-aggregator.js';
import { aggregateDailyMetrics } from './daily-aggregator.js';
import { runRetentionCleanup } from './retention-cleanup.js';
import { ensurePartitionsExist } from './partition-creator.js';
import { runHealthScoringJob } from './health-scorer.js';
import { logger } from '../lib/logger.js';
import { db } from '../lib/db.js';
import { cacheService } from '../lib/redis.js';

export class BackgroundJobScheduler {
  private intervals: NodeJS.Timeout[] = [];
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('🚀 Background Job Scheduler started');

    // Run partition check and initial health scoring immediately on startup
    ensurePartitionsExist(2).catch((err) => {
      logger.error({ err }, 'Initial partition check failed');
    });

    runHealthScoringJob().catch((err) => {
      logger.error({ err }, 'Initial health scoring job failed');
    });

    // Schedule health scoring (runs every 10 minutes)
    const healthInterval = setInterval(async () => {
      try {
        await runHealthScoringJob();
      } catch (err) {
        logger.error({ err }, 'Scheduled health scoring failed');
      }
    }, 10 * 60 * 1000);
    this.intervals.push(healthInterval);

    // Schedule hourly aggregation (runs every 10 minutes checking the last complete hour)
    const hourlyInterval = setInterval(async () => {
      try {
        await aggregateHourlyMetrics();
      } catch (err) {
        logger.error({ err }, 'Scheduled hourly aggregation failed');
      }
    }, 10 * 60 * 1000); // every 10 min
    this.intervals.push(hourlyInterval);

    // Schedule daily aggregation (runs every 60 minutes checking if yesterday is processed)
    const dailyInterval = setInterval(async () => {
      try {
        await aggregateDailyMetrics();
      } catch (err) {
        logger.error({ err }, 'Scheduled daily aggregation failed');
      }
    }, 60 * 60 * 1000); // every 1 hour
    this.intervals.push(dailyInterval);

    // Schedule retention cleanup (every 6 hours)
    const cleanupInterval = setInterval(async () => {
      try {
        await runRetentionCleanup();
      } catch (err) {
        logger.error({ err }, 'Scheduled retention cleanup failed');
      }
    }, 6 * 60 * 60 * 1000); // every 6 hours
    this.intervals.push(cleanupInterval);

    // Schedule partition creator (every 24 hours)
    const partitionInterval = setInterval(async () => {
      try {
        await ensurePartitionsExist(2);
      } catch (err) {
        logger.error({ err }, 'Scheduled partition creation failed');
      }
    }, 24 * 60 * 60 * 1000);
    this.intervals.push(partitionInterval);
  }

  stop() {
    this.intervals.forEach((i) => clearInterval(i));
    this.intervals = [];
    this.isRunning = false;
    logger.info('Background Job Scheduler stopped');
  }
}

export const jobScheduler = new BackgroundJobScheduler();

// Allow running standalone worker: `npx tsx src/jobs/scheduler.ts`
if (process.argv[1]?.endsWith('scheduler.ts') || process.argv[1]?.endsWith('scheduler.js')) {
  jobScheduler.start();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down worker...`);
    jobScheduler.stop();
    await cacheService.disconnect();
    await db.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
