import type { DepositAccount, Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// G1 (D-111): monthly / quarterly / half-yearly FD interest is paid each period by the daily job.
describe('FD periodic interest payouts (G1)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST', url: string, s: Session) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s) });
  const fd = data.deposits.find((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && d.payoutFrequency === 'MONTHLY' && (d.interestPayouts?.length ?? 0) >= 2)!;

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant')]);
  });
  afterAll(() => app.close());

  it('seeded FDs count past periods as paid, so a run on the seed date pays nothing', async () => {
    expect(fd).toBeDefined();
    expect((await call('POST', '/deposits/maturity/run', admin)).json().interestPaid).toBe(0);
  });

  it('pays each unpaid period once, posts it and writes an F10 voucher', async () => {
    // Forget the last two payouts: the job must pay exactly those two.
    const kept = fd.interestPayouts!.slice(0, -2);
    await app.db.execute(sql`update deposits set data = jsonb_set(data, '{interestPayouts}', ${JSON.stringify(kept)}::jsonb) where id = ${fd.id}`);
    const tbBefore = (await call('GET', '/ledger/trial-balance', accountant)).json();
    const run = (await call('POST', '/deposits/maturity/run', admin)).json();
    expect(run.interestPaid).toBe(2);
    const d = (await call('GET', `/deposits/${fd.id}`, admin)).json().deposit as DepositAccount;
    expect(d.interestPayouts).toHaveLength(fd.interestPayouts!.length);
    const paid = fd.interestPayouts!.slice(-2);
    expect(d.vouchers?.filter((v) => v.kind === 'INTEREST').map((v) => [v.date, v.amount])).toEqual(paid.map((p) => [p.date, p.amount]));
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.totalDebit).toBeGreaterThanOrEqual(tbBefore.totalDebit);
    // A second run (or a second server) pays nothing more.
    expect((await call('POST', '/deposits/maturity/run', admin)).json().interestPaid).toBe(0);
  });
});
