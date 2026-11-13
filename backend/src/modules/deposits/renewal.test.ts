import type { DepositAccount, DepositDetail, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

/** G9 (D-120): a matured FD is renewed into a new FD, which needs both acceptances. */
describe('FD renewal (G9)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let secretary: Session;
  let president: Session;
  let cashier: Session;
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const act = (id: string, action: string, s: Session, input: object = {}) => call('POST', `/deposits/${id}/actions/${action}`, s, input);

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, secretary, president, cashier] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-secretary'), signInAs(app, 'stf-president'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('closes the old FD, opens the new one at the slab rate in one entry, then both accept it', async () => {
    const matured = demoDataset().deposits.find((d) => d.scheme === 'FD' && d.status === 'MATURED')!;
    const detail = (await call('GET', `/deposits/${matured.id}`, cashier)).json() as DepositDetail;
    expect(detail.actions).toEqual(expect.arrayContaining(['payout', 'renew']));
    expect((await act(matured.id, 'renew', cashier, { renewal: { tenureMonths: 7777, payoutFrequency: 'ON_MATURITY', withInterest: true } })).json().fieldErrors).toHaveProperty('tenureMonths');
    expect((await act(matured.id, 'renew', secretary, { renewal: { tenureMonths: 24, payoutFrequency: 'ON_MATURITY', withInterest: true } })).json().code).toBe('INVALID_TRANSITION');

    const old = (await act(matured.id, 'renew', cashier, { renewal: { tenureMonths: 24, payoutFrequency: 'ON_MATURITY', withInterest: true } })).json().deposit as DepositAccount;
    expect(old).toMatchObject({ status: 'CLOSED', balance: 0, renewedTo: { id: expect.any(String) } });
    const value = Math.max(matured.maturityValue ?? 0, matured.principal ?? 0);
    const fresh = (await call('GET', `/deposits/${old.renewedTo!.id}`, accountant)).json() as DepositDetail;
    expect(fresh.deposit).toMatchObject({ status: 'ACCEPTANCE_SECRETARY', principal: value, tenureMonths: 24, payment: { mode: 'RENEWAL', amount: value }, renewedFrom: { id: matured.id } });

    const j = (await call('GET', '/ledger/journals?source=FD_RENEWAL', accountant)).json();
    const entry = (await call('GET', `/ledger/journals/${j.items[0].id}`, accountant)).json();
    // The member's FD balance moves from the old deposit to the new one; no cash moves when interest is added.
    expect(entry.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '2200', credit: value })]));
    expect(entry.lines.some((l: { accountCode: string }) => l.accountCode === '1200' || l.accountCode === '1100')).toBe(false);
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);

    expect((await act(fresh.deposit.id, 'accept', secretary)).json().deposit.status).toBe('ACCEPTANCE_PRESIDENT');
    const active = (await act(fresh.deposit.id, 'accept', president)).json().deposit as DepositAccount;
    expect(active).toMatchObject({ status: 'ACTIVE', fdrNo: expect.stringMatching(/^FDR-/) });
  });
});
