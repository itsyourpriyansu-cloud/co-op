import { randomUUID } from 'node:crypto';
import {
  allocateDuesPayment,
  allocateRecovery,
  amountInWords,
  availableSalary,
  checkDeduction,
  deductionEntryActionsFor,
  demandSendByDate,
  loanDefaulter,
  loanUnpaid,
  splitEqually,
  suretyRecoveryDue,
  nextDeductionEntryStatus,
  penalDue,
  type DeductionEntryAction,
  buildDemandComponents,
  calculateLoanClosure,
  lastInterestChargedOn,
  demandSheetActionsFor,
  departmentForCycle,
  formatCycle,
  formatINR,
  HEAD_PRIORITY,
  LOAN_PRIORITY,
  nextDemandSheetStatus,
  validateDenominations,
  type DemandSheetAction,
  type JournalLineInput,
} from '@tgs/domain';
import type {
  Cycle,
  DeductionEntryInput,
  DeductionEntrySource,
  Paise,
  DemandComponent,
  DemandCycleOverview,
  DemandHead,
  DemandLine,
  DemandLineView,
  DemandPreview,
  DemandSheet,
  DemandSheetDetail,
  DemandSheetRow,
  Department,
  DepositAccount,
  Loan,
  LoanClosureInput,
  LoanClosureQuote,
  LoanProductCode,
  LoanStage,
  Member,
  MemberDues,
  MemberNotice,
  MemberNotices,
  SuretyRecovery,
  SuretyRecoveryPanel,
  MyPayments,
  NewReceiptInput,
  PaymentReport,
  PaymentReportRow,
  Receipt,
  ReceiptDetail,
  ReceiptList,
  ReceiptListParams,
  ReceiptRow,
  RecoveryInput,
  ReportPaymentInput,
  SessionUser,
  ShareAccount,
  StaffSignOff,
} from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessCycle, businessNow, businessToday } from '../../common/utils/business-date';
import { notifyMember } from '../../common/utils/notify';
import { withTransaction, type Tx } from '../../db/transaction';
import { ACCOUNT, DEPOSIT_ACCOUNT, LOAN_ACCOUNT } from '../ledger/ledger.accounts';
import type { CollectionsRepository, SheetHead } from './collections.repository';

const HEAD_LABEL: Record<DemandHead, string> = { RRF: 'RRF', INSURANCE: 'Insurance', CRD: 'CRD', SRDS: 'SRDS', SHARE_CAPITAL: 'Share capital', PENAL: 'Penal interest', INTEREST: 'Interest', PRINCIPAL: 'Principal', SURETY: 'Surety recovery' };
const PRODUCT_LABEL: Record<string, string> = { ORDINARY: 'Ordinary', EDUCATION: 'Education', SALARY: 'Salary', DEPOSIT: 'Deposit' };
const PAY_TO = { accountName: 'TGSECCSL Dues Collection', accountNo: 'XXXXXXXX3307', ifsc: 'DEMO0000929', upi: 'tgseccsl.dues@demo', counter: 'Society cash counter, 2nd Floor, West Ancillary Building' };
const ACTION_TEXT: Record<DemandSheetAction | DeductionEntryAction, string> = { certify: 'Certify', sendToDdo: 'Send to DDO', postRecovery: 'Enter recovery', saveEntry: 'Enter deductions', submitEntry: 'Submit deductions', rejectEntry: 'Review deductions' };
/** Where each demand head is credited when money comes in (docs/22 §5.6). */
const HEAD_ACCOUNT: Partial<Record<DemandHead, string>> = { INTEREST: '4100', PENAL: '4200', CRD: DEPOSIT_ACCOUNT.CRD, SRDS: DEPOSIT_ACCOUNT.SRDS, RRF: '2320', INSURANCE: '2400', SHARE_CAPITAL: ACCOUNT.SHARE_CAPITAL };
const MEMBER_HEADS = new Set<DemandHead>(['PRINCIPAL', 'CRD', 'SRDS', 'SHARE_CAPITAL']);
const UNIDENTIFIED = '2900';

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
const rank = (c: DemandComponent) => HEAD_PRIORITY[c.head] * 10 + (c.loanProduct ? LOAN_PRIORITY[c.loanProduct] : 0);
/** Display order = recovery order (BR-011). */
function inPriority<T extends DemandComponent>(cs: T[]): T[] {
  return cs.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}
function headTotals(components: DemandComponent[]): Partial<Record<DemandHead, number>> {
  const t: Partial<Record<DemandHead, number>> = {};
  for (const c of components) t[c.head] = (t[c.head] ?? 0) + c.amount;
  return t;
}
const signOff = (u: { id: string; name: string; role: string }, at: string, remarks?: string): StaffSignOff => ({ byId: u.id, byName: u.name, role: u.role, at, ...(remarks ? { remarks } : {}) });

/** What one request needs to label and scope rows, loaded once. */
interface View {
  today: string;
  cycle: string;
  depts: Map<string, Department>;
  members: Map<string, Member>;
  loanNos: Map<string, { loanNo?: string; product: string }>;
}

/** Records an allocation changed; synced to the mock after the transaction (TODO(P8)). */
interface Changed {
  loans: Map<string, Loan>;
  deposits: Map<string, DepositAccount>;
  shares: Map<string, ShareAccount>;
}

/**
 * Demand & collections (docs/22 §5.6, ST-40…47, MB-10/18). Every allocation goes through
 * `applyAllocation`, so sheets, loans, CRD / SRDS, share capital and the ledger agree.
 */
export class CollectionsService {
  constructor(
    private readonly app: FastifyInstance,
    readonly repo: CollectionsRepository,
  ) {}

  // ---- shares (P7: moved from the mock) ----
  share(memberId: string, tx?: Tx): Promise<ShareAccount | null> {
    return this.repo.share(memberId, tx);
  }

  /** Create or change a member's share account inside the caller's transaction. */
  async saveShare(tx: Tx, s: ShareAccount): Promise<void> {
    await this.repo.saveShare(tx, s);
  }

  /** BR-004: a disbursement's share deposit deduction. */
  async creditShareDeposit(tx: Tx, memberId: string, amount: number): Promise<ShareAccount | null> {
    const s = await this.repo.lockShare(tx, memberId);
    if (!s) return null;
    const next = { ...s, shareDepositBalance: s.shareDepositBalance + amount };
    await this.repo.saveShare(tx, next);
    return next;
  }

  /** Member page: demand history and the department's generated cycles (BR-010 transfer timing). */
  async memberHistory(memberId: string): Promise<Array<{ cycle: Cycle; departmentId: string; demand: number; recovered?: number; sheetStatus: DemandSheet['status'] }>> {
    return (await this.repo.linesOfMember(memberId)).map(({ sheet, line }) => ({ cycle: sheet.cycle, departmentId: sheet.departmentId, demand: line.totalDemand, ...(line.recovered !== undefined ? { recovered: line.recovered } : {}), sheetStatus: sheet.status })).reverse();
  }

  async departmentCycles(departmentId: string): Promise<Cycle[]> {
    return (await this.repo.allSheetHeads()).filter((s) => s.departmentId === departmentId).map((s) => s.cycle);
  }

  // ---- read helpers ----
  private async view(): Promise<View> {
    const [today, cycle, depts, members, lite] = await Promise.all([businessToday(this.app), businessCycle(this.app), this.app.departments.all(), this.app.members.all(), this.app.loans.repo.lite('0000-00')]);
    return { today, cycle, depts: new Map(depts.map((d) => [d.id, d])), members: new Map(members.map((m) => [m.id, m])), loanNos: new Map(lite.map((l) => [l.id, { ...(l.loanNo ? { loanNo: l.loanNo } : {}), product: l.product }])) };
  }

  private labelOf(v: View, c: { head: DemandHead; loanId?: string; loanProduct?: string }): { label: string; loanNo?: string } {
    if (c.head !== 'INTEREST' && c.head !== 'PRINCIPAL') return { label: HEAD_LABEL[c.head] };
    const loan = c.loanId ? v.loanNos.get(c.loanId) : undefined;
    return { label: `${PRODUCT_LABEL[c.loanProduct ?? loan?.product ?? ''] ?? ''} loan ${HEAD_LABEL[c.head].toLowerCase()}`.trim(), ...(loan?.loanNo ? { loanNo: loan.loanNo } : {}) };
  }

  private deptName(v: View, id: string | undefined) {
    return (id && v.depts.get(id)?.name) || '';
  }

  private lineView(v: View, line: DemandLine, posted: boolean, pay?: { minTakeHome: Paise; previous: Map<string, number> }): DemandLineView {
    const m = v.members.get(line.memberId);
    const available = m && pay ? availableSalary(m.payProfile, pay.minTakeHome) : undefined;
    return {
      memberId: line.memberId,
      generalNo: m?.generalNo ?? '',
      name: m?.name ?? line.memberId,
      designation: m?.designation ?? '',
      heads: headTotals(line.components),
      components: inPriority(line.components.map((c) => ({ ...c, ...this.labelOf(v, c) }))),
      totalDemand: line.totalDemand,
      ...(posted && line.recovered !== undefined ? { recovered: line.recovered, short: Math.max(0, line.totalDemand - line.recovered) } : {}),
      ...(line.deducted !== undefined ? { deducted: line.deducted } : {}),
      ...(line.entrySource ? { entrySource: line.entrySource } : {}),
      ...(line.enteredByName ? { enteredByName: line.enteredByName } : {}),
      ...(line.note ? { note: line.note } : {}),
      ...(m?.payProfile.grossSalary ? { grossSalary: m.payProfile.grossSalary } : {}),
      ...(available !== undefined ? { availableSalary: available } : {}),
      ...(pay ? { previousOutstanding: pay.previous.get(line.memberId) ?? 0 } : {}),
    };
  }

  /** P7b: the sheet's actions for this user, from the workflow rules and the user's permissions. */
  async actionsFor(sh: SheetHead, user: SessionUser): Promise<string[]> {
    const [enter, post] = await Promise.all([this.app.permissions.has(user.role, 'collections.enterDeduction'), this.app.permissions.has(user.role, 'collections.postRecovery')]);
    const sheet = demandSheetActionsFor(sh.status, { role: user.role }).filter((a) => a !== 'postRecovery' || post);
    const entry = deductionEntryActionsFor(sh.status, sh.entry?.status, { role: user.role }).filter((a) => (a === 'rejectEntry' ? post : enter));
    return [...sheet, ...entry];
  }

  /** P7b: send-by date (settings) and whether the sheet missed it. */
  private sendBy(sh: SheetHead | undefined, cycle: Cycle, days: number, today: string): { sendBy: string; sendLate: boolean } {
    const sendBy = demandSendByDate(cycle, days);
    const sentOn = sh?.sent?.at.slice(0, 10);
    return { sendBy, sendLate: sentOn ? sentOn > sendBy : today > sendBy && (!sh || sh.status === 'GENERATED' || sh.status === 'CERTIFIED') };
  }

  private async requireView(user: SessionUser): Promise<void> {
    if (user.role === 'MEMBER' || user.role === 'APPLICANT') fail('FORBIDDEN', 'Staff only.');
    if (!(await this.app.permissions.has(user.role, 'collections.view'))) fail('FORBIDDEN', 'You do not have access to collections.');
  }

  private canReceive(user: SessionUser) {
    return user.role === 'CASHIER' || user.role === 'ACCOUNTANT';
  }

