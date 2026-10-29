import type { FastifyInstance } from 'fastify';
import { API_PREFIX } from '../config/constants';
import { authRoutes } from './auth/auth.routes';
import { healthRoutes } from './health/health.routes';
import { permissionsRoutes } from './permissions/permissions.routes';
import { usersRoutes } from './users/users.routes';

/**
 * Registers every business module. Unversioned system routes first, then `/api/v1/*`
 * modules as each phase builds them (docs/22 §5): P1 auth, users, permissions · P2 masters · …
 */
export async function registerModules(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(usersRoutes);
      await api.register(permissionsRoutes);
    },
    { prefix: API_PREFIX },
  );
}
