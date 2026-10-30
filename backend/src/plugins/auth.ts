import jwt from '@fastify/jwt';
import type { SessionUser } from '@tgs/types';
import fp from 'fastify-plugin';
import type { Env } from '../config/env';
import { AuditRepository } from '../modules/audit/audit.repository';
import { AuthRepository } from '../modules/auth/auth.repository';
import { appSessionUser } from '../modules/auth/session-user';
import { AuditService } from '../modules/audit/audit.service';
import { PermissionsRepository } from '../modules/permissions/permissions.repository';
import { PermissionsService } from '../modules/permissions/permissions.service';

/** What an access token carries (docs/22 §5.1). */
export interface AccessClaims {
  typ: 'access';
  user: SessionUser;
  /** Member App only: the sign-in account, reloaded on each request so a joining applicant becomes a member at once. */
  aid?: string;
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

    // Member App accounts change during joining (applicant → member): read them fresh, cached briefly.
    const accounts = new AuthRepository(app.db);
    const cache = new Map<string, { at: number; user: SessionUser | undefined }>();
    const appUser = async (aid: string): Promise<SessionUser | undefined> => {
      const hit = cache.get(aid);
      if (hit && Date.now() - hit.at < 2000) return hit.user;
      const row = await accounts.appById(aid);
      const user = row && row.status === 'ACTIVE' ? appSessionUser(row) : undefined;
      cache.set(aid, { at: Date.now(), user });
      return user;
    };

    app.addHook('onRequest', async (request) => {
      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) return;
      let claims: AccessClaims;
      try {
        claims = app.jwt.verify<AccessClaims>(header.slice(7));
      } catch {
        // Expired or forged: stay signed out. Guards answer 401 and the app refreshes.
        return;
      }
      if (claims.typ !== 'access') return;
      request.session = claims.aid ? await appUser(claims.aid) : claims.user;
    });
  },
  { name: 'auth', dependencies: ['db'] },
);
