import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const EVERY_MS = 15 * 60_000;

/**
 * Daily jobs (D-086). Checks every 15 minutes and runs each job once a day after its configured hour.
 * Safe with several servers: every job locks and re-checks each row, so a repeat run changes nothing.
 * shortcut: in-process timer, move to pg-boss (D-068) when P8 adds more jobs.
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
  };
  const first = setTimeout(tick, 5_000);
  const timer = setInterval(tick, EVERY_MS);
  first.unref();
  timer.unref();
  app.addHook('onClose', async () => {
    clearTimeout(first);
    clearInterval(timer);
  });
};

export const jobsPlugin = fp(jobs, { name: 'jobs', dependencies: ['services'] });
