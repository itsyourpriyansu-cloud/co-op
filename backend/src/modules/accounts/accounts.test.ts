import type { Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

// G2 (D-112): vouchers, sub-heads, the accounting statements and the year end, on the seeded books.
describe('accounts (G2)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  let ddo: Session;
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, s?: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, ...(s ? { headers: bearer(s) } : {}), ...(payload ? { payload } : {}) });
  const tb = async () => (await call('GET', '/ledger/trial-balance', accountant)).json();
  const report = async (id: string, q = '', s = accountant) => call('GET', `/reports/${id}${q}`, s);

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, cashier, ddo] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier'), signInAs(app, 'stf-ddo-fin')]);
  });
  afterAll(async () => {
    // The year-end test moves the demo clock; put it back so later test files see the dataset date.
    await call('POST', '/__demo/clock', undefined, { today: null });
    await app.close();
  });

  it('the Accountant adds a sub-head under an expense head', async () => {
    expect((await call('POST', '/accounts/heads', cashier, { parentCode: '5800', name: 'Annual general body' })).statusCode).toBe(403);
    expect((await call('POST', '/accounts/heads', accountant, { parentCode: '1200', name: 'Second bank' })).json().fieldErrors).toHaveProperty('parentCode');
    const h = (await call('POST', '/accounts/heads', accountant, { parentCode: '5800', name: 'Annual general body' })).json();
    expect(h).toMatchObject({ code: '5800.01', type: 'EXPENSE', parentCode: '5800', active: true });
    expect((await call('PATCH', '/accounts/heads/5800', accountant, { name: 'Renamed' })).json().code).toBe('RULE_VIOLATION');
    expect((await call('PATCH', '/accounts/heads/5800.01', accountant, { name: 'AGM expenses' })).json().name).toBe('AGM expenses');
  });

  it('vouchers post balanced entries by cash or bank', async () => {
    const pay = { kind: 'PAYMENT', headCode: '5800.01', amount: 1_250_00, mode: 'CASH', party: 'Sri Caterers', narration: 'Tea for the general body' };
    expect((await call('POST', '/accounts/vouchers', cashier, pay)).statusCode).toBe(403);
    expect((await call('POST', '/accounts/vouchers', accountant, { ...pay, headCode: '4900' })).json().fieldErrors).toHaveProperty('headCode');
    const v = (await call('POST', '/accounts/vouchers', accountant, pay)).json();
    expect(v).toMatchObject({ voucherNo: expect.stringMatching(/^PV-\d{4}-0001$/), headName: 'AGM expenses', amount: 1_250_00, reversed: false });
    expect((await call('POST', '/accounts/vouchers', accountant, { kind: 'RECEIPT', headCode: '4500', amount: 900_00, mode: 'BANK', party: 'Bank', narration: 'Interest on SB account' })).json().fieldErrors).toHaveProperty('reference');
    const r = (await call('POST', '/accounts/vouchers', accountant, { kind: 'RECEIPT', headCode: '4500', amount: 900_00, mode: 'BANK', reference: 'SB-INT-Q2', party: 'Bank', narration: 'Interest on SB account' })).json();
    expect(r.voucherNo).toMatch(/^RV-/);
    const list = (await call('GET', '/accounts/vouchers', cashier)).json();
    expect(list.total).toBe(2);
    expect((await tb()).balanced).toBe(true);
  });

  it('serves every accounting statement from the journal', async () => {
    const t = (await report('trial-balance')).json();
    expect(t.totals.debit).toBe(t.totals.credit);
    const bs = (await report('balance-sheet')).json();
    expect(bs.groups[0].subtotal.amount).toBe(bs.groups[1].subtotal.amount);
    const pl = (await report('profit-loss')).json();
    expect(pl.groups[1].rows.some((x: { name: string }) => x.name === 'AGM expenses')).toBe(true);
    const cash = (await report('books', '?book=CASH')).json();
    expect(cash.groups[0].rows.some((x: { payments: number }) => x.payments === 1_250_00)).toBe(true);
    expect((await report('books')).json().rowCount).toBeGreaterThan(0);
    expect((await report('general-ledger', '?account=4500')).json().totals.credit).toBe(900_00);
    const rp = (await report('receipts-payments')).json();
    expect(rp.groups[0].subtotal.amount).toBe(rp.groups[1].subtotal.amount);
    for (const id of ['monthly-receipts', 'monthly-payments', 'deposits-ledger', 'shares-ledger', 'dob-anniversary']) expect((await report(id)).statusCode).toBe(200);
    expect((await report('trial-balance', '', ddo)).statusCode).toBe(403);
  });

  it('year end: interest once, close and lock the year, then the dividend', async () => {
    const now = (await call('GET', '/accounts/year-end', accountant)).json();
    expect(now).toMatchObject({ fy: '2026-27', canClose: false });
    expect((await call('POST', '/accounts/year-end/close', accountant, { fy: '2026-27' })).json().code).toBe('RULE_VIOLATION');

    expect((await call('POST', '/__demo/clock', undefined, { today: '2027-04-02' })).statusCode).toBe(200);
    const preview = (await call('GET', '/accounts/year-end/interest?fy=2026-27', accountant)).json();
    expect(preview.rows.length).toBeGreaterThan(0);
    expect(preview.totals.all).toBe(preview.totals.SHARE_DEPOSIT + preview.totals.CRD + preview.totals.SRDS);
    expect((await call('POST', '/accounts/year-end/interest', cashier, { fy: '2026-27' })).statusCode).toBe(403);
    const crdRow = preview.rows.find((x: { scheme: string }) => x.scheme === 'CRD');
    const before = (await call('GET', `/deposits?memberId=${crdRow.memberId}`, accountant)).json();
    const posted = (await call('POST', '/accounts/year-end/interest', accountant, { fy: '2026-27' })).json();
    expect(posted.posted.entryNo).toMatch(/^JE-/);
    expect((await call('POST', '/accounts/year-end/interest', accountant, { fy: '2026-27' })).statusCode).toBe(409);
    const after = (await call('GET', `/deposits?memberId=${crdRow.memberId}`, accountant)).json();
    const bal = (x: { items?: Array<{ scheme: string; balance?: number; amount?: number }>; rows?: Array<{ scheme: string; balance?: number; amount?: number }> }) => (x.items ?? x.rows ?? []).find((d) => d.scheme === 'CRD');
    if (bal(before) && bal(after)) expect((bal(after)!.balance ?? bal(after)!.amount)! - (bal(before)!.balance ?? bal(before)!.amount)!).toBe(crdRow.interest);

    const ready = (await call('GET', '/accounts/year-end?fy=2026-27', accountant)).json();
    expect(ready).toMatchObject({ canClose: true, interestPosted: { entryNo: posted.posted.entryNo } });
    const closed = (await call('POST', '/accounts/year-end/close', accountant, { fy: '2026-27' })).json();
    expect(closed.closed).toMatchObject({ surplus: ready.income - ready.expense });
    // The year is locked: nothing dated in it is accepted, and P&L for it still shows the year's figures.
    const late = await call('POST', '/accounts/vouchers', accountant, { kind: 'PAYMENT', headCode: '5500', amount: 100_00, mode: 'CASH', party: 'Shop', narration: 'Files', date: '2027-03-31' });
    expect(late.json().ruleId).toBe('LED-CLOSED');
    const pl = (await report('profit-loss', '?from=2026-04-01&to=2027-03-31')).json();
    expect(pl.totals.amount).toBe(closed.closed.surplus);
    expect((await call('POST', '/accounts/year-end/close', accountant, { fy: '2026-27' })).statusCode).toBeGreaterThanOrEqual(400);

    const div = (await call('GET', '/accounts/year-end/dividend?fy=2026-27&rate=8', accountant)).json();
    expect(div.rows.length).toBeGreaterThan(0);
    expect((await call('POST', '/accounts/year-end/dividend', accountant, { fy: '2026-27', ratePercent: 8, resolution: '' })).json().fieldErrors).toHaveProperty('resolution');
    const declared = (await call('POST', '/accounts/year-end/dividend', accountant, { fy: '2026-27', ratePercent: 8, resolution: 'GB Res. 4 of 20 Jun 2027' })).json();
    expect(declared.declared).toMatchObject({ ratePercent: 8, resolution: 'GB Res. 4 of 20 Jun 2027' });
    expect(declared.total).toBe(div.total);
    const paid = (await call('POST', '/accounts/year-end/dividend/pay', accountant, { fy: '2026-27' })).json();
    expect(paid.paid.entryNo).toMatch(/^JE-/);
    expect((await call('GET', '/accounts/year-end?fy=2026-27', accountant)).json().dividend).toMatchObject({ ratePercent: 8, paid: true });
    expect((await tb()).balanced).toBe(true);
  });
});
