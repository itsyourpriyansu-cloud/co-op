import type { DepositAccount, LoanDetail, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// D-099: the forms of 05 Nov 2026 — loan bond wording (F8 / F9), loan receipt (F7), FD voucher (F10).
describe('bond, receipt and voucher (F7–F10)', () => {
  let app: FastifyInstance;
  let cashier: Session;
  let admin: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [cashier, admin] = await Promise.all([signInAs(app, 'stf-cashier'), signInAs(app, 'stf-admin')]);
  });
  afterAll(() => app.close());

  it('the bond is part of what the borrower signs', async () => {
    const member = await signInAs(app, 'mem-1103');
    const ctx = (await call('GET', '/me/loans/context', member)).json();
    expect(ctx.declaration.version).toBe('F2+F3+F8+F9-2026.2');
    expect(ctx.declaration.f2).toMatch(/jointly and severally promise to pay/);
    expect(ctx.declaration.f3).toMatch(/Salary loan bond \(F9\)/);
  });

  it('the Cashier pays someone else on authorisation; the borrower confirms receipt with an OTP', async () => {
    const loan = data.loans.find((l) => l.status === 'SANCTIONED')!;
    const paid = (await call('POST', `/loans/${loan.id}/actions/disburse`, cashier, { disbursement: { mode: 'NEFT', reference: 'UTR-F7-1', date: data.today, payee: 'Ramesh S' } })).json() as LoanDetail;
    expect(paid.loan.disbursement).toMatchObject({ payee: 'Ramesh S', byName: expect.any(String), signatureFileId: expect.any(String) });
    const mobile = data.members.find((m) => m.id === loan.memberId)!.mobile;
    const code = (await app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile, purpose: 'LOGIN' } })).json();
    const borrower = (await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { otpRef: code.otpRef, otp: code.demoOtp } })).json() as Session;
    const otp = (await call('POST', `/me/loans/${loan.id}/receipt/request`, borrower, {})).json();
    const done = (await call('POST', `/me/loans/${loan.id}/receipt`, borrower, { otpRef: otp.otpRef, otp: otp.demoOtp })).json() as LoanDetail;
    expect(done.loan.receiptAck).toMatchObject({ textVersion: 'F7-2026.1', fileId: expect.any(String) });
    expect((await call('POST', `/me/loans/${loan.id}/receipt/request`, borrower, {})).json().code).toBe('INVALID_TRANSITION');
  });

  it('money paid out of an FD gets a numbered voucher', async () => {
    const fd = data.deposits.find((d) => d.scheme === 'FD' && d.status === 'ACTIVE')!;
    const d = (await call('POST', `/deposits/${fd.id}/actions/withdraw`, admin, { remarks: 'Needs the money' })).json().deposit as DepositAccount;
    expect(d.vouchers).toEqual([expect.objectContaining({ no: expect.stringMatching(/^VR-\d{4}-\d{5}$/), kind: 'PREMATURE', amount: d.prematureWithdrawal!.payable })]);
  });
});
