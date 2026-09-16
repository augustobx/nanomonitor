import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { calculateAndPersistDeviceHealthScore } from '../modules/health/health-scorer.js';

export interface HealthScoringJobResult {
  devicesScored: number;
  averageScore: number;
  durationMs: number;
}

/**
 * Iterates through all devices in the database, calculates and saves health scores.
 */
export async function runHealthScoringJob(): Promise<HealthScoringJobResult> {
  const startTime = Date.now();
  logger.info('Starting automated device health scoring job');

  const devices = await db.device.findMany({
    select: { id: true, hostname: true },
  });

  if (devices.length === 0) {
    logger.info('No devices found to score');
    return { devicesScored: 0, averageScore: 100, durationMs: Date.now() - startTime };
  }

  let totalScore = 0;
  let scoredCount = 0;

  for (const device of devices) {
    const res = await calculateAndPersistDeviceHealthScore(device.id);
    if (res) {
      totalScore += res.overall;
      scoredCount++;
    }
  }

  const averageScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 100;
  const durationMs = Date.now() - startTime;

  logger.info(
    { devicesScored: scoredCount, averageScore, durationMs },
    'Device health scoring job finished successfully'
  );

  return { devicesScored: scoredCount, averageScore, durationMs };
}
