// M5 exit: J-01 → J-08 across both apps (phone apply → phone sureties → web stages → phone ACTIVE),
// plus return & resubmit, top-up (J-07), withdraw and the Work Queue.
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateLeftoverService } from '@tgs/domain';
import type { LoanDetail, LoanRequestInput, LoanRow, OtpChallenge, SanctionPreview, Session, SuretyRequests, WorkQueue } from '@tgs/types';
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
/** Any member (not only demo personas) signed in on their phone. */
function memberToken(memberId: string): string {
  const m = store.db.members.find((x) => x.id === memberId)!;
  const token = `test-${memberId}`;
  store.db.sessions[token] = { id: m.id, name: m.name, role: 'MEMBER', memberId: m.id, generalNo: m.generalNo };
  return token;
}

function freeMembers(n: number, exclude: string[]): string[] {
  const busy = new Set(store.db.loans.flatMap((l) => l.sureties.map((s) => s.memberId)));
  return store.db.members.filter((m) => m.status === 'ACTIVE' && !exclude.includes(m.id) && !busy.has(m.id) && calculateLeftoverService(m.dor, store.db.demo.today).months > 120).slice(0, n).map((m) => m.id);
}
const pay = { scaleOfPay: '24280-72850', grossSalary: 5_200_000, govtLoanDeductions: 300_000, otherLoanDeductions: 0 };

async function applyOnPhone(token: string, input: LoanRequestInput) {
  const d = await call<LoanDetail>('POST', '/me/loans', input, token);
  const otp = await call<OtpChallenge>('POST', `/me/loans/${d.body.loan.id}/sign/request`, {}, token);
  expect(otp.status).toBe(200);
  return (await call<LoanDetail>('POST', `/me/loans/${d.body.loan.id}/submit`, { otpRef: otp.body.otpRef, otp: '123456' }, token)).body;
}
async function suretySigns(memberId: string, loanId: string) {
  const t = memberToken(memberId);
  const reqs = await call<SuretyRequests>('GET', '/me/surety-requests', undefined, t);
  expect(reqs.body.requests.some((r) => r.loanId === loanId)).toBe(true);
  const otp = await call<OtpChallenge>('POST', `/me/surety-requests/${loanId}/sign/request`, {}, t);
  return call('POST', `/me/surety-requests/${loanId}/accept`, { otpRef: otp.body.otpRef, otp: '123456' }, t);
}
const act = (id: string, action: string, token: string, body: unknown = {}) => call<LoanDetail>('POST', `/loans/${id}/actions/${action}`, body, token);

