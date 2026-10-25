// M7 exit: J-10 (generate → certify → send → post recovery → receipts and ledgers) and Mahesh's
// short-recovery waterfall being identical in the console and on the phone; plus counter receipts,
// member-reported payments (D-043) and the work queue.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DemandCycleOverview, DemandPreview, DemandSheetDetail, MemberDues, MyPayments, PaymentReport, PaymentReportRow, ReceiptDetail, ReceiptList, Session, WorkQueue } from '@tgs/types';
import { createApp } from './app';
import { Store } from './store';

let app: ReturnType<typeof createApp>;
let store: Store;
beforeEach(() => {
  store = new Store({ persist: false, dataDir: '.data-test', latencyMs: [0, 0] });
  app = createApp({ store, version: 'test' });
});

type Err = { code?: string; message?: string; fieldErrors?: Record<string, string> };
const call = async <T>(method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as T & Err };
};
const login = async (personaId: string, channel: 'console' | 'app' = 'console') => (await call<Session>('POST', '/auth/persona', { personaId, channel })).body.token;
const sheetAct = (id: string, action: string, token: string, body: unknown = {}) => call<DemandSheetDetail>('POST', `/demand/sheets/${id}/actions/${action}`, body, token);

describe('J-10 monthly demand & recovery', () => {
  it('generate the missing departments → certify → send → post with one short member', async () => {
    const acc = await login('stf-accountant');
    const ov = await call<DemandCycleOverview>('GET', '/demand?cycle=2026-10', undefined, acc);
    expect(ov.body.rows).toHaveLength(15);
    expect(ov.body.totals.notGenerated).toBe(3);
    expect(ov.body.canGenerate).toBe(true);
    const missing = ov.body.rows.filter((r) => r.status === 'NOT_GENERATED').map((r) => r.departmentId);

    const preview = await call<DemandPreview>('GET', `/demand/preview?cycle=2026-10&departmentIds=${missing.join(',')}`, undefined, acc);
    expect(preview.body.rows.every((r) => !r.alreadyGenerated && r.members > 0 && (r.heads.RRF ?? 0) > 0)).toBe(true);
    expect((await call('POST', '/demand/generate', { cycle: '2026-10', departmentIds: missing }, await login('stf-cashier'))).status).toBe(403);
    expect((await call('POST', '/demand/generate', { cycle: '2025-01', departmentIds: missing }, acc)).status).toBe(400);
    const gen = await call<{ generated: string[] }>('POST', '/demand/generate', { cycle: '2026-10', departmentIds: missing }, acc);
    expect(gen.body.generated).toHaveLength(3);
    expect((await call('POST', '/demand/generate', { cycle: '2026-10', departmentIds: missing }, acc)).status).toBe(400);

    const id = gen.body.generated[0]!;
    expect((await sheetAct(id, 'sendToDdo', acc)).status).toBe(409); // certify first (BR-030)
    expect((await sheetAct(id, 'certify', await login('stf-secretary'))).status).toBe(403);
    let d = await sheetAct(id, 'certify', acc);
    expect(d.body.sheet.certified?.byName).toBe('Suresh Goud');
    d = await sheetAct(id, 'sendToDdo', acc);
    expect(d.body.sheet.status).toBe('SENT_TO_DDO');

    const lines = d.body.lines;
    const shortOne = lines.find((l) => l.components.some((c) => c.head === 'PRINCIPAL')) ?? lines[0]!;
    const tooMuch = await sheetAct(id, 'postRecovery', acc, { recovered: { [shortOne.memberId]: shortOne.totalDemand + 100 } });
    expect(tooMuch.status).toBe(400);
    const receiptsBefore = store.db.receipts.length;
    const loanId = shortOne.components.find((c) => c.head === 'PRINCIPAL')?.loanId;
    const outstandingBefore = loanId ? store.db.loans.find((l) => l.id === loanId)!.outstandingPrincipal : 0;
    const recoveredAmount = Math.round(shortOne.totalDemand / 2);
    d = await sheetAct(id, 'postRecovery', acc, { recovered: { [shortOne.memberId]: recoveredAmount } });
    expect(d.body.sheet.status).toBe('RECOVERY_POSTED');
    expect(d.body.totals.shortMembers).toBe(1);
    expect(d.body.totals.recovered).toBe(d.body.totals.demand - (shortOne.totalDemand - recoveredAmount));
    expect(store.db.receipts.length - receiptsBefore).toBe(lines.length);
    const posted = d.body.lines.find((l) => l.memberId === shortOne.memberId)!;
    // BR-011: fixed heads are paid before loan principal
    const rrf = posted.components.find((c) => c.head === 'RRF')!;
    expect(rrf.allocated).toBe(rrf.amount);
    if (loanId) expect(store.db.loans.find((l) => l.id === loanId)!.outstandingPrincipal).toBeLessThanOrEqual(outstandingBefore);
    const dues = await call<MemberDues>('GET', `/members/${shortOne.memberId}/dues`, undefined, acc);
    expect(dues.body.arrears.some((a) => a.sheetId === id && a.unpaid === shortOne.totalDemand - recoveredAmount)).toBe(true);
  });

  it('demo control posts a sheet as the Accountant', async () => {
    const admin = await login('stf-admin');
    const ov = await call<DemandCycleOverview>('GET', '/demand?cycle=2026-10', undefined, admin);
    const sent = ov.body.rows.find((r) => r.status === 'SENT_TO_DDO')!;
    const d = await call<DemandSheetDetail>('POST', `/demand/sheets/${sent.id}/demo-act`, {}, admin);
    expect(d.body.sheet.status).toBe('RECOVERY_POSTED');
    expect(d.body.sheet.posted?.byName).toBe('Suresh Goud');
  });
});

