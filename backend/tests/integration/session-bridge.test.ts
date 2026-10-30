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
  const mirrored: Array<{ path: string; user: string; body: unknown }> = [];
  mock.put('/api/v1/settings/loan-products/:code', async (req, reply) => {
    const user = sessions.get((req.headers.authorization ?? '').replace('Bearer ', ''));
    if (!user) return reply.status(401).send({ code: 'UNAUTHENTICATED' });
    mirrored.push({ path: req.url, user: user.id, body: req.body });
    return { ok: true };
  });
  mock.get('/api/v1/departments', async () => [{ id: 'dept-fin', memberCount: 42 }]);
  await mock.listen({ port: 0, host: '127.0.0.1' });
  return { mock, url: `http://127.0.0.1:${(mock.server.address() as { port: number }).port}`, issuedCount: () => issued, mirrored: () => mirrored };
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

  it('mirrors a saved settings change to the mock as the same user (P2)', async () => {
    const admin = await signInAs(app, 'stf-admin');
    const res = await app.inject({ method: 'PUT', url: '/api/v1/settings/loan-products/EDUCATION', headers: bearer(admin), payload: { ratePercent: 9.5 } });
    expect(res.statusCode).toBe(200);
    expect(fake.mirrored()).toContainEqual({ path: '/api/v1/settings/loan-products/EDUCATION', user: 'stf-admin', body: { ratePercent: 9.5 } });
    // A refused change is not mirrored.
    await app.inject({ method: 'PUT', url: '/api/v1/settings/loan-products/EDUCATION', headers: bearer(admin), payload: { ratePercent: -5 } });
    expect(fake.mirrored().filter((m) => m.path.endsWith('EDUCATION'))).toHaveLength(1);
  });

  it('takes department member counts from the mock until members move (P4)', async () => {
    const admin = await signInAs(app, 'stf-admin');
    const rows = (await app.inject({ method: 'GET', url: '/api/v1/departments', headers: bearer(admin) })).json();
    expect(rows.find((d: { id: string }) => d.id === 'dept-fin').memberCount).toBe(42);
  });

  it('forwards signed-out requests unchanged', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/work-queue' });
    expect(res.statusCode).toBe(401);
  });
});
