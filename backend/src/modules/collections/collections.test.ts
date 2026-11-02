import { denominationsFor } from '@tgs/domain';
import type { DemandSheetDetail, MemberDues, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('demand & collections (P7)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  let ddoFin: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const entries = async (source: string) => (await call('GET', `/ledger/journals?source=${source}&pageSize=100`, accountant)).json().items as Array<{ id: string; sourceRef: string; total: number }>;
  const lines = async (id: string) => (await call('GET', `/ledger/journals/${id}`, accountant)).json().lines as Array<{ accountCode: string; debit: number; credit: number; memberId?: string }>;
  const balanced = async () => {
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, cashier, ddoFin] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier'), signInAs(app, 'stf-ddo-fin')]);
  });
  afterAll(() => app.close());

  it('shows a cycle by department; a DDO sees only their own', async () => {
    const o = (await call('GET', '/demand?cycle=2026-10', accountant)).json();
    const sheets = data.demandSheets.filter((s) => s.cycle === '2026-10');
    expect(o.totals.generated).toBe(sheets.length);
    expect(o.cycles).toContain('2026-10');
    const fin = o.rows.find((r: { departmentId: string }) => r.departmentId === 'dept-fin');
    expect(fin).toMatchObject({ status: 'SENT_TO_DDO', members: sheets.find((s) => s.departmentId === 'dept-fin')!.lines.length, myAction: 'Enter recovery' });
    const ddo = (await call('GET', '/demand?cycle=2026-10', ddoFin)).json();
    expect(ddo.rows.map((r: { departmentId: string }) => r.departmentId)).toEqual(['dept-fin']);
    expect((await call('GET', '/demand/sheets/ds-2026-10-gad', ddoFin)).statusCode).toBe(404);
  });

  it('previews and generates the next cycle once (Accountant only)', async () => {
    const p = (await call('GET', '/demand/preview?cycle=2026-11', accountant)).json();
    expect(p.rows.length).toBeGreaterThan(0);
    expect(p.rows.every((r: { members: number; total: number }) => r.members === 0 || r.total > 0)).toBe(true);
    expect((await call('POST', '/demand/generate', cashier, { cycle: '2026-11', departmentIds: ['dept-fin'] })).statusCode).toBe(403);
    const gen = (await call('POST', '/demand/generate', accountant, { cycle: '2026-11', departmentIds: ['dept-fin'] })).json();
    expect(gen.generated).toEqual(['ds-2026-11-fin']);
    const sheet = (await call('GET', '/demand/sheets/ds-2026-11-fin', accountant)).json() as DemandSheetDetail;
    expect(sheet.sheet.status).toBe('GENERATED');
    expect(sheet.lines.length).toBe(p.rows.find((r: { departmentId: string }) => r.departmentId === 'dept-fin').members);
    expect((await call('POST', '/demand/generate', accountant, { cycle: '2026-11', departmentIds: ['dept-fin'] })).json().fieldErrors).toHaveProperty('departmentIds');
    expect((await call('POST', '/demand/generate', accountant, { cycle: '2027-05' })).json().fieldErrors).toHaveProperty('cycle');
    // BR-030 path: certify, then send to the DDO.
    expect((await call('POST', '/demand/sheets/ds-2026-11-fin/actions/sendToDdo', accountant)).json().code).toBe('INVALID_TRANSITION');
    expect((await call('POST', '/demand/sheets/ds-2026-11-fin/actions/certify', accountant)).json().sheet.status).toBe('CERTIFIED');
    expect((await call('POST', '/demand/sheets/ds-2026-11-fin/actions/sendToDdo', accountant)).json().sheet.status).toBe('SENT_TO_DDO');
  });

  let shortMember = '';
  it('posting a recovery allocates it, moves the money and posts one balanced entry', async () => {
    const sheet = data.demandSheets.find((s) => s.id === 'ds-2026-10-fin')!;
    const withLoan = sheet.lines.find((l) => l.components.some((c) => c.head === 'PRINCIPAL') && l.components.some((c) => c.head === 'CRD'))!;
    shortMember = sheet.lines.find((l) => l.memberId !== withLoan.memberId && l.totalDemand > 100_000)!.memberId;
    const loanId = withLoan.components.find((c) => c.head === 'PRINCIPAL')!.loanId!;
    const loanBefore = (await call('GET', `/loans/${loanId}`, accountant)).json().loan;
    const principal = withLoan.components.filter((c) => c.loanId === loanId && c.head === 'PRINCIPAL').reduce((s, c) => s + c.amount, 0);

    expect((await call('POST', '/demand/sheets/ds-2026-10-fin/actions/postRecovery', accountant, { recovered: { [shortMember]: 999_999_999 } })).json().fieldErrors).toHaveProperty(`recovered.${shortMember}`);
    const posted = (await call('POST', '/demand/sheets/ds-2026-10-fin/actions/postRecovery', accountant, { recovered: { [shortMember]: 50_000 } })).json() as DemandSheetDetail;
    expect(posted.sheet.status).toBe('RECOVERY_POSTED');
    expect(posted.totals.shortMembers).toBeGreaterThanOrEqual(1);

    const loanAfter = (await call('GET', `/loans/${loanId}`, accountant)).json().loan;
    expect(loanAfter.outstandingPrincipal).toBe(loanBefore.outstandingPrincipal - principal);
    expect(loanAfter.schedule.find((r: { dueCycle: string }) => r.dueCycle === '2026-10').paidStatus).toBe('PAID');

    const e = (await entries('SALARY_RECOVERY')).find((x) => x.sourceRef === 'ds-2026-10-fin')!;
    expect(e.total).toBe(posted.totals.recovered);
    const l = await lines(e.id);
    expect(l).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '1200', debit: posted.totals.recovered }), expect.objectContaining({ accountCode: '1300', memberId: withLoan.memberId })]));
    const receipts = (await call('GET', '/receipts?tab=SALARY_RECOVERY&cycle=2026-10&pageSize=100', accountant)).json();
    expect(receipts.items.some((r: { memberId: string }) => r.memberId === withLoan.memberId)).toBe(true);
    await balanced();
  });

  it('a short member owes the rest; a counter receipt pays it oldest first', async () => {
    const dues = (await call('GET', `/members/${shortMember}/dues`, cashier)).json() as MemberDues;
    const oct = dues.arrears.find((a) => a.cycle === '2026-10')!;
    expect(oct.unpaid).toBeGreaterThan(0);
    const amount = Math.min(dues.totalArrears, 100_000);
    const input = { memberId: shortMember, purpose: 'DUES', mode: 'CASH', amount, date: '2026-10-24' };
    expect((await call('POST', '/receipts', cashier, { ...input, denominations: { 500: 1 } })).json().fieldErrors).toHaveProperty('denominations');
    expect((await call('POST', '/receipts', cashier, { ...input, mode: 'ADJUSTMENT', remarks: 'Moved from suspense account' })).json().fieldErrors).toHaveProperty('mode');
    const res = await call('POST', '/receipts', cashier, { ...input, denominations: denominationsFor(amount) });
    expect(res.statusCode).toBe(201);
    const r = res.json();
    expect(r.receipt).toMatchObject({ receiptNo: expect.stringMatching(/^RCP-C-\d{6}$/), amount, purpose: 'DUES' });
    expect(r.lines.reduce((s: number, x: { amount: number }) => s + x.amount, 0)).toBe(amount);
    const after = (await call('GET', `/members/${shortMember}/dues`, cashier)).json() as MemberDues;
    expect(after.totalArrears).toBe(dues.totalArrears - amount);
    const e = (await entries('RECEIPT')).find((x) => x.sourceRef === r.receipt.receiptNo)!;
    expect(await lines(e.id)).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '1100', debit: amount })]));
    await balanced();
  });

  it('a member reports a payment; the Cashier verifies it into a receipt or rejects it', async () => {
    const member = await signInAsMember(shortMember);
    const before = (await call('GET', '/me/payments', member)).json();
    expect(before.months.find((m: { cycle: string }) => m.cycle === '2026-10')).toMatchObject({ sheetStatus: 'RECOVERY_POSTED' });
    if (!before.dues.totalArrears) return;
    const report = { amount: Math.min(before.dues.totalArrears, 10_000), paidOn: '2026-10-23', mode: 'UPI', reference: 'UPI99887766', towards: 'DUES' };
    const created = await call('POST', '/me/payments/reports', member, report);
    expect(created.statusCode).toBe(201);
    expect((await call('POST', '/me/payments/reports', member, report)).json().fieldErrors).toHaveProperty('reference');
    const id = created.json().id;
    expect((await call('POST', `/payment-reports/${id}/reject`, cashier, { reason: 'short' })).json().fieldErrors).toHaveProperty('reason');
    const verified = (await call('POST', `/payment-reports/${id}/verify`, cashier, {})).json();
    expect(verified).toMatchObject({ receipt: { paymentReportId: id, source: 'BANK_TRANSFER' }, report: { status: 'VERIFIED' } });
    expect((await call('POST', `/payment-reports/${id}/verify`, cashier, {})).json().code).toBe('INVALID_TRANSITION');
    const mine = (await call('GET', `/me/receipts/${verified.receipt.id}`, member)).json();
    expect(mine.receipt.id).toBe(verified.receipt.id);
    await balanced();
  });

  it('demo control moves a sheet along as the Accountant', async () => {
    expect((await call('POST', '/demand/sheets/ds-2026-10-irr/demo-act', accountant)).json().sheet.status).toBe('CERTIFIED');
  });

  /** Any member signs in to the Member App with their mobile and the demo code. */
  async function signInAsMember(memberId: string): Promise<Session> {
    const mobile = data.members.find((m) => m.id === memberId)!.mobile;
    const { otpRef } = (await app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile, purpose: 'LOGIN' } })).json();
    return (await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { otpRef, otp: '123456' } })).json();
  }
});
