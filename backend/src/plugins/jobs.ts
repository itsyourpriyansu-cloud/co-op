import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { sql } from 'drizzle-orm';
import { businessToday } from '../common/utils/business-date';
import { systemInfo } from '../models';

const EVERY_MS = 15 * 60_000;
/** G9 (D-121): how often the outbox looks for due sends (retries, held broadcasts). */
const OUTBOX_EVERY_MS = 15_000;
const HOUSEKEEPING_KEY = 'jobs.housekeeping.lastRunOn';

/**
 * G3 (D-113): claims today's run for this server in one statement. With several servers only the
 * first one to arrive gets `true`; the others see the row already holds today and skip.
 */
export async function claimDay(app: FastifyInstance, key: string, today: string): Promise<boolean> {
  const value = { date: today };
  const rows = await app.db
    .insert(systemInfo)
    .values({ key, value })
    .onConflictDoUpdate({ target: systemInfo.key, set: { value, updatedAt: new Date() }, setWhere: sql`${systemInfo.value}->>'date' is distinct from ${today}` })
    .returning({ key: systemInfo.key });
  return rows.length > 0;
}

/**
 * Once a day (G3, D-113): FD maturity reminders, then removal of what can never be used again
 * (expired refresh tokens and one-time codes, duplicate-guard keys older than a day).
 */
export async function runHousekeeping(app: FastifyInstance, today: string) {
  const reminders = await app.deposits.remindMaturing(today);
  const expired = await app.appAccounts.purgeExpired();
  const idempotencyKeys = await app.purgeIdempotencyKeys(new Date(Date.now() - 24 * 3600_000).toISOString());
  const erasedApplications = await app.joining.eraseClosedApplications();
  const minorsOfAge = await app.deposits.remindMinorsOfAge(today);
  return { reminders, ...expired, idempotencyKeys, erasedApplications, minorsOfAge };
}

/**
 * Daily jobs (D-086). Checks every 15 minutes and runs each job once a day after its configured hour.
 * Safe with several servers: every job locks and re-checks each row, so a repeat run changes nothing.
 * shortcut: in-process timer, move to pg-boss (D-068) if jobs need retries or run longer than a minute.
 */
const jobs: FastifyPluginAsync = async (app) => {
  const tick = async () => {
    try {
      if (await app.deposits.maturityDue()) {
        const r = await app.deposits.runMaturity();
        app.log.info(r, 'FD maturity job ran');
      }
    } catch (err) {
      app.log.error({ err }, 'FD maturity job failed');
    }
    try {
      const today = await businessToday(app);
      if (await claimDay(app, HOUSEKEEPING_KEY, today)) app.log.info(await runHousekeeping(app, today), 'Daily housekeeping ran');
    } catch (err) {
      app.log.error({ err }, 'Daily housekeeping failed');
    }
  };
  const first = setTimeout(tick, 5_000);
  const timer = setInterval(tick, EVERY_MS);
  const outbox = setInterval(() => app.notifications.kick(), OUTBOX_EVERY_MS);
  first.unref();
  timer.unref();
  outbox.unref();
  app.addHook('preClose', async () => {
    clearTimeout(first);
    clearInterval(timer);
    clearInterval(outbox);
  });
};

export const jobsPlugin = fp(jobs, { name: 'jobs', dependencies: ['services'] });
