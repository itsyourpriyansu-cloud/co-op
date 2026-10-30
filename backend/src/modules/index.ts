import type { FastifyInstance } from 'fastify';
import { API_PREFIX } from '../config/constants';
import { authRoutes } from './auth/auth.routes';
import { demoRoutes } from './demo/demo.routes';
import { departmentsRoutes } from './departments/departments.routes';
import { healthRoutes } from './health/health.routes';
import { ledgerRoutes } from './ledger/ledger.routes';
import { mastersRoutes } from './masters/masters.routes';
import { membersRoutes } from './members/members.routes';
import { joiningRoutes } from './joining/joining.routes';
import { profileChangesRoutes } from './profile-changes/profile-changes.routes';
import { permissionsRoutes } from './permissions/permissions.routes';
import { usersRoutes } from './users/users.routes';

/**
 * Registers every business module. Unversioned system routes first, then `/api/v1/*`
 * modules as each phase builds them (docs/22 §5): P1 auth, users, permissions · P2 masters, departments, demo reset · P3 ledger · P4a members · P4b change requests + my profile · P4c joining · …
 */
export async function registerModules(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(usersRoutes);
      await api.register(permissionsRoutes);
      await api.register(mastersRoutes);
      await api.register(departmentsRoutes);
      await api.register(ledgerRoutes);
      await api.register(membersRoutes);
      await api.register(profileChangesRoutes);
      await api.register(joiningRoutes);
      await api.register(demoRoutes);
    },
    { prefix: API_PREFIX },
  );
}
