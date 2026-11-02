import { randomUUID } from 'node:crypto';
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
  type JournalLineInput,
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
  Department,
  DepositAccount,
  Loan,
  LoanStage,
  Member,
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

const HEAD_LABEL: Record<DemandHead, string> = { RRF: 'RRF', INSURANCE: 'Insurance', CRD: 'CRD', SRDS: 'SRDS', SHARE_CAPITAL: 'Share capital', PENAL: 'Penal interest', INTEREST: 'Interest', PRINCIPAL: 'Principal' };
const PRODUCT_LABEL: Record<string, string> = { ORDINARY: 'Ordinary', EDUCATION: 'Education', SALARY: 'Salary', DEPOSIT: 'Deposit' };
const PAY_TO = { accountName: 'TGSECCSL Dues Collection', accountNo: 'XXXXXXXX3307', ifsc: 'DEMO0000929', upi: 'tgseccsl.dues@demo', counter: 'Society cash counter, 2nd Floor, West Ancillary Building' };
const ACTION_TEXT: Record<DemandSheetAction, string> = { certify: 'Certify', sendToDdo: 'Send to DDO', postRecovery: 'Enter recovery' };
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

  private lineView(v: View, line: DemandLine, posted: boolean): DemandLineView {
    const m = v.members.get(line.memberId);
    return {
      memberId: line.memberId,
      generalNo: m?.generalNo ?? '',
      name: m?.name ?? line.memberId,
      designation: m?.designation ?? '',
      heads: headTotals(line.components),
      components: inPriority(line.components.map((c) => ({ ...c, ...this.labelOf(v, c) }))),
      totalDemand: line.totalDemand,
      ...(posted && line.recovered !== undefined ? { recovered: line.recovered, short: Math.max(0, line.totalDemand - line.recovered) } : {}),
    };
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
    const [v, gen, sheetCycles] = await Promise.all([this.view(), this.generatableCycles(), this.repo.cycles()]);
    const cycle = cycleParam || v.cycle;
    const sheets = await this.repo.sheetsForCycle(cycle);
    const depts = [...v.depts.values()].filter((d) => user.role !== 'DDO' || d.id === user.departmentId);
    const rows: DemandSheetRow[] = [];
    for (const d of depts) {
      const sh = sheets.find((s) => s.departmentId === d.id);
      const full = sh?.status === 'RECOVERY_POSTED' ? await this.repo.sheet(sh.id) : undefined;
      const actions = sh ? demandSheetActionsFor(sh.status, { role: user.role }) : [];
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
        ...(actions[0] ? { myAction: ACTION_TEXT[actions[0]] } : {}),
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
    const [members, transfers, dueRows, shares, crd, srds, settings] = await Promise.all([
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
      await this.app.audit.record(request, { action: 'generate', entity: 'demandSheet', entityId: cycle, summary: `Generated ${formatCycle(cycle)} demand for ${targets.length} department${targets.length === 1 ? '' : 's'}` }, tx);
    });
    await this.sync({ demandSheets: sheets });
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
    const lines = sh.lines.map((l) => this.lineView(v, l, posted)).sort((a, b) => a.generalNo.localeCompare(b.generalNo));
    const actions = demandSheetActionsFor(sh.status, { role: user.role });
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
    };
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
    const saved = await withTransaction(this.app.db, async (tx) => {
      const sh = await this.loadSheet(user, id, tx, true);
      const next = nextDemandSheetStatus(sh.status, action);
      if (!next) fail('INVALID_TRANSITION', `This sheet is "${sh.status}". Refresh to see the latest.`);
      if (!opts.demo && !demandSheetActionsFor(sh.status, { role: user.role }).includes(action)) fail('FORBIDDEN', 'This step belongs to the Accountant.');
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
        const recovered = input?.recovered ?? {};
        const fieldErrors: Record<string, string> = {};
        for (const [memberId, amount] of Object.entries(recovered)) {
          const line = sh.lines.find((l) => l.memberId === memberId);
          if (!line) fieldErrors[`recovered.${memberId}`] = 'Not on this sheet';
          else if (!Number.isInteger(amount) || amount < 0) fieldErrors[`recovered.${memberId}`] = 'Enter ₹0 or more';
          else if (amount > line.totalDemand) fieldErrors[`recovered.${memberId}`] = `More than the demand of ${formatINR(line.totalDemand)}. The DDO refunds any excess (D-061).`;
        }
        if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted amounts.', { fieldErrors });
        const date = lastDayOf(sh.cycle) > today ? today : lastDayOf(sh.cycle);
        const credit: JournalLineInput[] = [];
        let seq = await this.repo.nextReceiptSeq(tx);
        for (const line of sh.lines) {
          const amount = recovered[line.memberId] ?? line.totalDemand;
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
    await this.syncChanged(changed, { demandSheets: [saved], receipts: newReceipts });
    for (const n of notes) await notifyMember(this.app, ...n);
    return saved;
  }

  /**
   * The one place money lands: newly allocated amounts (after − before) reduce loan principal,
   * mark schedule rows, close repaid loans, credit CRD / SRDS and share capital. Returns the
   * receipt allocations and the ledger credit lines for them.
   */
  private async applyAllocation(tx: Tx, memberId: string, cycle: Cycle, before: DemandComponent[], after: DemandComponent[], today: string, changed: Changed): Promise<{ allocations: Receipt['allocations']; lines: JournalLineInput[] }> {
    const allocations: Receipt['allocations'] = [];
    const lines: JournalLineInput[] = [];
    const loanOf = async (id: string) => changed.loans.get(id) ?? (await this.app.loans.repo.lock(tx, id));
    for (const [i, c] of after.entries()) {
      const delta = c.allocated - (before[i]?.allocated ?? 0);
      if (delta <= 0) continue;
      allocations.push({ head: c.head, ...(c.loanId ? { loanId: c.loanId } : {}), amount: delta, cycle });
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
  private async dues(v: View, memberId: string, tx?: Tx): Promise<MemberDues> {
    const m = v.members.get(memberId) ?? fail('NOT_FOUND', 'Member not found.');
    const [rows, share, settings] = await Promise.all([this.repo.linesOfMember(memberId, tx), this.repo.share(memberId, tx), this.app.masters.settings()]);
    const arrears: MemberDues['arrears'] = [];
    for (const { sheet, line } of rows) {
      if (sheet.status !== 'RECOVERY_POSTED') continue;
      const unpaid = line.totalDemand - sum(line.components.map((c) => c.allocated));
      if (unpaid > 0) arrears.push({ cycle: sheet.cycle, sheetId: sheet.id, unpaid, components: inPriority(line.components.map((c) => ({ ...c, ...this.labelOf(v, c), unpaid: c.amount - c.allocated }))) });
    }
    const shareCapitalDue = share ? Math.max(0, share.numberOfShares * settings.shareValue - share.shareCapital) : 0;
    return { memberId, name: m.name, generalNo: m.generalNo, departmentName: this.deptName(v, m.departmentId), arrears, totalArrears: sum(arrears.map((a) => a.unpaid)), shareCapitalDue };
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
    const dues = await this.dues(v, memberId, tx);
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
      const result = allocateArrears(sheets.map((s) => ({ key: s.id, components: s.lines.find((l) => l.memberId === memberId)!.components })), amount);
      for (const [i, cyc] of result.cycles.entries()) {
        const sh = sheets[i]!;
        const line = sh.lines.find((l) => l.memberId === memberId)!;
        const before = line.components.map((c) => ({ ...c }));
        line.components = cyc.components;
        const applied = await this.applyAllocation(tx, memberId, sh.cycle, before, line.components, v.today, changed);
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
    if (input.purpose !== 'DUES' && input.purpose !== 'SHARE_CAPITAL') fieldErrors.purpose = 'Choose what it is for';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const at = await businessNow(this.app);
    const changed: Changed = { loans: new Map(), deposits: new Map(), shares: new Map() };
    const sheets: DemandSheet[] = [];
    const debit = input.mode === 'CASH' ? ACCOUNT.CASH : input.mode === 'ADJUSTMENT' ? UNIDENTIFIED : ACCOUNT.BANK;
    const r = await withTransaction(this.app.db, async (tx) => {
      const receipt = await this.takePayment(tx, v, m!.id, input.purpose!, input.amount!, debit, {
        date: input.date!,
        source: input.mode === 'CASH' ? 'CASH' : input.mode === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'BANK_TRANSFER',
        ...(input.mode === 'CASH' ? { denominations: input.denominations! } : {}),
        ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
        ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
        byName: user.name,
        byId: user.id,
        at,
      }, changed, sheets);
      await this.app.audit.record(request, { action: 'create', entity: 'receipt', entityId: receipt.id, summary: `Receipt ${receipt.receiptNo} · ${m!.name} · ${formatINR(receipt.amount)}` }, tx);
      return receipt;
    });
    await this.syncChanged(changed, { demandSheets: sheets, receipts: [r] });
    return this.receiptDetail(await this.view(), r);
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
    await this.syncChanged(changed, { demandSheets: sheets, receipts: [receipt], paymentReports: [rep] });
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
    await this.sync({ paymentReports: [rep] });
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
    await this.sync({ paymentReports: [rep] });
    return rep;
  }

  // ---- dev bridge ----
  /** TODO(P8): the mock's work queue, dashboards and reports read these; keep them in step. */
  private async sync(records: Record<string, unknown[]>): Promise<void> {
    await this.app.members.sync(records);
  }

  private async syncChanged(changed: Changed, extra: Record<string, unknown[]>): Promise<void> {
    await this.sync({ ...extra, loans: [...changed.loans.values()], deposits: [...changed.deposits.values()], shareAccounts: [...changed.shares.values()] });
  }
}
