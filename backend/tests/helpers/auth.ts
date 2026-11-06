import type { Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { runSeed } from '../../src/db/seed';

export const STAFF_PASSWORD = 'Society@2026';

/** Reset the P1 tables to the demo state (idempotent seed). */
export async function reseed(app: FastifyInstance): Promise<void> {
  await runSeed(app.db, { staffPassword: STAFF_PASSWORD });
}

/** Demo one-click sign-in; works for every persona, including TOTP roles. */
export async function signInAs(app: FastifyInstance, personaId: string): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/persona', payload: { personaId } });
  if (res.statusCode !== 200) throw new Error(`persona sign-in failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

export const bearer = (s: Session | string) => ({ authorization: `Bearer ${typeof s === 'string' ? s : s.token}` });
