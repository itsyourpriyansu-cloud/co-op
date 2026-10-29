import jwt from '@fastify/jwt';
import type { SessionUser } from '@tgs/types';
import fp from 'fastify-plugin';
import type { Env } from '../config/env';
import { AuditRepository } from '../modules/audit/audit.repository';
import { AuditService } from '../modules/audit/audit.service';
import { PermissionsRepository } from '../modules/permissions/permissions.repository';
import { PermissionsService } from '../modules/permissions/permissions.service';

/** What an access token carries (docs/22 §5.1). */
export interface AccessClaims {
  typ: 'access';
  user: SessionUser;
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    audit: AuditService;
    permissions: PermissionsService;
  }
}

/**
 * Shared services + token reading. For every request with `Authorization: Bearer <token>`,
 * a valid access token puts the user on `request.session`; anything else leaves it empty and
 * the route guards answer UNAUTHENTICATED (common/guards).
 */
export const authPlugin = fp<{ env: Env }>(
  async (app, { env }) => {
    app.decorate('env', env);
    const audit = new AuditService(new AuditRepository(app.db));
    app.decorate('audit', audit);
    app.decorate('permissions', new PermissionsService(app.db, new PermissionsRepository(app.db), audit));

    await app.register(jwt, { secret: env.JWT_SECRET });

    app.addHook('onRequest', async (request) => {
      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) return;
      try {
        const claims = app.jwt.verify<AccessClaims>(header.slice(7));
        if (claims.typ === 'access') request.session = claims.user;
      } catch {
        // Expired or forged: stay signed out. Guards answer 401 and the app refreshes.
      }
    });
  },
  { name: 'auth', dependencies: ['db'] },
);