describe("Mahesh's short recovery (M7 exit) and reported payments (D-043)", () => {
  it('the September waterfall is identical in the console and on the phone; verifying his report clears it', async () => {
    const acc = await login('stf-accountant');
    const phone = await login('mem-1104', 'app');
    const sheetId = store.db.demandSheets.find((s) => s.cycle === '2026-09' && s.lines.some((l) => l.memberId === 'mem-1104'))!.id;
    const web = (await call<DemandSheetDetail>('GET', `/demand/sheets/${sheetId}`, undefined, acc)).body.lines.find((l) => l.memberId === 'mem-1104')!;
    const mine = (await call<MyPayments>('GET', '/me/payments', undefined, phone)).body;
    const sept = mine.months.find((m) => m.cycle === '2026-09')!;
    expect(sept.short).toBeGreaterThan(0);
    expect(sept.components.map((c) => [c.head, c.amount, c.allocated])).toEqual(web.components.map((c) => [c.head, c.amount, c.allocated]));
    expect(web.short).toBe(sept.short);

    const report = mine.reports.find((r) => r.status === 'REPORTED')!;
    expect(report.amount).toBeLessThanOrEqual(mine.dues.totalArrears);
    const cashier = await login('stf-cashier');
    const list = await call<PaymentReportRow[]>('GET', '/payment-reports?status=REPORTED', undefined, cashier);
    expect(list.body.some((r) => r.id === report.id)).toBe(true);
    const q = await call<WorkQueue>('GET', '/work-queue', undefined, cashier);
    expect(q.body.items.some((i) => i.kind === 'paymentReport' && i.id === report.id)).toBe(true);
    const v = await call<ReceiptDetail>('POST', `/payment-reports/${report.id}/verify`, {}, cashier);
    expect(v.status).toBe(200);
    expect(v.body.receipt).toMatchObject({ source: 'BANK_TRANSFER', purpose: 'DUES', amount: report.amount, paymentReportId: report.id });
    expect(v.body.lines.every((l) => l.cycle)).toBe(true);
    const after = (await call<MyPayments>('GET', '/me/payments', undefined, phone)).body;
    expect(after.dues.totalArrears).toBe(mine.dues.totalArrears - report.amount);
    expect(after.reports.find((r) => r.id === report.id)?.status).toBe('VERIFIED');
    expect((await call('POST', `/payment-reports/${report.id}/verify`, {}, cashier)).status).toBe(409);
  });

  it('member reports a payment: validation, then the cashier rejects it with a reason', async () => {
    const phone = await login('mem-1104', 'app');
    const dues = (await call<MyPayments>('GET', '/me/payments', undefined, phone)).body.dues;
    const bad = await call('POST', '/me/payments/reports', { amount: dues.totalArrears + 100, paidOn: '2027-01-01', mode: 'UPI', reference: 'x', towards: 'DUES' }, phone);
    expect(Object.keys(bad.body.fieldErrors ?? {})).toEqual(expect.arrayContaining(['amount', 'paidOn', 'reference']));
    const lakshmi = await login('mem-1101', 'app');
    const none = await call('POST', '/me/payments/reports', { amount: 10000, paidOn: '2026-10-20', mode: 'UPI', reference: 'UTR998877', towards: 'SHARE_CAPITAL' }, lakshmi);
    expect(none.body.fieldErrors?.towards).toBeDefined();
    const ok = await call<PaymentReport>('POST', '/me/payments/reports', { amount: 50000, paidOn: '2026-10-22', mode: 'UPI', reference: 'utr445566778', towards: 'DUES', screenshotName: 'pay.jpg' }, phone);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'REPORTED', reference: 'UTR445566778' });
    expect((await call('POST', '/me/payments/reports', { amount: 50000, paidOn: '2026-10-22', mode: 'UPI', reference: 'UTR445566778', towards: 'DUES' }, phone)).body.fieldErrors?.reference).toContain('already');
    const cashier = await login('stf-cashier');
    expect((await call('POST', `/payment-reports/${ok.body.id}/reject`, { reason: 'no' }, cashier)).status).toBe(400);
    const rej = await call<PaymentReportRow>('POST', `/payment-reports/${ok.body.id}/reject`, { reason: 'No matching credit in the bank statement.' }, cashier);
    expect(rej.body.status).toBe('REJECTED');
    expect(store.db.notifications.some((n) => n.recipientId === 'mem-1104' && n.title === 'Payment not verified')).toBe(true);
  });
});

