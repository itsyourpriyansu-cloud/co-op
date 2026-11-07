import { randomUUID } from 'node:crypto';
import {
  calculateFdMaturity,
  DEPOSIT_STAGE_OWNER,
  denominationsFor,
  depositActionsFor,
  fdPayoutSchedule,
  fdPrematureSettlement,
  fdRateFor,
  formatDisplayDate,
  formatINR,
  nextDepositStatus,
  PRIMARY_DEPOSIT_ACTION,
  validateDenominations,
  validateFdRequest,
  type DepositAction,
  type JournalLineInput,
} from '@tgs/domain';
import {
  ROLE_LABELS,
  type ConsoleRole,
  type DepositAccount,
  type DepositActionInput,
  type DepositContext,
  type DepositDetail,
  type DepositLedgerRow,
  type DepositList,
  type DepositRow,
  type DepositTab,
  type FdRequestInput,
  type FdSettlement,
  type LoanStage,
  type Member,
  type OtpChallenge,
  type Receipt,
  type Role,
  type SessionUser,
  type StaffSignOff,
} from '@tgs/types';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessNow, businessToday } from '../../common/utils/business-date';
import { notifyMember } from '../../common/utils/notify';
import { withTransaction, type Tx } from '../../db/transaction';
import { systemInfo } from '../../models';
import { ACCOUNT, DEPOSIT_ACCOUNT } from '../ledger/ledger.accounts';
import type { DepositsRepository } from './deposits.repository';

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
const FD_INTEREST_EXPENSE = '5100';
const FD_INTEREST_PAYABLE = '2210';
const FD_PENALTY_INCOME = '4400';
const SYSTEM: Actor = { id: 'system', name: 'System', role: 'SUPER_ADMIN' };
const LAST_RUN_KEY = 'fd.maturity.lastRunOn';

