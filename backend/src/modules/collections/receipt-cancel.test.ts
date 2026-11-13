import { denominationsFor } from '@tgs/domain';
import type { MemberDues, ReceiptDetail, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { businessToday } from '../../common/utils/business-date';

/** G9 (D-119): a wrong counter receipt is cancelled the same day and every effect goes back. */
describe('receipt cancellation (G9)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const balanced = async () => {
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, cashier] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('undoes dues, loan balance and the ledger; only the Accountant, not the issuer, same day', async () => {
    const today = await businessToday(app);
    const memberId = [...(await app.collections.defaulterIds())][0]!;
    const before = (await call('GET', `/members/${memberId}/dues`, cashier)).json() as MemberDues;
    const loansBefore = new Map((await app.loans.repo.forMember(memberId)).map((l) => [l.id, l.outstandingPrincipal]));
    const amount = Math.min(before.totalArrears, 100_000);
    const res = await call('POST', '/receipts', cashier, { memberId, purpose: 'DUES', mode: 'CASH', amount, date: today, denominations: denominationsFor(amount) });
    expect(res.statusCode).toBe(201);
    const id = (res.json() as ReceiptDetail).receipt.id;
    expect(((await call('GET', `/members/${memberId}/dues`, cashier)).json() as MemberDues).totalArrears).toBe(before.totalArrears - amount);

    // The Cashier who issued it may not cancel it; the Accountant may.
    expect((await call('GET', `/receipts/${id}`, cashier)).json()).toMatchObject({ canCancel: false, cancelBlockedBy: expect.stringMatching(/Accountant/) });
    expect((await call('GET', `/receipts/${id}`, accountant)).json()).toMatchObject({ canCancel: true });
    expect((await call('POST', `/receipts/${id}/cancel`, cashier, { reason: 'Wrong member selected' })).statusCode).toBe(403);
    expect((await call('POST', `/receipts/${id}/cancel`, accountant, { reason: 'short' })).json().fieldErrors).toHaveProperty('reason');

    // A bare ledger reversal of a business entry is refused: it would leave the dues behind.
    const journals = (await call('GET', '/ledger/journals?source=RECEIPT&pageSize=100', accountant)).json().items as Array<{ id: string; sourceRef: string }>;
    const entry = journals.find((j) => j.sourceRef === (res.json() as ReceiptDetail).receipt.receiptNo)!;
    const bare = await call('POST', `/ledger/journals/${entry.id}/reverse`, accountant, { reason: 'Trying the wrong way' });
    expect(bare.json()).toMatchObject({ code: 'RULE_VIOLATION', ruleId: 'REVERSE_SOURCE' });

    const done = (await call('POST', `/receipts/${id}/cancel`, accountant, { reason: 'Taken against the wrong member' })).json() as ReceiptDetail;
    expect(done.receipt.cancelled).toMatchObject({ byName: expect.any(String), reason: 'Taken against the wrong member', entryNo: expect.stringMatching(/^JE-/) });
    const after = (await call('GET', `/members/${memberId}/dues`, cashier)).json() as MemberDues;
    expect(after.totalArrears).toBe(before.totalArrears);
    expect(after.arrears.map((a) => a.unpaid)).toEqual(before.arrears.map((a) => a.unpaid));
    for (const l of await app.loans.repo.forMember(memberId)) expect(l.outstandingPrincipal).toBe(loansBefore.get(l.id));
    const reversal = (await call('GET', '/ledger/journals?source=RECEIPT_CANCEL&pageSize=100', accountant)).json().items as Array<{ sourceRef: string; total: number }>;
    expect(reversal.find((j) => j.sourceRef === done.receipt.receiptNo)?.total).toBe(amount);
    await balanced();

    expect((await call('POST', `/receipts/${id}/cancel`, accountant, { reason: 'Taken against the wrong member' })).json().code).toBe('INVALID_TRANSITION');
    const list = (await call('GET', `/receipts?q=${done.receipt.receiptNo}`, accountant)).json();
    expect(list.items[0]).toMatchObject({ receiptNo: done.receipt.receiptNo, cancelled: true });
  });

  it('the officer who took the money cannot cancel it, even as Accountant', async () => {
    const today = await businessToday(app);
    const memberId = [...(await app.collections.defaulterIds())][1]!;
    const dues = (await call('GET', `/members/${memberId}/dues`, accountant)).json() as MemberDues;
    const amount = Math.min(dues.totalArrears, 50_000);
    const r = (await call('POST', '/receipts', accountant, { memberId, purpose: 'DUES', mode: 'CASH', amount, date: today, denominations: denominationsFor(amount) })).json() as ReceiptDetail;
    expect(r).toMatchObject({ canCancel: false, cancelBlockedBy: expect.stringMatching(/another officer/) });
    expect((await call('POST', `/receipts/${r.receipt.id}/cancel`, accountant, { reason: 'Changed my mind today' })).json().code).toBe('RULE_VIOLATION');
  });
});
