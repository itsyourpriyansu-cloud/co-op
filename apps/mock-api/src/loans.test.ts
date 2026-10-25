// Loans core (M4): phone application → ST-20, BR-002 block for Ramaiah, ST-21 on behalf, scoping.
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateLeftoverService } from '@tgs/domain';
import type { LoanContext, LoanDetail, LoanList, LoanRequestInput, LoanRow, MemberPick, OtpChallenge, Session } from '@tgs/types';
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

/** Two members who can stand surety for a 60-month loan (active, long service, no guarantees). */
function freeSureties(exclude: string[]): string[] {
  const busy = new Set(store.db.loans.flatMap((l) => l.sureties.map((s) => s.memberId)));
  return store.db.members
    .filter((m) => m.status === 'ACTIVE' && !exclude.includes(m.id) && !busy.has(m.id) && calculateLeftoverService(m.dor, store.db.demo.today).months > 120)
    .slice(0, 2)
    .map((m) => m.id);
}

const pay = { scaleOfPay: '24280-72850', grossSalary: 5_200_000, govtLoanDeductions: 300_000, otherLoanDeductions: 0 };

describe('M4 exit: phone application appears on the web', () => {
  it('Sravani applies for an Ordinary loan, signs with OTP, the Accountant sees it in ST-20', async () => {
    const phone = await login('mem-1103', 'app');
    const ctx = (await call<LoanContext>('GET', '/me/loans/context', undefined, phone)).body;
    expect(ctx.member.generalNo).toBe('1103');
    expect(ctx.firstDueCycle).toBe('2026-11');
    const input: LoanRequestInput = { product: 'ORDINARY', amount: 15_000_000, instalments: 60, purpose: 'House repair', sureties: freeSureties(['mem-1103']), form: { pay, security: { type: 'SURETY' } } };

    const draft = await call<LoanDetail>('POST', '/me/loans', input, phone);
    expect(draft.status).toBe(201);
    expect(draft.body.loan.status).toBe('DRAFT');
    expect(draft.body.loan.applicationNo).toMatch(/^APP-2026-\d{5}$/);
    expect(draft.body.stages[0]?.status).toBe('current');
    // Staff never see a member's unsubmitted draft.
    const acc = await login('stf-accountant');
    expect((await call('GET', `/loans/${draft.body.loan.id}`, undefined, acc)).status).toBe(404);

    const otp = await call<OtpChallenge>('POST', `/me/loans/${draft.body.loan.id}/sign/request`, {}, phone);
    expect(otp.body.demoOtp).toBe('123456');
    expect((await call('POST', `/me/loans/${draft.body.loan.id}/submit`, { otpRef: otp.body.otpRef, otp: '111111' }, phone)).status).toBe(400);
    const done = await call<LoanDetail>('POST', `/me/loans/${draft.body.loan.id}/submit`, { otpRef: otp.body.otpRef, otp: '123456' }, phone);
    expect(done.body.loan.status).toBe('SURETY_PENDING');
    expect(done.body.loan.signature?.textVersion).toBeTruthy();
    expect(done.body.sureties.every((s) => s.status === 'PENDING')).toBe(true);
    expect(store.db.notifications.some((n) => n.recipientId === input.sureties[0] && n.title === 'Surety request')).toBe(true);

    const list = await call<LoanList>('GET', '/loans?group=IN_PROCESS&q=1103', undefined, acc);
    const row = list.body.items.find((r) => r.id === draft.body.loan.id);
    expect(row).toMatchObject({ status: 'SURETY_PENDING', memberName: 'Sravani M', group: 'IN_PROCESS' });
    expect(row?.waitingOn).toMatch(/^Sureties:/);
    const detail = await call<LoanDetail>('GET', `/loans/${draft.body.loan.id}`, undefined, acc);
    expect(detail.body.stages.map((s) => s.status).slice(0, 2)).toEqual(['done', 'current']);
    expect((await call<LoanRow[]>('GET', '/me/loans', undefined, phone)).body[0]?.id).toBe(draft.body.loan.id);
  });

  it('BR-002 blocks Ramaiah (retires in 14 months) from a 24-month loan', async () => {
    const phone = await login('mem-1102', 'app');
    const ctx = (await call<LoanContext>('GET', '/me/loans/context', undefined, phone)).body;
    expect(ctx.member.leftoverMonths).toBe(14);
    const a = await call<{ eligible: boolean; checks: Array<{ ruleId: string; pass: boolean }>; preview: { maxInstalments: number } }>('POST', '/loans/assess', { product: 'EDUCATION', amount: 5_000_000, instalments: 24, purpose: 'Fees', sureties: [], form: { pay } }, phone);
    expect(a.body.eligible).toBe(false);
    expect(a.body.checks.find((c) => c.ruleId === 'BR-002')?.pass).toBe(false);
    expect(a.body.preview.maxInstalments).toBe(13);
    // …and the server refuses to send the signing code.
    const draft = await call<LoanDetail>('POST', '/me/loans', { product: 'EDUCATION', amount: 5_000_000, instalments: 24, purpose: 'College fees', sureties: freeSureties(['mem-1102']), form: { pay, education: { studentName: 'Ravi', relation: 'Son', institution: 'JNTU', course: 'B.Tech' } } }, phone);
    const sign = await call('POST', `/me/loans/${draft.body.loan.id}/sign/request`, {}, phone);
    expect(sign.status).toBe(422);
    expect(sign.body.ruleId).toBe('BR-002');
  });
});