interface Actor {
  id: string;
  name: string;
  role: Role;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const isRequest = (d: DepositAccount) => d.scheme === 'FD' && ['REQUESTED', 'PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT', 'REFUND_PENDING'].includes(d.status);
const isStaff = (u: SessionUser) => u.role !== 'MEMBER' && u.role !== 'APPLICANT';
const inTab = (d: DepositAccount, t: DepositTab) => (t === 'REQUESTS' ? isRequest(d) || (d.scheme === 'FD' && d.status === 'CANCELLED') : t === 'FD' ? d.scheme === 'FD' && ['ACTIVE', 'MATURED', 'CLOSED'].includes(d.status) : d.scheme === t);

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

function maturityOf(d: DepositAccount, today: string) {
  if (d.scheme !== 'FD' || !d.principal || !d.tenureMonths || !d.payoutFrequency) return undefined;
  const openedOn = d.status === 'ACTIVE' || d.status === 'MATURED' || d.status === 'CLOSED' ? d.openedOn : (d.payment?.date ?? today);
  const m = calculateFdMaturity({ principal: d.principal, ratePercent: d.ratePercent, tenureMonths: d.tenureMonths, payout: d.payoutFrequency, openedOn });
  return { date: d.maturityDate ?? m.maturityDate, value: d.maturityValue ?? m.maturityValue, totalInterest: m.totalInterest, periodicInterest: m.periodicInterest, openedOn };
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

/**
 * Deposits (ST-30…33, MB-08/09/15, D-028): FD request → payment → Secretary → President (FDR) →
 * payout, refund or cancel; CRD / SRDS / savings balances. Rules from @tgs/domain. Money steps post
 * to the ledger in the same transaction.
 */
export class DepositsService {
  constructor(
    private readonly app: FastifyInstance,
    readonly repo: DepositsRepository,
  ) {}

  // ---- reads for other modules (loans) ----
  forMember(memberId: string): Promise<DepositAccount[]> {
    return this.repo.forMember(memberId);
  }

  byScheme(scheme: 'CRD' | 'SRDS'): Promise<DepositAccount[]> {
    return this.repo.list(scheme);
  }

  /** P7: collections credit CRD / SRDS inside their own transaction. */
  lockCompulsory(tx: Tx, memberId: string, scheme: 'CRD' | 'SRDS'): Promise<DepositAccount | undefined> {
    return this.repo.lockCompulsory(tx, memberId, scheme);
  }

  saveInTx(tx: Tx, d: DepositAccount): Promise<void> {
    return this.repo.save(tx, d);
  }

  /** An FD reserved for a loan against it (or released with loanId null). */
  async pledge(depositId: string, loanId: string | null): Promise<void> {
    const saved = await withTransaction(this.app.db, async (tx) => {
      const d = await this.repo.lock(tx, depositId);
      if (!d) return undefined;
      if (loanId) d.pledgedToLoanId = loanId;
      else if (d.pledgedToLoanId) delete d.pledgedToLoanId;
      await this.repo.save(tx, d);
      return d;
    });
  }

  // ---- read models ----
  private async waitingOn(d: DepositAccount, staff: Map<string, string>): Promise<string | undefined> {
    if (d.status === 'REQUESTED') return d.channel === 'APP' ? 'Payment from the member, then the Cashier' : 'Cashier (payment)';
    const role = DEPOSIT_STAGE_OWNER[d.status];
    if (!role || d.status === 'MATURED') return d.status === 'MATURED' ? 'Cashier (pay out)' : undefined;
    const name = staff.get(role);
    return name ? `${name} (${ROLE_LABELS[role as ConsoleRole]})` : ROLE_LABELS[role as ConsoleRole];
  }

  private async toRow(d: DepositAccount, today: string, m: Member | undefined, deptName: string, staff: Map<string, string>): Promise<DepositRow> {
    const waitingOn = isRequest(d) ? await this.waitingOn(d, staff) : undefined;
    return {
      id: d.id,
      accountNo: d.accountNo,
      ...(d.fdrNo ? { fdrNo: d.fdrNo } : {}),
      memberId: d.memberId,
      memberName: m?.name ?? '',
      generalNo: m?.generalNo ?? '',
      departmentName: deptName,
      scheme: d.scheme,
      status: d.status,
      openedOn: d.openedOn,
      amount: d.scheme === 'FD' ? (d.principal ?? 0) : d.balance,
      ...(d.monthlyAmount ? { monthlyAmount: d.monthlyAmount } : {}),
      ratePercent: d.ratePercent,
      ...(d.tenureMonths ? { tenureMonths: d.tenureMonths } : {}),
      ...(d.maturityDate ? { maturityDate: d.maturityDate, daysToMaturity: daysBetween(today, d.maturityDate) } : {}),
      ...(d.maturityValue ? { maturityValue: d.maturityValue } : {}),
      pledged: Boolean(d.pledgedToLoanId),
      joint: d.operationMode !== 'SINGLE',
      minor: Boolean(d.minor),
      ...(waitingOn ? { waitingOn } : {}),
    };
  }

  /** FD passbook from the account; CRD / SRDS from the salary-recovery receipts. */
  private async ledgerOf(d: DepositAccount): Promise<DepositLedgerRow[]> {
    if (d.scheme === 'FD') {
      const rows: DepositLedgerRow[] = [];
      if (d.payment || ['ACTIVE', 'MATURED', 'CLOSED'].includes(d.status)) rows.push({ date: d.payment?.date ?? d.openedOn, particulars: `Deposit received${d.payment ? ` (${d.payment.mode.toLowerCase()}, receipt ${d.payment.receiptNo})` : ''}`, credit: d.principal ?? 0, balance: d.principal ?? 0 });
      if (d.maturityInterestAccrued) rows.push({ date: d.maturityDate ?? d.openedOn, particulars: 'Interest credited on maturity', credit: d.maturityInterestAccrued, balance: (d.principal ?? 0) + d.maturityInterestAccrued });
      const w = d.prematureWithdrawal;
      if (w) rows.push({ date: w.date, particulars: `Premature withdrawal: interest ${formatINR(w.interestEarned - w.alreadyPaid)}${w.penalty ? `, less penalty ${formatINR(w.penalty)}` : ''}`, debit: w.payable, balance: 0 });
      else if (d.status === 'CLOSED') rows.push({ date: d.closedOn ?? d.maturityDate ?? d.openedOn, particulars: 'Paid out on maturity', debit: d.maturityValue ?? d.principal ?? 0, balance: 0 });
      if (d.status === 'CANCELLED' && d.payment) rows.push({ date: d.closedOn ?? d.payment.date, particulars: 'Refunded', debit: d.principal ?? 0, balance: 0 });
      return rows;
    }
    // CRD / SRDS: credits come from the monthly salary recovery and counter receipts (P7).
    const head = d.scheme === 'CRD' || d.scheme === 'SRDS' ? d.scheme : undefined;
    const credits = head
      ? (await this.app.collections.repo.receiptsOfMember(d.memberId))
          .flatMap((r) => r.allocations.filter((a) => a.head === head).map((a) => ({ date: r.date, particulars: `${r.cycle ? `Salary recovery ${r.cycle}` : 'Receipt'} · ${r.receiptNo}`, amount: a.amount })))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const opening = d.balance - credits.reduce((s, c) => s + c.amount, 0);
    let bal = opening;
    return [{ date: d.openedOn, particulars: credits.length ? 'Opening balance' : 'Balance', credit: Math.max(0, opening), balance: opening }, ...credits.map((c) => ({ date: c.date, particulars: c.particulars, credit: c.amount, balance: (bal += c.amount) }))];
  }

  private async detail(d: DepositAccount, user: SessionUser): Promise<DepositDetail> {
    const [m, today, products, staff] = await Promise.all([this.app.members.byId(d.memberId), businessToday(this.app), this.app.masters.loanProducts(), this.app.loans.repo.staffNames()]);
    if (!m) return fail('NOT_FOUND', 'Member not found.');
    const dept = await this.app.departments.get(m.departmentId);
    const mat = maturityOf(d, today);
    const staffUser = isStaff(user);
    const actions: DepositAction[] = staffUser ? depositActionsFor(d.status, { role: user.role }) : [];
    if (staffUser && (await this.withdrawable(d, user))) actions.push('withdraw');
    const owner = DEPOSIT_STAGE_OWNER[d.status];
    const loan = d.pledgedToLoanId ? await this.app.loans.repo.find(d.pledgedToLoanId) : undefined;
    const product = products.find((p) => p.code === 'DEPOSIT');
    const waitingOn = await this.waitingOn(d, staff);
    const canDemo = staffUser && !actions.length && owner && d.status !== 'MATURED' && (await this.app.permissions.has(user.role, 'demo.control'));
    return {
      deposit: d,
      member: { id: m.id, name: m.name, generalNo: m.generalNo, departmentName: dept?.name ?? '', designation: m.designation, mobileMasked: m.mobileMasked, fatherName: m.fatherName },
      ...(mat ? { maturity: { date: mat.date, value: mat.value, totalInterest: mat.totalInterest, periodicInterest: mat.periodicInterest } } : {}),
      payouts: mat && d.payoutFrequency && d.principal && d.tenureMonths ? fdPayoutSchedule({ principal: d.principal, ratePercent: d.ratePercent, tenureMonths: d.tenureMonths, payout: d.payoutFrequency, openedOn: mat.openedOn }).map((p) => ({ ...p, paid: d.status !== 'REQUESTED' && p.date <= today })) : [],
      ledger: await this.ledgerOf(d),
      stages: d.scheme === 'FD' ? stagesFor(d) : [],
      actions,
      ...(waitingOn ? { waitingOn } : {}),
      ...(canDemo ? { demoActAs: waitingOn ?? ROLE_LABELS[owner as ConsoleRole] } : {}),
      ...(loan ? { pledgedLoan: { id: loan.id, loanNo: loan.loanNo ?? loan.applicationNo, outstanding: loan.outstandingPrincipal } } : {}),
      ...(d.scheme === 'FD' && d.status === 'ACTIVE' && !d.pledgedToLoanId && product ? { loanAgainst: { maxAmount: Math.floor(((d.principal ?? 0) * product.depositMarginPercent) / 100 / 100) * 100, marginPercent: product.depositMarginPercent } } : {}),
      rules: FD_RULES,
    };
  }

  private async requireView(user: SessionUser): Promise<void> {
    if (!isStaff(user)) fail('FORBIDDEN', 'Staff only.');
    if (!(await this.app.permissions.has(user.role, 'deposits.view'))) fail('FORBIDDEN', 'You do not have access to deposits.');
  }

  private async staffDeposit(user: SessionUser, id: string): Promise<DepositAccount> {
    await this.requireView(user);
    return (await this.repo.find(id)) ?? fail('NOT_FOUND', 'Deposit not found.');
  }

  private memberIdOf(user: SessionUser): string {
    if (user.role !== 'MEMBER' || !user.memberId) fail('FORBIDDEN', 'Members only.');
    return user.memberId!;
  }

  private async myDeposit(user: SessionUser, id: string): Promise<DepositAccount> {
    const d = await this.repo.find(id);
    if (!d || d.memberId !== this.memberIdOf(user)) return fail('NOT_FOUND', 'Deposit not found.');
    return d;
  }

  private async validate(input: FdRequestInput): Promise<void> {
    const [settings, today] = await Promise.all([this.app.masters.settings(), businessToday(this.app)]);
    const fieldErrors = validateFdRequest(input, { slabs: settings.fdSlabs, minAmount: settings.fdMinAmount, today });
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
  }

  // ---- ST-30 / ST-32 (staff) ----
  async list(user: SessionUser, q: { tab?: string; status?: string; maturingWithinDays?: number; departmentId?: string; q?: string; page?: number; pageSize?: number }): Promise<DepositList> {
    await this.requireView(user);
    const tab = (q.tab ?? 'FD') as DepositTab;
    const [all, today, members, depts, staff] = await Promise.all([this.repo.list(), businessToday(this.app), this.app.members.all(), this.app.departments.all(), this.app.loans.repo.staffNames()]);
    const byId = new Map(members.map((m) => [m.id, m]));
    const deptName = new Map(depts.map((d) => [d.id, d.name]));
    const text = (q.q ?? '').trim().toLowerCase();
    const maturing = q.maturingWithinDays ?? 0;
    const rows: DepositRow[] = [];
    for (const d of all.filter((x) => inTab(x, tab))) {
      const m = byId.get(d.memberId);
      if (q.departmentId && m?.departmentId !== q.departmentId) continue;
      const r = await this.toRow(d, today, m, deptName.get(m?.departmentId ?? '') ?? '', staff);
      if (q.status && r.status !== q.status) continue;
      if (maturing && !(r.daysToMaturity !== undefined && r.daysToMaturity >= 0 && r.daysToMaturity <= maturing && r.status === 'ACTIVE')) continue;
      if (text && !(r.memberName.toLowerCase().includes(text) || r.generalNo.includes(text) || r.accountNo.toLowerCase().includes(text) || (r.fdrNo ?? '').toLowerCase().includes(text))) continue;
      rows.push(r);
    }
    rows.sort((a, b) => (tab === 'REQUESTS' ? b.openedOn.localeCompare(a.openedOn) : tab === 'FD' ? (a.maturityDate ?? '').localeCompare(b.maturityDate ?? '') : Number(a.generalNo) - Number(b.generalNo)));
    const sum = (f: (d: DepositAccount) => boolean, v: (d: DepositAccount) => number) => all.filter(f).reduce((s, d) => s + v(d), 0);
    const counts: DepositList['counts'] = {};
    for (const t of ['FD', 'REQUESTS', 'CRD', 'SRDS', 'SAVINGS'] as DepositTab[]) counts[t] = all.filter((d) => inTab(d, t)).length;
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
    const page = Math.max(1, q.page ?? 1);
    const within30 = (d: DepositAccount) => d.scheme === 'FD' && d.status === 'ACTIVE' && !!d.maturityDate && daysBetween(today, d.maturityDate) >= 0 && daysBetween(today, d.maturityDate) <= 30;
    return {
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
        maturing30: all.filter(within30).length,
        requestsOpen: all.filter((d) => isRequest(d) && d.status !== 'REFUND_PENDING').length,
      },
      scope: {},
      canOpen: await this.app.permissions.has(user.role, 'deposits.open'),
    };
  }

  async get(user: SessionUser, id: string): Promise<DepositDetail> {
    return this.detail(await this.staffDeposit(user, id), user);
  }

  /** ST-31: the office opens an FD from a signed paper form (no OTP). */
  async open(request: FastifyRequest, body: Partial<FdRequestInput> & { memberId?: string }): Promise<DepositDetail> {
    const user = sessionOf(request);
    if (!(await this.app.permissions.has(user.role, 'deposits.open'))) fail('FORBIDDEN', 'Only the Super Admin, Accountant and Cashier open deposits at the counter.');
    const m = body.memberId ? await this.app.members.byId(body.memberId) : undefined;
    if (!m || m.status !== 'ACTIVE') return fail('VALIDATION_ERROR', 'Choose an active member.', { fieldErrors: { memberId: 'Choose the member' } });
    const input = cleanRequest(body);
    await this.validate(input);
    const d = await this.newRequest(request, m, input, 'COUNTER', { id: user.id, name: user.name, role: user.role }, `FD request for ${m.name} (${formatINR(input.principal)}) at the counter`);
    return this.detail(d, user);
  }

  async act(request: FastifyRequest, id: string, action: DepositAction, input: DepositActionInput): Promise<DepositDetail> {
    const user = sessionOf(request);
    const d = await this.staffDeposit(user, id);
    return this.detail(await this.apply(request, d.id, action, { id: user.id, name: user.name, role: user.role }, input), user);
  }

  /** Demo: complete the current stage as its owner (cash counted exactly, acceptances signed). */
  async demoAct(request: FastifyRequest, id: string): Promise<DepositDetail> {
    const user = sessionOf(request);
    if (!(await this.app.permissions.has(user.role, 'demo.control'))) fail('FORBIDDEN', 'Demo controls are off for this user.');
    const d = await this.staffDeposit(user, id);
    const action = PRIMARY_DEPOSIT_ACTION[d.status];
    const role = DEPOSIT_STAGE_OWNER[d.status];
    const owner = role ? await this.app.loans.repo.staffByRole(role as ConsoleRole) : undefined;
    if (!action || !owner) return fail('INVALID_TRANSITION', `Nothing to do at "${d.status}".`);
    const today = await businessToday(this.app);
    const input: DepositActionInput = action === 'recordPayment' ? { payment: { mode: 'CASH', date: today, denominations: denominationsFor(d.principal ?? 0) } } : {};
    return this.detail(await this.apply(request, d.id, action, { ...owner, role: role! }, input, { demo: true }), user);
  }

  // ---- MB-08 / MB-09 / MB-15 (member) ----
  async mine(user: SessionUser): Promise<DepositRow[]> {
    const memberId = this.memberIdOf(user);
    const [list, today, m, staff] = await Promise.all([this.repo.forMember(memberId), businessToday(this.app), this.app.members.byId(memberId), this.app.loans.repo.staffNames()]);
    const dept = m ? await this.app.departments.get(m.departmentId) : undefined;
    return Promise.all(list.map((d) => this.toRow(d, today, m, dept?.name ?? '', staff)));
  }

  async context(user: SessionUser): Promise<DepositContext> {
    const m = (await this.app.members.byId(this.memberIdOf(user))) ?? fail('NOT_FOUND', 'Member record not found.');
    const [settings, today] = await Promise.all([this.app.masters.settings(), businessToday(this.app)]);
    return { member: { id: m.id, name: m.name, generalNo: m.generalNo, nominee: m.nominee }, slabs: settings.fdSlabs, minAmount: settings.fdMinAmount, rules: FD_RULES, textVersion: FD_TEXT_VERSION, payTo: PAY_TO, today };
  }

  async myDetail(user: SessionUser, id: string): Promise<DepositDetail> {
    return this.detail(await this.myDeposit(user, id), user);
  }

  /** Sign with OTP (D-031): checks the request first; the request is kept with the code until it is verified. */
  async requestSign(user: SessionUser, body: Partial<FdRequestInput>): Promise<OtpChallenge> {
    const m = (await this.app.members.byId(this.memberIdOf(user))) ?? fail('NOT_FOUND', 'Member record not found.');
    const input = cleanRequest(body);
    await this.validate(input);
    await this.app.signatures.require(m.id);
    return this.app.appAccounts.startCode(m.mobile, 'SIGN', `fd:${m.id}`, input);
  }

  async createMine(request: FastifyRequest, body: { otpRef?: string; otp?: string }): Promise<DepositDetail> {
    const user = sessionOf(request);
    const m = (await this.app.members.byId(this.memberIdOf(user))) ?? fail('NOT_FOUND', 'Member record not found.');
    const { payload } = await this.app.appAccounts.verifyCode('SIGN', `fd:${m.id}`, body.otpRef ?? '', body.otp ?? '');
    const input = payload as FdRequestInput;
    await this.validate(input);
    const fileId = await this.app.signatures.require(m.id);
    const d = await this.newRequest(request, m, input, 'APP', { id: m.id, name: m.name, role: 'MEMBER' }, `${m.name} requested an FD of ${formatINR(input.principal)} in the app`, fileId);
    return this.detail(d, user);
  }

  async cancelMine(request: FastifyRequest, id: string, reason?: string): Promise<DepositDetail> {
    const user = sessionOf(request);
    const d = await this.myDeposit(user, id);
    if (d.status !== 'REQUESTED') fail('INVALID_TRANSITION', 'Only a request that has not been paid can be cancelled. Ask the office.');
    const m = (await this.app.members.byId(d.memberId))!;
    return this.detail(await this.apply(request, d.id, 'cancel', { id: m.id, name: m.name, role: 'MEMBER' }, { remarks: reason?.trim() || 'Cancelled by the member' }, { demo: true }), user);
  }

  // ---- P6b: premature withdrawal (D-086) ----
  private async settlement(d: DepositAccount, today: string): Promise<FdSettlement> {
    const settings = await this.app.masters.settings();
    return fdPrematureSettlement({ principal: d.principal ?? d.balance, ratePercent: d.ratePercent, payout: d.payoutFrequency ?? 'ON_MATURITY', openedOn: d.openedOn, today, method: settings.fdPrematurePenaltyMethod, penaltyPercent: settings.fdPrematurePenaltyPercent });
  }

  private async withdrawable(d: DepositAccount, user: { role: Role }): Promise<boolean> {
    if (d.scheme !== 'FD' || d.status !== 'ACTIVE' || d.pledgedToLoanId) return false;
    const [settings, allowed] = await Promise.all([this.app.masters.settings(), this.app.permissions.has(user.role, 'deposits.withdraw')]);
    return settings.fdPrematureWithdrawalEnabled && allowed;
  }

  private async assertWithdrawable(d: DepositAccount, actor: Actor): Promise<void> {
    if (!(await this.app.permissions.has(actor.role, 'deposits.withdraw'))) fail('FORBIDDEN', 'You are not allowed to withdraw deposits early.');
    if (!(await this.app.masters.settings()).fdPrematureWithdrawalEnabled) fail('RULE_VIOLATION', 'Premature withdrawal is switched off in Settings.');
    if (d.scheme !== 'FD' || d.status !== 'ACTIVE') fail('INVALID_TRANSITION', 'Only an active fixed deposit can be withdrawn early.');
    if (d.pledgedToLoanId) fail('RULE_VIOLATION', 'This deposit is pledged for a loan. Close the loan first.');
  }

  /** ST-32: what an early withdrawal would pay today, before anyone confirms it. */
  async withdrawalPreview(user: SessionUser, id: string): Promise<FdSettlement> {
    const d = await this.staffDeposit(user, id);
    await this.assertWithdrawable(d, { id: user.id, name: user.name, role: user.role });
    return this.settlement(d, await businessToday(this.app));
  }

  // ---- P6b: maturity job (D-086) ----
  /**
   * Marks every active FD whose maturity date has come as MATURED, once: each FD is locked and its
   * status re-checked, so a second run (or a second server) changes nothing. Interest on FDs paid at
   * maturity is booked as payable to the member (Dr FD interest, Cr interest payable on FDs).
   */
  async runMaturity(request?: FastifyRequest, opts: { manual?: boolean } = {}): Promise<{ matured: number; date: string }> {
    const settings = await this.app.masters.settings();
    if (!settings.fdMaturityJobEnabled) return opts.manual ? fail('RULE_VIOLATION', 'FD maturity processing is switched off in Settings.') : { matured: 0, date: '' };
    const [today, at] = await Promise.all([businessToday(this.app), businessNow(this.app)]);
    const due = (await this.repo.list('FD')).filter((d) => d.status === 'ACTIVE' && d.maturityDate && d.maturityDate <= today);
    const changed: DepositAccount[] = [];
    for (const x of due) {
      const saved = await withTransaction(this.app.db, async (tx) => {
        const d = await this.repo.lock(tx, x.id);
        if (!d || !nextDepositStatus(d.status, 'mature') || !d.maturityDate || d.maturityDate > today) return undefined;
        const m = await this.app.members.byId(d.memberId);
        const interest = d.payoutFrequency === 'ON_MATURITY' ? Math.max(0, (d.maturityValue ?? 0) - (d.principal ?? 0)) : 0;
        if (interest > 0) {
          await this.post(tx, `Interest on FD ${d.fdrNo ?? d.accountNo} (${m?.name ?? d.memberId}) at maturity`, 'FD_MATURITY', d.fdrNo ?? d.accountNo, d.maturityDate, SYSTEM, [
            { accountCode: FD_INTEREST_EXPENSE, debit: interest, credit: 0 },
            { accountCode: FD_INTEREST_PAYABLE, debit: 0, credit: interest, memberId: d.memberId, refType: 'DEPOSIT', refId: d.id },
          ]);
          d.maturityInterestAccrued = interest;
        }
        d.events = [...(d.events ?? []), { at, actorId: SYSTEM.id, actorName: SYSTEM.name, actorRole: 'SYSTEM', action: 'mature', fromStatus: d.status, toStatus: 'MATURED' }];
        d.status = 'MATURED';
        await this.repo.save(tx, d);
        await this.app.audit.record(request, { action: 'deposit.mature', entity: 'deposit', entityId: d.id, summary: `FD ${d.fdrNo ?? d.accountNo} matured on ${d.maturityDate}${interest ? ` (interest ${formatINR(interest)} booked)` : ''}`, actor: { id: SYSTEM.id, name: SYSTEM.name, role: 'SYSTEM' as never } }, tx);
        return d;
      });
      if (saved) changed.push(saved);
    }
    await this.app.db.insert(systemInfo).values({ key: LAST_RUN_KEY, value: { date: today } }).onConflictDoUpdate({ target: systemInfo.key, set: { value: { date: today }, updatedAt: new Date() } });
    return { matured: changed.length, date: today };
  }

  /** The scheduler runs the job once a day, after the configured hour (IST). */
  async maturityDue(): Promise<boolean> {
    const settings = await this.app.masters.settings();
    if (!settings.fdMaturityJobEnabled) return false;
    const hourIst = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
    if (hourIst < settings.fdMaturityRunHour) return false;
    const [row] = await this.app.db.select().from(systemInfo).where(eq(systemInfo.key, LAST_RUN_KEY));
    return (row?.value as { date?: string } | undefined)?.date !== (await businessToday(this.app));
  }

  // ---- writes ----
  private async newRequest(request: FastifyRequest, m: Member, input: FdRequestInput, channel: 'APP' | 'COUNTER', actor: Actor, summary: string, signatureFileId?: string): Promise<DepositAccount> {
    const [at, today, settings] = await Promise.all([businessNow(this.app), businessToday(this.app), this.app.masters.settings()]);
    const holders = input.holding === 'JOINT' ? (input.holders ?? []).map((h) => ({ name: h.name.trim(), fatherOrHusbandName: h.fatherOrHusbandName.trim(), occupation: h.occupation.trim(), address: h.address.trim(), phone: h.phone })) : [];
    const d = await withTransaction(this.app.db, async (tx) => {
      const seq = await this.repo.nextNumber(tx, 'REQ');
      const created: DepositAccount = {
        id: `dep-fdreq-${randomUUID().slice(0, 8)}`,
        accountNo: `REQ-${String(seq).padStart(4, '0')}`,
        memberId: m.id,
        scheme: 'FD',
        status: 'REQUESTED',
        openedOn: today,
        principal: input.principal,
        tenureMonths: input.tenureMonths,
        ratePercent: fdRateFor(input.tenureMonths, settings.fdSlabs) ?? 0,
        payoutFrequency: input.payoutFrequency,
        balance: 0,
        operationMode: holders.length === 0 ? 'SINGLE' : holders.length === 1 ? 'EITHER_OR_SURVIVOR' : 'ANY_ONE_OR_SURVIVOR',
        jointHolders: holders.map((h) => h.name),
        ...(holders.length ? { holders } : {}),
        ...(input.holding === 'MINOR' && input.minor ? { minor: { name: input.minor.name.trim(), dob: input.minor.dob, guardianName: m.name, guardianRelation: input.minor.guardianRelation.trim() } } : {}),
        nominee: { name: input.nominee.name.trim(), relation: input.nominee.relation },
        channel,
        requestedAt: at,
        ...(channel === 'APP' ? { signature: { signedAt: at, textVersion: FD_TEXT_VERSION, ...(signatureFileId ? { fileId: signatureFileId } : {}) } } : {}),
        events: [{ at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action: 'request', toStatus: 'REQUESTED', ...(channel === 'COUNTER' ? { remarks: 'Opened at the counter from the signed form F4' } : {}) }],
      };
      await this.repo.insert(tx, created);
      await this.app.audit.record(request, { action: 'request', entity: 'deposit', entityId: created.id, summary }, tx);
      return created;
    });
    return d;
  }

  /** One transition with its side effects (ST-33, D-027), in one transaction. `demo` acts as the stage owner. */
  /** F10 (D-099): a numbered voucher for money paid out of an FD, with the paying Cashier's (Treasurer's) signature. */
  private async voucher(tx: Tx, d: DepositAccount, kind: 'MATURITY' | 'PREMATURE' | 'REFUND', amount: number, interest: number, date: string, actor: Actor, demo?: boolean): Promise<void> {
    const no = `VR-${date.slice(0, 4)}-${String(await this.repo.nextNumber(tx, 'VR')).padStart(5, '0')}`;
    const signatureFileId = actor.role === 'CASHIER' ? await this.app.signatures.signOff(actor.id, demo) : undefined;
    d.vouchers = [...(d.vouchers ?? []), { no, kind, amount, interest, date, paidByName: actor.name, ...(signatureFileId ? { signatureFileId } : {}) }];
  }

  private async apply(request: FastifyRequest, id: string, action: DepositAction, actor: Actor, input: DepositActionInput, opts: { demo?: boolean } = {}): Promise<DepositAccount> {
    const [at, today] = await Promise.all([businessNow(this.app), businessToday(this.app)]);
    let note: [string, string, Record<string, string>, string] | undefined;
    const receipts: Receipt[] = [];
    const saved = await withTransaction(this.app.db, async (tx) => {
      const d = (await this.repo.lock(tx, id)) ?? fail('NOT_FOUND', 'Deposit not found.');
      if (action === 'withdraw') await this.assertWithdrawable(d, actor);
      else if (!opts.demo) {
        const allowed = depositActionsFor(d.status, { role: actor.role });
        if (!allowed.includes(action)) fail(allowed.length ? 'FORBIDDEN' : 'INVALID_TRANSITION', allowed.length ? 'That action is not yours at this stage.' : `Nothing for you to do at "${d.status}".`);
      }
      const next = nextDepositStatus(d.status, action);
      if (!next) return fail('INVALID_TRANSITION', `"${action}" is not possible at "${d.status}".`);
      const m = (await this.app.members.byId(d.memberId))!;
      const remarks = input.remarks?.trim();
      const signOff: StaffSignOff = { byId: actor.id, byName: actor.name, role: actor.role, at, ...(remarks ? { remarks } : {}) };
      switch (action) {
        case 'recordPayment': {
          const p = input.payment;
          const fieldErrors: Record<string, string> = {};
          if (!p?.mode) fieldErrors.mode = 'Choose how it was paid';
          if (!p?.date || p.date > today) fieldErrors.date = 'Enter the payment date (today or earlier)';
          if (p?.mode === 'CASH') {
            const check = validateDenominations(p.denominations ?? {}, d.principal ?? 0);
            if (!check.pass) fieldErrors.denominations = check.message;
          } else if (p && !p.reference?.trim()) fieldErrors.reference = p.mode === 'CHEQUE' ? 'Enter the cheque number' : 'Enter the UTR / transfer reference';
          if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Check the payment details.', { fieldErrors });
          const amount = d.principal ?? 0;
          const entry = await this.post(tx, `FD ${d.accountNo} received from ${m.name} (General No. ${m.generalNo})`, 'FD_PAYMENT', d.accountNo, p!.date, actor, [
            { accountCode: p!.mode === 'CASH' ? ACCOUNT.CASH : ACCOUNT.BANK, debit: amount, credit: 0 },
            { accountCode: DEPOSIT_ACCOUNT.FD, debit: 0, credit: amount, memberId: m.id, refType: 'DEPOSIT', refId: d.id },
          ]);
          const receipt = await this.app.collections.fdReceipt(tx, { memberId: m.id, date: p!.date, source: p!.mode === 'CASH' ? 'CASH' : 'BANK_TRANSFER', amount, ...(p!.mode === 'CASH' ? { denominations: p!.denominations } : {}), ...(p!.reference?.trim() ? { reference: p!.reference.trim() } : {}), purpose: 'FD', depositId: d.id, byName: actor.name, byId: actor.id, at });
          receipts.push(receipt);
          void entry;
          d.payment = { mode: p!.mode, amount, date: p!.date, ...(p!.mode === 'CASH' ? { denominations: p!.denominations } : { reference: p!.reference!.trim() }), receiptNo: receipt.receiptNo, byName: actor.name, at };
          break;
        }
        case 'accept':
          d.signOffs ??= {};
          if (actor.role === (d.status === 'ACCEPTANCE_PRESIDENT' ? 'PRESIDENT' : 'SECRETARY')) {
            const fileId = await this.app.signatures.signOff(actor.id, opts.demo);
            if (fileId) signOff.signatureFileId = fileId;
          }
          if (d.status === 'ACCEPTANCE_PRESIDENT') {
            if (d.signOffs.secretary?.byId === actor.id) fail('FORBIDDEN', 'The President cannot be the same person as the Secretary (SOD-1).');
            d.signOffs.president = signOff;
            // Account No. + FDR No. issued on the President's acceptance; interest runs from the payment date.
            const fdSeq = await this.repo.nextNumber(tx, 'FD');
            const openedOn = d.payment?.date ?? today;
            const mat = calculateFdMaturity({ principal: d.principal ?? 0, ratePercent: d.ratePercent, tenureMonths: d.tenureMonths ?? 12, payout: d.payoutFrequency ?? 'ON_MATURITY', openedOn });
            Object.assign(d, { accountNo: `FD-${String(fdSeq).padStart(5, '0')}`, fdrNo: `FDR-${openedOn.slice(0, 4)}-${String(fdSeq).padStart(5, '0')}`, openedOn, maturityDate: mat.maturityDate, maturityValue: mat.maturityValue, balance: d.principal ?? 0 });
            note = [m.id, 'fd.accepted', { fdrNo: d.fdrNo!, amount: formatINR(d.principal ?? 0), maturityDate: formatDisplayDate(mat.maturityDate) }, `/deposit/${d.id}`];
          } else d.signOffs.secretary = signOff;
          break;
        case 'reject':
          if (!remarks) fail('VALIDATION_ERROR', 'Give a reason. The member sees it.', { fieldErrors: { remarks: 'Required' } });
          d.rejection = signOff;
          note = [m.id, 'fd.rejected', { requestNo: d.accountNo, reason: remarks! }, `/deposit/${d.id}`];
          break;
        case 'refund': {
          const amount = d.payment?.amount ?? d.principal ?? 0;
          await this.voucher(tx, d, 'REFUND', amount, 0, today, actor, opts.demo);
          await this.post(tx, `FD request ${d.accountNo} refunded to ${m.name} after rejection`, 'FD_REFUND', d.accountNo, today, actor, [
            { accountCode: DEPOSIT_ACCOUNT.FD, debit: amount, credit: 0, memberId: m.id, refType: 'DEPOSIT', refId: d.id },
            { accountCode: d.payment?.mode === 'CASH' ? ACCOUNT.CASH : ACCOUNT.BANK, debit: 0, credit: amount },
          ]);
          d.cancelledReason = 'Refunded after rejection';
          d.closedOn = today;
          break;
        }
        case 'cancel':
          d.cancelledReason = remarks || 'Cancelled at the counter';
          break;
        case 'payout': {
          // Dr the FD (principal) and FD interest (what maturity adds), Cr bank (maturity value).
          // shortcut: periodic-payout interest is not posted month by month; it posts when the jobs run (P8).
          const principal = d.principal ?? d.balance;
          const value = Math.max(d.maturityValue ?? principal, principal);
          const lines: JournalLineInput[] = [{ accountCode: DEPOSIT_ACCOUNT.FD, debit: principal, credit: 0, memberId: m.id, refType: 'DEPOSIT', refId: d.id }];
          // Interest booked as payable by the maturity job (P6b) is paid from there; otherwise it is expensed now.
          const accrued = Math.min(d.maturityInterestAccrued ?? 0, value - principal);
          if (accrued > 0) lines.push({ accountCode: FD_INTEREST_PAYABLE, debit: accrued, credit: 0, memberId: m.id, refType: 'DEPOSIT', refId: d.id });
          if (value - principal - accrued > 0) lines.push({ accountCode: FD_INTEREST_EXPENSE, debit: value - principal - accrued, credit: 0 });
          lines.push({ accountCode: ACCOUNT.BANK, debit: 0, credit: value });
          await this.voucher(tx, d, 'MATURITY', value, value - principal, today, actor, opts.demo);
          await this.post(tx, `FD ${d.fdrNo ?? d.accountNo} paid out to ${m.name} on maturity`, 'FD_PAYOUT', d.fdrNo ?? d.accountNo, today, actor, lines);
          d.closedOn = today;
          d.balance = 0;
          break;
        }
        case 'withdraw': {
          // P6b (D-086): the penalty comes only out of interest; the method and rate used are kept on the account.
          const s = await this.settlement(d, today);
          const lines: JournalLineInput[] = [{ accountCode: DEPOSIT_ACCOUNT.FD, debit: s.principal, credit: 0, memberId: m.id, refType: 'DEPOSIT', refId: d.id }];
          if (s.interestPayable + s.penalty > 0) lines.push({ accountCode: FD_INTEREST_EXPENSE, debit: s.interestPayable + s.penalty, credit: 0 });
          if (s.penalty > 0) lines.push({ accountCode: FD_PENALTY_INCOME, debit: 0, credit: s.penalty });
          lines.push({ accountCode: ACCOUNT.BANK, debit: 0, credit: s.payable });
          await this.voucher(tx, d, 'PREMATURE', s.payable, s.interestPayable, today, actor, opts.demo);
          await this.post(tx, `FD ${d.fdrNo ?? d.accountNo} withdrawn early by ${m.name} after ${s.monthsHeld} months${s.penalty ? ` (penalty ${formatINR(s.penalty)})` : ''}`, 'FD_PREMATURE', d.fdrNo ?? d.accountNo, today, actor, lines);
          d.prematureWithdrawal = { ...s, date: today, byName: actor.name, at };
          d.closedOn = today;
          d.balance = 0;
          break;
        }
      }
      d.events = [...(d.events ?? []), { at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: d.status, toStatus: next, ...(remarks ? { remarks } : {}) }];
      d.status = next;
      await this.repo.save(tx, d);
      await this.app.audit.record(request, { action: `deposit.${action}`, entity: 'deposit', entityId: d.id, summary: `${actor.name}: ${action} on ${d.fdrNo ?? d.accountNo} (${m.name})${opts.demo ? ' [demo]' : ''}` }, tx);
      return d;
    });
    if (note) await notifyMember(this.app, ...note);
    return saved;
  }

  private async post(tx: Tx, narration: string, source: string, sourceRef: string, entryDate: string, actor: Actor, lines: JournalLineInput[]): Promise<string> {
    const e = await this.app.ledger.post({ entryDate, narration, source, sourceRef, postedBy: { id: actor.id, name: actor.name }, lines }, tx);
    return String(e.entryNo);
  }

}
