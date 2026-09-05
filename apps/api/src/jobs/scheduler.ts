import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { processFeeReminders } from '../modules/fees/fees.service';
import { expireLapsedAdmissions } from '../modules/admissions/admissions.service';
import { activeDeviceIds, syncDevice } from '../modules/biometric/biometric.service';

/**
 * Background jobs (PRD §22).
 *
 * Every job is idempotent, so a missed run, a retry, or two instances racing
 * cannot produce duplicate reminders, invoices or attendance. Set
 * JOBS_ENABLED=false on replicas so only one instance schedules them.
 */

const tasks: ScheduledTask[] = [];
const running = new Set<string>();

/** Prevents a slow run from overlapping with the next tick. */
async function runExclusive(name: string, fn: () => Promise<void>): Promise<void> {
  if (running.has(name)) {
    logger.warn({ job: name }, 'Previous run still in progress — skipping this tick');
    return;
  }

  running.add(name);
  const started = Date.now();

  try {
    await fn();
    logger.info({ job: name, durationMs: Date.now() - started }, 'Job completed');
  } catch (error) {
    logger.error({ err: error, job: name }, 'Job failed');
  } finally {
    running.delete(name);
  }
}

export async function runFeeReminderJob(): Promise<void> {
  const result = await processFeeReminders();
  logger.info(result, 'Fee reminders processed');
}

export async function runMembershipExpiryJob(): Promise<void> {
  const expired = await expireLapsedAdmissions();
  logger.info({ expired }, 'Membership expiry processed');
}

export async function runBiometricSyncJob(): Promise<void> {
  const deviceIds = await activeDeviceIds();

  if (deviceIds.length === 0) {
    logger.debug('No active biometric devices to sync');
    return;
  }

  const until = new Date();
  // A 24-hour window comfortably covers a missed run without re-reading the
  // device's whole log; already-seen records are discarded by the unique key.
  const since = new Date(until.getTime() - 24 * 3_600_000);

  for (const deviceId of deviceIds) {
    // `null` auth: this is a system run, not a user request. syncDevice skips
    // the per-user branch check but still confines itself to the device's own
    // branch for every write.
    const result = await syncDevice(null, deviceId, { since, until });

    if (result.error) {
      logger.warn({ deviceId, error: result.error }, 'Device sync failed');
    } else {
      logger.info(result, 'Device sync complete');
    }
  }
}

export function startScheduler(): void {
  if (!env.JOBS_ENABLED) {
    logger.info('Background jobs are disabled (JOBS_ENABLED=false)');
    return;
  }

  const schedule = (name: string, expression: string, fn: () => Promise<void>) => {
    if (!cron.validate(expression)) {
      logger.error({ job: name, expression }, 'Invalid cron expression — job not scheduled');
      return;
    }

    tasks.push(
      cron.schedule(expression, () => {
        void runExclusive(name, fn);
      }),
    );

    logger.info({ job: name, expression }, 'Job scheduled');
  };

  schedule('fee-reminders', env.JOB_FEE_REMINDERS_CRON, runFeeReminderJob);
  schedule('membership-expiry', env.JOB_MEMBERSHIP_EXPIRY_CRON, runMembershipExpiryJob);

  if (env.BIOMETRIC_PROVIDER !== 'none') {
    schedule('biometric-sync', env.JOB_BIOMETRIC_SYNC_CRON, runBiometricSyncJob);
  } else {
    logger.info('Biometric sync job not scheduled: BIOMETRIC_PROVIDER=none');
  }
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
