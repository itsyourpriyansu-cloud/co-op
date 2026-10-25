// M9 exit: J-13 reports (catalogue → run with filters → totals reconcile with the ledgers), the five
// ST-01 dashboard variants agree with the Work Queue, ST-03 composer + member questions, and the
// ST-52 defaulter notice (D-063).
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComposePreview, DashboardSummary, DefaulterNotice, MemberDues, MyNotifications, OutboxMessage, ReportDef, ReportOptions, ReportResult, RoleDashboard, Session, StaffNotifications, StaffTicketRow, WorkQueue } from '@tgs/types';
import { DEMO_PASSWORD } from './account';
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
const login = async (personaId: string) => (await call<Session>('POST', '/auth/persona', { personaId, channel: 'console' })).body.token;
const run = (id: string, qs: string, token: string) => call<ReportResult>('GET', `/reports/${id}${qs ? `?${qs}` : ''}`, undefined, token);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('J-13 reports', () => {
  it('catalogue lists the 8 MVP reports + the defaulter notice; DDO and members have no access', async () => {
    const acc = await login('stf-accountant');
    const cat = (await call<{ reports: ReportDef[]; options: ReportOptions }>('GET', '/reports', undefined, acc)).body;
    expect(cat.reports.filter((r) => r.available && r.kind === 'table')).toHaveLength(8);
    expect(cat.reports.find((r) => r.id === 'defaulter-notice')?.kind).toBe('print');
    expect(cat.reports.filter((r) => !r.available).every((r) => r.note)).toBe(true);
    expect(cat.options.cycles.length).toBeGreaterThan(3);
    expect((await call('GET', '/reports', undefined, await login('stf-ddo-fin'))).status).toBe(403);
    expect((await run('trial-balance', '', acc)).status).toBe(404);
  });

  it('every report runs and its totals reconcile with the ledgers', async () => {
    const acc = await login('stf-accountant');
    const db = store.db;
    const cycle = (await call<{ options: ReportOptions }>('GET', '/reports', undefined, acc)).body.options.cycles[0]!;

    // Dues = what memberDues says each member still owes (arrears only, shares are a separate due).
    const dues = (await run('dues', '', acc)).body;
    const owing = db.members.map((m) => (db.demandSheets.some((s) => s.lines.some((l) => l.memberId === m.id)) ? m.id : '')).filter(Boolean);
    let expected = 0;
    for (const id of owing) expected += (await call<MemberDues>('GET', `/members/${id}/dues`, undefined, acc)).body.totalArrears;
    expect(dues.totals.total).toBe(expected);
    expect(sum(dues.groups.map((g) => g.subtotal.total!))).toBe(dues.totals.total);

    // Department unpaid = the demand sheets of that cycle.
    const du = (await run('dept-unpaid', `cycle=${cycle}`, acc)).body;
    const sheets = db.demandSheets.filter((s) => s.cycle === cycle);
    expect(du.totals.demand).toBe(sum(sheets.map((s) => s.totalDemand)));
    expect(du.totals.recovered).toBe(sum(sheets.map((s) => s.totalRecovered)));
    expect(du.totals.unpaid).toBe(du.totals.demand! - du.totals.recovered!);

    // Less collections = only short members; their short adds up to the departments' unpaid.
    const dl = (await run('dept-less', `cycle=${cycle}`, acc)).body;
    expect(dl.totals.short).toBe(du.totals.unpaid);

    // Loans ledger outstanding = dashboard's loans outstanding.
    const ll = (await run('loans-ledger', '', acc)).body;
    const dash = (await call<DashboardSummary>('GET', '/dashboard/summary', undefined, await login('stf-admin'))).body;
    expect(ll.totals.outstanding).toBe(dash.loanOutstanding);
    expect(ll.groups.length).toBeGreaterThan(1);
    const sl = (await run('loans-ledger', 'product=SALARY', acc)).body;
    expect(sl.groups).toHaveLength(1);

    // Maturity: active FDs in range; bad range is a field error.
    const mt = (await run('maturity', 'from=2026-01-01&to=2030-12-31', acc)).body;
    expect(mt.totals.principal).toBe(sum(db.deposits.filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && d.maturityDate! >= '2026-01-01' && d.maturityDate! <= '2030-12-31').map((d) => d.principal ?? 0)));
    expect((await run('maturity', 'from=2027-01-01&to=2026-01-01', acc)).body.fieldErrors?.to).toBeTruthy();

    // Member ledger: Mahesh's running unpaid ends at his arrears.
    const mahesh = db.members.find((m) => m.generalNo === '1104')!;
    expect((await run('member-ledger', '', acc)).body.fieldErrors?.memberId).toBeTruthy();
    const ml = (await run('member-ledger', `memberId=${mahesh.id}`, acc)).body;
    const md = (await call<MemberDues>('GET', `/members/${mahesh.id}/dues`, undefined, acc)).body;
    expect(ml.totals.unpaid).toBe(md.totalArrears);
    expect(ml.groups.at(-1)!.rows.at(-1)!.balance).toBe(md.totalArrears);

    // Defaulters: each is short in ≥ N cycles; Retirement: everyone retires inside the window.
    const df = (await run('defaulters', 'minCycles=2', acc)).body;
    expect(df.groups.flatMap((g) => g.rows).every((r) => Number(r.cycles) >= 2)).toBe(true);
    const rt = (await run('retirement', 'withinMonths=6', acc)).body;
    expect(rt.groups[0]!.rows.every((r) => String(r.dor) <= '2027-04-30')).toBe(true);
  }, 30_000); // runs all 8 reports over the full ledger; slow on a busy machine

  it('a DDO-scoped run is impossible (no reports.view) but department filters narrow the rows', async () => {
    const acc = await login('stf-accountant');
    const all = (await run('dues', '', acc)).body;
    const fin = (await run('dues', 'departmentId=dept-fin', acc)).body;
    expect(fin.rowCount).toBeLessThan(all.rowCount);
    expect(fin.groups.every((g) => g.label === fin.groups[0]!.label)).toBe(true);
  });

  it('defaulter notice lists the unpaid months and the pay-to details', async () => {
    const acc = await login('stf-accountant');
    const n = (await call<DefaulterNotice>('GET', '/print/defaulter-notice/1104', undefined, acc)).body;
    expect(n.member.generalNo).toBe('1104');
    expect(n.totalUnpaid).toBe(sum(n.rows.map((r) => r.unpaid)));
    expect(n.text.body).toContain(n.rows.length.toString());
    expect(n.refNo).toContain('1104');
  });
});

