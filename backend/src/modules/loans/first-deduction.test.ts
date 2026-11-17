import { earlyInterestFor, firstDeductionOptions } from '@tgs/domain';
import type { Loan, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// D-124: the Accountant chooses the first deduction month, the days before it are charged, and the
// choice is checked again when the Cashier pays.
describe('first deduction month and early interest (D-124)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let secretary: Session;
  let president: Session;
  let cashier: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const act = (id: string, action: string, s: Session, input: object = {}) => call('POST', `/loans/${id}/actions/${action}`, s, input);
  const loan = data.loans.find((l) => l.status === 'ASSESSMENT')!;
  const dept = data.members.find((m) => m.id === loan.memberId)!.departmentId;
  const today = '2026-10-24';

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, secretary, president, cashier] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-secretary'), signInAs(app, 'stf-president'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('offers the two earliest open months; a month outside them is refused', async () => {
    const p = (await call('GET', `/loans/${loan.id}/sanction-preview`, accountant)).json();
    expect(p.firstDueOptions).toEqual(['2026-11', '2026-12']);
    expect(p.sheet).toMatchObject({ firstDueCycle: '2026-11', firstDueChosen: true });
    const bad = (await call('GET', `/loans/${loan.id}/sanction-preview?firstDueCycle=2027-03`, accountant)).json();
    expect(bad.fieldErrors).toHaveProperty('firstDueCycle');
    expect((await act(loan.id, 'sendForSanction', accountant, { firstDueCycle: '2027-03' })).json().fieldErrors).toHaveProperty('firstDueCycle');
  });

  it('charges the days before the chosen month (the setting is on), only on the first instalment', async () => {
    const p = (await call('GET', `/loans/${loan.id}/sanction-preview?firstDueCycle=2026-12`, accountant)).json();
    const expected = earlyInterestFor(p.sheet.amount, p.sheet.ratePercent, today, '2026-12');
    expect(expected).toBeGreaterThan(0);
    expect(p.sheet).toMatchObject({ firstDueCycle: '2026-12', earlyInterest: expected, earlyInterestFrom: today });
    // An earlier month means fewer days, so less interest.
    const nov = (await call('GET', `/loans/${loan.id}/sanction-preview?firstDueCycle=2026-11`, accountant)).json();
    expect(nov.sheet.earlyInterest).toBe(earlyInterestFor(p.sheet.amount, p.sheet.ratePercent, today, '2026-11'));
    expect(nov.sheet.earlyInterest).toBeLessThan(p.sheet.earlyInterest);
  });

  it('the paid loan starts in the chosen month; closing that month first blocks payment until the Accountant moves it', async () => {
    const sanction = (await act(loan.id, 'sendForSanction', accountant, { firstDueCycle: '2026-11' })).json();
    expect(sanction.loan.status).toBe('SANCTION_SECRETARY');
    expect((await act(loan.id, 'secretarySign', secretary)).json().loan.status).toBe('SANCTION_PRESIDENT');
    expect((await act(loan.id, 'presidentSign', president)).json().loan.status).toBe('SANCTIONED');

    // November's sheet for this department is made and certified: that month is closed to new instalments.
    expect((await call('POST', '/demand/generate', accountant, { cycle: '2026-11', departmentIds: [dept] })).statusCode).toBe(200);
    expect((await call('POST', `/demand/sheets/ds-2026-11-${dept.replace('dept-', '')}/actions/certify`, accountant)).statusCode).toBe(200);

    const pay = { disbursement: { mode: 'NEFT', reference: 'UTR123456789', date: today } };
    const blocked = (await act(loan.id, 'disburse', cashier, pay)).json();
    expect(blocked.code).toBe('RULE_VIOLATION');
    expect(blocked.message).toMatch(/Nov 2026 is closed/);

    // Only the Accountant moves it, and only to an open month.
    expect((await call('POST', `/loans/${loan.id}/first-deduction`, cashier, { firstDueCycle: '2026-12' })).statusCode).toBe(403);
    expect((await call('POST', `/loans/${loan.id}/first-deduction`, accountant, { firstDueCycle: '2026-11' })).json().fieldErrors).toHaveProperty('firstDueCycle');
    const moved = (await call('POST', `/loans/${loan.id}/first-deduction`, accountant, { firstDueCycle: '2026-12' })).json().loan as Loan;
    expect(moved.events.at(-1)).toMatchObject({ action: 'changeFirstDue' });

    const paid = (await act(loan.id, 'disburse', cashier, pay)).json().loan as Loan;
    expect(paid.status).toBe('ACTIVE');
    const first = paid.schedule[0]!;
    expect(first.dueCycle).toBe('2026-12');
    const early = earlyInterestFor(paid.sanctionedAmount!, paid.ratePercent, today, '2026-12');
    expect(first.earlyInterest).toBe(early);
    expect(first.emi).toBe(first.principal + first.interest);
    expect(paid.schedule[1]!.earlyInterest).toBeUndefined();
    // After payment the month can no longer be changed.
    expect((await call('POST', `/loans/${loan.id}/first-deduction`, accountant, { firstDueCycle: '2027-01' })).json().code).toBe('INVALID_TRANSITION');
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('the domain and the service agree on which months are open', () => {
    expect(firstDeductionOptions({ today, sendByDays: 4, sheetStatus: () => undefined })).toEqual(['2026-11', '2026-12']);
  });
});
