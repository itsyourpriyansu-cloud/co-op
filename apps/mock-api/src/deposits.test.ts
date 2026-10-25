// M6 exit: J-16 (FD from the app → cashier → Secretary → President → FDR on the phone) and J-12
// (open at the counter), plus validation, cancel, refund, loan against FD, queue and lists.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DepositContext, DepositDetail, DepositList, DepositRow, FdRequestInput, OtpChallenge, Session, WorkQueue } from '@tgs/types';
import { createApp } from './app';
import { Store } from './store';

let app: ReturnType<typeof createApp>;
let store: Store;
beforeEach(() => {
  store = new Store({ persist: false, dataDir: '.data-test', latencyMs: [0, 0] });
  app = createApp({ store, version: 'test' });
});

type Err = { code?: string; ruleId?: string; message?: string; fieldErrors?: Record<string, string> };
const call = async <T>(method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as T & Err };
};
const login = async (personaId: string, channel: 'console' | 'app' = 'console') => (await call<Session>('POST', '/auth/persona', { personaId, channel })).body.token;
const fd: FdRequestInput = { principal: 10_000_000, tenureMonths: 24, payoutFrequency: 'QUARTERLY', holding: 'SINGLE', nominee: { name: 'Mahesh Goud', relation: 'Spouse' } };
const act = (id: string, action: string, token: string, body: unknown = {}) => call<DepositDetail>('POST', `/deposits/${id}/actions/${action}`, body, token);

