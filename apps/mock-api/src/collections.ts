// M7 Demand & collections: ST-40 index, ST-41 generate, ST-42 sheet (+ BR-030 certify & send),
// ST-43 recovery entry & posting, ST-44 receipts, ST-45 counter receipt, ST-46 receipt, ST-47 verify a
// member-reported payment; MB-10 payments & statements and MB-18 report a payment on the phone.
// All money movement goes through `postComponents`, so sheets, loans, CRD/SRDS and shares agree.
import { markLoanDirty } from './dev-sync';
import {
  allocateArrears,
  allocateRecovery,
  amountInWords,
  buildDemandComponents,
  demandSheetActionsFor,
  departmentForCycle,
  formatCycle,
  formatINR,
  HEAD_PRIORITY,
  LOAN_PRIORITY,
  nextDemandSheetStatus,
  validateDenominations,
  type DemandSheetAction,
} from '@tgs/domain';
import type {
  Cycle,
  DemandComponent,
  DemandCycleOverview,
  DemandHead,
  DemandLine,
  DemandLineView,
  DemandPreview,
  DemandSheet,
  DemandSheetDetail,
  DemandSheetRow,
  LoanStage,
  MemberDues,
  MyPayments,
  NewReceiptInput,
  PaymentReport,
  PaymentReportRow,
  Receipt,
  ReceiptDetail,
  ReceiptList,
  ReceiptListParams,
  ReceiptRow,
  ReceiptTab,
  RecoveryInput,
  ReportPaymentInput,
  SessionUser,
  StaffSignOff,
  WorkItem,
} from '@tgs/types';
import { audit, can, notify, nowIso, requireMember, requirePermission, requireStaff, type Api, type Guard } from './common';
import { fail } from './errors';
import type { Db, Store } from './store';

