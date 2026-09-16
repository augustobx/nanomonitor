import { evaluateAllDevicesAlerts } from '../modules/alerts/alert-evaluator.js';
import { logger } from '../lib/logger.js';

/**
 * Scheduled job to evaluate alert conditions for all devices across all tenants.
 */
export async function runAlertEvaluationJob(): Promise<void> {
  try {
    await evaluateAllDevicesAlerts();
  } catch (err) {
    logger.error({ err }, 'Alert evaluation job failed');
  }
}