describe('ST-01 role dashboards', () => {
  it('five variants, each built on that role’s Work Queue', async () => {
    const cases: Array<[string, RoleDashboard['variant']]> = [
      ['stf-admin', 'ADMIN'],
      ['stf-accountant', 'ACCOUNTANT'],
      ['stf-secretary', 'SIGNER'],
      ['stf-president', 'SIGNER'],
      ['stf-cashier', 'CASHIER'],
      ['stf-ddo-fin', 'DDO'],
    ];
    for (const [persona, variant] of cases) {
      const t = await login(persona);
      const d = (await call<RoleDashboard>('GET', '/dashboard/role', undefined, t)).body;
      const wq = (await call<WorkQueue>('GET', '/work-queue', undefined, t)).body;
      expect(d.variant).toBe(variant);
      expect(sum(d.queue.map((q) => q.count))).toBe(wq.items.length);
      expect(d.tiles.length).toBeGreaterThanOrEqual(2);
      if (variant === 'ACCOUNTANT' || variant === 'DDO') expect(sum(d.demand!.byStatus.map((s) => s.count))).toBe(variant === 'DDO' ? 1 : store.db.departments.length);
    }
    const ddo = (await call<RoleDashboard>('GET', '/dashboard/role', undefined, await login('stf-ddo-fin'))).body;
    expect(ddo.scope.departmentName).toBeTruthy();
    const member = (await call<Session>('POST', '/auth/member-login', { login: '1101', password: DEMO_PASSWORD })).body.token;
    expect((await call('GET', '/dashboard/role', undefined, member)).status).toBe(403);
  });
});

