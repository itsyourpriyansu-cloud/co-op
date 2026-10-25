// Deposits (M6): ST-30 index, ST-31 open at the counter, ST-32 detail, ST-33 payment & acceptance,
// MB-08 / MB-09 on the phone and MB-15 "Open FD" (D-028). Rules from @tgs/domain: fdRateFor (BR-017),
// calculateFdMaturity, fdPayoutSchedule, validateFdRequest (F4, Q-313), validateDenominations (BR-029),
// depositActionsFor / nextDepositStatus (docs/10 §3, D-027).
import { randomUUID } from 'node:crypto';
import {
  calculateFdMaturity,
  DEPOSIT_STAGE_OWNER,
  denominationsFor,
  depositActionsFor,
  fdPayoutSchedule,
  fdRateFor,
  formatDisplayDate,
  formatINR,
  nextDepositStatus,
  PRIMARY_DEPOSIT_ACTION,
  validateDenominations,
  validateFdRequest,
  type DepositAction,
} from '@tgs/domain';
import {
  ROLE_LABELS,
  type DepositAccount,
  type DepositActionInput,
  type DepositContext,
  type DepositDetail,
  type DepositLedgerRow,
  type DepositList,
  type DepositRow,
  type DepositTab,
  type FdRequestInput,
  type LoanStage,
  type OtpChallenge,
  type Role,
  type SessionUser,
  type WorkItem,
} from '@tgs/types';
import { audit, can, notify, nowIso, requireMember, requirePermission, requireStaff, type Api, type Guard } from './common';
import { fail } from './errors';
import type { Db, Store } from './store';

const DEMO_OTP = '123456';
export const FD_TEXT_VERSION = 'F4-2026.1';
/** The four rules printed on form F4 and the FDR (docs/16), in plain words. */
export const FD_RULES = [
  'The society does not have to send a notice when the deposit matures.',
  'Interest stops on the date fixed for repayment.',
  'For two depositors, payment to either one or the survivor fully settles the deposit; for three or more, payment to any one or the survivors does.',
  'Renewing the deposit in the name of either / any one of the depositors has the same effect.',
];
/** Fictional demo account for transfers (D-054: demo only). */
const PAY_TO = { accountName: 'TGSECCSL Fixed Deposits', accountNo: 'XXXXXXXX4021', ifsc: 'DEMO0000929', counter: 'Society cash counter, 2nd Floor, West Ancillary Building' };

