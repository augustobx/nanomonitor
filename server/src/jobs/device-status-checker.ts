import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ONLINE_HEARTBEAT_THRESHOLD_MS } from '../lib/device-presence.js';

/**
 * Checks all devices that are currently ONLINE and marks them as OFFLINE
 * if they haven't reported a heartbeat within the threshold.
 */
export async function runDeviceStatusCheck(): Promise<void> {
  const cutoff = new Date(Date.now() - ONLINE_HEARTBEAT_THRESHOLD_MS);

  try {
    const result = await db.device.updateMany({
      where: {
        status: 'ONLINE',
        heartbeats: {
          none: {
            timestamp: { gte: cutoff },
          },
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