describe('ST-21 on behalf, salary loan, scoping', () => {
  it('Accountant enters a Salary loan from the paper form: no sureties, straight to review', async () => {
    const acc = await login('stf-accountant');
    const salary = { substantivePay: 4_000_000, compulsoryDeductions: [{ label: 'GPF', amount: 400_000 }], netPayEarnedToDate: 2_500_000 };
    const tooMuch = await call('POST', '/loans', { memberId: 'mem-1104', product: 'SALARY', amount: 3_000_000, instalments: 10, purpose: 'Medical', sureties: [], form: { salary }, submit: true }, acc);
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.ruleId).toBe('BR-023');
    expect(store.db.loans.some((l) => l.memberId === 'mem-1104' && l.product === 'SALARY' && l.status === 'DRAFT')).toBe(false);
    const ok = await call<LoanDetail>('POST', '/loans', { memberId: 'mem-1104', product: 'SALARY', amount: 2_000_000, instalments: 10, purpose: 'Medical', sureties: [], form: { salary }, submit: true }, acc);
    expect(ok.status).toBe(201);
    expect(ok.body.loan).toMatchObject({ status: 'ACCOUNTANT_REVIEW', channel: 'COUNTER', createdByName: 'Suresh Goud' });
    expect(ok.body.stages.map((s) => s.key)).toEqual(['submitted', 'accountant', 'assessment', 'sanction', 'disbursement']);
    expect(ok.body.actions).toEqual(['forward', 'returnToMember', 'reject']);
    expect((await call('POST', '/loans', { memberId: 'mem-1104', product: 'SALARY' }, await login('stf-secretary'))).status).toBe(403);
  });

  it('missing fields come back as field errors; DDO sees only Finance; search finds sureties', async () => {
    const acc = await login('stf-accountant');
    const bad = await call('POST', '/loans', { memberId: 'mem-1103', product: 'ORDINARY', amount: 0, instalments: 0, purpose: '', sureties: [], form: {}, submit: true }, acc);
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fieldErrors ?? {})).toEqual(expect.arrayContaining(['amount', 'instalments', 'purpose', 'pay.grossSalary', 'sureties']));
    const ddo = await call<LoanList>('GET', '/loans?pageSize=100', undefined, await login('stf-ddo-fin'));
    expect(ddo.body.items.every((r) => r.departmentId === 'dept-fin')).toBe(true);
    const all = await call<LoanList>('GET', '/loans?product=ORDINARY', undefined, acc);
    expect(all.body.items.every((r) => r.product === 'ORDINARY')).toBe(true);
    expect(all.body.counts.byProduct.ALL).toBeGreaterThan(all.body.total);
    const found = await call<MemberPick[]>('GET', '/members/search?q=lakshmi', undefined, await login('mem-1103', 'app'));
    expect(found.body.some((p) => p.generalNo === '1101')).toBe(true);
    expect(found.body.some((p) => p.id === 'mem-1103')).toBe(false);
  });

  it('Lakshmi already has a running Ordinary loan: BR-018 says ask for a top-up', async () => {
    const phone = await login('mem-1101', 'app');
    const a = await call<{ checks: Array<{ ruleId: string; pass: boolean; message: string }> }>('POST', '/loans/assess', { product: 'ORDINARY', amount: 5_000_000, instalments: 24, purpose: 'x', sureties: [], form: { pay } }, phone);
    expect(a.body.checks.find((c) => c.ruleId === 'BR-018')?.message).toMatch(/top-up/);
    const draft = await call<LoanDetail>('POST', '/me/loans', { product: 'SALARY', amount: 1_000_000, instalments: 6, purpose: 'x', sureties: [], form: {} }, phone);
    expect((await call('DELETE', `/me/loans/${draft.body.loan.id}`, undefined, phone)).status).toBe(200);
    expect((await call('GET', `/me/loans/${draft.body.loan.id}`, undefined, phone)).status).toBe(404);
  });
});