describe('J-16: open an FD from the app', () => {
  it('request with OTP → cashier counts cash → Secretary → President → FDR visible on the phone', async () => {
    const phone = await login('mem-1101', 'app');
    const ctx = (await call<DepositContext>('GET', '/me/deposits/context', undefined, phone)).body;
    expect(ctx.rules).toHaveLength(4);
    expect(ctx.minAmount).toBe(1_000_000);
    expect((await call('POST', '/me/deposits/sign/request', { ...fd, tenureMonths: 6 }, phone)).body.fieldErrors?.tenureMonths).toBeTruthy();
    const otp = await call<OtpChallenge>('POST', '/me/deposits/sign/request', fd, phone);
    const created = await call<DepositDetail>('POST', '/me/deposits', { otpRef: otp.body.otpRef, otp: '123456' }, phone);
    expect(created.status).toBe(201);
    const id = created.body.deposit.id;
    expect(created.body.deposit).toMatchObject({ status: 'REQUESTED', channel: 'APP', ratePercent: 7.25 });
    expect(created.body.stages.map((s) => s.status)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(created.body.maturity?.value).toBe(10_000_000);
    expect(created.body.payouts).toHaveLength(8);

    const cashier = await login('stf-cashier');
    const q = await call<WorkQueue>('GET', '/work-queue', undefined, cashier);
    expect(q.body.items.some((i) => i.id === id && i.actionLabel === 'Record payment')).toBe(true);
    const short = await act(id, 'recordPayment', cashier, { payment: { mode: 'CASH', date: '2026-10-24', denominations: { 500: 100 } } });
    expect(short.body.fieldErrors?.denominations).toMatch(/do not match/);
    const paid = await act(id, 'recordPayment', cashier, { payment: { mode: 'CASH', date: '2026-10-24', denominations: { 500: 190, 200: 25 } } });
    expect(paid.body.deposit).toMatchObject({ status: 'ACCEPTANCE_SECRETARY' });
    expect(paid.body.deposit.payment?.receiptNo).toMatch(/^RCT-2026-/);
    expect(store.db.receipts.at(-1)).toMatchObject({ purpose: 'FD', depositId: id, amount: 10_000_000, source: 'CASH' });

    const president = await login('stf-president');
    expect((await act(id, 'accept', president)).status).toBe(409);
    expect((await act(id, 'accept', await login('stf-secretary'))).body.deposit.status).toBe('ACCEPTANCE_PRESIDENT');
    const active = await act(id, 'accept', president, { remarks: 'Accepted' });
    expect(active.body.deposit).toMatchObject({ status: 'ACTIVE', openedOn: '2026-10-24', maturityDate: '2028-10-24' });
    expect(active.body.deposit.fdrNo).toMatch(/^FDR-2026-/);
    expect(active.body.stages.every((s) => s.status === 'done')).toBe(true);

    const mine = await call<DepositRow[]>('GET', '/me/deposits', undefined, phone);
    expect(mine.body.find((r) => r.id === id)).toMatchObject({ status: 'ACTIVE', fdrNo: active.body.deposit.fdrNo });
    const detail = await call<DepositDetail>('GET', `/me/deposits/${id}`, undefined, phone);
    expect(detail.body.loanAgainst?.maxAmount).toBe(9_000_000);
    expect(store.db.notifications.find((n) => n.recipientId === 'mem-1101')?.title).toBe('Fixed deposit accepted');
  });

  it('member cancels an unpaid request; a rejected one goes to refund', async () => {
    const phone = await login('mem-1103', 'app');
    const otp = await call<OtpChallenge>('POST', '/me/deposits/sign/request', { ...fd, holding: 'JOINT', holders: [{ name: 'Ramesh M', fatherOrHusbandName: 'Venkat M', occupation: 'Teacher', address: 'Hyderabad', phone: '9876501234' }] }, phone);
    const d = (await call<DepositDetail>('POST', '/me/deposits', { otpRef: otp.body.otpRef, otp: '123456' }, phone)).body;
    expect(d.deposit).toMatchObject({ operationMode: 'EITHER_OR_SURVIVOR', jointHolders: ['Ramesh M'] });
    expect((await call<DepositDetail>('POST', `/me/deposits/${d.deposit.id}/cancel`, {}, phone)).body.deposit.status).toBe('CANCELLED');

    const req = store.db.deposits.find((x) => x.status === 'ACCEPTANCE_SECRETARY')!;
    const sec = await login('stf-secretary');
    expect((await act(req.id, 'reject', sec)).status).toBe(400);
    expect((await act(req.id, 'reject', sec, { remarks: 'KYC mismatch' })).body.deposit.status).toBe('REFUND_PENDING');
    expect((await act(req.id, 'refund', await login('stf-cashier'))).body.deposit.status).toBe('CANCELLED');
  });
});

describe('J-12: open at the counter; lists', () => {
  it('Cashier opens an FD for a member by transfer; demo act completes the acceptances', async () => {
    const cashier = await login('stf-cashier');
    expect((await call('POST', '/deposits', { memberId: 'mem-1104', ...fd }, await login('stf-secretary'))).status).toBe(403);
    const d = await call<DepositDetail>('POST', '/deposits', { memberId: 'mem-1104', ...fd, holding: 'MINOR', minor: { name: 'Chinnu P', dob: '2016-05-01', guardianRelation: 'Father' } }, cashier);
    expect(d.status).toBe(201);
    expect(d.body.deposit).toMatchObject({ channel: 'COUNTER', minor: { guardianName: 'Mahesh Babu P' } });
    expect((await act(d.body.deposit.id, 'recordPayment', cashier, { payment: { mode: 'TRANSFER', date: '2026-10-24' } })).body.fieldErrors?.reference).toBeTruthy();
    await act(d.body.deposit.id, 'recordPayment', cashier, { payment: { mode: 'TRANSFER', date: '2026-10-24', reference: 'UTR998877' } });
    const admin = await login('stf-admin');
    let x = (await call<DepositDetail>('POST', `/deposits/${d.body.deposit.id}/demo-act`, {}, admin)).body;
    x = (await call<DepositDetail>('POST', `/deposits/${d.body.deposit.id}/demo-act`, {}, admin)).body;
    expect(x.deposit.status).toBe('ACTIVE');
  });

  it('lists by tab with totals; maturing filter; requests tab', async () => {
    const acc = await login('stf-accountant');
    const fds = await call<DepositList>('GET', '/deposits?tab=FD&pageSize=100', undefined, acc);
    expect(fds.body.items.every((r) => r.scheme === 'FD')).toBe(true);
    expect(fds.body.totals.fdPrincipal).toBeGreaterThan(0);
    const reqs = await call<DepositList>('GET', '/deposits?tab=REQUESTS', undefined, acc);
    expect(reqs.body.items.length).toBeGreaterThanOrEqual(5);
    const crd = await call<DepositList>('GET', '/deposits?tab=CRD&q=1101', undefined, acc);
    const detail = await call<DepositDetail>('GET', `/deposits/${crd.body.items[0]!.id}`, undefined, acc);
    expect(detail.body.ledger.length).toBeGreaterThan(1);
    expect(detail.body.ledger.at(-1)?.balance).toBe(detail.body.deposit.balance);
    const soon = await call<DepositList>('GET', '/deposits?tab=FD&maturingWithinDays=90', undefined, acc);
    expect(soon.body.items.every((r) => (r.daysToMaturity ?? -1) <= 90)).toBe(true);
    expect((await call('GET', '/deposits', undefined, await login('stf-ddo-fin'))).status).toBe(403);
  });
});
