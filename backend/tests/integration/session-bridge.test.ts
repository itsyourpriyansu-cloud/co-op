import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../helpers/auth';
import { buildTestApp } from '../helpers/test-app';

/** A stand-in mock API: issues bridge sessions and echoes the Authorization it receives. */
async function fakeMock() {
  const sessions = new Map<string, { id: string }>();
  const mock = Fastify();
  let issued = 0;
  mock.post('/api/v1/__demo/session', async (req) => {
    const token = `mock-${++issued}`;
    sessions.set(token, req.body as { id: string });
    return { token, user: req.body };
  });
  mock.post('/api/v1/__demo/reset', async () => {
    sessions.clear();
    return { ok: true };
  });
  mock.get('/api/v1/work-queue', async (req, reply) => {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    const user = sessions.get(token);
    return user ? { items: [], for: user.id } : reply.status(401).send({ code: 'UNAUTHENTICATED' });
  });
  await mock.listen({ port: 0, host: '127.0.0.1' });
  return { mock, url: `http://127.0.0.1:${(mock.server.address() as { port: number }).port}`, issuedCount: () => issued };
}

describe('session bridge (docs/22 §5.1)', () => {
  let app: FastifyInstance;
  let fake: Awaited<ReturnType<typeof fakeMock>>;
  beforeAll(async () => {
    fake = await fakeMock();
    app = await buildTestApp({ MOCK_FALLBACK_URL: fake.url });
    await reseed(app);
  });
  afterAll(async () => {
    await app.close();
    await fake.mock.close();
  });

  it('lets a backend sign-in use routes still served by the mock', async () => {
    const s = await signInAs(app, 'stf-accountant');
    const res = await app.inject({ method: 'GET', url: '/api/v1/work-queue', headers: bearer(s) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], for: 'stf-accountant' });
    expect(res.headers['x-served-by']).toBe('mock-fallback');
  });

  it('reuses one mock session per user and makes a new one after a demo reset', async () => {
    const s = await signInAs(app, 'stf-cashier');
    await app.inject({ method: 'GET', url: '/api/v1/work-queue', headers: bearer(s) });
    const before = fake.issuedCount();
    await app.inject({ method: 'GET', url: '/api/v1/work-queue', headers: bearer(s) });
    expect(fake.issuedCount()).toBe(before);

    await app.inject({ method: 'POST', url: '/api/v1/__demo/reset' });
    const after = await app.inject({ method: 'GET', url: '/api/v1/work-queue', headers: bearer(s) });
    expect(after.statusCode).toBe(200);
    expect(fake.issuedCount()).toBe(before + 1);
  });

  it('forwards signed-out requests unchanged', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/work-queue' });
    expect(res.statusCode).toBe(401);
  });
});