  private async generatableCycles(): Promise<Cycle[]> {
    const latest = (await this.repo.cycles()).sort().at(-1) ?? (await businessCycle(this.app));
    return [...new Set([latest, nextCycle(latest)])];
  }

  private async accountantName(): Promise<string> {
    return `${(await this.app.loans.repo.staffNames()).get('ACCOUNTANT') ?? 'Accountant'} (Accountant)`;
  }

  // ---- ST-40 ----
  async overview(user: SessionUser, cycleParam?: string): Promise<DemandCycleOverview> {
    await this.requireView(user);
    const [v, gen, sheetCycles, settings] = await Promise.all([this.view(), this.generatableCycles(), this.repo.cycles(), this.app.masters.settings()]);
    const cycle = cycleParam || v.cycle;
    const sheets = await this.repo.sheetsForCycle(cycle);
    const depts = [...v.depts.values()].filter((d) => user.role !== 'DDO' || d.id === user.departmentId);
    const rows: DemandSheetRow[] = [];
    for (const d of depts) {
      const sh = sheets.find((s) => s.departmentId === d.id);
      const full = sh?.status === 'RECOVERY_POSTED' ? await this.repo.sheet(sh.id) : undefined;
      const actions = sh ? await this.actionsFor(sh, user) : [];
      rows.push({
        ...(sh ? { id: sh.id } : {}),
        cycle,
        departmentId: d.id,
        departmentName: d.name,
        ddoName: d.ddoName ?? '',
        status: sh?.status ?? 'NOT_GENERATED',
        members: sh ? ((full ?? (await this.repo.sheet(sh.id)))?.lines.length ?? 0) : 0,
        demand: sh?.totalDemand ?? 0,
        recovered: sh?.totalRecovered ?? 0,
        short: full ? sum(full.lines.map((l) => Math.max(0, l.totalDemand - (l.recovered ?? 0)))) : 0,
        shortMembers: full ? full.lines.filter((l) => (l.recovered ?? 0) < l.totalDemand).length : 0,
        ...(actions[0] ? { myAction: ACTION_TEXT[actions[0] as keyof typeof ACTION_TEXT] } : {}),
        ...(sh?.entry ? { entryStatus: sh.entry.status, entrySource: sh.entry.source } : {}),
        ...this.sendBy(sh, cycle, settings.demandSendByDays, v.today),
      });
    }
    const own = user.role === 'DDO' && user.departmentId ? v.depts.get(user.departmentId) : undefined;
    return {
      cycle,
      cycles: [...new Set([...sheetCycles, ...gen])].sort().reverse(),
      currentCycle: v.cycle,
      rows,
      totals: { demand: sum(rows.map((r) => r.demand)), recovered: sum(rows.map((r) => r.recovered)), short: sum(rows.map((r) => r.short)), generated: rows.filter((r) => r.status !== 'NOT_GENERATED').length, notGenerated: rows.filter((r) => r.status === 'NOT_GENERATED').length, posted: rows.filter((r) => r.status === 'RECOVERY_POSTED').length },
      canGenerate: user.role === 'ACCOUNTANT' && gen.includes(cycle),
      scope: own ? { departmentName: own.name } : {},
    };
  }

  // ---- ST-41 ----
  /** Lines for each department and a cycle (BR-009 / BR-010), from today's records. */
  private async buildLines(cycle: Cycle): Promise<Map<string, DemandLine[]>> {
    const [recoveries, members, transfers, dueRows, shares, crd, srds, settings] = await Promise.all([
      this.repo.openRecoveries(),
      this.app.members.all(),
      this.app.members.latestTransfers(),
      this.app.loans.repo.dueRows(cycle),
      this.repo.shares(),
      this.app.deposits.byScheme('CRD'),
      this.app.deposits.byScheme('SRDS'),
      this.app.masters.settings(),
    ]);
    const shareOf = new Map(shares.map((s) => [s.memberId, s]));
    const hasCrd = new Set(crd.filter((d) => d.status === 'ACTIVE').map((d) => d.memberId));
    const srdsOf = new Map(srds.filter((d) => d.status === 'ACTIVE').map((d) => [d.memberId, d]));
    // F-13 (D-097): an open surety recovery goes on the surety's demand once; unpaid after that it stays as their dues.
    const suretyRows = new Map<string, Array<{ loanId: string; amount: number }>>();
    for (const r of recoveries.filter((x) => !x.demandedCycle || x.demandedCycle === cycle)) {
      const amount = suretyRecoveryDue({ share: r.share, paid: r.paid, loanOverdue: await this.loanOverdue(r.borrowerId, r.loanId) });
      if (amount > 0) suretyRows.set(r.suretyId, [...(suretyRows.get(r.suretyId) ?? []), { loanId: r.loanId, amount }]);
    }
    const out = new Map<string, DemandLine[]>();
    for (const m of members) {
      if (m.status !== 'ACTIVE' || m.joinedSocietyOn > lastDayOf(cycle)) continue;
      const dept = departmentForCycle(m.departmentId, transfers.get(m.id), cycle);
      const share = shareOf.get(m.id);
      const shareCapitalDue = share ? Math.max(0, share.numberOfShares * settings.shareValue - share.shareCapital) : 0;
      const s = srdsOf.get(m.id);
      const { components, totalDemand } = buildDemandComponents({
        cycle,
        settings,
        hasCrd: hasCrd.has(m.id),
        srdsActive: Boolean(s && s.openedOn <= `${cycle}-01`),
        loanRows: dueRows.filter((r) => r.memberId === m.id).map((r) => ({ loanId: r.loanId, product: r.product, interest: r.interest, principal: r.principal })),
        ...(shareCapitalDue ? { shareCapitalDue } : {}),
        ...(suretyRows.has(m.id) ? { suretyRows: suretyRows.get(m.id)! } : {}),
      });
      out.set(dept, [...(out.get(dept) ?? []), { memberId: m.id, components, totalDemand }]);
    }
    return out;
  }

  async preview(user: SessionUser, cycleParam?: string, departmentIds = ''): Promise<DemandPreview> {
    await this.requireView(user);
    const gen = await this.generatableCycles();
    const cycle = cycleParam || (await businessCycle(this.app));
    if (!gen.includes(cycle)) fail('VALIDATION_ERROR', `Only ${gen.map(formatCycle).join(' or ')} can be generated now.`, { fieldErrors: { cycle: 'Choose the current or the next cycle' } });
    const ids = departmentIds.split(',').filter(Boolean);
    const [v, existing, built] = await Promise.all([this.view(), this.repo.sheetsForCycle(cycle), this.buildLines(cycle)]);
    const settings = await this.app.masters.settings();
    const rows = [];
    for (const d of [...v.depts.values()].filter((x) => !ids.length || ids.includes(x.id))) {
      const sh = existing.find((s) => s.departmentId === d.id);
      const lines = sh ? ((await this.repo.sheet(sh.id))?.lines ?? []) : (built.get(d.id) ?? []);
      const warnings: string[] = [];
      if (sh) warnings.push(`Already generated (${sh.status === 'GENERATED' ? 'not certified yet' : 'certified'}). It will be skipped.`);
      const noPay = lines.filter((l) => !(v.members.get(l.memberId)?.payProfile.grossSalary ?? 0)).length;
      if (noPay) warnings.push(`${noPay} member${noPay === 1 ? '' : 's'} without a certified pay profile.`);
      if (!lines.length) warnings.push('No active members in this department for the cycle.');
      rows.push({ departmentId: d.id, departmentName: d.name, members: lines.length, heads: headTotals(lines.flatMap((l) => l.components)), total: sum(lines.map((l) => l.totalDemand)), alreadyGenerated: Boolean(sh), warnings });
    }
    return { cycle, insuranceMonth: Number(cycle.slice(5, 7)) === settings.insurance.collectionMonth, rows };
  }

  async generate(request: FastifyRequest, body: { cycle?: string; departmentIds?: string[] }): Promise<{ generated: string[] }> {
    const user = sessionOf(request);
    await this.requireView(user);
    if (user.role !== 'ACCOUNTANT') fail('FORBIDDEN', 'Only the Accountant generates demand sheets.');
    const cycle = body.cycle ?? '';
    if (!(await this.generatableCycles()).includes(cycle)) fail('VALIDATION_ERROR', 'Choose the current or the next cycle.', { fieldErrors: { cycle: 'Choose the current or the next cycle' } });
    const [depts, existing, built, at] = await Promise.all([this.app.departments.all(), this.repo.sheetsForCycle(cycle), this.buildLines(cycle), businessNow(this.app)]);
    const ids = body.departmentIds ?? [];
    const targets = depts.filter((d) => (!ids.length || ids.includes(d.id)) && !existing.some((s) => s.departmentId === d.id));
    if (!targets.length) fail('VALIDATION_ERROR', 'Every chosen department already has a sheet for this cycle.', { fieldErrors: { departmentIds: 'Nothing left to generate' } });
    const sheets: DemandSheet[] = targets.map((d) => {
      const lines = built.get(d.id) ?? [];
      const so = signOff(user, at);
      return { id: `ds-${cycle}-${d.code.toLowerCase()}`, cycle, departmentId: d.id, status: 'GENERATED', lines, totalDemand: sum(lines.map((l) => l.totalDemand)), totalRecovered: 0, generated: so, events: [{ at, actorId: user.id, actorName: user.name, actorRole: user.role, action: 'generate', toStatus: 'GENERATED' }] };
    });
    await withTransaction(this.app.db, async (tx) => {
      for (const s of sheets) await this.repo.insertSheet(tx, s);
      // F-13: mark the surety recoveries these sheets now carry.
      const carried = new Set(sheets.flatMap((s) => s.lines.flatMap((l) => l.components.filter((c) => c.head === 'SURETY').map((c) => `${l.memberId}:${c.loanId}`))));
      for (const r of await this.repo.openRecoveries(undefined, tx)) if (!r.demandedCycle && carried.has(`${r.suretyId}:${r.loanId}`)) await this.repo.saveRecovery(tx, { ...r, demandedCycle: cycle });
      await this.app.audit.record(request, { action: 'generate', entity: 'demandSheet', entityId: cycle, summary: `Generated ${formatCycle(cycle)} demand for ${targets.length} department${targets.length === 1 ? '' : 's'}` }, tx);
    });
    return { generated: sheets.map((s) => s.id) };
  }

  // ---- ST-42 / ST-43 ----
  private async loadSheet(user: SessionUser, id: string, tx?: Tx, lock = false): Promise<DemandSheet> {
    const sh = await this.repo.sheet(id, tx, lock);
    if (!sh || (user.role === 'DDO' && sh.departmentId !== user.departmentId)) return fail('NOT_FOUND', 'This demand sheet does not exist or is outside your department.');
    return sh;
  }

  private stages(sh: SheetHead): LoanStage[] {
    const at = (s?: StaffSignOff) => s?.at.slice(0, 10);
    const order = ['GENERATED', 'CERTIFIED', 'SENT_TO_DDO', 'RECOVERY_POSTED'];
    const idx = order.indexOf(sh.status);
    const step = (key: string, title: string, i: number, so?: StaffSignOff): LoanStage => ({ key, title, status: i <= idx ? 'done' : i === idx + 1 ? 'current' : 'todo', ...(at(so) ? { date: at(so)! } : {}), ...(so ? { by: so.byName } : {}) });
    return [step('generated', 'Generated', 0, sh.generated), step('certified', 'Certified correct (BR-030)', 1, sh.certified), step('sent', 'Sent to the DDO', 2, sh.sent), step('posted', 'Recovery posted', 3, sh.posted)];
  }