describe('M5 exit: J-01 → J-08 across both apps', () => {
  it('phone apply → sureties sign (one declines, replaced) → review → DDO → assessment → sanction → disbursement → phone sees ACTIVE', async () => {
    const sravani = await login('mem-1103', 'app');
    const [s1, s2, s3] = freeMembers(3, ['mem-1103']);
    const loan = await applyOnPhone(sravani, { product: 'ORDINARY', amount: 15_000_000, instalments: 60, purpose: 'House repair', sureties: [s1!, s2!], form: { pay } });
    expect(loan.loan.status).toBe('SURETY_PENDING');
    const id = loan.loan.id;

    // J-02 sureties on their phones
    expect((await suretySigns(s1!, id)).status).toBe(200);
    const t2 = memberToken(s2!);
    expect((await call('POST', `/me/surety-requests/${id}/decline`, {}, t2)).status).toBe(400);
    await call('POST', `/me/surety-requests/${id}/decline`, { reason: 'Already committed elsewhere' }, t2);
    expect(store.db.notifications.find((n) => n.recipientId === 'mem-1103')?.title).toBe('Choose another surety');
    const replaced = await call<LoanDetail>('POST', `/me/loans/${id}/sureties/replace`, { oldId: s2, newId: s3 }, sravani);
    expect(replaced.body.sureties.map((s) => s.memberId)).toEqual([s1, s3]);
    await suretySigns(s3!, id);
    const afterSureties = store.db.loans.find((l) => l.id === id)!;
    expect(afterSureties.status).toBe('ACCOUNTANT_REVIEW');

    // J-03 … J-06 on the web
    const acc = await login('stf-accountant');
    const queue = await call<WorkQueue>('GET', '/work-queue', undefined, acc);
    expect(queue.body.items.some((i) => i.id === id && i.actionLabel === 'Review')).toBe(true);
    expect((await act(id, 'forward', acc)).status).toBe(400);
    expect((await act(id, 'forward', acc, { checklist: { memberVerified: true, documentsVerified: true } })).body.loan.status).toBe('DDO_CERTIFICATION');
    expect((await act(id, 'ddoCertify', acc, { recoveryFeasible: true })).status).toBe(403);
    const kiran = await login('stf-ddo-fin');
    expect((await act(id, 'ddoCertify', kiran, { recoveryFeasible: true, remarks: 'Verified' })).body.loan.status).toBe('ASSESSMENT');

    const preview = await call<SanctionPreview>('GET', `/loans/${id}/sanction-preview?amount=12000000&instalments=48`, undefined, acc);
    expect(preview.body.sheet.netDisbursable).toBe(12_000_000 - preview.body.sheet.shareDeduction);
    expect((await act(id, 'sendForSanction', acc, { amount: 20_000_000 })).body.fieldErrors?.amount).toBeTruthy();
    const assessed = await act(id, 'sendForSanction', acc, { amount: 12_000_000, instalments: 48 });
    expect(assessed.body.loan).toMatchObject({ status: 'SANCTION_SECRETARY', sanctionedAmount: 12_000_000, sanctionedInstalments: 48 });

    const president = await login('stf-president');
    const secretary = await login('stf-secretary');
    expect((await act(id, 'presidentSign', president)).status).toBe(409);
    expect((await act(id, 'secretarySign', secretary)).body.loan.status).toBe('SANCTION_PRESIDENT');
    expect((await act(id, 'sendBack', president)).status).toBe(400);
    expect((await act(id, 'sendBack', president, { remarks: 'Recheck tenure' })).body.loan.status).toBe('ASSESSMENT');
    await act(id, 'sendForSanction', acc, { amount: 12_000_000, instalments: 48 });
    await act(id, 'secretarySign', secretary);
    const sanctioned = await act(id, 'presidentSign', president, { remarks: 'Sanctioned' });
    expect(sanctioned.body.loan.status).toBe('SANCTIONED');
    expect(sanctioned.body.loan.sanctionLetterNo).toMatch(/^SL-2026-/);

    // J-08 disbursement
    const cashier = await login('stf-cashier');
    expect((await act(id, 'disburse', cashier, { disbursement: { mode: 'NEFT', reference: '', date: '2026-10-24' } })).body.fieldErrors?.reference).toBeTruthy();
    const shareBefore = store.db.shareAccounts.find((s) => s.memberId === 'mem-1103')!.shareDepositBalance;
    const paid = await act(id, 'disburse', cashier, { disbursement: { mode: 'NEFT', reference: 'UTR123456789', date: '2026-10-24' } });
    expect(paid.body.loan).toMatchObject({ status: 'ACTIVE', outstandingPrincipal: 12_000_000 });
    expect(paid.body.loan.loanNo).toMatch(/^LN-2026-/);
    expect(paid.body.loan.schedule).toHaveLength(48);
    expect(paid.body.loan.schedule[0]?.dueCycle).toBe('2026-11');
    expect(store.db.shareAccounts.find((s) => s.memberId === 'mem-1103')!.shareDepositBalance).toBe(shareBefore + (paid.body.loan.shareDepositDeduction ?? 0));
    expect(paid.body.stages.every((s) => s.status === 'done')).toBe(true);

    // The phone sees it running.
    const mine = await call<LoanRow[]>('GET', '/me/loans', undefined, sravani);
    expect(mine.body.find((r) => r.id === id)).toMatchObject({ status: 'ACTIVE', group: 'ACTIVE' });
    expect(store.db.notifications.filter((n) => n.recipientId === 'mem-1103').map((n) => n.title)).toEqual(expect.arrayContaining(['Loan sanctioned', 'Loan disbursed', 'Sureties signed']));
  });
});