interface Actor {
  id: string;
  name: string;
  role: Role;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const deptOf = (db: Db, memberId: string) => db.departments.find((d) => d.id === db.members.find((m) => m.id === memberId)?.departmentId);
const isRequest = (d: DepositAccount) => d.scheme === 'FD' && ['REQUESTED', 'PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT', 'REFUND_PENDING'].includes(d.status);

function waitingOnFor(db: Db, d: DepositAccount): string | undefined {
  if (d.status === 'REQUESTED') return d.channel === 'APP' ? 'Payment from the member, then the Cashier' : 'Cashier (payment)';
  const role = DEPOSIT_STAGE_OWNER[d.status];
  if (!role || d.status === 'MATURED') return d.status === 'MATURED' ? 'Cashier (pay out)' : undefined;
  const u = db.staffUsers.find((x) => x.role === role);
  return u ? `${u.name} (${ROLE_LABELS[role]})` : ROLE_LABELS[role];
}

function maturityOf(d: DepositAccount, today: string) {
  if (d.scheme !== 'FD' || !d.principal || !d.tenureMonths || !d.payoutFrequency) return undefined;
  const openedOn = d.status === 'ACTIVE' || d.status === 'MATURED' || d.status === 'CLOSED' ? d.openedOn : (d.payment?.date ?? today);
  const m = calculateFdMaturity({ principal: d.principal, ratePercent: d.ratePercent, tenureMonths: d.tenureMonths, payout: d.payoutFrequency, openedOn });
  return { date: d.maturityDate ?? m.maturityDate, value: d.maturityValue ?? m.maturityValue, totalInterest: m.totalInterest, periodicInterest: m.periodicInterest, openedOn };
}

function toRow(db: Db, d: DepositAccount): DepositRow {
  const m = db.members.find((x) => x.id === d.memberId);
  const waitingOn = isRequest(d) ? waitingOnFor(db, d) : undefined;
  return {
    id: d.id,
    accountNo: d.accountNo,
    ...(d.fdrNo ? { fdrNo: d.fdrNo } : {}),
    memberId: d.memberId,
    memberName: m?.name ?? '',
    generalNo: m?.generalNo ?? '',
    departmentName: deptOf(db, d.memberId)?.name ?? '',
    scheme: d.scheme,
    status: d.status,
    openedOn: d.openedOn,
    amount: d.scheme === 'FD' ? (d.principal ?? 0) : d.balance,
    ...(d.monthlyAmount ? { monthlyAmount: d.monthlyAmount } : {}),
    ratePercent: d.ratePercent,
    ...(d.tenureMonths ? { tenureMonths: d.tenureMonths } : {}),
    ...(d.maturityDate ? { maturityDate: d.maturityDate, daysToMaturity: daysBetween(db.demo.today, d.maturityDate) } : {}),
    ...(d.maturityValue ? { maturityValue: d.maturityValue } : {}),
    pledged: Boolean(d.pledgedToLoanId),
    joint: d.operationMode !== 'SINGLE',
    minor: Boolean(d.minor),
    ...(waitingOn ? { waitingOn } : {}),
  };
}

/** Request → acceptance tracker (MB-15 chips, ST-32 stepper). A stopped request fails at its next step. */
function stagesFor(d: DepositAccount): LoanStage[] {
  const accepted = ['ACTIVE', 'MATURED', 'CLOSED'].includes(d.status);
  const by = (pred: (e: NonNullable<DepositAccount['events']>[number]) => boolean) => {
    const e = d.events?.find(pred);
    return e ? { date: e.at.slice(0, 10), by: e.actorName } : {};
  };
  const steps = [
    { key: 'requested', title: 'Requested', done: true, meta: by((e) => e.action === 'request') },
    { key: 'payment', title: 'Payment received', done: Boolean(d.payment) || accepted, meta: by((e) => e.action === 'recordPayment') },
    { key: 'secretary', title: 'Accepted by the Secretary', done: Boolean(d.signOffs?.secretary) || accepted, meta: by((e) => e.action === 'accept' && e.actorRole === 'SECRETARY') },
    { key: 'president', title: 'Accepted by the President · FDR issued', done: Boolean(d.signOffs?.president) || accepted, meta: by((e) => e.action === 'accept' && e.actorRole === 'PRESIDENT') },
  ];
  const stopped = d.status === 'CANCELLED' || d.status === 'REFUND_PENDING';
  const next = steps.findIndex((x) => !x.done);
  return steps.map((x, i) => ({ key: x.key, title: x.title, status: x.done ? ('done' as const) : i === next ? (stopped ? ('failed' as const) : ('current' as const)) : ('todo' as const), ...x.meta }));
}

function ledgerOf(db: Db, d: DepositAccount): DepositLedgerRow[] {
  if (d.scheme === 'FD') {
    const rows: DepositLedgerRow[] = [];
    if (d.payment || ['ACTIVE', 'MATURED', 'CLOSED'].includes(d.status)) rows.push({ date: d.payment?.date ?? d.openedOn, particulars: `Deposit received${d.payment ? ` (${d.payment.mode.toLowerCase()}, receipt ${d.payment.receiptNo})` : ''}`, credit: d.principal ?? 0, balance: d.principal ?? 0 });
    if (d.status === 'CLOSED') rows.push({ date: d.closedOn ?? d.maturityDate ?? d.openedOn, particulars: 'Paid out on maturity', debit: d.maturityValue ?? d.principal ?? 0, balance: 0 });
    if (d.status === 'CANCELLED' && d.payment) rows.push({ date: d.closedOn ?? d.payment.date, particulars: 'Refunded', debit: d.principal ?? 0, balance: 0 });
    return rows;
  }
  // CRD / SRDS: credits come from the monthly salary recovery (demand sheets → receipts).
  const head = d.scheme === 'CRD' || d.scheme === 'SRDS' ? d.scheme : undefined;
  const credits = head
    ? db.receipts
        .filter((r) => r.memberId === d.memberId)
        .flatMap((r) => r.allocations.filter((a) => a.head === head).map((a) => ({ date: r.date, particulars: `${r.cycle ? `Salary recovery ${r.cycle}` : 'Receipt'} · ${r.receiptNo}`, amount: a.amount })))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const opening = d.balance - credits.reduce((s, c) => s + c.amount, 0);
  let bal = opening;
  return [{ date: d.openedOn, particulars: credits.length ? 'Opening balance' : 'Balance', credit: Math.max(0, opening), balance: opening }, ...credits.map((c) => ({ date: c.date, particulars: c.particulars, credit: c.amount, balance: (bal += c.amount) }))];
}

export function depositDetail(db: Db, d: DepositAccount, user: SessionUser): DepositDetail {
  const m = db.members.find((x) => x.id === d.memberId)!;
  const mat = maturityOf(d, db.demo.today);
  const staff = user.role !== 'MEMBER' && user.role !== 'APPLICANT';
  const actions = staff ? depositActionsFor(d.status, { role: user.role }) : [];
  const owner = DEPOSIT_STAGE_OWNER[d.status];
  const loan = d.pledgedToLoanId ? db.loans.find((l) => l.id === d.pledgedToLoanId) : undefined;
  const product = db.loanProducts.find((p) => p.code === 'DEPOSIT');
  const waitingOn = waitingOnFor(db, d);
  return {
    deposit: d,
    member: { id: m.id, name: m.name, generalNo: m.generalNo, departmentName: deptOf(db, m.id)?.name ?? '', designation: m.designation, mobileMasked: m.mobileMasked, fatherName: m.fatherName },
    ...(mat ? { maturity: { date: mat.date, value: mat.value, totalInterest: mat.totalInterest, periodicInterest: mat.periodicInterest } } : {}),
    payouts: mat && d.payoutFrequency && d.principal && d.tenureMonths ? fdPayoutSchedule({ principal: d.principal, ratePercent: d.ratePercent, tenureMonths: d.tenureMonths, payout: d.payoutFrequency, openedOn: mat.openedOn }).map((p) => ({ ...p, paid: d.status !== 'REQUESTED' && p.date <= db.demo.today })) : [],
    ledger: ledgerOf(db, d),
    stages: d.scheme === 'FD' ? stagesFor(d) : [],
    actions,
    ...(waitingOn ? { waitingOn } : {}),
    ...(staff && !actions.length && owner && can(user, 'demo.control') && d.status !== 'MATURED' ? { demoActAs: waitingOn ?? ROLE_LABELS[owner] } : {}),
    ...(loan ? { pledgedLoan: { id: loan.id, loanNo: loan.loanNo ?? loan.applicationNo, outstanding: loan.outstandingPrincipal } } : {}),
    ...(d.scheme === 'FD' && d.status === 'ACTIVE' && !d.pledgedToLoanId && product ? { loanAgainst: { maxAmount: Math.floor(((d.principal ?? 0) * product.depositMarginPercent) / 100 / 100) * 100, marginPercent: product.depositMarginPercent } } : {}),
    rules: FD_RULES,
  };
}

function newRequest(db: Db, memberId: string, input: FdRequestInput, channel: 'APP' | 'COUNTER', actor: Actor): DepositAccount {
  const m = db.members.find((x) => x.id === memberId)!;
  const at = nowIso();
  const seq = db.deposits.filter((d) => d.accountNo.startsWith('REQ-')).length + 1;
  const holders = input.holding === 'JOINT' ? (input.holders ?? []).map((h) => ({ name: h.name.trim(), fatherOrHusbandName: h.fatherOrHusbandName.trim(), occupation: h.occupation.trim(), address: h.address.trim(), phone: h.phone })) : [];
  const d: DepositAccount = {
    id: `dep-fdreq-${randomUUID().slice(0, 8)}`,
    accountNo: `REQ-${String(seq).padStart(4, '0')}`,
    memberId,
    scheme: 'FD',
    status: 'REQUESTED',
    openedOn: db.demo.today,
    principal: input.principal,
    tenureMonths: input.tenureMonths,
    ratePercent: fdRateFor(input.tenureMonths, db.settings.fdSlabs) ?? 0,
    payoutFrequency: input.payoutFrequency,
    balance: 0,
    operationMode: holders.length === 0 ? 'SINGLE' : holders.length === 1 ? 'EITHER_OR_SURVIVOR' : 'ANY_ONE_OR_SURVIVOR',
    jointHolders: holders.map((h) => h.name),
    ...(holders.length ? { holders } : {}),
    ...(input.holding === 'MINOR' && input.minor ? { minor: { name: input.minor.name.trim(), dob: input.minor.dob, guardianName: m.name, guardianRelation: input.minor.guardianRelation.trim() } } : {}),
    nominee: { name: input.nominee.name.trim(), relation: input.nominee.relation },
    channel,
    requestedAt: at,
    ...(channel === 'APP' ? { signature: { signedAt: at, textVersion: FD_TEXT_VERSION } } : {}),
    events: [{ at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action: 'request', toStatus: 'REQUESTED', ...(channel === 'COUNTER' ? { remarks: 'Opened at the counter from the signed form F4' } : {}) }],
  };
  db.deposits.push(d);
  return d;
}

function cleanRequest(raw: Partial<FdRequestInput>): FdRequestInput {
  return {
    principal: Math.round(Number(raw.principal ?? 0)),
    tenureMonths: Math.round(Number(raw.tenureMonths ?? 0)),
    payoutFrequency: raw.payoutFrequency ?? 'ON_MATURITY',
    holding: raw.holding ?? 'SINGLE',
    ...(raw.holders ? { holders: raw.holders } : {}),
    ...(raw.minor ? { minor: raw.minor } : {}),
    nominee: { name: raw.nominee?.name ?? '', relation: raw.nominee?.relation ?? 'Spouse' } as FdRequestInput['nominee'],
  };
}

/** One transition with its side effects (ST-33, D-027). `demo` acts as the stage owner. */
export function applyDepositAction(store: Store, d: DepositAccount, action: DepositAction, actor: Actor, input: DepositActionInput, opts: { demo?: boolean } = {}) {
  const db = store.db;
  if (!opts.demo) {
    const allowed = depositActionsFor(d.status, { role: actor.role });
    if (!allowed.includes(action)) fail(allowed.length ? 'FORBIDDEN' : 'INVALID_TRANSITION', allowed.length ? 'That action is not yours at this stage.' : `Nothing for you to do at "${d.status}".`);
  }
  const next = nextDepositStatus(d.status, action);
  if (!next) return fail('INVALID_TRANSITION', `"${action}" is not possible at "${d.status}".`);
  const m = db.members.find((x) => x.id === d.memberId)!;
  const remarks = input.remarks?.trim();
  const at = nowIso();
  const signOff = { byId: actor.id, byName: actor.name, role: actor.role, at, ...(remarks ? { remarks } : {}) };
  switch (action) {
    case 'recordPayment': {
      const p = input.payment;
      const fieldErrors: Record<string, string> = {};
      if (!p?.mode) fieldErrors.mode = 'Choose how it was paid';
      if (!p?.date || p.date > db.demo.today) fieldErrors.date = 'Enter the payment date (today or earlier)';
      if (p?.mode === 'CASH') {
        const check = validateDenominations(p.denominations ?? {}, d.principal ?? 0);
        if (!check.pass) fieldErrors.denominations = check.message;
      } else if (p && !p.reference?.trim()) fieldErrors.reference = p.mode === 'CHEQUE' ? 'Enter the cheque number' : 'Enter the UTR / transfer reference';
      if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Check the payment details.', { fieldErrors });
      const receiptNo = `RCT-${db.demo.today.slice(0, 4)}-${String(db.receipts.length + 1).padStart(5, '0')}`;
      db.receipts.push({ id: `rct-${randomUUID().slice(0, 8)}`, receiptNo, memberId: m.id, date: p!.date, source: p!.mode === 'CASH' ? 'CASH' : 'BANK_TRANSFER', amount: d.principal ?? 0, ...(p!.mode === 'CASH' ? { denominations: p!.denominations } : {}), allocations: [], purpose: 'FD', depositId: d.id, ...(p!.reference?.trim() ? { reference: p!.reference.trim() } : {}) });
      d.payment = { mode: p!.mode, amount: d.principal ?? 0, date: p!.date, ...(p!.mode === 'CASH' ? { denominations: p!.denominations } : { reference: p!.reference!.trim() }), receiptNo, byName: actor.name, at };
      break;
    }
    case 'accept':
      d.signOffs ??= {};
      if (d.status === 'ACCEPTANCE_PRESIDENT') {
        if (d.signOffs.secretary?.byId === actor.id) fail('FORBIDDEN', 'The President cannot be the same person as the Secretary (SOD-1).');
        d.signOffs.president = signOff;
        // Account No. + FDR No. issued on the President's acceptance; interest runs from the payment date.
        const fdSeq = db.deposits.filter((x) => x.scheme === 'FD' && x.fdrNo).length + 1;
        const openedOn = d.payment?.date ?? db.demo.today;
        const mat = calculateFdMaturity({ principal: d.principal ?? 0, ratePercent: d.ratePercent, tenureMonths: d.tenureMonths ?? 12, payout: d.payoutFrequency ?? 'ON_MATURITY', openedOn });
        Object.assign(d, { accountNo: `FD-${String(fdSeq).padStart(5, '0')}`, fdrNo: `FDR-${openedOn.slice(0, 4)}-${String(fdSeq).padStart(5, '0')}`, openedOn, maturityDate: mat.maturityDate, maturityValue: mat.maturityValue, balance: d.principal ?? 0 });
        notify(store, m.id, 'fd.accepted', { fdrNo: d.fdrNo!, amount: formatINR(d.principal ?? 0), maturityDate: formatDisplayDate(mat.maturityDate) }, `/deposit/${d.id}`);
      } else d.signOffs.secretary = signOff;
      break;
    case 'reject':
      if (!remarks) fail('VALIDATION_ERROR', 'Give a reason. The member sees it.', { fieldErrors: { remarks: 'Required' } });
      d.rejection = signOff;
      notify(store, m.id, 'fd.rejected', { requestNo: d.accountNo, reason: remarks! }, `/deposit/${d.id}`);
      break;
    case 'refund':
      d.cancelledReason = 'Refunded after rejection';
      d.closedOn = db.demo.today;
      break;
    case 'cancel':
      d.cancelledReason = remarks || 'Cancelled at the counter';
      break;
    case 'payout':
      d.closedOn = db.demo.today;
      d.balance = 0;
      break;
  }
  d.events = [...(d.events ?? []), { at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: d.status, toStatus: next, ...(remarks ? { remarks } : {}) }];
  d.status = next;
  audit(store, { id: actor.id, name: actor.name, role: actor.role }, 'deposit', d.id, action, `${actor.name}: ${action} on ${d.fdrNo ?? d.accountNo} (${m.name})${opts.demo ? ' [demo]' : ''}`);
  store.save();
  return d;
}

/** ST-02 items: FD requests and maturities waiting on this user. */
export function depositWorkItems(db: Db, user: SessionUser): WorkItem[] {
  if (!can(user, 'deposits.view')) return [];
  const today = db.demo.today;
  return db.deposits
    .filter((d) => d.scheme === 'FD' && depositActionsFor(d.status, { role: user.role }).length > 0)
    .map((d) => {
      const m = db.members.find((x) => x.id === d.memberId);
      // A matured FD waits from its maturity date, not from when it was opened.
      const since = (d.status === 'MATURED' && d.maturityDate ? d.maturityDate : (d.events?.at(-1)?.at ?? d.openedOn)).slice(0, 10);
      const action = PRIMARY_DEPOSIT_ACTION[d.status];
      return {
        kind: 'deposit' as const,
        id: d.id,
        ref: d.fdrNo ?? d.accountNo,
        title: m?.name ?? '',
        subtitle: `Fixed deposit · ${d.tenureMonths ?? ''} months${d.channel === 'APP' ? ' · from the app' : ''}`,
        stage: 'deposit',
        stageLabel: 'Deposits',
        status: d.status,
        departmentName: deptOf(db, d.memberId)?.name ?? '',
        amount: d.principal ?? 0,
        since,
        days: Math.max(0, daysBetween(since, today)),
        actionLabel: action === 'recordPayment' ? 'Record payment' : action === 'accept' ? 'Accept' : action === 'payout' ? 'Pay out' : action === 'refund' ? 'Refund' : 'Open',
        link: `/deposits/${d.id}`,
      };
    });
}

// ---- routes -------------------------------------------------------------------------------------

export function registerDeposits(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const otps = new Map<string, { memberId: string; input: string; expiresAt: number }>();
  const staffView = (user: SessionUser) => {
    requireStaff(user);
    requirePermission(user, 'deposits.view', 'You do not have access to deposits.');
  };
  const staffDeposit = (id: string, user: SessionUser) => {
    staffView(user);
    return db().deposits.find((d) => d.id === id || d.fdrNo === id || d.accountNo === id) ?? fail('NOT_FOUND', 'Deposit not found.');
  };
  const myMember = (user: SessionUser) => {
    const id = requireMember(user);
    return db().members.find((m) => m.id === id) ?? fail('NOT_FOUND', 'Member record not found.');
  };
  const validate = (input: FdRequestInput) => {
    const fieldErrors = validateFdRequest(input, { slabs: db().settings.fdSlabs, minAmount: db().settings.fdMinAmount, today: db().demo.today });
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
  };

  // ---- ST-30 index ---------------------------------------------------------------------------
  api.get('/deposits', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const tab = (c.req.query('tab') ?? 'FD') as DepositTab;
    const status = c.req.query('status');
    const maturing = Number(c.req.query('maturingWithinDays') ?? 0);
    const departmentId = c.req.query('departmentId');
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 25)));
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const all = db().deposits;
    const inTab = (d: DepositAccount, t: DepositTab) => (t === 'REQUESTS' ? isRequest(d) || (d.scheme === 'FD' && d.status === 'CANCELLED') : t === 'FD' ? d.scheme === 'FD' && ['ACTIVE', 'MATURED', 'CLOSED'].includes(d.status) : d.scheme === t);
    const rows = all
      .filter((d) => inTab(d, tab))
      .map((d) => toRow(db(), d))
      .filter((r) => (!status || r.status === status) && (!maturing || (r.daysToMaturity !== undefined && r.daysToMaturity >= 0 && r.daysToMaturity <= maturing && r.status === 'ACTIVE')) && (!departmentId || deptOf(db(), r.memberId)?.id === departmentId) && (!q || r.memberName.toLowerCase().includes(q) || r.generalNo.includes(q) || r.accountNo.toLowerCase().includes(q) || (r.fdrNo ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (tab === 'REQUESTS' ? b.openedOn.localeCompare(a.openedOn) : tab === 'FD' ? (a.maturityDate ?? '').localeCompare(b.maturityDate ?? '') : Number(a.generalNo) - Number(b.generalNo)));
    const sum = (f: (d: DepositAccount) => boolean, v: (d: DepositAccount) => number) => all.filter(f).reduce((s, d) => s + v(d), 0);
    const counts: DepositList['counts'] = {};
    for (const t of ['FD', 'REQUESTS', 'CRD', 'SRDS', 'SAVINGS'] as DepositTab[]) counts[t] = all.filter((d) => inTab(d, t)).length;
    return c.json<DepositList>({
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
      counts,
      totals: {
        fdPrincipal: sum((d) => d.scheme === 'FD' && d.status === 'ACTIVE', (d) => d.principal ?? 0),
        crd: sum((d) => d.scheme === 'CRD' && d.status === 'ACTIVE', (d) => d.balance),
        srds: sum((d) => d.scheme === 'SRDS' && d.status === 'ACTIVE', (d) => d.balance),
        savings: sum((d) => d.scheme === 'SAVINGS' && d.status === 'ACTIVE', (d) => d.balance),
        maturing30: all.filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && d.maturityDate && daysBetween(db().demo.today, d.maturityDate) >= 0 && daysBetween(db().demo.today, d.maturityDate) <= 30).length,
        requestsOpen: all.filter((d) => isRequest(d) && d.status !== 'REFUND_PENDING').length,
      },
      scope: {},
      canOpen: can(user, 'deposits.open'),
    });
  });

  api.get('/deposits/:id', requireSession, (c) => {
    const user = c.get('session');
    return c.json<DepositDetail>(depositDetail(db(), staffDeposit(c.req.param('id'), user), user));
  });

  /** ST-31: the office opens an FD from a signed paper form (no OTP). */
  api.post('/deposits', requireSession, async (c) => {
    const user = c.get('session');
    requirePermission(user, 'deposits.open', 'Only the Super Admin, Accountant and Cashier open deposits at the counter.');
    const body = await c.req.json<Partial<FdRequestInput> & { memberId?: string }>().catch(() => ({}) as Partial<FdRequestInput> & { memberId?: string });
    const m = db().members.find((x) => x.id === body.memberId && x.status === 'ACTIVE') ?? fail('VALIDATION_ERROR', 'Choose an active member.', { fieldErrors: { memberId: 'Choose the member' } });
    const input = cleanRequest(body);
    validate(input);
    const d = newRequest(db(), m.id, input, 'COUNTER', { id: user.id, name: user.name, role: user.role });
    audit(store, user, 'deposit', d.id, 'request', `FD request ${d.accountNo} for ${m.name} (${formatINR(input.principal)}) at the counter`);
    store.save();
    return c.json<DepositDetail>(depositDetail(db(), d, user), 201);
  });

  api.post('/deposits/:id/actions/:action', requireSession, async (c) => {
    const user = c.get('session');
    const d = staffDeposit(c.req.param('id'), user);
    const input = await c.req.json<DepositActionInput>().catch((): DepositActionInput => ({}));
    applyDepositAction(store, d, c.req.param('action') as DepositAction, { id: user.id, name: user.name, role: user.role }, input);
    return c.json<DepositDetail>(depositDetail(db(), d, user));
  });

  /** Demo: complete the current stage as its owner (cash counted exactly, acceptances signed). */
  api.post('/deposits/:id/demo-act', requireSession, (c) => {
    const user = c.get('session');
    if (!can(user, 'demo.control')) fail('FORBIDDEN', 'Demo controls are off for this user.');
    const d = staffDeposit(c.req.param('id'), user);
    const action = PRIMARY_DEPOSIT_ACTION[d.status];
    const role = DEPOSIT_STAGE_OWNER[d.status];
    const owner = role ? db().staffUsers.find((u) => u.role === role) : undefined;
    if (!action || !owner) return fail('INVALID_TRANSITION', `Nothing to do at "${d.status}".`);
    applyDepositAction(store, d, action, { id: owner.id, name: owner.name, role: owner.role }, action === 'recordPayment' ? { payment: { mode: 'CASH', date: db().demo.today, denominations: denominationsFor(d.principal ?? 0) } } : {}, { demo: true });
    return c.json<DepositDetail>(depositDetail(db(), d, user));
  });

  // ---- MB-08 / MB-09 / MB-15 (member) ----------------------------------------------------------
  api.get('/me/deposits', requireSession, (c) => {
    const m = myMember(c.get('session'));
    return c.json<DepositRow[]>(db().deposits.filter((d) => d.memberId === m.id).map((d) => toRow(db(), d)));
  });

  api.get('/me/deposits/context', requireSession, (c) => {
    const m = myMember(c.get('session'));
    return c.json<DepositContext>({ member: { id: m.id, name: m.name, generalNo: m.generalNo, nominee: m.nominee }, slabs: db().settings.fdSlabs, minAmount: db().settings.fdMinAmount, rules: FD_RULES, textVersion: FD_TEXT_VERSION, payTo: PAY_TO, today: db().demo.today });
  });

  api.get('/me/deposits/:id', requireSession, (c) => {
    const user = c.get('session');
    const m = myMember(user);
    const d = db().deposits.find((x) => x.id === c.req.param('id') && x.memberId === m.id) ?? fail('NOT_FOUND', 'Deposit not found.');
    return c.json<DepositDetail>(depositDetail(db(), d, user));
  });

  /** Sign with OTP (D-031): checks the request first so the code is only sent for a valid one. */
  api.post('/me/deposits/sign/request', requireSession, async (c) => {
    const m = myMember(c.get('session'));
    const input = cleanRequest(await c.req.json<Partial<FdRequestInput>>().catch(() => ({})));
    validate(input);
    const otpRef = randomUUID();
    otps.set(otpRef, { memberId: m.id, input: JSON.stringify(input), expiresAt: Date.now() + 300_000 });
    return c.json<OtpChallenge>({ otpRef, expiresInSeconds: 300, demoOtp: DEMO_OTP });
  });

  api.post('/me/deposits', requireSession, async (c) => {
    const user = c.get('session');
    const m = myMember(user);
    const { otpRef = '', otp } = await c.req.json<{ otpRef?: string; otp?: string }>().catch(() => ({}) as { otpRef?: string; otp?: string });
    const pending = otps.get(otpRef);
    if (!pending || pending.memberId !== m.id || Date.now() > pending.expiresAt) fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    if (otp !== DEMO_OTP) fail('VALIDATION_ERROR', "That code doesn't match. Check the SMS and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    otps.delete(otpRef);
    const input = JSON.parse(pending!.input) as FdRequestInput;
    const d = newRequest(db(), m.id, input, 'APP', { id: m.id, name: m.name, role: 'MEMBER' });
    audit(store, user, 'deposit', d.id, 'request', `${m.name} requested an FD of ${formatINR(input.principal)} in the app`);
    store.save();
    return c.json<DepositDetail>(depositDetail(db(), d, user), 201);
  });

  api.post('/me/deposits/:id/cancel', requireSession, async (c) => {
    const user = c.get('session');
    const m = myMember(user);
    const d = db().deposits.find((x) => x.id === c.req.param('id') && x.memberId === m.id) ?? fail('NOT_FOUND', 'Deposit not found.');
    if (d.status !== 'REQUESTED') fail('INVALID_TRANSITION', 'Only a request that has not been paid can be cancelled. Ask the office.');
    const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string });
    applyDepositAction(store, d, 'cancel', { id: m.id, name: m.name, role: 'MEMBER' }, { remarks: reason?.trim() || 'Cancelled by the member' }, { demo: true });
    return c.json<DepositDetail>(depositDetail(db(), d, user));
  });
}