  private async detail(v: View, sh: DemandSheet, user: SessionUser): Promise<DemandSheetDetail> {
    const posted = sh.status === 'RECOVERY_POSTED';
    const [settings, previous] = await Promise.all([this.app.masters.settings(), this.repo.outstandingBefore(sh.lines.map((l) => l.memberId), sh.cycle)]);
    const lines = sh.lines.map((l) => this.lineView(v, l, posted, { minTakeHome: settings.minTakeHomePay, previous })).sort((a, b) => a.generalNo.localeCompare(b.generalNo));
    const actions = await this.actionsFor(sh, user);
    const { lines: _l, ...rest } = sh;
    const dept = v.depts.get(sh.departmentId);
    const accountant = await this.accountantName();
    const demo = !actions.length && sh.status !== 'RECOVERY_POSTED' && (await this.app.permissions.has(user.role, 'demo.control'));
    return {
      sheet: rest,
      department: dept ?? null,
      lines,
      totals: { heads: headTotals(sh.lines.flatMap((l) => l.components)), demand: sh.totalDemand, recovered: sh.totalRecovered, short: posted ? sum(lines.map((l) => l.short ?? 0)) : 0, shortMembers: posted ? lines.filter((l) => (l.short ?? 0) > 0).length : 0 },
      stages: this.stages(sh),
      actions,
      ...(sh.status !== 'RECOVERY_POSTED' ? { waitingOn: sh.status === 'SENT_TO_DDO' ? `${dept?.ddoName ?? 'the DDO'} (deduction) and ${accountant} (post recovery)` : accountant } : {}),
      ...(demo ? { demoActAs: accountant } : {}),
      ...this.sendBy(sh, sh.cycle, settings.demandSendByDays, v.today),
    };
  }

