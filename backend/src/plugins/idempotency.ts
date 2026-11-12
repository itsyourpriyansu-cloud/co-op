import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { and, eq, lt } from 'drizzle-orm';
import { fail } from '../common/errors/app-error';
import { sha256 } from '../common/utils/crypto';
import { idempotencyKeys } from '../models';

declare module 'fastify' {
  interface FastifyRequest {
    idempotency?: { scope: string; key: string };
  }
}

/**
 * G1 (D-111): `Idempotency-Key` on any POST. The first request claims the key; a repeat with the same
 * key and body gets the first answer back (header `Idempotent-Replay: true`), so a phone that timed out
 * and tries again never makes a second receipt. A repeat while the first is still running is refused.
 * Keys are per signed-in user. Errors are not stored, so a corrected retry with the same key runs.
 */
const idempotency: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !key) return;
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) fail('VALIDATION_ERROR', 'The Idempotency-Key header must be 8–100 letters, digits, - or _.');
    const scope = request.session?.id ?? 'anonymous';
    const requestHash = sha256(`${request.method} ${request.url} ${JSON.stringify(request.body ?? null)}`);
    const claimed = await app.db.insert(idempotencyKeys).values({ scope, key, requestHash, status: 'IN_PROGRESS' }).onConflictDoNothing().returning({ key: idempotencyKeys.key });
    if (claimed.length) {
      request.idempotency = { scope, key };
      return;
    }
    const [row] = await app.db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    if (!row) fail('ALREADY_POSTED', 'This was just saved. Refresh to see it.');
    if (row.requestHash !== requestHash) fail('VALIDATION_ERROR', 'An earlier try of this form was already saved. Check the list before entering it again.');
    if (row.status !== 'DONE') fail('ALREADY_POSTED', 'This is still being saved. Check the list before entering it again.');
    return reply.status(row.statusCode ?? 200).header('idempotent-replay', 'true').type('application/json; charset=utf-8').send(row.responseBody ?? '');
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const idem = request.idempotency;
    if (!idem) return payload;
    const where = and(eq(idempotencyKeys.scope, idem.scope), eq(idempotencyKeys.key, idem.key));
    if (reply.statusCode >= 200 && reply.statusCode < 300 && typeof payload === 'string') {
      await app.db.update(idempotencyKeys).set({ status: 'DONE', statusCode: reply.statusCode, responseBody: payload }).where(where);
    } else {
      await app.db.delete(idempotencyKeys).where(where);
    }
    return payload;
  });

  app.decorate('purgeIdempotencyKeys', async (olderThan: string) => {
    const gone = await app.db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, olderThan)).returning({ key: idempotencyKeys.key });
    return gone.length;
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    purgeIdempotencyKeys(olderThan: string): Promise<number>;
  }
}

export const idempotencyPlugin = fp(idempotency, { name: 'idempotency', dependencies: ['db', 'auth'] });
