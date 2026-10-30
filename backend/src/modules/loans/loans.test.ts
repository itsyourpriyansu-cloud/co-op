import type { Loan, Session, SuretyCard } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('loans (P5)', () => {
  let app: FastifyInstance;
  let sravani: Session;
  let accountant: Session;
  let ddoFin: Session;
  let secretary: Session;
  let president: Session;
  let cashier: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, s: Session, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const act = (id: string, action: string, s: Session, input: object = {}) => call('POST', `/loans/${id}/actions/${action}`, s, input);
  /** Any member signs in to the Member App with their mobile and the demo code. */
  const memberSession = async (memberId: string): Promise<Session> => {
    const mobile = data.members.find((m) => m.id === memberId)!.mobile;
    const { otpRef } = (await app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile, purpose: 'LOGIN' } })).json();
    return (await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { otpRef, otp: '123456' } })).json();
  };
  const sravaniRec = data.members.find((m) => m.generalNo === '1103')!;
  const request = (sureties: string[]) => ({
    product: 'ORDINARY',
    amount: 20000000,
    instalments: 60,
    purpose: 'House repairs',
    sureties,
    form: { pay: { scaleOfPay: sravaniRec.payProfile.scaleOfPay, grossSalary: sravaniRec.payProfile.grossSalary, govtLoanDeductions: 0, otherLoanDeductions: 0 } },
  });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [sravani, accountant, ddoFin, secretary, president, cashier] = await Promise.all([
      signInAs(app, 'mem-1103'),
      signInAs(app, 'stf-accountant'),
      signInAs(app, 'stf-ddo-fin'),
      signInAs(app, 'stf-secretary'),
      signInAs(app, 'stf-president'),
      signInAs(app, 'stf-cashier'),
    ]);
  });
  afterAll(() => app.close());

  it('lists loans with counts; staff never see app drafts; a DDO sees only their department', async () => {
    const list = (await call('GET', '/loans?pageSize=100', accountant)).json();
    const appDrafts = data.loans.filter((l) => l.status === 'DRAFT' && l.channel !== 'COUNTER').length;
    expect(list.counts.byProduct.ALL).toBe(data.loans.length - appDrafts);
    expect(list.items[0]).toMatchObject({ applicationNo: expect.any(String), memberName: expect.any(String), productName: expect.any(String), group: expect.any(String) });
    expect(list.items.some((r: { status: string; nextDue?: object }) => r.status === 'ACTIVE' && r.nextDue)).toBe(true);
    const ddo = (await call('GET', '/loans?pageSize=100', ddoFin)).json();
    expect(ddo.items.every((r: { departmentId: string }) => r.departmentId === 'dept-fin')).toBe(true);
    const active = data.loans.find((l) => l.status === 'ACTIVE')!;
    const detail = (await call('GET', `/loans/${active.applicationNo}`, accountant)).json();
    expect(detail).toMatchObject({ loan: { id: active.id }, stages: expect.any(Array), checks: [] });
    expect((await call('GET', '/loans', sravani)).statusCode).toBe(403);
  });

  let loanId = '';
  it('a member drafts, signs and submits; each surety signs with their own code', async () => {
    // Two members who can stand surety (no failing block check).
    const candidates = data.members.filter((m) => m.status === 'ACTIVE' && m.id !== sravaniRec.id && m.dor > '2040-01-01').slice(0, 15).map((m) => m.id);
    const cards: SuretyCard[] = (await call('POST', '/loans/surety-preview', sravani, { sureties: candidates.slice(0, 4), instalments: 60 })).json();
    const more: SuretyCard[] = (await call('POST', '/loans/surety-preview', sravani, { sureties: candidates.slice(4, 8), instalments: 60 })).json();
    const ok = [...cards, ...more].filter((c) => c.checks.every((x) => x.pass || x.severity === 'warn')).map((c) => c.memberId);
    expect(ok.length).toBeGreaterThanOrEqual(2);
    const sureties = ok.slice(0, 2);

    const ctx = (await call('GET', '/me/loans/context', sravani)).json();
    expect(ctx).toMatchObject({ member: { generalNo: '1103' }, firstDueCycle: expect.any(String), declaration: { version: expect.any(String) } });

    const draft = await call('POST', '/me/loans', sravani, request([]));
    expect(draft.statusCode).toBe(201);
    loanId = draft.json().loan.id;
    expect(draft.json().loan).toMatchObject({ status: 'DRAFT', applicationNo: expect.stringMatching(/^APP-\d{4}-\d{5}$/), channel: 'APP' });
    // Staff do not see a member's draft.
    expect((await call('GET', `/loans/${loanId}`, accountant)).statusCode).toBe(404);
    // Missing sureties: no code is sent.
    expect((await call('POST', `/me/loans/${loanId}/sign/request`, sravani)).json().fieldErrors).toHaveProperty('sureties');

    const saved = (await call('PUT', `/me/loans/${loanId}`, sravani, request(sureties))).json();
    expect(saved.loan.sureties.map((s: { memberId: string }) => s.memberId)).toEqual(sureties);
    const assess = (await call('POST', '/loans/assess', sravani, { ...request(sureties), loanId })).json();
    expect(assess).toMatchObject({ eligible: true, preview: { emi: expect.any(Number), netDisbursable: expect.any(Number) } });

    const { otpRef } = (await call('POST', `/me/loans/${loanId}/sign/request`, sravani)).json();
    expect((await call('POST', `/me/loans/${loanId}/submit`, sravani, { otpRef, otp: '000000' })).statusCode).toBe(400);
    const submitted = (await call('POST', `/me/loans/${loanId}/submit`, sravani, { otpRef, otp: '123456' })).json();
    expect(submitted.loan).toMatchObject({ status: 'SURETY_PENDING', signature: { textVersion: expect.any(String) } });
    expect((await call('PUT', `/me/loans/${loanId}`, sravani, request(sureties))).json().code).toBe('INVALID_TRANSITION');

    for (const id of sureties) {
      const s = await memberSession(id);
      const reqs = (await call('GET', '/me/surety-requests', s)).json();
      expect(reqs.requests.map((r: { loanId: string }) => r.loanId)).toContain(loanId);
      const code = (await call('POST', `/me/surety-requests/${loanId}/sign/request`, s)).json();
      const res = (await call('POST', `/me/surety-requests/${loanId}/accept`, s, { otpRef: code.otpRef, otp: '123456' })).json();
      expect(res.myStatus).toBe('ACCEPTED');
    }
    expect((await call('GET', `/me/loans/${loanId}`, sravani)).json().loan.status).toBe('ACCOUNTANT_REVIEW');
  });

  it('staff stages run in order; disbursement posts a balanced entry and starts the schedule', async () => {
    expect((await act(loanId, 'forward', accountant, {})).json().fieldErrors).toHaveProperty('checklist');
    expect((await act(loanId, 'forward', cashier, { checklist: { memberVerified: true, documentsVerified: true } })).json().code).toBe('INVALID_TRANSITION');
    expect((await act(loanId, 'forward', accountant, { checklist: { memberVerified: true, documentsVerified: true } })).json().loan.status).toBe('DDO_CERTIFICATION');
    expect((await act(loanId, 'ddoCertify', ddoFin, { recoveryFeasible: true })).json().loan.status).toBe('ASSESSMENT');

    const preview = (await call('GET', `/loans/${loanId}/sanction-preview?amount=15000000&instalments=60`, accountant)).json();
    expect(preview.sheet).toMatchObject({ amount: 15000000, instalments: 60 });
    expect((await call('GET', `/loans/${loanId}/sanction-preview?amount=99000000`, accountant)).json().fieldErrors).toHaveProperty('amount');
    const assessed = (await act(loanId, 'sendForSanction', accountant, { amount: 15000000, instalments: 60 })).json();
    expect(assessed.loan).toMatchObject({ status: 'SANCTION_SECRETARY', sanctionedAmount: 15000000 });
    expect((await act(loanId, 'secretarySign', secretary)).json().loan.status).toBe('SANCTION_PRESIDENT');
    const sanctioned = (await act(loanId, 'presidentSign', president)).json().loan as Loan;
    expect(sanctioned).toMatchObject({ status: 'SANCTIONED', sanctionLetterNo: expect.stringMatching(/^SL-\d{4}-\d{4}$/) });

    expect((await act(loanId, 'disburse', cashier, { disbursement: { mode: 'NEFT', reference: '', date: '2026-10-24' } })).json().fieldErrors).toHaveProperty('reference');
    const paid = (await act(loanId, 'disburse', cashier, { disbursement: { mode: 'NEFT', reference: 'UTR123456789', date: '2026-10-24' } })).json().loan as Loan;
    expect(paid).toMatchObject({ status: 'ACTIVE', loanNo: expect.stringMatching(/^LN-\d{4}-\d{5}$/), outstandingPrincipal: 15000000 });
    expect(paid.schedule.length).toBe(60);

    const journals = (await call('GET', '/ledger/journals?source=LOAN_DISBURSEMENT', accountant)).json();
    const entry = (await call('GET', `/ledger/journals/${journals.items[0].id}`, accountant)).json();
    expect(entry.sourceRef).toBe(paid.loanNo);
    expect(entry.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '1300', debit: 15000000, memberId: sravaniRec.id }),
        expect.objectContaining({ accountCode: '1200', credit: paid.disbursement!.amount }),
      ]),
    );
    if (paid.shareDepositDeduction) expect(entry.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '2100', credit: paid.shareDepositDeduction })]));
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);

    const mine = (await call('GET', '/me/loans', sravani)).json();
    expect(mine.find((r: { id: string }) => r.id === loanId)).toMatchObject({ status: 'ACTIVE', nextDue: { amount: expect.any(Number) } });
  });

  it('demo controls act for the stage owner, including the sureties', async () => {
    const pending = data.loans.find((l) => l.status === 'SURETY_PENDING' && l.sureties.every((s) => s.status !== 'DECLINED'))!;
    const after = (await call('POST', `/loans/${pending.id}/demo-act`, accountant)).json();
    expect(after.loan.status).toBe('ACCOUNTANT_REVIEW');
    const sanctioned = data.loans.find((l) => l.status === 'SANCTIONED')!;
    expect((await call('POST', `/loans/${sanctioned.id}/demo-act`, accountant)).json().loan).toMatchObject({ status: 'ACTIVE', loanNo: expect.any(String) });
  });

  it('a member discards a draft and withdraws a submitted application', async () => {
    const res = await call('POST', '/me/loans', sravani, { product: 'SALARY', amount: 1000000, instalments: 10, purpose: 'Medical', form: {} });
    const draft = res.json();
    expect((await call('DELETE', `/me/loans/${draft.loan.id}`, sravani)).json()).toEqual({ ok: true });
    expect((await call('GET', `/me/loans/${draft.loan.id}`, sravani)).statusCode).toBe(404);

    const review = data.loans.find((l) => l.status === 'ACCOUNTANT_REVIEW')!;
    const owner = await memberSession(review.memberId);
    expect((await call('POST', `/me/loans/${review.id}/withdraw`, owner, { reason: 'No longer needed' })).json().loan.status).toBe('WITHDRAWN');
    expect((await call('POST', `/me/loans/${review.id}/withdraw`, owner, {})).json().code).toBe('INVALID_TRANSITION');
    // Someone else's loan is not found.
    expect((await call('POST', `/me/loans/${review.id}/withdraw`, sravani, {})).statusCode).toBe(404);
  });

  it('the office enters a paper application and submits it in one go; a failed submit leaves nothing', async () => {
    const before = (await call('GET', '/loans?pageSize=1', accountant)).json().total;
    const bad = await call('POST', '/loans', accountant, { memberId: sravaniRec.id, product: 'ORDINARY', amount: 100000, instalments: 10, purpose: 'x', sureties: [], form: {}, submit: true });
    expect(bad.statusCode).toBe(400);
    expect((await call('GET', '/loans?pageSize=1', accountant)).json().total).toBe(before);
    const ok = await call('POST', '/loans', accountant, { memberId: sravaniRec.id, product: 'SALARY', amount: 1000000, instalments: 10, purpose: 'Medical', sureties: [], form: {} });
    expect(ok.json().loan).toMatchObject({ status: 'DRAFT', channel: 'COUNTER', createdByName: 'Suresh Goud' });
    // An office draft is visible to staff (it came from a signed paper form).
    expect((await call('GET', `/loans/${ok.json().loan.id}`, accountant)).statusCode).toBe(200);
    const search = (await call('GET', '/members/search?q=1103', accountant)).json();
    expect(search[0]).toMatchObject({ generalNo: '1103', activeGuarantees: expect.any(Number) });
  });
});
