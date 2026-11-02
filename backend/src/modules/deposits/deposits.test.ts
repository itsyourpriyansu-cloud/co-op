import { denominationsFor } from '@tgs/domain';
import type { DepositAccount, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('deposits (P6)', () => {
  let app: FastifyInstance;
  let sravani: Session;
  let accountant: Session;
  let secretary: Session;
  let president: Session;
  let cashier: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const act = (id: string, action: string, s: Session, input: object = {}) => call('POST', `/deposits/${id}/actions/${action}`, s, input);
  const fd = { principal: 10000000, tenureMonths: 24, payoutFrequency: 'ON_MATURITY', holding: 'SINGLE', nominee: { name: 'Ravi M', relation: 'Spouse' } };
  /** The newest ledger entry of a source, with its lines. */
  const lastEntry = async (source: string) => {
    const j = (await call('GET', `/ledger/journals?source=${source}`, accountant)).json();
    return (await call('GET', `/ledger/journals/${j.items[0].id}`, accountant)).json();
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [sravani, accountant, secretary, president, cashier] = await Promise.all([signInAs(app, 'mem-1103'), signInAs(app, 'stf-accountant'), signInAs(app, 'stf-secretary'), signInAs(app, 'stf-president'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('lists deposits by tab with totals; opens one by FDR No.', async () => {
    const list = (await call('GET', '/deposits?tab=CRD&pageSize=5', accountant)).json();
    expect(list.counts.CRD).toBe(data.deposits.filter((d) => d.scheme === 'CRD').length);
    expect(list.totals.crd).toBe(data.deposits.filter((d) => d.scheme === 'CRD' && d.status === 'ACTIVE').reduce((s, d) => s + d.balance, 0));
    const active = data.deposits.find((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && d.fdrNo)!;
    const detail = (await call('GET', `/deposits/${active.fdrNo}`, accountant)).json();
    expect(detail).toMatchObject({ deposit: { id: active.id }, maturity: { value: expect.any(Number) }, rules: expect.any(Array) });
    expect((await call('GET', '/deposits', sravani)).statusCode).toBe(403);
  });

  it('a member signs an FD request with a code; the request travels with the code', async () => {
    const ctx = (await call('GET', '/me/deposits/context', sravani)).json();
    expect(ctx).toMatchObject({ slabs: expect.any(Array), minAmount: expect.any(Number), textVersion: expect.any(String) });
    expect((await call('POST', '/me/deposits/sign/request', sravani, { ...fd, principal: 1 })).json().fieldErrors).toHaveProperty('principal');
    const { otpRef } = (await call('POST', '/me/deposits/sign/request', sravani, fd)).json();
    expect((await call('POST', '/me/deposits', sravani, { otpRef, otp: '000000' })).statusCode).toBe(400);
    const res = await call('POST', '/me/deposits', sravani, { otpRef, otp: '123456' });
    expect(res.statusCode).toBe(201);
    const d: DepositAccount = res.json().deposit;
    expect(d).toMatchObject({ status: 'REQUESTED', channel: 'APP', principal: fd.principal, accountNo: expect.stringMatching(/^REQ-\d{4}$/), signature: { textVersion: expect.any(String) } });
    const cancelled = (await call('POST', `/me/deposits/${d.id}/cancel`, sravani, { reason: 'Changed my mind' })).json();
    expect(cancelled.deposit.status).toBe('CANCELLED');
    expect((await call('POST', `/me/deposits/${d.id}/cancel`, sravani, {})).json().code).toBe('INVALID_TRANSITION');
  });

  it('counter FD: payment posts to the ledger, two acceptances issue the FDR', async () => {
    const opened = await call('POST', '/deposits', cashier, { memberId: 'mem-1103', ...fd });
    expect(opened.statusCode).toBe(201);
    const id = opened.json().deposit.id;
    expect((await act(id, 'recordPayment', cashier, { payment: { mode: 'CASH', date: '2026-10-24', denominations: { 500: 1 } } })).json().fieldErrors).toHaveProperty('denominations');
    const paid = (await act(id, 'recordPayment', cashier, { payment: { mode: 'CASH', date: '2026-10-24', denominations: denominationsFor(fd.principal) } })).json();
    expect(paid.deposit).toMatchObject({ status: 'ACCEPTANCE_SECRETARY', payment: { mode: 'CASH', receiptNo: expect.any(String) } });
    const entry = await lastEntry('FD_PAYMENT');
    expect(entry.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '1100', debit: fd.principal }), expect.objectContaining({ accountCode: '2200', credit: fd.principal, memberId: 'mem-1103' })]));

    expect((await act(id, 'accept', president)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await act(id, 'accept', secretary)).json().deposit.status).toBe('ACCEPTANCE_PRESIDENT');
    const accepted = (await act(id, 'accept', president)).json().deposit as DepositAccount;
    expect(accepted).toMatchObject({ status: 'ACTIVE', fdrNo: expect.stringMatching(/^FDR-\d{4}-\d{5}$/), accountNo: expect.stringMatching(/^FD-\d{5}$/), balance: fd.principal, maturityDate: expect.any(String) });

    // The member can now pledge it for a loan against the FD (P5 reads deposits from here).
    const loanCtx = (await call('GET', '/me/loans/context', sravani)).json();
    expect(loanCtx.pledgeableDeposits.map((x: { id: string }) => x.id)).toContain(id);
  });

  it('rejection and refund reverse the money; payout on maturity posts the interest', async () => {
    const opened = (await call('POST', '/deposits', cashier, { memberId: 'mem-1103', ...fd })).json().deposit;
    await act(opened.id, 'recordPayment', cashier, { payment: { mode: 'TRANSFER', date: '2026-10-24', reference: 'UTR987654' } });
    expect((await act(opened.id, 'reject', secretary)).json().fieldErrors).toHaveProperty('remarks');
    expect((await act(opened.id, 'reject', secretary, { remarks: 'Signature does not match' })).json().deposit.status).toBe('REFUND_PENDING');
    expect((await act(opened.id, 'refund', cashier)).json().deposit.status).toBe('CANCELLED');
    const refund = await lastEntry('FD_REFUND');
    expect(refund.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '1200', credit: fd.principal })]));

    const matured = data.deposits.find((d) => d.scheme === 'FD' && d.status === 'MATURED')!;
    const closed = (await act(matured.id, 'payout', cashier)).json().deposit as DepositAccount;
    expect(closed).toMatchObject({ status: 'CLOSED', balance: 0 });
    const payout = await lastEntry('FD_PAYOUT');
    const value = Math.max(matured.maturityValue ?? 0, matured.principal ?? 0);
    expect(payout.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '1200', credit: value })]));
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('demo control acts for the stage owner', async () => {
    const req = data.deposits.find((d) => d.status === 'REQUESTED')!;
    expect((await call('POST', `/deposits/${req.id}/demo-act`, accountant)).json().deposit.status).toBe('ACCEPTANCE_SECRETARY');
  });
});
