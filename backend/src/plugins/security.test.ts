import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../tests/helpers/auth';
import { buildTestApp } from '../../tests/helpers/test-app';

// G7 (D-117): every route needs a signed-in user, and the check runs before the body is read (guards are
// onRequest hooks), except this list. A new public route must be added here on purpose.
const PUBLIC = new Set([
  'GET /health',
  'GET /api/v1/health',
  'GET /api/v1/app/config',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/otp/start',
  'POST /api/v1/auth/otp/verify',
  'POST /api/v1/auth/staff/login',
  'POST /api/v1/auth/staff/totp',
  'POST /api/v1/auth/staff/totp/setup',
  'POST /api/v1/auth/staff/totp/confirm',
  // Demo one-click sign-in: 404 unless DEMO_MODE, which production forces off.
  'POST /api/v1/auth/persona',
  // The join form's society facts (departments, share limits, agreement texts), read before sign-up.
  'GET /api/v1/joining/reference',
  // G9 (D-121): WhatsApp status callbacks, proven by the verify token and Meta's signature instead.
  'GET /api/v1/webhooks/whatsapp',
  'POST /api/v1/webhooks/whatsapp',
]);

describe('route protection (G7)', () => {
  let app: FastifyInstance;
  beforeAll(async () => (app = await buildTestApp()));
  afterAll(() => app.close());

  it('every route outside the public list answers 401 without a session', async () => {
    const spec = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as { paths: Record<string, Record<string, unknown>> };
    const open: string[] = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods).map((m) => m.toUpperCase())) {
        const key = `${method} ${path}`;
        if (PUBLIC.has(key) || path.startsWith('/docs') || path.startsWith('/api/v1/__demo')) continue;
        const res = await app.inject({ method: method as 'GET', url: path.replace(/\{[^}]+\}/g, 'x'), ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }) });
        if (res.statusCode !== 401) open.push(`${key} → ${res.statusCode}`);
      }
    }
    expect(open).toEqual([]);
  });

  it("a member sees only their own records, and no staff screen", async () => {
    await reseed(app);
    const [owner, other] = await Promise.all([signInAs(app, 'mem-1101'), signInAs(app, 'mem-1102')]);
    const loan = (await app.loans.repo.forMember('mem-1101'))[0]!;
    const deposit = (await app.deposits.repo.forMember('mem-1101'))[0]!;
    const get = (url: string, s: typeof owner) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });
    expect((await get(`/me/loans/${loan.id}`, owner)).statusCode).toBe(200);
    for (const url of [`/me/loans/${loan.id}`, `/me/deposits/${deposit.id}`, `/loans/${loan.id}`, `/deposits/${deposit.id}`, '/members/mem-1101', '/members', '/ledger/trial-balance', '/audit', '/users', '/reports/demand-register'])
      expect([403, 404], url).toContain((await get(url, other)).statusCode);
  });
});