describe('counter receipts (ST-45) and the receipts index (ST-44)', () => {
  it('cash needs matching notes; dues are capped; a valid receipt shows in the list', async () => {
    const cashier = await login('stf-cashier');
    const dues = (await call<MemberDues>('GET', '/members/mem-1104/dues', undefined, cashier)).body;
    const amount = Math.min(dues.totalArrears, 100000);
    const wrongNotes = await call('POST', '/receipts', { memberId: 'mem-1104', purpose: 'DUES', mode: 'CASH', amount, date: '2026-10-24', denominations: { 500: 1 } }, cashier);
    expect(wrongNotes.body.fieldErrors?.denominations).toBeDefined();
    const tooMuch = await call('POST', '/receipts', { memberId: 'mem-1104', purpose: 'DUES', mode: 'BANK_TRANSFER', amount: dues.totalArrears + 100, date: '2026-10-24', reference: 'UTR1' }, cashier);
    expect(tooMuch.body.fieldErrors?.amount).toBeDefined();
    expect((await call('POST', '/receipts', { memberId: 'mem-1104', purpose: 'DUES', mode: 'ADJUSTMENT', amount, date: '2026-10-24', remarks: 'Waived by the committee' }, cashier)).body.fieldErrors?.mode).toBeDefined();
    const ok = await call<ReceiptDetail>('POST', '/receipts', { memberId: 'mem-1104', purpose: 'DUES', mode: 'BANK_TRANSFER', amount, date: '2026-10-24', reference: 'UTR5566' }, cashier);
    expect(ok.status).toBe(201);
    expect(ok.body.receipt.byName).toBe('Venkat Naidu');
    expect(ok.body.lines.reduce((s, l) => s + l.amount, 0)).toBe(amount);
    const list = await call<ReceiptList>('GET', '/receipts?tab=COUNTER&q=mahesh', undefined, cashier);
    expect(list.body.items[0]?.receiptNo).toBe(ok.body.receipt.receiptNo);
    expect(list.body.counts.SALARY_RECOVERY).toBeGreaterThan(1000);
    expect((await call('POST', '/receipts', { memberId: 'mem-1101', purpose: 'DUES', mode: 'BANK_TRANSFER', amount: 100, date: '2026-10-24', reference: 'UTR9' }, await login('stf-secretary'))).status).toBe(403);
  });
});