describe('ST-03 notifications, composer and member questions', () => {
  it('staff see their own notifications and can mark them read', async () => {
    const t = await login('stf-accountant');
    const n = (await call<StaffNotifications>('GET', '/notifications', undefined, t)).body;
    expect(n.unread).toBeGreaterThan(0);
    await call('POST', `/notifications/${n.items[0]!.id}/read`, {}, t);
    await call('POST', '/notifications/read-all', {}, t);
    expect((await call<{ unread: number; openQuestions: number }>('GET', '/notifications/count', undefined, t)).body).toMatchObject({ unread: 0, openQuestions: 2 });
  });

  it('preview → send a dues reminder to defaulters; every recipient gets it in the app', async () => {
    const acc = await login('stf-accountant');
    const input = { channel: 'SMS', audience: { kind: 'DEFAULTERS' }, templateKey: 'dues.reminder', title: 'Dues reminder', body: 'Dear {name} (General No. {generalNo}), {overdue} is unpaid.' };
    expect((await call('POST', '/messages/preview', input, await login('stf-secretary'))).status).toBe(403);
    expect((await call('POST', '/messages/preview', { ...input, body: 'short' }, acc)).body.fieldErrors?.body).toBeTruthy();
    const p = (await call<ComposePreview>('POST', '/messages/preview', input, acc)).body;
    expect(p.recipients).toBeGreaterThan(0);
    expect(p.sample[0]!.body).not.toContain('{name}');
    const before = store.db.notifications.length;
    const sent = await call<OutboxMessage>('POST', '/messages', input, acc);
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe('DELIVERED_SIMULATED');
    expect(store.db.notifications.length - before).toBe(p.recipients);
    expect((await call<OutboxMessage[]>('GET', '/messages', undefined, acc)).body[0]!.id).toBe(sent.body.id);

    // One member by email: needs an address on file.
    const lakshmi = store.db.members.find((m) => m.generalNo === '1101')!;
    const one = await call<ComposePreview>('POST', '/messages/preview', { channel: 'EMAIL', audience: { kind: 'MEMBER', memberId: lakshmi.id }, title: 'Hello {name}', body: 'Your FD receipt is ready at the office.' }, acc);
    expect(one.body.sample[0]?.title).toBe(`Hello ${lakshmi.name}`);
  });

  it('the office answers a member question and the member sees the reply on the phone', async () => {
    const acc = await login('stf-accountant');
    const rows = (await call<StaffTicketRow[]>('GET', '/support/tickets', undefined, acc)).body;
    expect(rows[0]!.status).toBe('OPEN');
    expect((await call('GET', '/support/tickets', undefined, await login('stf-cashier'))).status).toBe(403);
    const t = rows.find((r) => r.member.generalNo === '1101')!;
    expect((await call('POST', `/support/tickets/${t.id}/reply`, { text: 'no' }, acc)).body.fieldErrors?.text).toBeTruthy();
    const r = await call<StaffTicketRow>('POST', `/support/tickets/${t.id}/reply`, { text: 'Your FDR is ready, collect it at the counter.' }, acc);
    expect(r.body.status).toBe('ANSWERED');
    const member = (await call<Session>('POST', '/auth/member-login', { login: '1101', password: DEMO_PASSWORD })).body.token;
    const mine = (await call<MyNotifications>('GET', '/me/notifications', undefined, member)).body;
    expect(mine.items[0]!.title).toBe('Reply from the society office');
    await call('POST', `/support/tickets/${t.id}/reply`, { close: true }, acc);
    expect((await call('POST', `/support/tickets/${t.id}/reply`, { text: 'Anything else?' }, acc)).status).toBe(409);
  });
});

describe('M10 topbar search', () => {
  it('finds members by name / General No. / Employee ID, loans and receipts by number, scoped for the DDO', async () => {
    const admin = await login('stf-admin');
    const m = store.db.members.find((x) => x.generalNo === '1101')!;
    const byName = (await call<Array<{ kind: string; id: string }>>('GET', '/search?q=lakshmi', undefined, admin)).body;
    expect(byName.some((h) => h.kind === 'member' && h.id === m.id)).toBe(true);
    expect((await call<Array<{ id: string }>>('GET', '/search?q=1101', undefined, admin)).body.some((h) => h.id === m.id)).toBe(true);
    expect((await call<Array<{ id: string }>>('GET', `/search?q=${m.employeeId}`, undefined, admin)).body.some((h) => h.id === m.id)).toBe(true);
    const loan = store.db.loans.find((l) => l.loanNo)!;
    expect((await call<Array<{ kind: string; id: string }>>('GET', `/search?q=${loan.loanNo}`, undefined, admin)).body.some((h) => h.kind === 'loan' && h.id === loan.id)).toBe(true);
    expect((await call<unknown[]>('GET', '/search?q=a', undefined, admin)).body).toHaveLength(0);
    const ddo = await login('stf-ddo-fin');
    const scoped = (await call<Array<{ kind: string; id: string }>>('GET', '/search?q=a', undefined, ddo)).body;
    expect(scoped).toHaveLength(0);
    const fin = (await call<Array<{ kind: string; id: string }>>('GET', '/search?q=kumar', undefined, ddo)).body;
    expect(fin.filter((h) => h.kind === 'member').every((h) => store.db.members.find((x) => x.id === h.id)?.departmentId === 'dept-fin')).toBe(true);
    expect(fin.some((h) => h.kind === 'deposit')).toBe(false);
  });
});

