import type { DemandSheetDetail, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

// P7b-1 (D-088, REQ-132): deductions entered by the DDO online or by the Accountant from a paper
// sheet, reviewed and posted by the Accountant; partial deductions within the salary (R1).
describe('deduction entry (P7b-1)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let ddoFin: Session;
  let admin: Session;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const sheet = async (id: string, s: Session) => (await call('GET', `/demand/sheets/${id}`, s)).json() as DemandSheetDetail;
  const entry = (id: string, action: string, s: Session, body: object = {}) => call('POST', `/demand/sheets/${id}/entry/${action}`, s, body);
  const FIN = 'ds-2026-10-fin';

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, ddoFin, admin] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-ddo-fin'), signInAs(app, 'stf-admin')]);
  });
  afterAll(() => app.close());

  let partial = '';
  let partialAmount = 0;
  let full = '';
  it('the DDO enters actual deductions online, saves a draft and submits; the DDO can never post', async () => {
    const before = await sheet(FIN, ddoFin);
    expect(before.actions).toEqual(['saveEntry', 'submitEntry']);
    expect(before).toMatchObject({ sendBy: '2026-09-27' });
    const [a, b] = before.lines.filter((l) => l.availableSalary !== undefined && l.availableSalary > 0 && l.totalDemand > 0);
    partial = a!.memberId;
    full = b!.memberId;
    partialAmount = Math.min(a!.totalDemand, a!.availableSalary!) - 100;
    // More than the salary available is refused (never a negative payout).
    const tooMuch = await entry(FIN, 'saveEntry', ddoFin, { deductions: { [partial]: a!.availableSalary! + 100 } });
    expect(tooMuch.json().fieldErrors?.[`deductions.${partial}`] ?? tooMuch.json().fieldErrors?.[`deductions.${partial}`]).toBeTruthy();

    const saved = (await entry(FIN, 'saveEntry', ddoFin, { deductions: { [partial]: partialAmount, [full]: b!.totalDemand } })).json() as DemandSheetDetail;
    expect(saved.sheet.entry).toMatchObject({ status: 'DRAFT', source: 'DDO_ONLINE' });
    expect(saved.lines.find((l) => l.memberId === partial)).toMatchObject({ deducted: partialAmount, entrySource: 'DDO_ONLINE', enteredByName: 'Kiran Kumar' });
    expect((await call('POST', `/demand/sheets/${FIN}/actions/postRecovery`, ddoFin, {})).statusCode).toBe(403);
    expect((await entry(FIN, 'submitEntry', ddoFin)).json().sheet.entry.status).toBe('SUBMITTED');
    expect((await entry(FIN, 'saveEntry', ddoFin, { deductions: { [full]: 0 } })).statusCode).toBe(403);
  });

  it('the Accountant reviews: a correction puts it under review, a send-back needs a reason, the DDO resubmits', async () => {
    const review = await sheet(FIN, accountant);
    expect(review.actions).toEqual(expect.arrayContaining(['postRecovery', 'saveEntry', 'rejectEntry']));
    const corrected = (await entry(FIN, 'saveEntry', accountant, { deductions: { [full]: review.lines.find((l) => l.memberId === full)!.totalDemand - 1000 }, notes: { [full]: 'Leave without pay for 2 days' } })).json() as DemandSheetDetail;
    expect(corrected.sheet.entry).toMatchObject({ status: 'UNDER_REVIEW', reviewed: { byName: 'Suresh Goud' } });
    // The line keeps the DDO as its source; the audit trail keeps both amounts.
    expect(corrected.lines.find((l) => l.memberId === full)).toMatchObject({ entrySource: 'DDO_ONLINE', enteredByName: 'Suresh Goud', note: 'Leave without pay for 2 days' });
    expect((await entry(FIN, 'rejectEntry', accountant, { reason: 'short' })).json().fieldErrors).toHaveProperty('reason');
    const back = (await entry(FIN, 'rejectEntry', accountant, { reason: 'Check the deduction for the second member against the pay bill.' })).json() as DemandSheetDetail;
    expect(back.sheet.entry).toMatchObject({ status: 'REJECTED', rejection: { remarks: expect.stringContaining('pay bill') } });
    expect((await entry(FIN, 'submitEntry', ddoFin)).json().sheet.entry.status).toBe('SUBMITTED');
  });

  it('approve and post uses the entered amounts once; a short member keeps the rest as dues', async () => {
    const posted = (await call('POST', `/demand/sheets/${FIN}/actions/postRecovery`, accountant, {})).json() as DemandSheetDetail;
    expect(posted.sheet).toMatchObject({ status: 'RECOVERY_POSTED', entry: { status: 'POSTED', approved: { byName: 'Suresh Goud' } } });
    const line = posted.lines.find((l) => l.memberId === partial)!;
    expect(line).toMatchObject({ recovered: partialAmount, short: line.totalDemand - partialAmount, deducted: partialAmount });
    expect((await call('POST', `/demand/sheets/${FIN}/actions/postRecovery`, accountant, {})).json().code).toBe('INVALID_TRANSITION');
    const dues = (await call('GET', `/members/${partial}/dues`, accountant)).json();
    expect(dues.arrears.find((a: { cycle: string }) => a.cycle === '2026-10').unpaid).toBe(line.totalDemand - partialAmount);
    // Next month's sheet shows it as previous outstanding (not added to the demand, R2).
    await call('POST', '/demand/generate', accountant, { cycle: '2026-11', departmentIds: ['dept-fin'] });
    const nov = await sheet('ds-2026-11-fin', accountant);
    expect(nov.lines.find((l) => l.memberId === partial)?.previousOutstanding).toBe(dues.totalArrears - (dues.totalPenal ?? 0));
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('the Accountant enters a paper sheet and posts it; the minimum take-home pay limits every deduction', async () => {
    const GAD = 'ds-2026-10-gad';
    const s = await sheet(GAD, accountant);
    const m = s.lines.find((l) => l.availableSalary !== undefined && l.availableSalary > 0)!;
    const saved = (await entry(GAD, 'saveEntry', accountant, { deductions: { [m.memberId]: 0 } })).json() as DemandSheetDetail;
    expect(saved.sheet.entry).toMatchObject({ status: 'DRAFT', source: 'PHYSICAL_SHEET' });
    expect(saved.lines.find((l) => l.memberId === m.memberId)).toMatchObject({ deducted: 0, entrySource: 'PHYSICAL_SHEET' });

    // A minimum take-home pay above everyone's salary: the full demand can no longer be posted.
    expect((await call('PUT', '/settings/values', admin, { minTakeHomePay: 1_000_000_000 })).statusCode).toBe(200);
    const blocked = await call('POST', `/demand/sheets/${GAD}/actions/postRecovery`, accountant, {});
    expect(Object.values(blocked.json().fieldErrors ?? {}).some((x) => String(x).includes('salary available'))).toBe(true);
    await call('PUT', '/settings/values', admin, { minTakeHomePay: 0 });
    const posted = (await call('POST', `/demand/sheets/${GAD}/actions/postRecovery`, accountant, {})).json() as DemandSheetDetail;
    expect(posted.lines.find((l) => l.memberId === m.memberId)).toMatchObject({ recovered: 0 });
  });

  it('send-by days are an Admin setting that persists', async () => {
    expect((await call('PUT', '/settings/values', accountant, { demandSendByDays: 5 })).statusCode).toBe(403);
    await call('PUT', '/settings/values', admin, { demandSendByDays: 5 });
    const again = await buildTestApp();
    expect((await again.masters.settings()).demandSendByDays).toBe(5);
    await again.close();
    const o = (await call('GET', '/demand?cycle=2026-10', accountant)).json();
    expect(o.rows[0]).toMatchObject({ sendBy: '2026-09-26' });
  });
});
