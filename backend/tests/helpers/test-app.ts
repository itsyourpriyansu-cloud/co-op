import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { createDb } from '../../src/db/client';

/**
 * A fully wired app on the test database, without logs. Close it in afterAll.
 * Pass `ready: false` to add probe routes before the app starts.
 */
export async function buildTestApp(overrides: Record<string, string> = {}, { ready = true } = {}): Promise<FastifyInstance> {
  // Tests never send real email or WhatsApp, and sign in as demo personas, whatever the local .env says.
  const env = loadEnv({ ...process.env, EMAIL_PROVIDER: 'simulated', WHATSAPP_PROVIDER: 'simulated', PUSH_PROVIDER: 'simulated', DEMO_MODE: 'true', ...overrides });
  const app = await buildApp({ env, logger: false });
  if (ready) await app.ready();
  return app;
}

/** An app whose database is unreachable, to test failure paths. */
export async function buildAppWithDeadDatabase(): Promise<FastifyInstance> {
  const env = loadEnv(process.env);
  const dbHandle = createDb({ url: 'postgres://nobody:wrong@127.0.0.1:1/none', max: 1 });
  const app = await buildApp({ env, dbHandle, logger: false });
  await app.ready();
  return app;
}