const HEAD_LABEL: Record<DemandHead, string> = {
  RRF: 'RRF',
  INSURANCE: 'Insurance',
  CRD: 'CRD',
  SRDS: 'SRDS',
  SHARE_CAPITAL: 'Share capital',
  PENAL: 'Penal interest',
  INTEREST: 'Interest',
  PRINCIPAL: 'Principal',
};
const PRODUCT_LABEL: Record<string, string> = { ORDINARY: 'Ordinary', EDUCATION: 'Education', SALARY: 'Salary', DEPOSIT: 'Deposit' };
const PAY_TO = { accountName: 'TGSECCSL Dues Collection', accountNo: 'XXXXXXXX3307', ifsc: 'DEMO0000929', upi: 'tgseccsl.dues@demo', counter: 'Society cash counter, 2nd Floor, West Ancillary Building' };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const nextCycle = (c: Cycle): Cycle => {
  const [y, m] = c.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const lastDayOf = (c: Cycle) => {
  const [y, m] = c.split('-').map(Number) as [number, number];
  return `${c}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const deptName = (db: Db, id: string) => db.departments.find((d) => d.id === id)?.name ?? '';
const memberOf = (db: Db, id: string) => db.members.find((m) => m.id === id);

function signOff(user: { id: string; name: string; role: string }, remarks?: string): StaffSignOff {
  return { byId: user.id, byName: user.name, role: user.role, at: nowIso(), ...(remarks ? { remarks } : {}) };
}

function labelOf(db: Db, c: DemandComponent): { label: string; loanNo?: string } {
  if (c.head !== 'INTEREST' && c.head !== 'PRINCIPAL') return { label: HEAD_LABEL[c.head] };
  const loan = c.loanId ? db.loans.find((l) => l.id === c.loanId) : undefined;
  return { label: `${PRODUCT_LABEL[c.loanProduct ?? ''] ?? ''} loan ${HEAD_LABEL[c.head].toLowerCase()}`.trim(), ...(loan?.loanNo ? { loanNo: loan.loanNo } : {}) };
}

/** Display order = recovery order (BR-011): heads by priority, loans Education → Salary → Ordinary → Deposit. */
const rank = (c: DemandComponent) => HEAD_PRIORITY[c.head] * 10 + (c.loanProduct ? LOAN_PRIORITY[c.loanProduct] : 0);
function inPriority<T extends DemandComponent>(cs: T[]): T[] {
  return cs.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

function headTotals(components: DemandComponent[]): Partial<Record<DemandHead, number>> {
  const t: Partial<Record<DemandHead, number>> = {};
  for (const c of components) t[c.head] = (t[c.head] ?? 0) + c.amount;
  return t;
}

function lineView(db: Db, line: DemandLine, posted: boolean): DemandLineView {
  const m = memberOf(db, line.memberId);
  const recovered = line.recovered;
  return {
    memberId: line.memberId,
    generalNo: m?.generalNo ?? '',
    name: m?.name ?? line.memberId,
    designation: m?.designation ?? '',
    heads: headTotals(line.components),
    components: inPriority(line.components.map((c) => ({ ...c, ...labelOf(db, c) }))),
    totalDemand: line.totalDemand,
    ...(posted && recovered !== undefined ? { recovered, short: Math.max(0, line.totalDemand - recovered) } : {}),
  };
}

// ---- posting: one place that moves money into the ledgers ------------------------------------------

/**
 * Applies newly allocated amounts (after − before) to the member's ledgers: loan principal and
 * schedule status, CRD / SRDS balances, share capital. Returns the receipt allocation lines.
 */
function postComponents(db: Db, memberId: string, cycle: Cycle, before: DemandComponent[], after: DemandComponent[]): Receipt['allocations'] {
  const out: Receipt['allocations'] = [];
  after.forEach((c, i) => {
    const delta = c.allocated - (before[i]?.allocated ?? 0);
    if (delta <= 0) return;
    out.push({ head: c.head, ...(c.loanId ? { loanId: c.loanId } : {}), amount: delta, cycle });
    if (c.head === 'PRINCIPAL' && c.loanId) {
      const loan = db.loans.find((l) => l.id === c.loanId);
      if (loan) {
        loan.outstandingPrincipal = Math.max(0, loan.outstandingPrincipal - delta);
        markLoanDirty(loan.id);
      }
    }
    if (c.head === 'CRD' || c.head === 'SRDS') {
      const dep = db.deposits.find((d) => d.memberId === memberId && d.scheme === c.head);
      if (dep) dep.balance += delta;
    }
    if (c.head === 'SHARE_CAPITAL') {
      const sh = db.shareAccounts.find((s) => s.memberId === memberId);
      if (sh) sh.shareCapital += delta;
    }
  });
  // Schedule status for every loan touched this cycle.
  for (const loanId of new Set(after.filter((c) => c.loanId).map((c) => c.loanId!))) {
    const loan = db.loans.find((l) => l.id === loanId);
    const row = loan?.schedule.find((r) => r.dueCycle === cycle);
    if (!loan || !row) continue;
    const parts = after.filter((c) => c.loanId === loanId);
    const paid = sum(parts.map((c) => c.allocated));
    const due = sum(parts.map((c) => c.amount));
    row.paidStatus = paid >= due ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    markLoanDirty(loan.id);
    if (loan.status === 'ACTIVE' && loan.outstandingPrincipal === 0 && loan.schedule.every((r) => r.paidStatus === 'PAID')) {
      loan.status = 'CLOSED';
      loan.closedOn = db.demo.today;
      loan.events.push({ at: nowIso(), actorId: 'system', actorName: 'System', actorRole: 'SYSTEM', action: 'close', fromStatus: 'ACTIVE', toStatus: 'CLOSED', remarks: 'Fully repaid' });
    }
  }
  return out;
}

function recomputeSheet(sheet: DemandSheet) {
  for (const l of sheet.lines) if (l.recovered !== undefined || l.components.some((c) => c.allocated > 0)) l.recovered = sum(l.components.map((c) => c.allocated));
  sheet.totalRecovered = sum(sheet.lines.map((l) => l.recovered ?? 0));
}

function nextReceiptNo(db: Db, prefix: string) {
  return `${prefix}-${String(db.receipts.length + 1).padStart(6, '0')}`;
}

// ---- read models -----------------------------------------------------------------------------------

export function memberDues(db: Db, memberId: string): MemberDues {
  const m = memberOf(db, memberId) ?? fail('NOT_FOUND', 'Member not found.');
  const arrears: MemberDues['arrears'] = [];
  for (const sh of [...db.demandSheets].filter((s) => s.status === 'RECOVERY_POSTED').sort((a, b) => a.cycle.localeCompare(b.cycle))) {
    const line = sh.lines.find((l) => l.memberId === memberId);
    if (!line) continue;
    const unpaid = line.totalDemand - sum(line.components.map((c) => c.allocated));
    if (unpaid <= 0) continue;
    arrears.push({ cycle: sh.cycle, sheetId: sh.id, unpaid, components: inPriority(line.components.map((c) => ({ ...c, ...labelOf(db, c), unpaid: c.amount - c.allocated }))) });
  }
  const share = db.shareAccounts.find((s) => s.memberId === memberId);
  const shareCapitalDue = share ? Math.max(0, share.numberOfShares * db.settings.shareValue - share.shareCapital) : 0;
  return { memberId, name: m.name, generalNo: m.generalNo, departmentName: deptName(db, m.departmentId), arrears, totalArrears: sum(arrears.map((a) => a.unpaid)), shareCapitalDue };
}

function sheetStages(sh: DemandSheet): LoanStage[] {
  const at = (s?: StaffSignOff) => s?.at.slice(0, 10);
  const order = ['GENERATED', 'CERTIFIED', 'SENT_TO_DDO', 'RECOVERY_POSTED'];
  const idx = order.indexOf(sh.status);
  const step = (key: string, title: string, i: number, so?: StaffSignOff): LoanStage => ({ key, title, status: i <= idx ? 'done' : i === idx + 1 ? 'current' : 'todo', ...(at(so) ? { date: at(so)! } : {}), ...(so ? { by: so.byName } : {}) });
  return [step('generated', 'Generated', 0, sh.generated), step('certified', 'Certified correct (BR-030)', 1, sh.certified), step('sent', 'Sent to the DDO', 2, sh.sent), step('posted', 'Recovery posted', 3, sh.posted)];
}

const ACTION_TEXT: Record<DemandSheetAction, string> = { certify: 'Certify', sendToDdo: 'Send to DDO', postRecovery: 'Enter recovery' };

function sheetRow(db: Db, sh: DemandSheet | undefined, departmentId: string, cycle: Cycle, user: SessionUser): DemandSheetRow {
  const d = db.departments.find((x) => x.id === departmentId);
  const actions = sh ? demandSheetActionsFor(sh.status, { role: user.role }) : [];
  const posted = sh?.status === 'RECOVERY_POSTED';
  const short = posted ? sum(sh.lines.map((l) => Math.max(0, l.totalDemand - (l.recovered ?? 0)))) : 0;
  return {
    ...(sh ? { id: sh.id } : {}),
    cycle,
    departmentId,
    departmentName: d?.name ?? '',
    ddoName: d?.ddoName ?? '',
    status: sh?.status ?? 'NOT_GENERATED',
    members: sh?.lines.length ?? 0,
    demand: sh?.totalDemand ?? 0,
    recovered: sh?.totalRecovered ?? 0,
    short,
    shortMembers: posted ? sh.lines.filter((l) => (l.recovered ?? 0) < l.totalDemand).length : 0,
    ...(actions[0] ? { myAction: ACTION_TEXT[actions[0]] } : {}),
  };
}

function sheetDetail(db: Db, sh: DemandSheet, user: SessionUser): DemandSheetDetail {
  const posted = sh.status === 'RECOVERY_POSTED';
  const lines = sh.lines.map((l) => lineView(db, l, posted)).sort((a, b) => a.generalNo.localeCompare(b.generalNo));
  const actions = demandSheetActionsFor(sh.status, { role: user.role });
  const { lines: _lines, ...rest } = sh;
  return {
    sheet: rest,
    department: db.departments.find((d) => d.id === sh.departmentId) ?? null,
    lines,
    totals: {
      heads: headTotals(sh.lines.flatMap((l) => l.components)),
      demand: sh.totalDemand,
      recovered: sh.totalRecovered,
      short: posted ? sum(lines.map((l) => l.short ?? 0)) : 0,
      shortMembers: posted ? lines.filter((l) => (l.short ?? 0) > 0).length : 0,
    },
    stages: sheetStages(sh),
    actions,
    ...(sh.status !== 'RECOVERY_POSTED' ? { waitingOn: sh.status === 'SENT_TO_DDO' ? `${db.departments.find((d) => d.id === sh.departmentId)?.ddoName ?? 'the DDO'} (deduction) and the Accountant (post recovery)` : 'Suresh Goud (Accountant)' } : {}),
    ...(!actions.length && sh.status !== 'RECOVERY_POSTED' && can(user, 'demo.control') ? { demoActAs: 'Suresh Goud (Accountant)' } : {}),
  };
}

function receiptRow(db: Db, r: Receipt): ReceiptRow {
  const m = memberOf(db, r.memberId);
  return {
    id: r.id,
    receiptNo: r.receiptNo,
    date: r.date,
    memberId: r.memberId,
    memberName: m?.name ?? '',
    generalNo: m?.generalNo ?? '',
    departmentName: deptName(db, m?.departmentId ?? ''),
    source: r.source,
    ...(r.purpose ? { purpose: r.purpose } : {}),
    amount: r.amount,
    heads: [...new Set(r.allocations.map((a) => a.head))],
    ...(r.cycle ? { cycle: r.cycle } : {}),
    ...(r.byName ? { byName: r.byName } : {}),
  };
}

function receiptDetail(db: Db, r: Receipt): ReceiptDetail {
  const m = memberOf(db, r.memberId);
  const sheet = r.sheetId ? db.demandSheets.find((s) => s.id === r.sheetId) : undefined;
  const report = r.paymentReportId ? db.paymentReports.find((p) => p.id === r.paymentReportId) : undefined;
  return {
    receipt: r,
    member: { id: r.memberId, name: m?.name ?? '', generalNo: m?.generalNo ?? '', departmentName: deptName(db, m?.departmentId ?? ''), designation: m?.designation ?? '' },
    lines: r.allocations.map((a) => {
      const loan = a.loanId ? db.loans.find((l) => l.id === a.loanId) : undefined;
      const label = a.head === 'INTEREST' || a.head === 'PRINCIPAL' ? `${PRODUCT_LABEL[loan?.product ?? ''] ?? ''} loan ${HEAD_LABEL[a.head].toLowerCase()}`.trim() : HEAD_LABEL[a.head];
      return { head: a.head, label, ...(a.cycle ?? r.cycle ? { cycle: (a.cycle ?? r.cycle)! } : {}), ...(loan?.loanNo ? { loanNo: loan.loanNo } : {}), amount: a.amount };
    }),
    amountInWords: amountInWords(r.amount),
    ...(sheet ? { sheet: { id: sheet.id, cycle: sheet.cycle, departmentName: deptName(db, sheet.departmentId) } } : {}),
    ...(report ? { report } : {}),
  };
}

/** Lines for one department and cycle (BR-009 / BR-010), from today's master data. */
function buildLines(db: Db, departmentId: string, cycle: Cycle): DemandLine[] {
  const lines: DemandLine[] = [];
  for (const m of db.members) {
    if (m.status !== 'ACTIVE' || m.joinedSocietyOn > lastDayOf(cycle)) continue;
    const transfer = db.transfers.filter((t) => t.memberId === m.id).at(-1);
    if (departmentForCycle(m.departmentId, transfer, cycle) !== departmentId) continue;
    const loanRows = db.loans
      .filter((l) => l.memberId === m.id && l.status === 'ACTIVE')
      .flatMap((l) => {
        const row = l.schedule.find((r) => r.dueCycle === cycle);
        return row ? [{ loanId: l.id, product: l.product, interest: row.interest, principal: row.principal }] : [];
      });
    const share = db.shareAccounts.find((s) => s.memberId === m.id);
    const shareCapitalDue = share ? Math.max(0, share.numberOfShares * db.settings.shareValue - share.shareCapital) : 0;
    const srds = db.deposits.find((d) => d.memberId === m.id && d.scheme === 'SRDS' && d.status === 'ACTIVE');
    const { components, totalDemand } = buildDemandComponents({
      cycle,
      settings: db.settings,
      hasCrd: db.deposits.some((d) => d.memberId === m.id && d.scheme === 'CRD' && d.status === 'ACTIVE'),
      srdsActive: Boolean(srds && srds.openedOn <= `${cycle}-01`),
      loanRows,
      ...(shareCapitalDue ? { shareCapitalDue } : {}),
    });
    lines.push({ memberId: m.id, components, totalDemand });
  }
  return lines;
}

function generatableCycles(db: Db): Cycle[] {
  const latest = [...new Set(db.demandSheets.map((s) => s.cycle))].sort().at(-1) ?? db.currentCycle;
  return [...new Set([latest, nextCycle(latest)])];
}

export function collectionWorkItems(db: Db, user: SessionUser): WorkItem[] {
  if (!can(user, 'collections.view')) return [];
  const items: WorkItem[] = [];
  const today = db.demo.today;
  for (const sh of db.demandSheets) {
    const acts = demandSheetActionsFor(sh.status, { role: user.role });
    if (!acts.length) continue;
    const since = (sh.sent?.at ?? sh.certified?.at ?? sh.generated?.at ?? `${sh.cycle}-01`).slice(0, 10);
    items.push({ kind: 'demandSheet', id: sh.id, ref: `${formatCycle(sh.cycle)} demand`, title: deptName(db, sh.departmentId), subtitle: `${sh.lines.length} members · ${sh.status === 'GENERATED' ? 'certify the sheet' : sh.status === 'CERTIFIED' ? 'send to the DDO' : 'enter the recovery'}`, stage: 'demand', stageLabel: 'Demand sheets', status: sh.status, departmentName: deptName(db, sh.departmentId), amount: sh.totalDemand, since, days: daysBetween(since, today), actionLabel: ACTION_TEXT[acts[0]!], link: `/demand-sheets/${sh.id}` });
  }
  if (user.role === 'CASHIER' || user.role === 'ACCOUNTANT') {
    for (const r of db.paymentReports) {
      if (r.status !== 'REPORTED') continue;
      const m = memberOf(db, r.memberId);
      const since = (r.reportedAt ?? r.paidOn).slice(0, 10);
      items.push({ kind: 'paymentReport', id: r.id, ref: r.reference, title: m?.name ?? '', subtitle: `Reported ${r.mode === 'UPI' ? 'UPI' : r.mode === 'CHEQUE_DEPOSIT' ? 'cheque deposit' : 'bank transfer'} · ${r.towards === 'SHARE_CAPITAL' ? 'share capital' : 'dues'}`, stage: 'payments', stageLabel: 'Reported payments', status: r.status, departmentName: deptName(db, m?.departmentId ?? ''), amount: r.amount, since, days: daysBetween(since, today), actionLabel: 'Verify', link: `/payments?report=${r.id}` });
    }
  }
  return items;
}

// ---- routes ----------------------------------------------------------------------------------------

export function registerCollections(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const staffView = (user: SessionUser) => {
    requireStaff(user);
    requirePermission(user, 'collections.view', 'You do not have access to collections.');
  };
  const visibleSheet = (sh: DemandSheet, user: SessionUser) => user.role !== 'DDO' || sh.departmentId === user.departmentId;
  const loadSheet = (id: string, user: SessionUser) => {
    staffView(user);
    const sh = db().demandSheets.find((s) => s.id === id);
    if (!sh || !visibleSheet(sh, user)) return fail('NOT_FOUND', 'This demand sheet does not exist or is outside your department.');
    return sh;
  };
  const canReceive = (user: SessionUser) => user.role === 'CASHIER' || user.role === 'ACCOUNTANT';

  // ---- ST-40 ------------------------------------------------------------------------------------
  api.get('/demand', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const cycles = [...new Set([...db().demandSheets.map((s) => s.cycle), ...generatableCycles(db())])].sort().reverse();
    const cycle = c.req.query('cycle') || db().currentCycle;
    const depts = db().departments.filter((d) => user.role !== 'DDO' || d.id === user.departmentId);
    const rows = depts.map((d) => sheetRow(db(), db().demandSheets.find((s) => s.cycle === cycle && s.departmentId === d.id), d.id, cycle, user));
    const own = user.role === 'DDO' ? db().departments.find((d) => d.id === user.departmentId) : undefined;
    return c.json<DemandCycleOverview>({
      cycle,
      cycles,
      currentCycle: db().currentCycle,
      rows,
      totals: {
        demand: sum(rows.map((r) => r.demand)),
        recovered: sum(rows.map((r) => r.recovered)),
        short: sum(rows.map((r) => r.short)),
        generated: rows.filter((r) => r.status !== 'NOT_GENERATED').length,
        notGenerated: rows.filter((r) => r.status === 'NOT_GENERATED').length,
        posted: rows.filter((r) => r.status === 'RECOVERY_POSTED').length,
      },
      canGenerate: user.role === 'ACCOUNTANT' && generatableCycles(db()).includes(cycle),
      scope: own ? { departmentName: own.name } : {},
    });
  });

  // ---- ST-41 ------------------------------------------------------------------------------------
  api.get('/demand/preview', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const cycle = c.req.query('cycle') || db().currentCycle;
    if (!generatableCycles(db()).includes(cycle)) fail('VALIDATION_ERROR', `Only ${generatableCycles(db()).map(formatCycle).join(' or ')} can be generated now.`, { fieldErrors: { cycle: 'Choose the current or the next cycle' } });
    const ids = (c.req.query('departmentIds') ?? '').split(',').filter(Boolean);
    const depts = db().departments.filter((d) => !ids.length || ids.includes(d.id));
    return c.json<DemandPreview>({
      cycle,
      insuranceMonth: Number(cycle.slice(5, 7)) === db().settings.insurance.collectionMonth,
      rows: depts.map((d) => {
        const existing = db().demandSheets.find((s) => s.cycle === cycle && s.departmentId === d.id);
        const lines = existing ? existing.lines : buildLines(db(), d.id, cycle);
        const warnings: string[] = [];
        if (existing) warnings.push(`Already generated (${existing.status === 'GENERATED' ? 'not certified yet' : 'certified'}). It will be skipped.`);
        const noPay = lines.filter((l) => !(memberOf(db(), l.memberId)?.payProfile.grossSalary ?? 0)).length;
        if (noPay) warnings.push(`${noPay} member${noPay === 1 ? '' : 's'} without a certified pay profile.`);
        if (!lines.length) warnings.push('No active members in this department for the cycle.');
        const comps = lines.flatMap((l) => l.components);
        return { departmentId: d.id, departmentName: d.name, members: lines.length, heads: headTotals(comps), total: sum(lines.map((l) => l.totalDemand)), alreadyGenerated: Boolean(existing), warnings };
      }),
    });
  });

  api.post('/demand/generate', requireSession, async (c) => {
    const user = c.get('session');
    staffView(user);
    if (user.role !== 'ACCOUNTANT') fail('FORBIDDEN', 'Only the Accountant generates demand sheets.');
    const { cycle = '', departmentIds = [] } = await c.req.json<{ cycle?: string; departmentIds?: string[] }>().catch(() => ({}) as { cycle?: string; departmentIds?: string[] });
    if (!generatableCycles(db()).includes(cycle)) fail('VALIDATION_ERROR', 'Choose the current or the next cycle.', { fieldErrors: { cycle: 'Choose the current or the next cycle' } });
    const targets = db().departments.filter((d) => (!departmentIds.length || departmentIds.includes(d.id)) && !db().demandSheets.some((s) => s.cycle === cycle && s.departmentId === d.id));
    if (!targets.length) fail('VALIDATION_ERROR', 'Every chosen department already has a sheet for this cycle.', { fieldErrors: { departmentIds: 'Nothing left to generate' } });
    for (const d of targets) {
      const lines = buildLines(db(), d.id, cycle);
      const so = signOff(user);
      db().demandSheets.push({ id: `ds-${cycle}-${d.code.toLowerCase()}`, cycle, departmentId: d.id, status: 'GENERATED', lines, totalDemand: sum(lines.map((l) => l.totalDemand)), totalRecovered: 0, generated: so, events: [{ at: so.at, actorId: user.id, actorName: user.name, actorRole: user.role, action: 'generate', toStatus: 'GENERATED' }] });
    }
    audit(store, user, 'demandSheet', cycle, 'generate', `Generated ${formatCycle(cycle)} demand for ${targets.length} department${targets.length === 1 ? '' : 's'}`);
    store.save();
    return c.json({ generated: targets.map((d) => `ds-${cycle}-${d.code.toLowerCase()}`) });
  });

  // ---- ST-42 / ST-43 ----------------------------------------------------------------------------
  api.get('/demand/sheets/:id', requireSession, (c) => {
    const user = c.get('session');
    return c.json<DemandSheetDetail>(sheetDetail(db(), loadSheet(c.req.param('id'), user), user));
  });

  const act = (sh: DemandSheet, action: DemandSheetAction, user: SessionUser, input: RecoveryInput | undefined, opts: { demo?: boolean } = {}) => {
    const next = nextDemandSheetStatus(sh.status, action);
    if (!next) fail('INVALID_TRANSITION', `This sheet is "${sh.status}". Refresh to see the latest.`);
    if (!opts.demo && !demandSheetActionsFor(sh.status, { role: user.role }).includes(action)) fail('FORBIDDEN', 'This step belongs to the Accountant.');
    const actor = opts.demo ? { id: 'stf-accountant', name: 'Suresh Goud', role: 'ACCOUNTANT' } : { id: user.id, name: user.name, role: user.role };
    const so = signOff(actor, input?.remarks?.trim() || undefined);
    if (action === 'certify') {
      sh.certified = { ...so, remarks: so.remarks ?? 'Certified correct (BR-030).' };
      sh.certifiedBy = actor.id;
    }
    if (action === 'sendToDdo') {
      sh.sent = so;
      const ddo = db().staffUsers.find((u) => u.role === 'DDO' && u.departmentId === sh.departmentId);
      if (ddo) notify(store, ddo.id, 'demand.sent', { cycle: formatCycle(sh.cycle), department: deptName(db(), sh.departmentId), members: sh.lines.length, amount: formatINR(sh.totalDemand) }, `/demand-sheets/${sh.id}`);
    }
    if (action === 'postRecovery') {
      const recovered = input?.recovered ?? {};
      const fieldErrors: Record<string, string> = {};
      for (const [memberId, amount] of Object.entries(recovered)) {
        const line = sh.lines.find((l) => l.memberId === memberId);
        if (!line) fieldErrors[`recovered.${memberId}`] = 'Not on this sheet';
        else if (!Number.isInteger(amount) || amount < 0) fieldErrors[`recovered.${memberId}`] = 'Enter ₹0 or more';
        else if (amount > line.totalDemand) fieldErrors[`recovered.${memberId}`] = `More than the demand of ${formatINR(line.totalDemand)}. The DDO refunds any excess (D-061).`;
      }
      if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted amounts.', { fieldErrors });
      for (const line of sh.lines) {
        const amount = recovered[line.memberId] ?? line.totalDemand;
        const before = line.components.map((c) => ({ ...c }));
        const result = allocateRecovery(line.components, amount);
        line.components = result.components;
        line.recovered = amount;
        const allocations = postComponents(db(), line.memberId, sh.cycle, before, line.components);
        if (amount > 0) db().receipts.push({ id: `rcpt-${db().receipts.length + 1}-${sh.cycle}`, receiptNo: nextReceiptNo(db(), `RCP-${sh.cycle.replace('-', '')}`), memberId: line.memberId, date: lastDayOf(sh.cycle) > db().demo.today ? db().demo.today : lastDayOf(sh.cycle), source: 'SALARY_RECOVERY', amount, cycle: sh.cycle, allocations, sheetId: sh.id, byName: actor.name, byId: actor.id, at: so.at });
        if (amount < line.totalDemand) notify(store, line.memberId, 'recovery.short', { recovered: formatINR(amount), demand: formatINR(line.totalDemand), cycle: formatCycle(sh.cycle) }, '/payments');
        else notify(store, line.memberId, 'recovery.posted', { amount: formatINR(amount), cycle: formatCycle(sh.cycle) }, '/payments');
      }
      sh.totalRecovered = sum(sh.lines.map((l) => l.recovered ?? 0));
      sh.posted = so;
    }
    (sh.events ??= []).push({ at: so.at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: sh.status, toStatus: next, ...(so.remarks ? { remarks: so.remarks } : {}) });
    sh.status = next;
    audit(store, user, 'demandSheet', sh.id, action, `${ACTION_TEXT[action]} · ${deptName(db(), sh.departmentId)} ${formatCycle(sh.cycle)}${opts.demo ? ' (demo, as Accountant)' : ''}`);
    store.save();
  };

  api.post('/demand/sheets/:id/actions/:action', requireSession, async (c) => {
    const user = c.get('session');
    const sh = loadSheet(c.req.param('id'), user);
    const input = await c.req.json<RecoveryInput>().catch((): RecoveryInput => ({ recovered: {} }));
    act(sh, c.req.param('action') as DemandSheetAction, user, input);
    return c.json<DemandSheetDetail>(sheetDetail(db(), sh, user));
  });

  api.post('/demand/sheets/:id/demo-act', requireSession, (c) => {
    const user = c.get('session');
    requirePermission(user, 'demo.control', 'Demo controls are off for this user.');
    const sh = loadSheet(c.req.param('id'), user);
    const action: DemandSheetAction | undefined = sh.status === 'GENERATED' ? 'certify' : sh.status === 'CERTIFIED' ? 'sendToDdo' : sh.status === 'SENT_TO_DDO' ? 'postRecovery' : undefined;
    if (!action) fail('INVALID_TRANSITION', 'Nothing to do: recovery is posted.');
    act(sh, action, user, { recovered: {} }, { demo: true });
    return c.json<DemandSheetDetail>(sheetDetail(db(), sh, user));
  });

  // ---- ST-44 … ST-46 ----------------------------------------------------------------------------
  api.get('/receipts', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const q = c.req.query() as ReceiptListParams & Record<string, string>;
    const inScope = (r: Receipt) => user.role !== 'DDO' || memberOf(db(), r.memberId)?.departmentId === user.departmentId;
    const all = db().receipts.filter(inScope);
    const counter = (r: Receipt) => r.source !== 'SALARY_RECOVERY';
    const needle = (q.q ?? '').trim().toLowerCase();
    const filtered = all
      .filter((r) => (q.tab === 'SALARY_RECOVERY' ? r.source === 'SALARY_RECOVERY' : q.tab === 'COUNTER' ? counter(r) : true))
      .filter((r) => !q.cycle || r.cycle === q.cycle || r.date.startsWith(q.cycle))
      .filter((r) => !q.departmentId || memberOf(db(), r.memberId)?.departmentId === q.departmentId)
      .filter((r) => {
        if (!needle) return true;
        const m = memberOf(db(), r.memberId);
        return r.receiptNo.toLowerCase().includes(needle) || (m?.name.toLowerCase().includes(needle) ?? false) || m?.generalNo === needle || (r.reference?.toLowerCase().includes(needle) ?? false);
      })
      .sort((a, b) => (b.at ?? b.date).localeCompare(a.at ?? a.date) || b.receiptNo.localeCompare(a.receiptNo));
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(q.pageSize) || 25));
    const today = db().demo.today;
    const counts: Record<ReceiptTab, number> = { ALL: all.length, SALARY_RECOVERY: all.filter((r) => r.source === 'SALARY_RECOVERY').length, COUNTER: all.filter(counter).length, REPORTED: db().paymentReports.filter((r) => r.status === 'REPORTED').length };
    return c.json<ReceiptList>({
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => receiptRow(db(), r)),
      page,
      pageSize,
      total: filtered.length,
      counts,
      totals: { today: sum(all.filter((r) => r.date === today).map((r) => r.amount)), thisMonth: sum(all.filter((r) => r.date.startsWith(today.slice(0, 7))).map((r) => r.amount)), reportedOpen: counts.REPORTED },
      canReceive: canReceive(user),
    });
  });

  api.get('/receipts/:id', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const r = db().receipts.find((x) => x.id === c.req.param('id') || x.receiptNo === c.req.param('id')) ?? fail('NOT_FOUND', 'Receipt not found.');
    return c.json<ReceiptDetail>(receiptDetail(db(), r));
  });

  api.get('/members/:id/dues', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    return c.json<MemberDues>(memberDues(db(), c.req.param('id')));
  });

  /** Dues payment: arrears oldest first (D-061); share capital: the first-demand shares. */
  const takePayment = (memberId: string, purpose: 'DUES' | 'SHARE_CAPITAL', amount: number, receipt: Omit<Receipt, 'id' | 'receiptNo' | 'memberId' | 'amount' | 'allocations' | 'purpose'>) => {
    const dues = memberDues(db(), memberId);
    let allocations: Receipt['allocations'] = [];
    if (purpose === 'SHARE_CAPITAL') {
      if (amount > dues.shareCapitalDue) fail('VALIDATION_ERROR', dues.shareCapitalDue ? `Share capital due is ${formatINR(dues.shareCapitalDue)}.` : 'No share capital is due.', { fieldErrors: { amount: dues.shareCapitalDue ? `At most ${formatINR(dues.shareCapitalDue)}` : 'Nothing due' } });
      const sh = db().shareAccounts.find((s) => s.memberId === memberId);
      if (sh) sh.shareCapital += amount;
      allocations = [{ head: 'SHARE_CAPITAL', amount }];
    } else {
      if (!dues.totalArrears) fail('VALIDATION_ERROR', 'This member has no dues from past cycles.', { fieldErrors: { amount: 'Nothing due' } });
      if (amount > dues.totalArrears) fail('VALIDATION_ERROR', `More than the dues of ${formatINR(dues.totalArrears)}.`, { fieldErrors: { amount: `At most ${formatINR(dues.totalArrears)}` } });
      const sheets = dues.arrears.map((a) => db().demandSheets.find((s) => s.id === a.sheetId)!);
      const result = allocateArrears(sheets.map((s) => ({ key: s.id, components: s.lines.find((l) => l.memberId === memberId)!.components })), amount);
      result.cycles.forEach((cyc, i) => {
        const sh = sheets[i]!;
        const line = sh.lines.find((l) => l.memberId === memberId)!;
        const before = line.components.map((c) => ({ ...c }));
        line.components = cyc.components;
        allocations.push(...postComponents(db(), memberId, sh.cycle, before, line.components));
        recomputeSheet(sh);
      });
    }
    const r: Receipt = { id: `rcpt-c-${db().receipts.length + 1}`, receiptNo: nextReceiptNo(db(), 'RCP-C'), memberId, amount, allocations, purpose, ...receipt };
    db().receipts.push(r);
    return r;
  };

  api.post('/receipts', requireSession, async (c) => {
    const user = c.get('session');
    staffView(user);
    if (!canReceive(user)) fail('FORBIDDEN', 'Only the Cashier or the Accountant takes payments.');
    const input = await c.req.json<Partial<NewReceiptInput>>().catch(() => ({}) as Partial<NewReceiptInput>);
    const fieldErrors: Record<string, string> = {};
    const m = input.memberId ? memberOf(db(), input.memberId) : undefined;
    if (!m) fieldErrors.memberId = 'Choose the member';
    if (!input.amount || !Number.isInteger(input.amount) || input.amount <= 0) fieldErrors.amount = 'Enter the amount';
    if (!input.date || input.date > db().demo.today) fieldErrors.date = 'Today or earlier';
    if (input.mode === 'CASH') {
      const check = validateDenominations(input.denominations ?? {}, input.amount ?? 0);
      if (!check.pass) fieldErrors.denominations = check.message;
    } else if (input.mode === 'BANK_TRANSFER') {
      if (!input.reference?.trim()) fieldErrors.reference = 'Enter the UTR / transfer reference';
    } else if (input.mode === 'ADJUSTMENT') {
      if (user.role !== 'ACCOUNTANT') fieldErrors.mode = 'Only the Accountant records adjustments';
      if ((input.remarks?.trim().length ?? 0) < 10) fieldErrors.remarks = 'Explain the adjustment (at least 10 characters)';
    } else fieldErrors.mode = 'Choose how it was paid';
    if (input.purpose !== 'DUES' && input.purpose !== 'SHARE_CAPITAL') fieldErrors.purpose = 'Choose what it is for';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const r = takePayment(m!.id, input.purpose!, input.amount!, {
      date: input.date!,
      source: input.mode === 'CASH' ? 'CASH' : input.mode === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'BANK_TRANSFER',
      ...(input.mode === 'CASH' ? { denominations: input.denominations! } : {}),
      ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
      ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
      byName: user.name,
      byId: user.id,
      at: nowIso(),
    });
    audit(store, user, 'receipt', r.id, 'create', `Receipt ${r.receiptNo} · ${m!.name} · ${formatINR(r.amount)}`);
    store.save();
    return c.json<ReceiptDetail>(receiptDetail(db(), r), 201);
  });

  // ---- ST-47 member-reported payments -------------------------------------------------------------
  const reportRow = (r: PaymentReport): PaymentReportRow => {
    const m = memberOf(db(), r.memberId);
    return { ...r, memberName: m?.name ?? '', generalNo: m?.generalNo ?? '', departmentName: deptName(db(), m?.departmentId ?? ''), totalArrears: memberDues(db(), r.memberId).totalArrears };
  };

  api.get('/payment-reports', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const status = c.req.query('status');
    return c.json<PaymentReportRow[]>(
      db()
        .paymentReports.filter((r) => (!status || r.status === status) && (user.role !== 'DDO' || memberOf(db(), r.memberId)?.departmentId === user.departmentId))
        .sort((a, b) => Number(b.status === 'REPORTED') - Number(a.status === 'REPORTED') || (b.reportedAt ?? b.paidOn).localeCompare(a.reportedAt ?? a.paidOn))
        .map(reportRow),
    );
  });

  const loadReport = (id: string, user: SessionUser) => {
    staffView(user);
    if (!canReceive(user)) fail('FORBIDDEN', 'Only the Cashier or the Accountant verifies payments.');
    const r = db().paymentReports.find((x) => x.id === id) ?? fail('NOT_FOUND', 'Report not found.');
    if (r.status !== 'REPORTED') fail('INVALID_TRANSITION', `Already ${r.status.toLowerCase()}.`);
    return r;
  };

  api.post('/payment-reports/:id/verify', requireSession, async (c) => {
    const user = c.get('session');
    const rep = loadReport(c.req.param('id'), user);
    const { remarks } = await c.req.json<{ remarks?: string }>().catch(() => ({}) as { remarks?: string });
    const receipt = takePayment(rep.memberId, rep.towards ?? 'DUES', rep.amount, { date: rep.paidOn, source: 'BANK_TRANSFER', reference: rep.reference, paymentReportId: rep.id, byName: user.name, byId: user.id, at: nowIso(), ...(remarks?.trim() ? { remarks: remarks.trim() } : {}) });
    rep.status = 'VERIFIED';
    rep.decided = signOff(user, remarks?.trim() || undefined);
    rep.receiptId = receipt.id;
    notify(store, rep.memberId, 'payment.verified', { amount: formatINR(rep.amount), reference: rep.reference, receiptNo: receipt.receiptNo }, '/payments');
    audit(store, user, 'paymentReport', rep.id, 'verify', `Verified ${formatINR(rep.amount)} (${rep.reference}) → ${receipt.receiptNo}`);
    store.save();
    return c.json<ReceiptDetail>(receiptDetail(db(), receipt));
  });

  api.post('/payment-reports/:id/reject', requireSession, async (c) => {
    const user = c.get('session');
    const rep = loadReport(c.req.param('id'), user);
    const { reason = '' } = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string });
    if (reason.trim().length < 10) fail('VALIDATION_ERROR', 'Give the reason (at least 10 characters). The member sees it.', { fieldErrors: { reason: 'At least 10 characters' } });
    rep.status = 'REJECTED';
    rep.rejectReason = reason.trim();
    rep.decided = signOff(user, reason.trim());
    notify(store, rep.memberId, 'payment.rejected', { amount: formatINR(rep.amount), reason: reason.trim() }, '/payments');
    audit(store, user, 'paymentReport', rep.id, 'reject', `Rejected ${formatINR(rep.amount)} (${rep.reference})`);
    store.save();
    return c.json<PaymentReportRow>(reportRow(rep));
  });

  // ---- MB-10 / MB-18 (member) ---------------------------------------------------------------------
  const myMember = (user: SessionUser) => {
    const id = requireMember(user);
    return memberOf(db(), id) ?? fail('NOT_FOUND', 'Member record not found.');
  };

  api.get('/me/payments', requireSession, (c) => {
    const m = myMember(c.get('session'));
    const months = db()
      .demandSheets.flatMap((sh) => {
        const line = sh.lines.find((l) => l.memberId === m.id);
        if (!line) return [];
        const posted = sh.status === 'RECOVERY_POSTED';
        const paid = sum(line.components.map((x) => x.allocated));
        return [{ cycle: sh.cycle, sheetStatus: sh.status, demand: line.totalDemand, ...(posted ? { recovered: paid, short: Math.max(0, line.totalDemand - paid) } : {}), components: inPriority(line.components.map((x) => ({ ...x, ...labelOf(db(), x) }))) }];
      })
      .sort((a, b) => b.cycle.localeCompare(a.cycle));
    return c.json<MyPayments>({
      months,
      receipts: db().receipts.filter((r) => r.memberId === m.id).sort((a, b) => (b.at ?? b.date).localeCompare(a.at ?? a.date)).map((r) => receiptRow(db(), r)),
      reports: db().paymentReports.filter((r) => r.memberId === m.id).sort((a, b) => (b.reportedAt ?? b.paidOn).localeCompare(a.reportedAt ?? a.paidOn)),
      dues: memberDues(db(), m.id),
      payTo: PAY_TO,
    });
  });

  api.get('/me/receipts/:id', requireSession, (c) => {
    const m = myMember(c.get('session'));
    const r = db().receipts.find((x) => x.id === c.req.param('id') && x.memberId === m.id) ?? fail('NOT_FOUND', 'Receipt not found.');
    return c.json<ReceiptDetail>(receiptDetail(db(), r));
  });

  api.post('/me/payments/reports', requireSession, async (c) => {
    const user = c.get('session');
    const m = myMember(user);
    const input = await c.req.json<Partial<ReportPaymentInput>>().catch(() => ({}) as Partial<ReportPaymentInput>);
    const dues = memberDues(db(), m.id);
    const today = db().demo.today;
    const fieldErrors: Record<string, string> = {};
    const owed = input.towards === 'SHARE_CAPITAL' ? dues.shareCapitalDue : dues.totalArrears;
    if (input.towards !== 'DUES' && input.towards !== 'SHARE_CAPITAL') fieldErrors.towards = 'Choose what the payment was for';
    else if (!owed) fieldErrors.towards = input.towards === 'SHARE_CAPITAL' ? 'No share capital is due' : 'You have no dues from past months';
    if (!input.amount || !Number.isInteger(input.amount) || input.amount <= 0) fieldErrors.amount = 'Enter the amount you paid';
    else if (owed && input.amount > owed) fieldErrors.amount = `You owe ${formatINR(owed)}. Pay that or less.`;
    if (!input.paidOn || input.paidOn > today) fieldErrors.paidOn = 'Today or earlier';
    else if (daysBetween(input.paidOn, today) > 60) fieldErrors.paidOn = 'Report within 60 days of paying';
    if (!['BANK_TRANSFER', 'UPI', 'CHEQUE_DEPOSIT'].includes(input.mode ?? '')) fieldErrors.mode = 'Choose how you paid';
    const ref = (input.reference ?? '').trim().toUpperCase();
    if (ref.length < 6) fieldErrors.reference = 'Enter the UTR / transaction or cheque number';
    else if (db().paymentReports.some((r) => r.reference.toUpperCase() === ref && r.status !== 'REJECTED')) fieldErrors.reference = 'This reference was already reported';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const rep: PaymentReport = { id: `prep-${db().paymentReports.length + 1}-${Date.now().toString(36)}`, memberId: m.id, amount: input.amount!, paidOn: input.paidOn!, mode: input.mode!, reference: ref, status: 'REPORTED', towards: input.towards!, reportedAt: nowIso(), ...(input.screenshotName ? { screenshotName: input.screenshotName } : {}) };
    db().paymentReports.push(rep);
    audit(store, user, 'paymentReport', rep.id, 'report', `${m.name} reported ${formatINR(rep.amount)} (${ref})`);
    store.save();
    return c.json<PaymentReport>(rep, 201);
  });
}
