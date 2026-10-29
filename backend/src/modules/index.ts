import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health/health.routes';

/**
 * Registers every business module. Unversioned system routes first, then `/api/v1/*`
 * modules as each phase builds them (docs/22 §5): P1 auth, users · P2 masters, departments · …
 */
export async function registerModules(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  // await app.register(apiV1Routes, { prefix: API_PREFIX });  ← from P1
}
