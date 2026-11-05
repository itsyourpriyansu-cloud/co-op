import { penalDue } from '@tgs/domain';
import type { MemberDues, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// P7b-2 (D-088, BR-012, F-06 [P]): penal interest worked out on read, collected first at the counter,
// posted to penal income (4200), waivable by the Accountant with a reason.
describe('penal interest (P7b-2)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  let cashier: Session;
  const data = demoDataset();
  // A member short on an Ordinary loan instalment in September (two loan heads unpaid).
  const MEMBER = 'mem-1017';
  const sept = data.demandSheets.find((s) => s.id === 'ds-2026-09-fin')!.lines.find((l) => l.memberId === MEMBER)!;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const dues = async () => (await call('GET', `/members/${MEMBER}/dues`, accountant)).json() as MemberDues;
  const septDues = (d: MemberDues) => d.arrears.find((a) => a.cycle === '2026-09')!;
  // The demo clock (DEMO_MODE): the dataset's date.
  const today = demoDataset().today;
  const pay = (amount: number, reference: string) => call('POST', '/receipts', cashier, { memberId: MEMBER, purpose: 'DUES', mode: 'BANK_TRANSFER', amount, date: today, reference });
  const lastEntryLines = async (source: string) => {
    const j = (await call('GET', `/ledger/journals?source=${source}`, accountant)).json();
    return (await call('GET', `/ledger/journals/${j.items[0].id}`, accountant)).json().lines as Array<{ accountCode: string; debit: number; credit: number }>;
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant, cashier] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('is 0 while the rate is 0 (F-06; the default is a 2% placeholder, D-093)', async () => {
    await call('PUT', '/settings/loan-products/ORDINARY', admin, { penalRatePercent: 0 });
    const d = await dues();
    expect(d.totalPenal).toBe(0);
    expect(septDues(d).penal).toBe(0);
  });

  it('with a rate: simple interest per day on the unpaid loan instalment only, from the cycle end', async () => {
    await call('PUT', '/settings/loan-products/ORDINARY', admin, { penalRatePercent: 12 });
    const d = await dues();
    const expected = penalDue({ cycle: '2026-09', components: sept.components, rates: { ORDINARY: 12 }, graceDays: 0, asOf: today });
    expect(expected).toBeGreaterThan(0);
    expect(septDues(d).penal).toBe(expected);
    expect(d.totalPenal).toBeGreaterThanOrEqual(expected);
    expect(d.totalArrears).toBe(d.arrears.reduce((s, a) => s + a.unpaid + a.penal, 0));
    // Grace days push the start back.
    await call('PUT', '/settings/values', admin, { penalGraceDays: 400 });
    expect(septDues(await dues()).penal).toBe(0);
    await call('PUT', '/settings/values', admin, { penalGraceDays: 0 });
  });

  it('a payment takes penal first, posts it to 4200 once, and stops it accruing on what was paid', async () => {
    const before = await dues();
    const penal = before.totalPenal;
    // Smaller than the penal: penal only, nothing towards the instalments.
    const small = (await pay(Math.min(1_000, penal), 'UTR-PENAL-1')).json();
    expect(small.receipt.allocations).toEqual([expect.objectContaining({ head: 'PENAL' })]);
    expect(await lastEntryLines('RECEIPT')).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '4200', credit: Math.min(1_000, penal) })]));
    const mid = await dues();
    expect(mid.totalPenal).toBe(penal - Math.min(1_000, penal));
    expect(mid.totalArrears).toBe(before.totalArrears - Math.min(1_000, penal));

    // The rest of the penal plus part of the instalment.
    const rest = (await pay(mid.totalPenal + 50_000, 'UTR-PENAL-2')).json();
    expect(rest.receipt.allocations[0]).toMatchObject({ head: 'PENAL', amount: mid.totalPenal });
    const after = await dues();
    expect(after.totalPenal).toBe(0); // settled today: nothing new accrues until tomorrow
    expect(after.totalArrears).toBe(mid.totalArrears - mid.totalPenal - 50_000);
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('the Accountant waives penal with a reason; others cannot; it is kept on the line', async () => {
    // A second member with penal still owed.
    const other = 'mem-1524';
    const d = (await call('GET', `/members/${other}/dues`, accountant)).json() as MemberDues;
    const a = d.arrears.find((x) => x.penal > 0)!;
    const waive = (s: Session, body: object) => call('POST', `/members/${other}/dues/penal-waiver`, s, { sheetId: a.sheetId, ...body });
    expect((await waive(cashier, { amount: 100, reason: 'Late pay bill from the department' })).statusCode).toBe(403);
    expect((await waive(accountant, { amount: 100, reason: 'late' })).json().fieldErrors).toHaveProperty('reason');
    expect((await waive(accountant, { amount: a.penal + 100, reason: 'Late pay bill from the department' })).json().fieldErrors).toHaveProperty('amount');
    const half = Math.floor(a.penal / 2);
    const after = (await waive(accountant, { amount: half, reason: 'Late pay bill from the department' })).json() as MemberDues;
    const line = after.arrears.find((x) => x.sheetId === a.sheetId)!;
    expect(line).toMatchObject({ penal: a.penal - half, penalWaived: half });
  });
});
