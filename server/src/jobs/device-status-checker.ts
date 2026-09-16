import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes without heartbeat = OFFLINE

/**
 * Checks all devices that are currently ONLINE and marks them as OFFLINE
 * if they haven't reported a heartbeat within the threshold.
 */
export async function runDeviceStatusCheck(): Promise<void> {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

  try {
    const result = await db.device.updateMany({
      where: {
        status: 'ONLINE',
        lastSeenAt: {
          lt: cutoff,
        },
      },
      data: {
        status: 'OFFLINE',
      },
    });

    if (result.count > 0) {
      logger.info({ markedOffline: result.count, cutoff: cutoff.toISOString() },
        `⚠️ Marked ${result.count} device(s) as OFFLINE (no report since ${cutoff.toISOString()})`);
    }
  } catch (err) {
    logger.error({ err }, 'Device status check failed');
  }
}