describe('return, resubmit, withdraw, top-up, queue scope', () => {
  it('returned loan: the member corrects it and resubmits with OTP; signed sureties stay signed', async () => {
    const sravani = await login('mem-1103', 'app');
    const [s1, s2] = freeMembers(2, ['mem-1103']);
    const loan = await applyOnPhone(sravani, { product: 'ORDINARY', amount: 10_000_000, instalments: 36, purpose: 'Repairs', sureties: [s1!, s2!], form: { pay } });
    await suretySigns(s1!, loan.loan.id);
    await suretySigns(s2!, loan.loan.id);
    const acc = await login('stf-accountant');
    expect((await act(loan.loan.id, 'returnToMember', acc)).status).toBe(400);
    expect((await act(loan.loan.id, 'returnToMember', acc, { remarks: 'Purpose too vague' })).body.loan.returnInfo?.reason).toBe('Purpose too vague');
    const edited = await call<LoanDetail>('PUT', `/me/loans/${loan.loan.id}`, { product: 'ORDINARY', amount: 10_000_000, instalments: 36, purpose: 'Roof repair of own house', sureties: [s1, s2], form: { pay } }, sravani);
    expect(edited.body.loan.sureties.every((s) => s.status === 'ACCEPTED')).toBe(true);
    const otp = await call<OtpChallenge>('POST', `/me/loans/${loan.loan.id}/sign/request`, {}, sravani);
    const again = await call<LoanDetail>('POST', `/me/loans/${loan.loan.id}/submit`, { otpRef: otp.body.otpRef, otp: '123456' }, sravani);
    expect(again.body.loan.status).toBe('ACCOUNTANT_REVIEW');
    expect(again.body.loan.events.at(-1)?.action).toBe('resubmit');
  });

  it('member withdraws before sanction', async () => {
    const t = await login('mem-1104', 'app');
    const loan = await applyOnPhone(t, { product: 'SALARY', amount: 1_000_000, instalments: 6, purpose: 'Medical', sureties: [], form: { salary: { substantivePay: 4_000_000, compulsoryDeductions: [], netPayEarnedToDate: 2_000_000 } } });
    expect(loan.loan.status).toBe('ACCOUNTANT_REVIEW');
    expect((await call<LoanDetail>('POST', `/me/loans/${loan.loan.id}/withdraw`, { reason: 'No longer needed' }, t)).body.loan.status).toBe('WITHDRAWN');
    expect((await call('POST', `/me/loans/${loan.loan.id}/withdraw`, {}, t)).status).toBe(409);
  });

  it('J-07 top-up: Lakshmi tops up her running Ordinary loan; demo act pushes it through; the old loan closes by settlement', async () => {
    const lakshmi = await login('mem-1101', 'app');
    const parent = store.db.loans.find((l) => l.memberId === 'mem-1101' && l.product === 'ORDINARY' && l.status === 'ACTIVE')!;
    const [s1, s2] = freeMembers(2, ['mem-1101']);
    const a = await call<{ eligible: boolean; preview: { topup?: { settlement: number }; netDisbursable: number } }>('POST', '/loans/assess', { product: 'ORDINARY', amount: 10_000_000, instalments: 36, purpose: 'Top-up', sureties: [s1, s2], topupOf: parent.id, form: { pay } }, lakshmi);
    expect(a.body.eligible).toBe(true);
    expect(a.body.preview.topup?.settlement).toBeGreaterThanOrEqual(parent.outstandingPrincipal);
    const loan = await applyOnPhone(lakshmi, { product: 'ORDINARY', amount: 10_000_000, instalments: 36, purpose: 'Top-up', sureties: [s1!, s2!], topupOf: parent.id, form: { pay } });
    expect(loan.loan.parentLoanId).toBe(parent.id);
    const admin = await login('stf-admin');
    let d = loan;
    for (let i = 0; i < 8 && d.loan.status !== 'ACTIVE'; i++) d = (await call<LoanDetail>('POST', `/loans/${loan.loan.id}/demo-act`, {}, admin)).body;
    expect(d.loan.status).toBe('ACTIVE');
    expect(d.loan.sanctionSheet?.topup?.loanId).toBe(parent.id);
    expect(store.db.loans.find((l) => l.id === parent.id)).toMatchObject({ status: 'CLOSED_BY_TOPUP', outstandingPrincipal: 0 });
  });

  it('Work Queue: DDO sees only Finance work, incl. change requests; members cannot open it', async () => {
    const q = await call<WorkQueue>('GET', '/work-queue', undefined, await login('stf-ddo-fin'));
    expect(q.body.items.every((i) => i.departmentName === 'Finance')).toBe(true);
    expect(q.body.items.some((i) => i.kind === 'changeRequest')).toBe(true);
    expect((await call('GET', '/work-queue', undefined, await login('mem-1101', 'app'))).status).toBe(403);
  });
});
