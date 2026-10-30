import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../helpers/auth';
import { buildTestApp } from '../helpers/test-app';
import { demoDataset } from '../../src/db/seed/dataset';

/** A member the mock's joining flow created (General No. 9999), copied from Lakshmi. */
const lakshmi = demoDataset().members.find((m) => m.generalNo === '1101')!;
const JOINED_MEMBER = { ...lakshmi, id: 'mem-9999', generalNo: '9999', employeeId: 'TSJOIN99', mobile: '9000000012', mobileMasked: '90XXXXXX12', name: 'Divya S' };

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
  // P4a record sync and combined reads.
  const synced: Array<Record<string, unknown[]>> = [];
  mock.post('/api/v1/__demo/sync', async (req) => {
    synced.push(req.body as Record<string, unknown[]>);
    return { ok: true };
  });
  mock.get('/api/v1/__demo/state', async () => ({ today: '2026-10-24' }));
  mock.get('/api/v1/__demo/legacy/members-summary', async () => ({ today: '2026-10-24', currentCycle: '2026-10', rows: { 'mem-1101': { activeLoans: 2, outstanding: 1234500, pendingChanges: 1 } }, pendingChangeRequests: [{ id: 'pcr-1', memberId: 'mem-1101', route: 'OFFICE' }] }));
  mock.get('/api/v1/__demo/legacy/member/:id', async () => ({ today: '2026-10-24', currentCycle: '2026-10', loans: [{ id: 'loan-x', applicationNo: 'APP-1', product: 'ORDINARY', productName: 'Ordinary Loan', status: 'ACTIVE', amount: 100, outstanding: 50, appliedOn: '2026-01-01' }], guarantees: [], deposits: [], shares: null, ledger: [], changeRequests: [], demandCycles: ['2026-10'] }));
  // P4a reverse sync: the mock's joining flow made member 9999.
  const joined = { ...JOINED_MEMBER };
  mock.post('/api/v1/membership/applications/:id/demo-act', async () => ({ ok: true }));
  mock.get('/api/v1/__demo/legacy/export-members', async (req) => (Number((req.query as { sinceGeneralNo: string }).sinceGeneralNo) < 9999 ? { members: [joined], mandates: [], serviceEvents: [] } : { members: [], mandates: [], serviceEvents: [] }));
  await mock.listen({ port: 0, host: '127.0.0.1' });
  return { mock, url: `http://127.0.0.1:${(mock.server.address() as { port: number }).port}`, issuedCount: () => issued, mirrored: () => mirrored, synced: () => synced };
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

  it('member list and page combine backend records with loans the mock still owns (P4a)', async () => {
    const acc = await signInAs(app, 'stf-accountant');
    const list = (await app.inject({ method: 'GET', url: '/api/v1/members?q=1101', headers: bearer(acc) })).json();
    expect(list.asOf).toBe('2026-10-24');
    expect(list.items[0]).toMatchObject({ generalNo: '1101', activeLoans: 2, outstanding: 1234500 });
    // P4b: change requests are the backend's own records now, not the mock's.
    const changes = (await app.inject({ method: 'GET', url: '/api/v1/profile-change-requests', headers: bearer(acc) })).json();
    expect(list.counts.changeRequests).toBe(changes.counts.pending);
    expect(list.items[0].pendingChanges).toBe(changes.rows.filter((r: { generalNo: string; status: string }) => r.generalNo === '1101' && r.status === 'PENDING').length);
    const detail = (await app.inject({ method: 'GET', url: '/api/v1/members/1101', headers: bearer(acc) })).json();
    expect(detail.loans[0].id).toBe('loan-x');
  });

  it('pushes a changed member to the mock (record sync)', async () => {
    const acc = await signInAs(app, 'stf-accountant');
    const before = fake.synced().length;
    const m = (await app.inject({ method: 'GET', url: '/api/v1/members/1101', headers: bearer(acc) })).json().member;
    const { id: _id, generalNo: _g, mobileMasked: _mm, status: _s, portalActivated: _p, joinedSocietyOn: _j, ...input } = m;
    const res = await app.inject({ method: 'PUT', url: '/api/v1/members/1101', headers: bearer(acc), payload: { ...input, designation: 'Under Secretary' } });
    expect(res.statusCode).toBe(200);
    const sent = fake.synced().slice(before);
    expect(sent.some((s) => (s.members as Array<{ id: string; designation: string }> | undefined)?.some((x) => x.id === 'mem-1101' && x.designation === 'Under Secretary'))).toBe(true);
  });

  it("imports a member the mock's joining flow created, and the applicant's sign-in becomes theirs", async () => {
    const divya = await signInAs(app, 'apl-divya');
    expect(divya.user.role).toBe('APPLICANT');
    const acc = await signInAs(app, 'stf-accountant');
    expect((await app.inject({ method: 'POST', url: '/api/v1/membership/applications/mapp-x/demo-act', headers: bearer(acc) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/members/9999', headers: bearer(acc) })).json().member.name).toBe('Divya S');
    // Same login, now a member (D-026): the next request already carries the member.
    await new Promise((r) => setTimeout(r, 2100));
    const me = (await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(divya) })).json();
    expect(me.user).toMatchObject({ role: 'MEMBER', memberId: 'mem-9999', generalNo: '9999' });
  });

  it('forwards signed-out requests unchanged', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/work-queue' });
    expect(res.statusCode).toBe(401);
  });
});