  // ---- P7b deduction entry (D-088, REQ-132): DDO online or the Accountant from a paper sheet ----
  async entryAction(request: FastifyRequest, id: string, action: DeductionEntryAction, body: Partial<DeductionEntryInput> & { reason?: string }): Promise<DemandSheetDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    const [at, settings, v] = await Promise.all([businessNow(this.app), this.app.masters.settings(), this.view()]);
    const saved = await withTransaction(this.app.db, async (tx) => {
      const sh = await this.loadSheet(user, id, tx, true);
      if (!(await this.actionsFor(sh, user)).includes(action)) fail(sh.status === 'SENT_TO_DDO' ? 'FORBIDDEN' : 'INVALID_TRANSITION', sh.status === 'SENT_TO_DDO' ? 'This step is not yours now.' : 'The sheet must be sent to the DDO first.');
      const next = nextDeductionEntryStatus(sh.entry?.status, action, user.role)!;
      const from = sh.entry?.status ?? 'NONE';
      const so = signOff(user, at);
      const dept = v.depts.get(sh.departmentId);
      const changes: Array<{ memberId: string; before?: number; after: number }> = [];
      if (action === 'saveEntry') {
        const deductions = body.deductions ?? {};
        const notes = body.notes ?? {};
        const fieldErrors: Record<string, string> = {};
        for (const [memberId, amount] of Object.entries(deductions)) {
          const line = sh.lines.find((l) => l.memberId === memberId);
          const m = v.members.get(memberId);
          if (!line || !m) fieldErrors[`deductions.${memberId}`] = 'Not on this sheet';
          else {
            const err = checkDeduction(amount, line.totalDemand, availableSalary(m.payProfile, settings.minTakeHomePay));
            if (err) fieldErrors[`deductions.${memberId}`] = err;
          }
        }
        if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted amounts.', { fieldErrors });
        const source: DeductionEntrySource = user.role === 'DDO' ? 'DDO_ONLINE' : 'PHYSICAL_SHEET';
        for (const line of sh.lines) {
          const amount = deductions[line.memberId];
          const note = notes[line.memberId]?.trim();
          if (amount === undefined && note === undefined) continue;
          if (amount !== undefined && amount !== line.deducted) {
            changes.push({ memberId: line.memberId, ...(line.deducted !== undefined ? { before: line.deducted } : {}), after: amount });
            // A reviewer's correction keeps the line's original source; the audit trail keeps both amounts.
            Object.assign(line, { deducted: amount, entrySource: line.entrySource ?? source, enteredByName: user.name, enteredAt: at });
          }
          if (note !== undefined) {
            if (note) line.note = note;
            else delete line.note;
          }
          await this.repo.saveLine(tx, sh.id, line);
        }
        sh.entry = { ...(sh.entry ?? { source }), status: next, savedBy: so, ...(next === 'UNDER_REVIEW' ? { reviewed: so } : {}) };
      }
      if (action === 'submitEntry') sh.entry = { ...(sh.entry ?? { source: 'DDO_ONLINE' }), status: next, submitted: so };
      if (action === 'rejectEntry') {
        const reason = body.reason?.trim() ?? '';
        if (reason.length < 10) fail('VALIDATION_ERROR', 'Tell the DDO what to correct (at least 10 characters).', { fieldErrors: { reason: 'At least 10 characters' } });
        sh.entry = { ...sh.entry!, status: next, rejection: { ...so, remarks: reason } };
      }
      sh.events = [...(sh.events ?? []), { at, actorId: user.id, actorName: user.name, actorRole: user.role, action, fromStatus: from, toStatus: next, ...(action === 'rejectEntry' ? { remarks: body.reason?.trim() } : {}) }];
      const { lines: _l, ...head } = sh;
      await this.repo.saveSheetHead(tx, head);
      const what = action === 'saveEntry' ? `saved ${changes.length} deduction${changes.length === 1 ? '' : 's'}` : action === 'submitEntry' ? 'submitted the deductions' : 'sent the deductions back';
      await this.app.audit.record(request, { action, entity: 'demandSheet', entityId: sh.id, summary: `${user.name} ${what} · ${dept?.name ?? ''} ${formatCycle(sh.cycle)}`, ...(changes.length ? { before: Object.fromEntries(changes.map((c) => [c.memberId, c.before ?? null])), after: Object.fromEntries(changes.map((c) => [c.memberId, c.after])) } : {}) }, tx);
      return sh;
    });
    return this.detail(await this.view(), saved, user);
  }

  async sheetDetail(user: SessionUser, id: string): Promise<DemandSheetDetail> {
    await this.requireView(user);
    return this.detail(await this.view(), await this.loadSheet(user, id), user);
  }

  async act(request: FastifyRequest, id: string, action: DemandSheetAction, input: RecoveryInput | undefined): Promise<DemandSheetDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    await this.loadSheet(user, id);
    const sh = await this.transition(request, id, action, user, input);
    return this.detail(await this.view(), sh, user);
  }

  async demoAct(request: FastifyRequest, id: string): Promise<DemandSheetDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    if (!(await this.app.permissions.has(user.role, 'demo.control'))) fail('FORBIDDEN', 'Demo controls are off for this user.');
    const cur = await this.loadSheet(user, id);
    const action: DemandSheetAction | undefined = cur.status === 'GENERATED' ? 'certify' : cur.status === 'CERTIFIED' ? 'sendToDdo' : cur.status === 'SENT_TO_DDO' ? 'postRecovery' : undefined;
    if (!action) fail('INVALID_TRANSITION', 'Nothing to do: recovery is posted.');
    const sh = await this.transition(request, id, action!, user, { recovered: {} }, { demo: true });
    return this.detail(await this.view(), sh, user);
  }

  private async transition(request: FastifyRequest, id: string, action: DemandSheetAction, user: SessionUser, input: RecoveryInput | undefined, opts: { demo?: boolean } = {}): Promise<DemandSheet> {
    const [at, today, staff] = await Promise.all([businessNow(this.app), businessToday(this.app), this.app.loans.repo.staffByRole('ACCOUNTANT')]);
    const actor = opts.demo ? { id: staff?.id ?? 'stf-accountant', name: staff?.name ?? 'Accountant', role: 'ACCOUNTANT' } : { id: user.id, name: user.name, role: user.role };
    const changed: Changed = { loans: new Map(), deposits: new Map(), shares: new Map() };
    const newReceipts: Receipt[] = [];
    const notes: Array<[string, string, Record<string, string | number>, string]> = [];
    const notices: MemberNotice[] = [];
    const saved = await withTransaction(this.app.db, async (tx) => {
      const sh = await this.loadSheet(user, id, tx, true);
      const next = nextDemandSheetStatus(sh.status, action);
      if (!next) fail('INVALID_TRANSITION', `This sheet is "${sh.status}". Refresh to see the latest.`);
      if (!opts.demo && !(await this.actionsFor(sh, user)).includes(action)) fail('FORBIDDEN', 'This step belongs to the Accountant.');
      const so = signOff(actor, at, input?.remarks?.trim() || undefined);
      const dept = await this.app.departments.get(sh.departmentId);
      if (action === 'certify') {
        sh.certified = { ...so, remarks: so.remarks ?? 'Certified correct (BR-030).' };
        sh.certifiedBy = actor.id;
      }
      if (action === 'sendToDdo') {
        sh.sent = so;
        const ddo = await this.app.departments.ddoLogin(sh.departmentId);
        if (ddo) notes.push([ddo, 'demand.sent', { cycle: formatCycle(sh.cycle), department: dept?.name ?? '', members: sh.lines.length, amount: formatINR(sh.totalDemand) }, `/demand-sheets/${sh.id}`]);
      }
      if (action === 'postRecovery') {
        // R6 approve-and-post: amounts given now, else the saved entry, else the full demand; each
        // within the demand and the available salary (R1).
        const recovered = input?.recovered ?? {};
        const [settings, everyone] = await Promise.all([this.app.masters.settings(), this.app.members.all()]);
        const members = new Map(everyone.map((x) => [x.id, x]));
        const amountOf = (l: DemandLine) => recovered[l.memberId] ?? l.deducted ?? l.totalDemand;
        const fieldErrors: Record<string, string> = {};
        for (const memberId of Object.keys(recovered)) if (!sh.lines.some((l) => l.memberId === memberId)) fieldErrors[`recovered.${memberId}`] = 'Not on this sheet';
        for (const line of sh.lines) {
          const m = members.get(line.memberId);
          const err = checkDeduction(amountOf(line), line.totalDemand, m ? availableSalary(m.payProfile, settings.minTakeHomePay) : undefined);
          if (err) fieldErrors[`recovered.${line.memberId}`] = err;
        }
        if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted amounts.', { fieldErrors });
        const date = lastDayOf(sh.cycle) > today ? today : lastDayOf(sh.cycle);
        const credit: JournalLineInput[] = [];
        let seq = await this.repo.nextReceiptSeq(tx);
        for (const line of sh.lines) {
          const amount = amountOf(line);
          const before = line.components.map((c) => ({ ...c }));
          line.components = allocateRecovery(line.components, amount).components;
          line.recovered = amount;
          const { allocations, lines } = await this.applyAllocation(tx, line.memberId, sh.cycle, before, line.components, today, changed);
          credit.push(...lines);
          await this.repo.saveLine(tx, sh.id, line);
          if (amount > 0) {
            const r: Receipt = { id: `rcpt-${randomUUID().slice(0, 8)}-${sh.cycle}`, receiptNo: `RCP-${sh.cycle.replace('-', '')}-${String(seq++).padStart(6, '0')}`, memberId: line.memberId, date, source: 'SALARY_RECOVERY', amount, cycle: sh.cycle, allocations, sheetId: sh.id, byName: actor.name, byId: actor.id, at };
            await this.repo.insertReceipt(tx, r);
            newReceipts.push(r);
          }
          notes.push(amount < line.totalDemand ? [line.memberId, 'recovery.short', { recovered: formatINR(amount), demand: formatINR(line.totalDemand), cycle: formatCycle(sh.cycle) }, '/payments'] : [line.memberId, 'recovery.posted', { amount: formatINR(amount), cycle: formatCycle(sh.cycle) }, '/payments']);
        }
        sh.totalRecovered = sum(sh.lines.map((l) => l.recovered ?? 0));
        sh.posted = so;
        sh.entry = { ...(sh.entry ?? { source: 'PHYSICAL_SHEET' }), status: 'POSTED', approved: so };
        notices.push(...(await this.raiseNotices(tx, request, sh, at)));
        // The DDO remits the month's recovery to the society's bank: one entry per sheet.
        if (sh.totalRecovered > 0) await this.app.ledger.post({ entryDate: date, narration: `Salary recovery ${formatCycle(sh.cycle)}, ${dept?.name ?? sh.departmentId}`, source: 'SALARY_RECOVERY', sourceRef: sh.id, postedBy: { id: actor.id, name: actor.name }, lines: [{ accountCode: ACCOUNT.BANK, debit: sh.totalRecovered, credit: 0 }, ...credit] }, tx);
      }
      sh.events = [...(sh.events ?? []), { at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: sh.status, toStatus: next!, ...(so.remarks ? { remarks: so.remarks } : {}) }];
      sh.status = next!;
      const { lines: _l, ...head } = sh;
      await this.repo.saveSheetHead(tx, head);
      await this.app.audit.record(request, { action, entity: 'demandSheet', entityId: sh.id, summary: `${ACTION_TEXT[action]} · ${dept?.name ?? ''} ${formatCycle(sh.cycle)}${opts.demo ? ' (demo, as Accountant)' : ''}` }, tx);
      return sh;
    });
    for (const n of notes) await notifyMember(this.app, ...n);
    await this.deliverNotices(request, notices);
    return saved;
  }

  // ---- P7b-3 defaulters and notices (D-088, BR-020, Q-310; guarantor recovery waits for F-13) ----

  /** Posted loan-unpaid history of a member, oldest first (`extra` = the sheet being posted now). */
  private async loanHistory(memberId: string, tx?: Tx, extra?: DemandSheet) {
    const rows = (await this.repo.linesOfMember(memberId, tx)).filter(({ sheet }) => sheet.status === 'RECOVERY_POSTED' || sheet.id === extra?.id);
    return rows.map(({ sheet, line }) => ({ cycle: sheet.cycle, components: sheet.id === extra?.id ? extra.lines.find((l) => l.memberId === memberId)!.components : line.components }));
  }

  /**
   * After a recovery is posted: every borrower who is now a defaulter (settings.defaulterCycles
   * unpaid cycles in a row) gets a notice for each loan left unpaid, and so does every surety who
   * signed for it. Inside the posting transaction, at most once per recipient, loan and cycle.
   */
  private async raiseNotices(tx: Tx, request: FastifyRequest, sh: DemandSheet, at: string): Promise<MemberNotice[]> {
    const threshold = (await this.app.masters.settings()).defaulterCycles;
    const created: MemberNotice[] = [];
    for (const line of sh.lines) {
      if (loanUnpaid(line.components) <= 0) continue;
      const history = await this.loanHistory(line.memberId, tx, sh);
      const status = loanDefaulter(history.map((h) => ({ cycle: h.cycle, loanUnpaid: loanUnpaid(h.components) })), threshold);
      if (!status.isDefaulter) continue;
      const borrower = await this.app.members.byId(line.memberId);
      for (const loanId of new Set(line.components.filter((c) => c.loanId && loanUnpaid(line.components, c.loanId) > 0).map((c) => c.loanId!))) {
        const loan = await this.app.loans.repo.find(loanId, tx);
        if (!loan || !borrower) continue;
        const overdue = history.reduce((s, h) => s + loanUnpaid(h.components, loanId), 0);
        const base = { borrowerId: borrower.id, borrowerName: borrower.name, loanId, loanNo: loan.loanNo ?? loan.applicationNo, cycle: sh.cycle, overdue, consecutiveCycles: status.consecutiveCycles, createdAt: at, delivery: { inApp: 'PENDING' as const } };
        const recipients: Array<[MemberNotice['kind'], string]> = [['DEFAULTER', borrower.id], ...loan.sureties.filter((s) => s.status === 'ACCEPTED').map((s) => ['GUARANTOR', s.memberId] as [MemberNotice['kind'], string])];
        for (const [kind, memberId] of recipients) {
          const n: MemberNotice = { id: `ntc-${randomUUID().slice(0, 8)}`, kind, memberId, ...base };
          if (await this.repo.insertNotice(tx, n)) created.push(n);
        }
      }
    }
    if (created.length) await this.app.audit.record(request, { action: 'defaulterNotices', entity: 'demandSheet', entityId: sh.id, summary: `${created.length} defaulter notice${created.length === 1 ? '' : 's'} raised for ${formatCycle(sh.cycle)} (${created.filter((n) => n.kind === 'GUARANTOR').length} to sureties)`, after: created.map((n) => ({ id: n.id, kind: n.kind, memberId: n.memberId, loanNo: n.loanNo, overdue: n.overdue })) }, tx);
    return created;
  }

  /** In the app and on the member's channels (P8a); each notice keeps its delivery status, and the audit trail the outcome. */
  private async deliverNotices(request: FastifyRequest, notices: MemberNotice[]): Promise<void> {
    if (!notices.length) return;
    const members = new Map((await this.app.members.all()).map((m) => [m.id, m]));
    for (const n of notices) {
      const b = members.get(n.borrowerId);
      const vars: Record<string, string | number> = n.kind === 'DEFAULTER' ? { overdue: formatINR(n.overdue), cycles: n.consecutiveCycles } : { borrower: n.borrowerName, generalNo: b?.generalNo ?? '', loanNo: n.loanNo, overdue: formatINR(n.overdue), cycles: n.consecutiveCycles };
      const sent = await notifyMember(this.app, n.memberId, n.kind === 'DEFAULTER' ? 'defaulter.notice' : 'defaulter.guarantorNotice', vars, '/payments');
      n.delivery = sent ? { inApp: 'SENT', via: sent.via } : { inApp: 'FAILED' };
      await this.repo.saveNotice(n);
    }
    const sent = notices.filter((n) => n.delivery.inApp === 'SENT').length;
    await this.app.audit.record(request, { action: 'noticeDelivery', entity: 'memberNotice', entityId: notices[0]!.cycle, summary: `Defaulter notices ${notices[0]!.cycle}: ${sent} of ${notices.length} delivered in the app${notices.length - sent ? `, ${notices.length - sent} failed` : ''}` });
  }

  /** ST-11 member page: defaulter status and the notices the member received (as borrower or surety). */
  async memberNotices(user: SessionUser, memberId: string): Promise<MemberNotices> {
    if (user.role === 'MEMBER' || user.role === 'APPLICANT') fail('FORBIDDEN', 'Staff only.');
    if (!(await this.app.permissions.has(user.role, 'members.view'))) fail('FORBIDDEN', 'You do not have access to members.');
    const m = (await this.app.members.byId(memberId)) ?? fail('NOT_FOUND', 'Member not found.');
    if (user.role === 'DDO' && m.departmentId !== user.departmentId) fail('NOT_FOUND', 'Member not found.');
    const [history, notices, settings] = await Promise.all([this.loanHistory(m.id), this.repo.noticesOf(m.id), this.app.masters.settings()]);
    return { defaulter: { ...loanDefaulter(history.map((h) => ({ cycle: h.cycle, loanUnpaid: loanUnpaid(h.components) })), settings.defaulterCycles), threshold: settings.defaulterCycles }, notices };
  }

  /**
   * The one place money lands: newly allocated amounts (after − before) reduce loan principal,
   * mark schedule rows, close repaid loans, credit CRD / SRDS and share capital. Returns the
   * receipt allocations and the ledger credit lines for them.
   */
  private async applyAllocation(tx: Tx, memberId: string, cycle: Cycle, before: DemandComponent[], after: DemandComponent[], today: string, changed: Changed, via: 'SALARY' | 'COUNTER' = 'SALARY'): Promise<{ allocations: Receipt['allocations']; lines: JournalLineInput[] }> {
    const allocations: Receipt['allocations'] = [];
    const lines: JournalLineInput[] = [];
    const loanOf = async (id: string) => changed.loans.get(id) ?? (await this.app.loans.repo.lock(tx, id));
    for (const [i, c] of after.entries()) {
      const delta = c.allocated - (before[i]?.allocated ?? 0);
      if (delta <= 0) continue;
      allocations.push({ head: c.head, ...(c.loanId ? { loanId: c.loanId } : {}), amount: delta, cycle });
      if (c.head === 'SURETY' && c.loanId) {
        lines.push(...(await this.collectFromSurety(tx, memberId, c.loanId, delta, today, changed, { via, cycle })));
        continue;
      }
      const account = c.head === 'PRINCIPAL' ? LOAN_ACCOUNT[(c.loanProduct ?? 'ORDINARY') as keyof typeof LOAN_ACCOUNT] : HEAD_ACCOUNT[c.head];
      if (account) lines.push({ accountCode: account, debit: 0, credit: delta, ...(MEMBER_HEADS.has(c.head) ? { memberId, refType: c.head === 'PRINCIPAL' ? 'LOAN' : c.head === 'SHARE_CAPITAL' ? 'SHARE' : 'DEPOSIT', refId: c.loanId ?? memberId } : {}) });
      if (c.head === 'PRINCIPAL' && c.loanId) {
        const loan = await loanOf(c.loanId);
        if (loan) {
          loan.outstandingPrincipal = Math.max(0, loan.outstandingPrincipal - delta);
          changed.loans.set(loan.id, loan);
        }
      }
      if (c.head === 'CRD' || c.head === 'SRDS') {
        const dep = changed.deposits.get(`${memberId}:${c.head}`) ?? (await this.app.deposits.lockCompulsory(tx, memberId, c.head));
        if (dep) {
          dep.balance += delta;
          changed.deposits.set(`${memberId}:${c.head}`, dep);
        }
      }
      if (c.head === 'SHARE_CAPITAL') {
        const sh = changed.shares.get(memberId) ?? (await this.repo.lockShare(tx, memberId));
        if (sh) {
          sh.shareCapital += delta;
          changed.shares.set(memberId, sh);
        }
      }
    }
    // Schedule status for every loan touched this cycle; a fully repaid loan closes.
    for (const loanId of new Set(after.filter((c) => c.loanId).map((c) => c.loanId!))) {
      const loan = await loanOf(loanId);
      const row = loan?.schedule.find((r) => r.dueCycle === cycle);
      if (!loan || !row) continue;
      const parts = after.filter((c) => c.loanId === loanId);
      const paid = sum(parts.map((c) => c.allocated));
      row.paidStatus = paid >= sum(parts.map((c) => c.amount)) ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
      if (loan.status === 'ACTIVE' && loan.outstandingPrincipal === 0 && loan.schedule.every((r) => r.paidStatus === 'PAID')) {
        loan.status = 'CLOSED';
        loan.closedOn = today;
        loan.events = [...loan.events, { at: await businessNow(this.app), actorId: 'system', actorName: 'System', actorRole: 'SYSTEM', action: 'close', fromStatus: 'ACTIVE', toStatus: 'CLOSED', remarks: 'Fully repaid' }];
      }
      changed.loans.set(loan.id, loan);
    }
    for (const l of changed.loans.values()) await this.app.loans.repo.save(tx, l);
    for (const d of changed.deposits.values()) await this.app.deposits.saveInTx(tx, d);
    for (const s of changed.shares.values()) await this.repo.saveShare(tx, s);
    return { allocations, lines };
  }

  // ---- dues (ST-45, MB-10) ----
  /** Penal inputs (P7b-2): each loan product's yearly penal rate and the grace days. */
  private async penalRules(): Promise<{ rates: Partial<Record<LoanProductCode, number>>; graceDays: number }> {
    const [products, settings] = await Promise.all([this.app.masters.loanProducts(), this.app.masters.settings()]);
    return { rates: Object.fromEntries(products.map((p) => [p.code, p.penalRatePercent])), graceDays: settings.penalGraceDays };
  }

  /** What a member owes from posted cycles as of a date: unpaid instalments plus penal on the loan part (R3). */
  private async dues(v: View, memberId: string, tx?: Tx, asOf = v.today): Promise<MemberDues> {
    const m = v.members.get(memberId) ?? fail('NOT_FOUND', 'Member not found.');
    const [rows, share, settings, rules] = await Promise.all([this.repo.linesOfMember(memberId, tx), this.repo.share(memberId, tx), this.app.masters.settings(), this.penalRules()]);
    const arrears: MemberDues['arrears'] = [];
    for (const { sheet, line } of rows) {
      if (sheet.status !== 'RECOVERY_POSTED') continue;
      const unpaid = line.totalDemand - sum(line.components.map((c) => c.allocated));
      const penal = penalDue({ cycle: sheet.cycle, components: line.components, ...rules, ...(line.penal ? { penal: line.penal } : {}), asOf });
      if (unpaid > 0 || penal > 0) arrears.push({ cycle: sheet.cycle, sheetId: sheet.id, unpaid, penal, ...(line.penal?.waived ? { penalWaived: line.penal.waived } : {}), components: inPriority(line.components.map((c) => ({ ...c, ...this.labelOf(v, c), unpaid: c.amount - c.allocated }))) });
    }
    const shareCapitalDue = share ? Math.max(0, share.numberOfShares * settings.shareValue - share.shareCapital) : 0;
    const totalPenal = sum(arrears.map((a) => a.penal));
    const suretyRecoveries = await Promise.all((await this.repo.openRecoveries(memberId, tx)).map((r) => this.withDue(r, tx)));
    return { memberId, name: m.name, generalNo: m.generalNo, departmentName: this.deptName(v, m.departmentId), arrears, totalArrears: sum(arrears.map((a) => a.unpaid)) + totalPenal, totalPenal, shareCapitalDue, ...(suretyRecoveries.length ? { suretyRecoveries } : {}) };
  }

  /**
   * R5: the Accountant waives penal on one cycle, with a reason. Penal is never booked before it is
   * collected, so a waiver changes no ledger entry; the line keeps the original and waived amounts.
   */
  async waivePenal(request: FastifyRequest, memberId: string, body: { sheetId?: string; amount?: number; reason?: string }): Promise<MemberDues> {
    const user = sessionOf(request);
    await this.requireView(user);
    if (!(await this.app.permissions.has(user.role, 'collections.waivePenal'))) fail('FORBIDDEN', 'You are not allowed to waive penal interest.');
    const reason = body.reason?.trim() ?? '';
    const amount = Number(body.amount);
    const fieldErrors: Record<string, string> = {};
    if (reason.length < 10) fieldErrors.reason = 'Give the reason (at least 10 characters)';
    if (!Number.isInteger(amount) || amount <= 0) fieldErrors.amount = 'Enter the amount to waive';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const [v, at, rules] = await Promise.all([this.view(), businessNow(this.app), this.penalRules()]);
    await withTransaction(this.app.db, async (tx) => {
      const sh = await this.repo.sheet(body.sheetId ?? '', tx, true);
      const line = sh?.lines.find((l) => l.memberId === memberId);
      if (!sh || !line || sh.status !== 'RECOVERY_POSTED') return fail('NOT_FOUND', 'No posted cycle with dues for this member.');
      const due = penalDue({ cycle: sh.cycle, components: line.components, ...rules, ...(line.penal ? { penal: line.penal } : {}), asOf: v.today });
      if (amount > due) fail('VALIDATION_ERROR', `Only ${formatINR(due)} penal is owed for ${formatCycle(sh.cycle)}.`, { fieldErrors: { amount: `At most ${formatINR(due)}` } });
      const prev = line.penal;
      line.penal = { settledTo: v.today, carried: due - amount, collected: prev?.collected ?? 0, waived: (prev?.waived ?? 0) + amount, waivers: [...(prev?.waivers ?? []), { amount, original: due, reason, byName: user.name, at }] };
      await this.repo.saveLine(tx, sh.id, line);
      await this.app.audit.record(request, { action: 'waivePenal', entity: 'demandSheet', entityId: sh.id, summary: `${user.name} waived ${formatINR(amount)} of ${formatINR(due)} penal for ${v.members.get(memberId)?.name ?? memberId}, ${formatCycle(sh.cycle)}: ${reason}`, before: { memberId, penal: due }, after: { memberId, penal: due - amount, waived: amount, reason } }, tx);
    });
    return this.dues(await this.view(), memberId);
  }

  /** Dues of several members without a permission check (P8 messages, member home). */
  async duesOf(memberIds: string[]): Promise<Map<string, MemberDues>> {
    const v = await this.view();
    const out = new Map<string, MemberDues>();
    for (const id of memberIds) out.set(id, await this.dues(v, id));
    return out;
  }

  /** Members who are defaulters today (BR-020, settings.defaulterCycles), from every posted sheet at once. */
  async defaulterIds(): Promise<Set<string>> {
    const [rows, settings] = await Promise.all([this.repo.postedLines(), this.app.masters.settings()]);
    const byMember = new Map<string, Array<{ cycle: string; loanUnpaid: number }>>();
    for (const r of rows) {
      const list = byMember.get(r.memberId) ?? [];
      list.push({ cycle: r.cycle, loanUnpaid: loanUnpaid(r.components) });
      byMember.set(r.memberId, list);
    }
    return new Set([...byMember].filter(([, h]) => loanDefaulter(h, settings.defaulterCycles).isDefaulter).map(([id]) => id));
  }

  async memberDues(user: SessionUser, memberId: string): Promise<MemberDues> {
    await this.requireView(user);
    return this.dues(await this.view(), memberId);
  }

  // ---- receipts (ST-44…46) ----
  private receiptRow(v: View, r: Receipt): ReceiptRow {
    const m = v.members.get(r.memberId);
    return { id: r.id, receiptNo: r.receiptNo, date: r.date, memberId: r.memberId, memberName: m?.name ?? '', generalNo: m?.generalNo ?? '', departmentName: this.deptName(v, m?.departmentId), source: r.source, ...(r.purpose ? { purpose: r.purpose } : {}), amount: r.amount, heads: [...new Set(r.allocations.map((a) => a.head))], ...(r.cycle ? { cycle: r.cycle } : {}), ...(r.byName ? { byName: r.byName } : {}) };
  }

  private async receiptDetail(v: View, r: Receipt): Promise<ReceiptDetail> {
    const m = v.members.get(r.memberId);
    const sheet = r.sheetId ? await this.repo.sheet(r.sheetId) : undefined;
    const report = r.paymentReportId ? (await this.repo.reports(undefined, r.memberId)).find((p) => p.id === r.paymentReportId) : undefined;
    return {
      receipt: r,
      member: { id: r.memberId, name: m?.name ?? '', generalNo: m?.generalNo ?? '', departmentName: this.deptName(v, m?.departmentId), designation: m?.designation ?? '' },
      lines: r.allocations.map((a) => {
        const loan = a.loanId ? v.loanNos.get(a.loanId) : undefined;
        const label = a.head === 'INTEREST' || a.head === 'PRINCIPAL' ? `${PRODUCT_LABEL[loan?.product ?? ''] ?? ''} loan ${HEAD_LABEL[a.head].toLowerCase()}`.trim() : HEAD_LABEL[a.head];
        return { head: a.head, label, ...((a.cycle ?? r.cycle) ? { cycle: (a.cycle ?? r.cycle)! } : {}), ...(loan?.loanNo ? { loanNo: loan.loanNo } : {}), amount: a.amount };
      }),
      amountInWords: amountInWords(r.amount),
      ...(sheet ? { sheet: { id: sheet.id, cycle: sheet.cycle, departmentName: this.deptName(v, sheet.departmentId) } } : {}),
      ...(report ? { report } : {}),
    };
  }

  async receipts(user: SessionUser, q: ReceiptListParams): Promise<ReceiptList> {
    await this.requireView(user);
    const v = await this.view();
    const scope = user.role === 'DDO' ? user.departmentId : undefined;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(q.pageSize) || 25));
    const [list, stats, reported] = await Promise.all([this.repo.receiptPage({ ...q, ...(scope ? { scopeDepartmentId: scope } : {}) }, (page - 1) * pageSize, pageSize), this.repo.receiptStats(scope, v.today), this.repo.reports('REPORTED')]);
    return {
      items: list.items.map((r) => this.receiptRow(v, r)),
      page,
      pageSize,
      total: list.total,
      counts: { ALL: stats.all, SALARY_RECOVERY: stats.salary, COUNTER: stats.all - stats.salary, REPORTED: reported.length },
      totals: { today: stats.todayAmount, thisMonth: stats.monthAmount, reportedOpen: reported.length },
      canReceive: this.canReceive(user),
    };
  }

  async receipt(user: SessionUser, id: string): Promise<ReceiptDetail> {
    await this.requireView(user);
    const r = (await this.repo.receipt(id)) ?? fail('NOT_FOUND', 'Receipt not found.');
    return this.receiptDetail(await this.view(), r);
  }

  /** Dues payment: arrears oldest first (D-061); share capital: the first-demand shares (D-029). */
  private async takePayment(tx: Tx, v: View, memberId: string, purpose: 'DUES' | 'SHARE_CAPITAL', amount: number, debitAccount: string, receipt: Omit<Receipt, 'id' | 'receiptNo' | 'memberId' | 'amount' | 'allocations' | 'purpose'>, changed: Changed, sheetsOut: DemandSheet[]): Promise<Receipt> {
    const dues = await this.dues(v, memberId, tx, receipt.date);
    let allocations: Receipt['allocations'] = [];
    const credit: JournalLineInput[] = [];
    if (purpose === 'SHARE_CAPITAL') {
      if (amount > dues.shareCapitalDue) fail('VALIDATION_ERROR', dues.shareCapitalDue ? `Share capital due is ${formatINR(dues.shareCapitalDue)}.` : 'No share capital is due.', { fieldErrors: { amount: dues.shareCapitalDue ? `At most ${formatINR(dues.shareCapitalDue)}` : 'Nothing due' } });
      const sh = await this.repo.lockShare(tx, memberId);
      if (sh) {
        sh.shareCapital += amount;
        await this.repo.saveShare(tx, sh);
        changed.shares.set(memberId, sh);
      }
      allocations = [{ head: 'SHARE_CAPITAL', amount }];
      credit.push({ accountCode: ACCOUNT.SHARE_CAPITAL, debit: 0, credit: amount, memberId, refType: 'SHARE', refId: memberId });
    } else {
      if (!dues.totalArrears) fail('VALIDATION_ERROR', 'This member has no dues from past cycles.', { fieldErrors: { amount: 'Nothing due' } });
      if (amount > dues.totalArrears) fail('VALIDATION_ERROR', `More than the dues of ${formatINR(dues.totalArrears)}.`, { fieldErrors: { amount: `At most ${formatINR(dues.totalArrears)}` } });
      const sheets: DemandSheet[] = [];
      for (const a of dues.arrears) sheets.push((await this.repo.sheet(a.sheetId, tx, true))!);
      // R4: penal first (oldest cycle first), then the instalments in the agreement's order.
      const result = allocateDuesPayment(sheets.map((s, i) => ({ key: s.id, penal: dues.arrears[i]!.penal, components: s.lines.find((l) => l.memberId === memberId)!.components })), amount);
      for (const [i, cyc] of result.cycles.entries()) {
        const sh = sheets[i]!;
        const line = sh.lines.find((l) => l.memberId === memberId)!;
        const before = line.components.map((c) => ({ ...c }));
        line.components = cyc.components;
        // Settle penal to the payment date: what is left keeps accruing only on what is still unpaid.
        const owed = dues.arrears[i]!.penal;
        if (owed > 0 || line.penal) line.penal = { ...line.penal, settledTo: receipt.date, carried: owed - cyc.penalPaid, collected: (line.penal?.collected ?? 0) + cyc.penalPaid, waived: line.penal?.waived ?? 0 };
        if (cyc.penalPaid > 0) {
          allocations.push({ head: 'PENAL', amount: cyc.penalPaid, cycle: sh.cycle });
          credit.push({ accountCode: HEAD_ACCOUNT.PENAL!, debit: 0, credit: cyc.penalPaid });
        }
        const applied = await this.applyAllocation(tx, memberId, sh.cycle, before, line.components, v.today, changed, 'COUNTER');
        allocations.push(...applied.allocations);
        credit.push(...applied.lines);
        if (line.recovered !== undefined || line.components.some((c) => c.allocated > 0)) line.recovered = sum(line.components.map((c) => c.allocated));
        await this.repo.saveLine(tx, sh.id, line);
        sh.totalRecovered = sum(sh.lines.map((l) => l.recovered ?? 0));
        const { lines: _l, ...head } = sh;
        await this.repo.saveSheetHead(tx, head);
        sheetsOut.push(sh);
      }
    }
    const seq = await this.repo.nextReceiptSeq(tx);
    const r: Receipt = { id: `rcpt-c-${randomUUID().slice(0, 8)}`, receiptNo: `RCP-C-${String(seq).padStart(6, '0')}`, memberId, amount, allocations, purpose, ...receipt };
    await this.repo.insertReceipt(tx, r);
    const m = v.members.get(memberId);
    await this.app.ledger.post({ entryDate: r.date, narration: `Receipt ${r.receiptNo} from ${m?.name ?? memberId} (${purpose === 'SHARE_CAPITAL' ? 'share capital' : 'dues'})`, source: 'RECEIPT', sourceRef: r.receiptNo, postedBy: { id: receipt.byId ?? 'system', name: receipt.byName ?? 'System' }, lines: [{ accountCode: debitAccount, debit: amount, credit: 0 }, ...credit] }, tx);
    return r;
  }

  // ---- F-13 surety recovery (D-097) ----

  /** The borrower's unpaid instalments on one loan, across posted cycles. */
  private async loanOverdue(borrowerId: string, loanId: string, tx?: Tx): Promise<number> {
    const rows = await this.repo.linesOfMember(borrowerId, tx);
    return sum(rows.filter((r) => r.sheet.status === 'RECOVERY_POSTED').map((r) => loanUnpaid(r.line.components, loanId)));
  }

  private async withDue(r: SuretyRecovery, tx?: Tx): Promise<SuretyRecovery & { due: number }> {
    return { ...r, due: suretyRecoveryDue({ share: r.share, paid: r.paid, loanOverdue: await this.loanOverdue(r.borrowerId, r.loanId, tx) }) };
  }

  /** ST-22 loan page: may this loan be recovered from its sureties now, and what each would owe. */
  async suretyRecoveryPanel(user: SessionUser, loanId: string, tx?: Tx): Promise<SuretyRecoveryPanel> {
    await this.requireView(user);
    const loan = (await this.app.loans.repo.find(loanId, tx)) ?? fail('NOT_FOUND', 'Loan not found.');
    const [settings, rows, existing, canRaise, members] = await Promise.all([this.app.masters.settings(), this.repo.linesOfMember(loan.memberId, tx), this.repo.recoveriesOfLoan(loan.id, tx), this.app.permissions.has(user.role, 'collections.recoverFromSureties'), this.app.members.all()]);
    const history = rows.filter((r) => r.sheet.status === 'RECOVERY_POSTED').map((r) => ({ cycle: r.sheet.cycle, loanUnpaid: loanUnpaid(r.line.components, loan.id) }));
    const threshold = settings.suretyRecoveryAfterCycles;
    const { isDefaulter, consecutiveCycles } = loanDefaulter(history, threshold);
    const overdue = sum(history.map((h) => Math.max(0, h.loanUnpaid)));
    const sureties = loan.sureties.filter((s) => s.status === 'ACCEPTED').map((s) => members.find((m) => m.id === s.memberId)).filter((m): m is Member => Boolean(m));
    const split = splitEqually(overdue, sureties.length);
    const open = existing.some((r) => r.status === 'OPEN');
    const reason = !sureties.length ? 'This loan has no sureties.' : open ? 'Already being recovered from the sureties.' : !isDefaulter ? `Unpaid ${consecutiveCycles} month${consecutiveCycles === 1 ? '' : 's'} in a row; the sureties are asked after ${threshold}.` : overdue <= 0 ? 'Nothing is overdue.' : undefined;
    return {
      loanId: loan.id,
      threshold,
      consecutiveCycles,
      overdue,
      eligible: !reason,
      ...(reason ? { reason } : {}),
      canRaise,
      shares: sureties.map((s, i) => ({ memberId: s.id, name: s.name, generalNo: s.generalNo, share: split[i]! })),
      recoveries: await Promise.all(existing.map((r) => this.withDue(r, tx))),
    };
  }

  /** F-13 (D-097): the Accountant asks every surety who signed for an equal share of what is overdue. */
  async raiseSuretyRecovery(request: FastifyRequest, loanId: string): Promise<SuretyRecoveryPanel> {
    const user = sessionOf(request);
    await this.requireView(user);
    if (!(await this.app.permissions.has(user.role, 'collections.recoverFromSureties'))) fail('FORBIDDEN', 'Only the Accountant recovers a loan from its sureties.');
    const at = await businessNow(this.app);
    const created: SuretyRecovery[] = [];
    let overdue = 0;
    let cycles = 0;
    const loan = await withTransaction(this.app.db, async (tx) => {
      const l = (await this.app.loans.repo.lock(tx, loanId)) ?? fail('NOT_FOUND', 'Loan not found.');
      const panel = await this.suretyRecoveryPanel(user, l.id, tx);
      if (!panel.eligible) fail('RULE_VIOLATION', panel.reason ?? 'Not possible now.', { ruleId: 'F-13' });
      const borrower = (await this.app.members.byId(l.memberId))!;
      overdue = panel.overdue;
      cycles = panel.consecutiveCycles;
      for (const s of panel.shares) {
        const r: SuretyRecovery = { id: `sry-${randomUUID().slice(0, 8)}`, loanId: l.id, loanNo: l.loanNo ?? l.applicationNo, borrowerId: borrower.id, borrowerName: borrower.name, suretyId: s.memberId, suretyName: s.name, share: s.share, paid: 0, status: 'OPEN', raisedOn: at, raisedByName: user.name, cycles, payments: [] };
        await this.repo.insertRecovery(tx, r);
        created.push(r);
      }
      await this.app.audit.record(request, { action: 'suretyRecovery', entity: 'loan', entityId: l.id, summary: `${user.name} asked ${created.length} suret${created.length === 1 ? 'y' : 'ies'} to pay ${formatINR(overdue)} overdue on ${l.loanNo ?? l.applicationNo} (${cycles} months unpaid)`, after: created.map((r) => ({ suretyId: r.suretyId, share: r.share })) }, tx);
      return { l, borrower };
    });
    for (const r of created) await notifyMember(this.app, r.suretyId, 'surety.recovery', { borrower: r.borrowerName, generalNo: loan.borrower.generalNo, loanNo: r.loanNo, cycles, share: formatINR(r.share) }, '/payments');
    await notifyMember(this.app, loan.borrower.id, 'surety.recoveryBorrower', { loanNo: loan.l.loanNo ?? loan.l.applicationNo, cycles, overdue: formatINR(overdue) }, '/payments');
    return this.suretyRecoveryPanel(user, loanId);
  }

  /**
   * Money a surety paid for a loan: settles the borrower's unpaid interest then principal on that
   * loan, oldest cycle first, and records the payment on the recovery. Anything beyond what the
   * borrower still owes goes to unidentified receipts for the Accountant [ASSUMPTION, D-097].
   */
  async collectFromSurety(tx: Tx, suretyId: string, loanId: string, amount: number, today: string, changed: Changed, how: { via: 'SALARY' | 'COUNTER'; cycle?: Cycle; receiptNo?: string }): Promise<JournalLineInput[]> {
    const recovery = (await this.repo.openRecoveries(suretyId, tx)).find((r) => r.loanId === loanId);
    const borrowerId = recovery?.borrowerId ?? (await this.app.loans.repo.find(loanId, tx))?.memberId;
    const lines: JournalLineInput[] = [];
    let remaining = amount;
    for (const { sheet } of borrowerId ? (await this.repo.linesOfMember(borrowerId, tx)).filter((r) => r.sheet.status === 'RECOVERY_POSTED') : []) {
      if (remaining <= 0) break;
      const sh = (await this.repo.sheet(sheet.id, tx, true))!;
      const line = sh.lines.find((l) => l.memberId === borrowerId)!;
      const before = line.components.map((c) => ({ ...c }));
      for (const head of ['INTEREST', 'PRINCIPAL'] as const)
        for (const c of line.components.filter((x) => x.loanId === loanId && x.head === head)) {
          const take = Math.min(c.amount - c.allocated, remaining);
          c.allocated += take;
          remaining -= take;
        }
      if (line.components.every((c, i) => c.allocated === before[i]!.allocated)) continue;
      lines.push(...(await this.applyAllocation(tx, borrowerId!, sh.cycle, before, line.components, today, changed)).lines);
      line.recovered = sum(line.components.map((c) => c.allocated));
      await this.repo.saveLine(tx, sh.id, line);
      sh.totalRecovered = sum(sh.lines.map((l) => l.recovered ?? 0));
      const { lines: _l, ...head } = sh;
      await this.repo.saveSheetHead(tx, head);
    }
    if (remaining > 0) lines.push({ accountCode: UNIDENTIFIED, debit: 0, credit: remaining });
    if (recovery) {
      const paid = recovery.paid + amount;
      const overdueLeft = await this.loanOverdue(recovery.borrowerId, loanId, tx);
      const closed = paid >= recovery.share ? 'PAID' : overdueLeft <= 0 ? 'BORROWER_PAID' : undefined;
      await this.repo.saveRecovery(tx, { ...recovery, paid, payments: [...recovery.payments, { at: await businessNow(this.app), amount, via: how.via, ...(how.receiptNo ? { receiptNo: how.receiptNo } : {}), ...(how.cycle ? { cycle: how.cycle } : {}) }], ...(closed ? { status: 'CLOSED' as const, closedReason: closed } : {}) });
    }
    return lines;
  }

  /** A surety pays their share at the counter (receipt in their name, money to the borrower's loan). */
  private async takeSuretyPayment(tx: Tx, suretyId: string, recoveryId: string, amount: number, debitAccount: string, receipt: Omit<Receipt, 'id' | 'receiptNo' | 'memberId' | 'amount' | 'allocations' | 'purpose'>, changed: Changed): Promise<Receipt> {
    const r = await this.repo.lockRecovery(tx, recoveryId);
    if (!r || r.suretyId !== suretyId || r.status !== 'OPEN') fail('VALIDATION_ERROR', 'Choose an open surety recovery of this member.', { fieldErrors: { recoveryId: 'Not an open recovery of this member' } });
    const { due } = await this.withDue(r!, tx);
    if (amount > due) fail('VALIDATION_ERROR', `At most ${formatINR(due)} is due on this recovery.`, { fieldErrors: { amount: `At most ${formatINR(due)}` } });
    const seq = await this.repo.nextReceiptSeq(tx);
    const receiptNo = `RCP-C-${String(seq).padStart(6, '0')}`;
    const credit = await this.collectFromSurety(tx, suretyId, r!.loanId, amount, receipt.date, changed, { via: 'COUNTER', receiptNo });
    const rec: Receipt = { id: `rcpt-c-${randomUUID().slice(0, 8)}`, receiptNo, memberId: suretyId, amount, allocations: [{ head: 'SURETY', loanId: r!.loanId, amount }], purpose: 'SURETY_RECOVERY', ...receipt };
    await this.repo.insertReceipt(tx, rec);
    await this.app.ledger.post({ entryDate: rec.date, narration: `Receipt ${receiptNo} from ${r!.suretyName} as surety for ${r!.borrowerName} (${r!.loanNo})`, source: 'RECEIPT', sourceRef: receiptNo, postedBy: { id: receipt.byId ?? 'system', name: receipt.byName ?? 'System' }, lines: [{ accountCode: debitAccount, debit: amount, credit: 0 }, ...credit] }, tx);
    return rec;
  }

  async counterReceipt(request: FastifyRequest, input: Partial<NewReceiptInput>): Promise<ReceiptDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    if (!this.canReceive(user)) fail('FORBIDDEN', 'Only the Cashier or the Accountant takes payments.');
    const v = await this.view();
    const fieldErrors: Record<string, string> = {};
    const m = input.memberId ? v.members.get(input.memberId) : undefined;
    if (!m) fieldErrors.memberId = 'Choose the member';
    if (!input.amount || !Number.isInteger(input.amount) || input.amount <= 0) fieldErrors.amount = 'Enter the amount';
    if (!input.date || input.date > v.today) fieldErrors.date = 'Today or earlier';
    if (input.mode === 'CASH') {
      const check = validateDenominations(input.denominations ?? {}, input.amount ?? 0);
      if (!check.pass) fieldErrors.denominations = check.message;
    } else if (input.mode === 'BANK_TRANSFER') {
      if (!input.reference?.trim()) fieldErrors.reference = 'Enter the UTR / transfer reference';
    } else if (input.mode === 'ADJUSTMENT') {
      if (user.role !== 'ACCOUNTANT') fieldErrors.mode = 'Only the Accountant records adjustments';
      if ((input.remarks?.trim().length ?? 0) < 10) fieldErrors.remarks = 'Explain the adjustment (at least 10 characters)';
    } else fieldErrors.mode = 'Choose how it was paid';
    if (input.purpose !== 'DUES' && input.purpose !== 'SHARE_CAPITAL' && input.purpose !== 'SURETY_RECOVERY') fieldErrors.purpose = 'Choose what it is for';
    if (input.purpose === 'SURETY_RECOVERY' && !input.recoveryId) fieldErrors.recoveryId = 'Choose which loan it is for';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const at = await businessNow(this.app);
    const changed: Changed = { loans: new Map(), deposits: new Map(), shares: new Map() };
    const sheets: DemandSheet[] = [];
    const debit = input.mode === 'CASH' ? ACCOUNT.CASH : input.mode === 'ADJUSTMENT' ? UNIDENTIFIED : ACCOUNT.BANK;
    const r = await withTransaction(this.app.db, async (tx) => {
      const pay = input.purpose === 'SURETY_RECOVERY' ? (r: Omit<Receipt, 'id' | 'receiptNo' | 'memberId' | 'amount' | 'allocations' | 'purpose'>) => this.takeSuretyPayment(tx, m!.id, input.recoveryId!, input.amount!, debit, r, changed) : (r: Omit<Receipt, 'id' | 'receiptNo' | 'memberId' | 'amount' | 'allocations' | 'purpose'>) => this.takePayment(tx, v, m!.id, input.purpose as 'DUES' | 'SHARE_CAPITAL', input.amount!, debit, r, changed, sheets);
      const receipt = await pay({
        date: input.date!,
        source: input.mode === 'CASH' ? 'CASH' : input.mode === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'BANK_TRANSFER',
        ...(input.mode === 'CASH' ? { denominations: input.denominations! } : {}),
        ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
        ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
        byName: user.name,
        byId: user.id,
        at,
      });
      await this.app.audit.record(request, { action: 'create', entity: 'receipt', entityId: receipt.id, summary: `Receipt ${receipt.receiptNo} · ${m!.name} · ${formatINR(receipt.amount)}` }, tx);
      return receipt;
    });
    return this.receiptDetail(await this.view(), r);
  }

  // ---- G1 (D-111, BR-040): paying a loan off early at the counter ----
  /** What closing a loan today costs and whether it can close now. Locks the loan when given a transaction. */
  async closureQuote(user: SessionUser, loanId: string, tx?: Tx): Promise<LoanClosureQuote> {
    await this.requireView(user);
    const loan = (tx ? await this.app.loans.repo.lock(tx, loanId) : await this.app.loans.repo.find(loanId)) ?? fail('NOT_FOUND', 'Loan not found.');
    const m = (await this.app.members.byId(loan.memberId)) ?? fail('NOT_FOUND', 'Loan not found.');
    if (user.role === 'DDO' && m.departmentId !== user.departmentId) fail('NOT_FOUND', 'Loan not found.');
    const today = await businessToday(this.app);
    const interestFrom = lastInterestChargedOn(loan, today);
    const q = calculateLoanClosure({ outstandingPrincipal: loan.outstandingPrincipal, ratePercent: loan.ratePercent, lastInterestChargedOn: interestFrom, today });
    const rows = await this.repo.linesOfMember(loan.memberId, tx);
    const onLoan = (line: DemandLine) => line.components.filter((c) => c.loanId === loan.id);
    const blockers: string[] = [];
    if (loan.status !== 'ACTIVE') blockers.push('Only a running loan can be closed.');
    const unpaid = sum(rows.filter((r) => r.sheet.status === 'RECOVERY_POSTED').flatMap((r) => onLoan(r.line).filter((c) => c.head === 'PRINCIPAL' || c.head === 'INTEREST').map((c) => c.amount - c.allocated)));
    if (unpaid > 0) blockers.push(`${formatINR(unpaid)} of earlier instalments on this loan is unpaid. Take it as dues first (New receipt), then close the loan.`);
    for (const r of rows.filter((x) => (x.sheet.status === 'CERTIFIED' || x.sheet.status === 'SENT_TO_DDO') && onLoan(x.line).length))
      blockers.push(`The ${formatCycle(r.sheet.cycle)} demand with this instalment is ${r.sheet.status === 'CERTIFIED' ? 'already certified' : 'with the DDO'}. Close the loan after that recovery is posted.`);
    const draftCycles = rows.filter((r) => r.sheet.status === 'GENERATED' && onLoan(r.line).length).map((r) => r.sheet.cycle);
    return { loanId: loan.id, loanNo: loan.loanNo ?? loan.applicationNo, memberId: m.id, memberName: m.name, generalNo: m.generalNo, asOf: today, interestFrom, ratePercent: loan.ratePercent, ...q, canClose: blockers.length === 0, blockers, draftCycles };
  }

  /** Takes the closing payment: receipt, one ledger entry, the loan closes and leaves any draft demand. */
  async closeLoan(request: FastifyRequest, loanId: string, input: Partial<LoanClosureInput>): Promise<ReceiptDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    if (!this.canReceive(user)) fail('FORBIDDEN', 'Only the Cashier or the Accountant takes payments.');
    const at = await businessNow(this.app);
    const { rec, q } = await withTransaction(this.app.db, async (tx) => {
      const q = await this.closureQuote(user, loanId, tx);
      if (!q.canClose) fail('RULE_VIOLATION', q.blockers[0]!, { ruleId: 'BR-040' });
      const fieldErrors: Record<string, string> = {};
      if (input.amount !== q.total) fieldErrors.amount = `Collect ${formatINR(q.total)} (principal and interest to today)`;
      if (input.mode === 'CASH') {
        const coins = input.coins ?? 0;
        if (!Number.isInteger(coins) || coins < 0 || coins >= 1000) fieldErrors.coins = 'Coins are for less than ₹10 only';
        const check = validateDenominations(input.denominations ?? {}, (input.amount ?? 0) - coins);
        if (!check.pass) fieldErrors.denominations = check.message;
      } else if (input.mode === 'BANK_TRANSFER') {
        if (!input.reference?.trim()) fieldErrors.reference = 'Enter the UTR / transfer reference';
      } else fieldErrors.mode = 'Choose how it was paid';
      if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });

      // Draft sheets drop this loan's instalment, so the DDO is never asked to deduct it.
      for (const { sheet } of (await this.repo.linesOfMember(q.memberId, tx)).filter((r) => r.sheet.status === 'GENERATED')) {
        const sh = (await this.repo.sheet(sheet.id, tx, true))!;
        const line = sh.lines.find((l) => l.memberId === q.memberId)!;
        if (!line.components.some((c) => c.loanId === loanId)) continue;
        line.components = line.components.filter((c) => c.loanId !== loanId);
        line.totalDemand = sum(line.components.map((c) => c.amount));
        await this.repo.saveLine(tx, sh.id, line);
        sh.totalDemand = sum(sh.lines.map((l) => l.totalDemand));
        const { lines: _l, ...head } = sh;
        await this.repo.saveSheetHead(tx, head);
      }

      const loan = (await this.app.loans.repo.lock(tx, loanId))!;
      const seq = await this.repo.nextReceiptSeq(tx);
      const receiptNo = `RCP-C-${String(seq).padStart(6, '0')}`;
      const rec: Receipt = {
        id: `rcpt-c-${randomUUID().slice(0, 8)}`,
        receiptNo,
        memberId: q.memberId,
        date: q.asOf,
        source: input.mode === 'CASH' ? 'CASH' : 'BANK_TRANSFER',
        amount: q.total,
        ...(input.mode === 'CASH' ? { denominations: input.denominations!, ...(input.coins ? { coins: input.coins } : {}) } : {}),
        ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
        ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
        allocations: [...(q.principal ? [{ head: 'PRINCIPAL' as const, loanId, amount: q.principal }] : []), ...(q.interest ? [{ head: 'INTEREST' as const, loanId, amount: q.interest }] : [])],
        purpose: 'LOAN_CLOSURE',
        byName: user.name,
        byId: user.id,
        at,
      };
      await this.repo.insertReceipt(tx, rec);
      await this.app.ledger.post(
        {
          entryDate: q.asOf,
          narration: `Receipt ${receiptNo}: ${q.memberName} (${q.generalNo}) closed loan ${q.loanNo} early`,
          source: 'RECEIPT',
          sourceRef: receiptNo,
          postedBy: { id: user.id, name: user.name },
          lines: [
            { accountCode: input.mode === 'CASH' ? ACCOUNT.CASH : ACCOUNT.BANK, debit: q.total, credit: 0 },
            ...(q.principal ? [{ accountCode: LOAN_ACCOUNT[loan.product], debit: 0, credit: q.principal, memberId: q.memberId, refType: 'LOAN' as const, refId: loanId }] : []),
            ...(q.interest ? [{ accountCode: HEAD_ACCOUNT.INTEREST!, debit: 0, credit: q.interest }] : []),
          ],
        },
        tx,
      );
      await this.app.loans.repo.save(tx, { ...loan, status: 'CLOSED', outstandingPrincipal: 0, closedOn: q.asOf, events: [...loan.events, { at, actorId: user.id, actorName: user.name, actorRole: user.role, action: 'close', fromStatus: 'ACTIVE', toStatus: 'CLOSED', remarks: `Closed early at the counter, receipt ${receiptNo}` }] });
      for (const r of (await this.repo.recoveriesOfLoan(loanId, tx)).filter((x) => x.status === 'OPEN')) await this.repo.saveRecovery(tx, { ...r, status: 'CLOSED', closedReason: 'BORROWER_PAID' });
      await this.app.audit.record(request, { action: 'loan.close', entity: 'loan', entityId: loanId, summary: `${q.loanNo} closed early by ${q.memberName}: ${formatINR(q.principal)} principal + ${formatINR(q.interest)} interest, receipt ${receiptNo}` }, tx);
      return { rec, q };
    });
    await notifyMember(this.app, q.memberId, 'loan.closed', { loanNo: q.loanNo, amount: formatINR(q.total), receiptNo: rec.receiptNo }, `/loan/${loanId}`);
    return this.receiptDetail(await this.view(), rec);
  }

  /** P6: an FD payment's receipt (the ledger entry is the deposit's own). */
  async fdReceipt(tx: Tx, r: Omit<Receipt, 'id' | 'receiptNo' | 'allocations'>): Promise<Receipt> {
    const seq = await this.repo.nextReceiptSeq(tx);
    const receipt: Receipt = { id: `rct-${randomUUID().slice(0, 8)}`, receiptNo: `RCT-${r.date.slice(0, 4)}-${String(seq).padStart(5, '0')}`, allocations: [], ...r };
    await this.repo.insertReceipt(tx, receipt);
    return receipt;
  }

  // ---- ST-47 member-reported payments ----
  private async reportRow(v: View, r: PaymentReport): Promise<PaymentReportRow> {
    const m = v.members.get(r.memberId);
    return { ...r, memberName: m?.name ?? '', generalNo: m?.generalNo ?? '', departmentName: this.deptName(v, m?.departmentId), totalArrears: (await this.dues(v, r.memberId)).totalArrears };
  }

  async reports(user: SessionUser, status?: string): Promise<PaymentReportRow[]> {
    await this.requireView(user);
    const v = await this.view();
    const list = (await this.repo.reports(status as PaymentReport['status'] | undefined)).filter((r) => user.role !== 'DDO' || v.members.get(r.memberId)?.departmentId === user.departmentId);
    list.sort((a, b) => Number(b.status === 'REPORTED') - Number(a.status === 'REPORTED') || (b.reportedAt ?? b.paidOn).localeCompare(a.reportedAt ?? a.paidOn));
    return Promise.all(list.map((r) => this.reportRow(v, r)));
  }

  private async loadReport(tx: Tx, user: SessionUser, id: string): Promise<PaymentReport> {
    await this.requireView(user);
    if (!this.canReceive(user)) fail('FORBIDDEN', 'Only the Cashier or the Accountant verifies payments.');
    const r = (await this.repo.lockReport(tx, id)) ?? fail('NOT_FOUND', 'Report not found.');
    if (r.status !== 'REPORTED') fail('INVALID_TRANSITION', `Already ${r.status.toLowerCase()}.`);
    return r;
  }

  async verifyReport(request: FastifyRequest, id: string, remarks?: string): Promise<ReceiptDetail> {
    const user = sessionOf(request);
    const v = await this.view();
    const at = await businessNow(this.app);
    const changed: Changed = { loans: new Map(), deposits: new Map(), shares: new Map() };
    const sheets: DemandSheet[] = [];
    const { receipt, rep } = await withTransaction(this.app.db, async (tx) => {
      const rep = await this.loadReport(tx, user, id);
      const receipt = await this.takePayment(tx, v, rep.memberId, rep.towards ?? 'DUES', rep.amount, ACCOUNT.BANK, { date: rep.paidOn, source: 'BANK_TRANSFER', reference: rep.reference, paymentReportId: rep.id, byName: user.name, byId: user.id, at, ...(remarks?.trim() ? { remarks: remarks.trim() } : {}) }, changed, sheets);
      Object.assign(rep, { status: 'VERIFIED', decided: signOff(user, at, remarks?.trim() || undefined), receiptId: receipt.id });
      await this.repo.saveReport(tx, rep);
      await this.app.audit.record(request, { action: 'verify', entity: 'paymentReport', entityId: rep.id, summary: `Verified ${formatINR(rep.amount)} (${rep.reference}) → ${receipt.receiptNo}` }, tx);
      return { receipt, rep };
    });
    await notifyMember(this.app, rep.memberId, 'payment.verified', { amount: formatINR(rep.amount), reference: rep.reference, receiptNo: receipt.receiptNo }, '/payments');
    return this.receiptDetail(await this.view(), receipt);
  }

  async rejectReport(request: FastifyRequest, id: string, reason = ''): Promise<PaymentReportRow> {
    const user = sessionOf(request);
    if (reason.trim().length < 10) fail('VALIDATION_ERROR', 'Give the reason (at least 10 characters). The member sees it.', { fieldErrors: { reason: 'At least 10 characters' } });
    const at = await businessNow(this.app);
    const rep = await withTransaction(this.app.db, async (tx) => {
      const r = await this.loadReport(tx, user, id);
      Object.assign(r, { status: 'REJECTED', rejectReason: reason.trim(), decided: signOff(user, at, reason.trim()) });
      await this.repo.saveReport(tx, r);
      await this.app.audit.record(request, { action: 'reject', entity: 'paymentReport', entityId: r.id, summary: `Rejected ${formatINR(r.amount)} (${r.reference})` }, tx);
      return r;
    });
    await notifyMember(this.app, rep.memberId, 'payment.rejected', { amount: formatINR(rep.amount), reason: reason.trim() }, '/payments');
    return this.reportRow(await this.view(), rep);
  }

  // ---- MB-10 / MB-18 (member) ----
  private memberIdOf(user: SessionUser): string {
    if (user.role !== 'MEMBER' || !user.memberId) fail('FORBIDDEN', 'Members only.');
    return user.memberId!;
  }

  async myPayments(user: SessionUser): Promise<MyPayments> {
    const memberId = this.memberIdOf(user);
    const v = await this.view();
    const [rows, receipts, reports] = await Promise.all([this.repo.linesOfMember(memberId), this.repo.receiptsOfMember(memberId), this.repo.reports(undefined, memberId)]);
    const months = rows
      .map(({ sheet, line }) => {
        const posted = sheet.status === 'RECOVERY_POSTED';
        const paid = sum(line.components.map((x) => x.allocated));
        return { cycle: sheet.cycle, sheetStatus: sheet.status, demand: line.totalDemand, ...(posted ? { recovered: paid, short: Math.max(0, line.totalDemand - paid) } : {}), components: inPriority(line.components.map((x) => ({ ...x, ...this.labelOf(v, x) }))) };
      })
      .sort((a, b) => b.cycle.localeCompare(a.cycle));
    return { months, receipts: receipts.map((r) => this.receiptRow(v, r)), reports: reports.sort((a, b) => (b.reportedAt ?? b.paidOn).localeCompare(a.reportedAt ?? a.paidOn)), dues: await this.dues(v, memberId), payTo: PAY_TO };
  }

  async myReceipt(user: SessionUser, id: string): Promise<ReceiptDetail> {
    const memberId = this.memberIdOf(user);
    const r = await this.repo.receipt(id);
    if (!r || r.memberId !== memberId) return fail('NOT_FOUND', 'Receipt not found.');
    return this.receiptDetail(await this.view(), r);
  }

  async reportPayment(request: FastifyRequest, input: Partial<ReportPaymentInput>): Promise<PaymentReport> {
    const user = sessionOf(request);
    const memberId = this.memberIdOf(user);
    const v = await this.view();
    const dues = await this.dues(v, memberId);
    const fieldErrors: Record<string, string> = {};
    const owed = input.towards === 'SHARE_CAPITAL' ? dues.shareCapitalDue : dues.totalArrears;
    if (input.towards !== 'DUES' && input.towards !== 'SHARE_CAPITAL') fieldErrors.towards = 'Choose what the payment was for';
    else if (!owed) fieldErrors.towards = input.towards === 'SHARE_CAPITAL' ? 'No share capital is due' : 'You have no dues from past months';
    if (!input.amount || !Number.isInteger(input.amount) || input.amount <= 0) fieldErrors.amount = 'Enter the amount you paid';
    else if (owed && input.amount > owed) fieldErrors.amount = `You owe ${formatINR(owed)}. Pay that or less.`;
    if (!input.paidOn || input.paidOn > v.today) fieldErrors.paidOn = 'Today or earlier';
    else if (daysBetween(input.paidOn, v.today) > 60) fieldErrors.paidOn = 'Report within 60 days of paying';
    if (!['BANK_TRANSFER', 'UPI', 'CHEQUE_DEPOSIT'].includes(input.mode ?? '')) fieldErrors.mode = 'Choose how you paid';
    const ref = (input.reference ?? '').trim().toUpperCase();
    if (ref.length < 6) fieldErrors.reference = 'Enter the UTR / transaction or cheque number';
    else if (await this.repo.referenceUsed(ref)) fieldErrors.reference = 'This reference was already reported';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const at = await businessNow(this.app);
    const rep: PaymentReport = { id: `prep-${randomUUID().slice(0, 8)}`, memberId, amount: input.amount!, paidOn: input.paidOn!, mode: input.mode!, reference: ref, status: 'REPORTED', towards: input.towards!, reportedAt: at, ...(input.screenshotName ? { screenshotName: input.screenshotName } : {}) };
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.saveReport(tx, rep, true);
      await this.app.audit.record(request, { action: 'report', entity: 'paymentReport', entityId: rep.id, summary: `${user.name} reported ${formatINR(rep.amount)} (${ref})` }, tx);
    });
    return rep;
  }

}
