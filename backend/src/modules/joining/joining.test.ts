import { F1_CERT_ITEMS, type MembershipApplication, type Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('joining (P4c)', () => {
  let app: FastifyInstance;
  let divya: Session;
  let accountant: Session;
  let ddoFin: Session;
  let secretary: Session;
  let president: Session;
  let cashier: Session;
  const data = demoDataset();
  // A complete form to copy: Ravi's (Finance), with a fresh employee ID.
  const ravi = data.membershipApplications.find((a) => a.applicantId === 'apl-ravi')!;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session | undefined, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, ...(s ? { headers: bearer(s) } : {}), ...(payload ? { payload } : {}) });
  const act = (id: string, action: string, s: Session, input: object = {}) => call('POST', `/membership/applications/${id}/actions/${action}`, s, input);

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [divya, accountant, ddoFin, secretary, president, cashier] = await Promise.all([
      signInAs(app, 'apl-divya'),
      signInAs(app, 'stf-accountant'),
      signInAs(app, 'stf-ddo-fin'),
      signInAs(app, 'stf-secretary'),
      signInAs(app, 'stf-president'),
      signInAs(app, 'stf-cashier'),
    ]);
  });
  afterAll(() => app.close());

  it('serves the join reference without signing in', async () => {
    const ref = (await call('GET', '/joining/reference', undefined)).json();
    expect(ref.departments.length).toBeGreaterThan(0);
    expect(ref).toMatchObject({ shareValue: expect.any(Number), minShares: expect.any(Number), requiredDocuments: expect.any(Array), agreements: expect.any(Array) });
  });

  let id = '';
  it('an applicant drafts, signs with a code and submits', async () => {
    expect((await call('GET', '/membership/me', divya)).json()).toBeNull();
    const elig = (await call('POST', '/membership/me/eligibility', divya, { worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: false })).json();
    expect(elig.eligible).toBe(true);
    id = elig.application.id;
    expect(elig.application).toMatchObject({ status: 'DRAFT', applicationNo: expect.stringMatching(/^MEM-\d{4}-\d{4}$/) });

    // Incomplete: no code is sent.
    expect((await call('POST', '/membership/me/sign/request', divya)).json().fieldErrors).toBeTruthy();

    const { documents, ...form } = ravi.form!;
    await call('PUT', '/membership/me/draft', divya, { ...form, personal: { ...form.personal, fullName: 'Divya S' }, employment: { ...form.employment, employeeId: 'TSDIVYA1' } });
    const draft = (await call('PUT', '/membership/me/draft', divya, { documents })).json();
    expect(draft.form.employment.employeeId).toBe('TSDIVYA1');
    expect(draft.form.documents.length).toBe(documents!.length);

    const { otpRef, demoOtp } = (await call('POST', '/membership/me/sign/request', divya)).json();
    expect(demoOtp).toBe('123456');
    expect((await call('POST', '/membership/me/submit', divya, { otpRef, otp: '000000' })).statusCode).toBe(400);
    const submitted = (await call('POST', '/membership/me/submit', divya, { otpRef, otp: '123456' })).json();
    expect(submitted).toMatchObject({ status: 'SUBMITTED', name: 'Divya S', departmentId: ravi.departmentId, signature: { method: 'OTP' } });
    expect((await call('PUT', '/membership/me/draft', divya, { shares: { sharesProposed: 1 } })).json().code).toBe('INVALID_TRANSITION');
  });

  it('a DDO sees only their department and only submitted applications', async () => {
    const list = (await call('GET', '/membership/applications', ddoFin)).json();
    expect(list.rows.every((r: { departmentId: string }) => r.departmentId === 'dept-fin')).toBe(true);
    expect(list.scope.departmentId).toBe('dept-fin');
    const other = data.membershipApplications.find((a) => a.departmentId !== 'dept-fin' && a.status !== 'DRAFT')!;
    expect((await call('GET', `/membership/applications/${other.id}`, ddoFin)).statusCode).toBe(404);
    expect((await call('GET', '/membership/applications', divya)).statusCode).toBe(403);
  });

  it('staff stages run in order; share payment admits the member and posts the receipt', async () => {
    expect((await act(id, 'certify', ddoFin)).json().code).toBe('INVALID_TRANSITION');
    expect((await act(id, 'sendToDdo', accountant, { remarks: 'Documents complete.' })).json().application.status).toBe('DDO_CERTIFICATION');
    expect((await act(id, 'certify', accountant)).statusCode).toBe(403);
    expect((await act(id, 'certify', ddoFin, { mandateAgreed: true })).json().fieldErrors).toHaveProperty('items');
    const items = Object.fromEntries(F1_CERT_ITEMS.map((i) => [i, 'OK']));
    expect((await act(id, 'certify', ddoFin, { items, mandateAgreed: true })).json().application.status).toBe('OFFICE_REVIEW');
    expect((await act(id, 'forward', accountant, { remarks: 'Eligible.' })).json().application.status).toBe('APPROVAL_SECRETARY');
    expect((await act(id, 'approve', secretary)).json().application.status).toBe('APPROVAL_PRESIDENT');
    expect((await act(id, 'approve', president)).json().fieldErrors).toHaveProperty('sharePaymentRoute');
    expect((await act(id, 'approve', president, { sharePaymentRoute: 'COUNTER' })).json().application.status).toBe('SHARE_PAYMENT_PENDING');
    expect((await act(id, 'recordSharePayment', cashier, { mode: 'UPI' })).json().fieldErrors).toHaveProperty('reference');

    const paid = (await act(id, 'recordSharePayment', cashier, { mode: 'UPI', reference: 'UPI-778899' })).json();
    const a: MembershipApplication = paid.application;
    expect(a.status).toBe('ACTIVE');
    expect(a.shareReceipt).toMatchObject({ mode: 'UPI', receiptNo: expect.stringMatching(/^SH-\d{4}-\d{4}$/) });
    const generalNo = a.allottedGeneralNo!;

    const member = (await call('GET', `/members/${generalNo}`, accountant)).json();
    expect(member.member).toMatchObject({ name: 'Divya S', employeeId: 'TSDIVYA1', departmentId: ravi.departmentId, status: 'ACTIVE' });
    expect(member.mandate).toMatchObject({ status: 'AGREED' });
    expect(member.serviceEvents.some((e: { type: string }) => e.type === 'JOINED')).toBe(true);

    // The receipt is in the books: bank debited, the member's share capital credited.
    const journals = (await call('GET', '/ledger/journals?source=SHARE_RECEIPT', accountant)).json();
    const entry = (await call('GET', `/ledger/journals/${journals.items[0].id}`, accountant)).json();
    expect(entry.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '1200', debit: a.shareReceipt!.amount }),
        expect.objectContaining({ accountCode: '3100', credit: a.shareReceipt!.amount, memberId: member.member.id }),
      ]),
    );
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);

    // Same login, now a member (D-026); the tracker still shows the application.
    await new Promise((r) => setTimeout(r, 2100));
    const me = (await call('GET', '/me', divya)).json();
    expect(me.user).toMatchObject({ role: 'MEMBER', generalNo });
    expect((await call('GET', '/membership/me', divya)).json().id).toBe(id);
  });

  it('demo controls act for the stage owner; paid by first demand posts nothing yet', async () => {
    const before = (await call('GET', '/ledger/journals?source=SHARE_RECEIPT', accountant)).json().items.length;
    const pending = data.membershipApplications.find((x) => x.status === 'APPROVAL_PRESIDENT')!;
    // Phone tracker: the President approves (demo default COUNTER), then the cashier records cash.
    expect((await call('POST', `/__demo/membership/${pending.id}/advance`, undefined)).json().status).toBe('SHARE_PAYMENT_PENDING');
    expect((await call('POST', `/__demo/membership/${pending.id}/advance`, undefined)).json()).toMatchObject({ status: 'ACTIVE', shareReceipt: { mode: 'CASH' } });
    expect((await call('GET', '/ledger/journals?source=SHARE_RECEIPT', accountant)).json().items.length).toBe(before + 1);

    // Console demo control on another department's DDO stage.
    const atDdo = data.membershipApplications.find((x) => x.status === 'DDO_CERTIFICATION' && x.departmentId !== 'dept-fin')!;
    expect((await call('GET', `/membership/applications/${atDdo.id}`, accountant)).json().demoActAs).toMatchObject({ role: 'DDO' });
    expect((await call('POST', `/membership/applications/${atDdo.id}/demo-act`, accountant)).json().application.status).toBe('OFFICE_REVIEW');

    // Rejecting needs a reason; the demo control supplies one.
    const submitted = data.membershipApplications.find((x) => x.status === 'SUBMITTED')!;
    expect((await act(submitted.id, 'reject', accountant, { remarks: 'short' })).json().fieldErrors).toHaveProperty('remarks');
    expect((await call('POST', `/__demo/membership/${submitted.id}/reject`, undefined)).json()).toMatchObject({ status: 'REJECTED', rejection: { remarks: expect.any(String) } });
  });
});
