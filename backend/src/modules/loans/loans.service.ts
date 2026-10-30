import { randomUUID } from 'node:crypto';
import {
  assessLoanApplication,
  buildSanctionSheet,
  calculateLeftoverService,
  checkSalaryLoan,
  checkSuretyEligibility,
  checkTopupEligibility,
  firstDueCycle,
  formatINR,
  lastInstalmentCycle,
  lastInterestChargedOn,
  LOAN_STAGE_OWNER,
  loanActionsFor,
  loanStages,
  loanStatusGroup,
  nextLoanStatus,
  suretyProgress,
  validateLoanRequest,
  type RuleCheck,
} from '@tgs/domain';
import {
  ROLE_LABELS,
  type ConsoleRole,
  type Department,
  type DepositAccount,
  type Loan,
  type LoanContext,
  type LoanDetail,
  type LoanList,
  type LoanProduct,
  type LoanProductCode,
  type LoanRequestInput,
  type LoanRow,
  type LoanStatus,
  type LoanStatusGroup,
  type Member,
  type MemberPick,
  type OtpChallenge,
  type SessionUser,
  type ShareAccount,
  type SocietySettings,
  type SuretyCard,
} from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessCycle, businessNow, businessToday } from '../../common/utils/business-date';
import { notifyMember } from '../../common/utils/notify';
import { withTransaction, type Tx } from '../../db/transaction';
import type { LoanLite, LoansRepository } from './loans.repository';

export const LOAN_TEXT_VERSION = 'F2+F3-2026.1';
/** Plain-language versions of form F2 clause 12 and the F3 declaration (docs/16). */
const DECLARATION = {
  f2: 'I and my sureties authorise the Drawing & Disbursing Officer, and any future pay officer, to recover the instalments of this loan from our salaries as demanded by the society. If I am transferred, the new pay officer recovers as per the society’s demand. If I go on deputation, my sureties will tell the society my address.',
  f3: 'I authorise the pay disbursing officer to recover this salary loan from my salary.',
  version: LOAN_TEXT_VERSION,
};

export const OPEN: LoanStatus[] = ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'RETURNED', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED', 'ACTIVE'];
export const editable = (l: Loan) => l.status === 'DRAFT' || l.status === 'RETURNED';
const isStaff = (u: SessionUser) => u.role !== 'MEMBER' && u.role !== 'APPLICANT';

/** What one request needs to know, loaded once. */
export interface World {
  today: string;
  cycle: string;
  settings: SocietySettings;
  products: LoanProduct[];
  depts: Map<string, Department>;
  ddoNames: Map<string, string>;
  staffNames: Map<string, string>;
}

export interface Holdings {
  shares: ShareAccount | null;
  deposits: DepositAccount[];
}

/** The request a saved loan represents (re-assessed live on every read). */
export function inputOf(l: Loan): LoanRequestInput {
  return {
    product: l.product,
    amount: l.sanctionedAmount ?? l.appliedAmount,
    instalments: l.sanctionedInstalments ?? l.appliedInstalments,
    purpose: l.purpose,
    sureties: l.sureties.filter((s) => s.status !== 'REPLACED').map((s) => s.memberId),
    ...(l.pledgedDepositId ? { pledgedDepositId: l.pledgedDepositId } : {}),
    ...(l.parentLoanId ? { topupOf: l.parentLoanId } : {}),
    form: l.form ?? {},
  };
}

function cleanInput(raw: Partial<LoanRequestInput>): LoanRequestInput {
  return {
    product: (raw.product ?? 'ORDINARY') as LoanProductCode,
    amount: Math.round(Number(raw.amount ?? 0)),
    instalments: Math.round(Number(raw.instalments ?? 0)),
    purpose: String(raw.purpose ?? ''),
    sureties: Array.isArray(raw.sureties) ? raw.sureties.map(String) : [],
    ...(raw.pledgedDepositId ? { pledgedDepositId: String(raw.pledgedDepositId) } : {}),
    ...(raw.topupOf ? { topupOf: String(raw.topupOf) } : {}),
    form: raw.form ?? {},
  };
}

/**
 * Loans (docs/22 §5.5): ST-20 list, ST-21 paper application, ST-23 detail, MB-03…05 on the phone.
 * Every rule comes from @tgs/domain; the workflow after submission lives in LoanWorkflowService.
 */
export class LoansService {
  constructor(
    private readonly app: FastifyInstance,
    readonly repo: LoansRepository,
  ) {}

  // ---- shared building blocks (also used by the workflow) ----
  async world(): Promise<World> {
    const [today, cycle, settings, products, depts, ddoNames, staff] = await Promise.all([
      businessToday(this.app),
      businessCycle(this.app),
      this.app.masters.settings(),
      this.app.masters.loanProducts(),
      this.app.departments.all(),
      this.app.departments.ddoLoginNames(),
      this.repo.staffNames(),
    ]);
    return { today, cycle, settings, products, depts: new Map(depts.map((d) => [d.id, d])), ddoNames, staffNames: staff };
  }

  productOf(w: World, code: LoanProductCode): LoanProduct {
    return w.products.find((p) => p.code === code) ?? fail('VALIDATION_ERROR', 'Unknown loan type.', { fieldErrors: { product: 'Choose a loan type' } });
  }

  /** TODO(P6/P7): deposits and share accounts move to the backend; until then from the mock. */
  async holdings(memberId: string): Promise<Holdings> {
    const bridge = this.app.mockBridge;
    if (!bridge) return { shares: null, deposits: [] };
    return bridge.getPublic<Holdings>(`/api/v1/__demo/legacy/holdings/${encodeURIComponent(memberId)}`).catch(() => ({ shares: null, deposits: [] }));
  }

  async member(id: string): Promise<Member> {
    return (await this.app.members.byId(id)) ?? fail('NOT_FOUND', 'Member not found.');
  }

  async context(w: World, m: Member, mine?: Loan[]): Promise<LoanContext> {
    const [own, holdings, mandate] = await Promise.all([mine ?? this.repo.forMember(m.id), this.holdings(m.id), this.app.members.mandateOf(m.id)]);
    const leftover = calculateLeftoverService(m.dor, w.today);
    const running = (code: LoanProductCode) => own.filter((l) => l.product === code && l.status === 'ACTIVE');
    const s = holdings.shares;
    return {
      member: { id: m.id, name: m.name, generalNo: m.generalNo, departmentName: w.depts.get(m.departmentId)?.name ?? m.departmentId, designation: m.designation, dob: m.dob, dor: m.dor, doj: m.doj, leftoverMonths: leftover.months, leftoverLabel: leftover.label, status: m.status, ...(mandate ? { mandateStatus: mandate.status } : {}) },
      products: w.products,
      activeProducts: own.filter((l) => OPEN.includes(l.status)).map((l) => l.product),
      pay: m.payProfile,
      shares: { numberOfShares: s?.numberOfShares ?? m.numberOfShares, shareCapital: s?.shareCapital ?? 0, shareDepositBalance: s?.shareDepositBalance ?? 0 },
      ordinaryLoanDues: running('ORDINARY').reduce((t, l) => t + (l.emi ?? 0), 0),
      balances: { ordinary: running('ORDINARY').reduce((t, l) => t + l.outstandingPrincipal, 0), salary: running('SALARY').reduce((t, l) => t + l.outstandingPrincipal, 0) },
      pledgeableDeposits: holdings.deposits.filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && !d.pledgedToLoanId).map((d) => ({ id: d.id, accountNo: d.accountNo, principal: d.principal ?? d.balance, ...(d.maturityDate ? { maturityDate: d.maturityDate } : {}) })),
      topupCandidates: own
        .filter((l) => l.status === 'ACTIVE' && w.products.find((p) => p.code === l.product)?.topupAllowed && !own.some((x) => x.parentLoanId === l.id && OPEN.includes(x.status)))
        .map((l) => ({ id: l.id, loanNo: l.loanNo ?? l.applicationNo, product: l.product, outstanding: l.outstandingPrincipal, emi: l.emi ?? 0, ...(l.disbursedOn ? { disbursedOn: l.disbursedOn } : {}) })),
      settings: { emiToNetSalaryMaxPercent: w.settings.emiToNetSalaryMaxPercent, maxGuaranteesPerSurety: w.settings.maxGuaranteesPerSurety, shareValue: w.settings.shareValue },
      firstDueCycle: firstDueCycle(w.today),
      declaration: DECLARATION,
    };
  }

  /** Loans each member stands surety on that still carry risk (BR-014). */
  private guaranteesOf(open: LoanLite[], memberId: string, exceptLoanId?: string): LoanLite[] {
    return open.filter((l) => l.id !== exceptLoanId && l.sureties.some((s) => s.memberId === memberId && (s.status === 'PENDING' || s.status === 'ACCEPTED')));
  }

  async suretyCards(w: World, loan: Pick<Loan, 'id' | 'memberId' | 'sureties'> & { instalments: number }, ids: string[]): Promise<SuretyCard[]> {
    if (!ids.length) return [];
    const open = await this.repo.lite(w.cycle, { statuses: OPEN });
    const last = lastInstalmentCycle(firstDueCycle(w.today), loan.instalments);
    const cards: SuretyCard[] = [];
    for (const id of ids) {
      const s = await this.app.members.byId(id);
      if (!s) continue;
      const record = loan.sureties.find((x) => x.memberId === id);
      const guarantees = this.guaranteesOf(open, id, loan.id);
      const borrowers = await Promise.all(guarantees.map((g) => this.app.members.byId(g.memberId)));
      cards.push({
        memberId: s.id,
        name: s.name,
        generalNo: s.generalNo,
        departmentName: w.depts.get(s.departmentId)?.name ?? s.departmentId,
        designation: s.designation,
        dob: s.dob,
        dor: s.dor,
        leftoverLabel: calculateLeftoverService(s.dor, w.today).label,
        substantivePay: s.payProfile.substantivePay,
        numberOfShares: s.numberOfShares,
        guarantees: guarantees.map((g, i) => ({ applicationNo: g.loanNo ?? g.applicationNo, borrower: borrowers[i]?.name ?? '', generalNo: borrowers[i]?.generalNo ?? '', product: w.products.find((p) => p.code === g.product)?.name ?? g.product, outstanding: g.outstandingPrincipal })),
        ...(record ? { status: record.status, ...(record.respondedAt ? { respondedAt: record.respondedAt } : {}), ...(record.declineReason ? { declineReason: record.declineReason } : {}) } : {}),
        checks: checkSuretyEligibility({ suretyMemberId: s.id, borrowerMemberId: loan.memberId, suretyActive: s.status === 'ACTIVE', activeGuarantees: guarantees.length, maxGuarantees: w.settings.maxGuaranteesPerSurety, suretyDor: s.dor, lastInstalmentCycle: last }),
      });
    }
    return cards;
  }

  async assess(w: World, m: Member, input: LoanRequestInput, loanId?: string) {
    const mine = await this.repo.forMember(m.id);
    const ctx = await this.context(w, m, mine);
    const product = this.productOf(w, input.product);
    const pay = input.form.pay ?? m.payProfile;
    const holdings = input.pledgedDepositId ? await this.holdings(m.id) : undefined;
    const pledged = holdings?.deposits.find((d) => d.id === input.pledgedDepositId);
    const others = mine.filter((l) => l.id !== loanId && OPEN.includes(l.status)).map((l) => l.product);
    const parent = input.topupOf ? await this.repo.find(input.topupOf) : undefined;
    const a = assessLoanApplication({
      product,
      amount: input.amount,
      instalments: input.instalments,
      leftoverMonths: ctx.member.leftoverMonths,
      activeProducts: others,
      grossSalary: pay.grossSalary,
      govtLoanDeductions: pay.govtLoanDeductions,
      otherLoanDeductions: pay.otherLoanDeductions,
      existingShareDeposit: ctx.shares.shareDepositBalance,
      emiToNetSalaryMaxPercent: ctx.settings.emiToNetSalaryMaxPercent,
      ...(pledged ? { pledgedDepositPrincipal: pledged.principal ?? pledged.balance } : {}),
      isTopup: Boolean(input.topupOf),
    });
    const checks: RuleCheck[] = [...a.checks];
    // J-07 top-up: settle the running loan (BR-007) and net the share deposit (BR-004).
    let topup: LoanDetail['preview']['topup'];
    let netDisbursable = a.netDisbursable;
    if (input.topupOf) {
      if (!parent) checks.push({ ruleId: 'BR-007', pass: false, message: 'The loan to top up was not found.', severity: 'block' });
      else {
        checks.push(checkTopupEligibility(parent, product, m.id));
        const sheet = buildSanctionSheet({
          amount: input.amount,
          instalments: Math.max(1, input.instalments),
          product,
          firstDueCycle: ctx.firstDueCycle,
          existingShareDeposit: ctx.shares.shareDepositBalance,
          today: w.today,
          topup: { loanId: parent.id, loanNo: parent.loanNo ?? parent.applicationNo, outstandingPrincipal: parent.outstandingPrincipal, ratePercent: parent.ratePercent, lastInterestChargedOn: lastInterestChargedOn(parent, w.today) },
          balances: { ordinary: 0, salary: 0 },
        });
        topup = { loanNo: sheet.topup!.loanNo, outstandingPrincipal: sheet.topup!.outstandingPrincipal, accruedInterest: sheet.topup!.accruedInterest, settlement: sheet.topup!.settlement };
        netDisbursable = sheet.netDisbursable;
        if (sheet.netDisbursable <= 0) checks.push({ ruleId: 'BR-007', pass: false, message: `The new amount must be more than the settlement of ${formatINR(sheet.topup!.settlement)} plus the share deposit.`, severity: 'block' });
      }
    }
    if (m.status !== 'ACTIVE') checks.unshift({ ruleId: 'BR-013', pass: false, message: 'Only active members can apply for a loan.', severity: 'block' });
    if (product.code === 'SALARY' && input.form.salary) checks.push(...checkSalaryLoan(input.amount, input.form.salary, ctx.ordinaryLoanDues).checks);
    if (ctx.member.mandateStatus === 'PENDING_NEW_DDO') checks.push({ ruleId: 'BR-028', pass: false, message: 'Your new DDO has not agreed the salary recovery mandate yet. The office may hold the loan until they do.', severity: 'warn' });
    const cards = await this.suretyCards(w, { id: loanId ?? '', memberId: m.id, sureties: [], instalments: input.instalments }, input.sureties);
    for (const c of cards) for (const k of c.checks.filter((x) => !x.pass)) checks.push({ ...k, message: `${c.name}: ${k.message}` });
    return {
      product,
      ctx,
      checks,
      cards,
      eligible: checks.every((c) => c.pass || c.severity === 'warn'),
      preview: { emi: a.emi.firstInstalment, lastInstalment: a.emi.lastInstalment, totalInterest: a.emi.totalInterest, shareDeduction: a.shareDeduction, netDisbursable, maxInstalments: a.maxInstalments, netSalary: a.netSalary, ...(topup ? { topup } : {}) },
    };
  }

  // ---- read models ----
  waitingOn(w: World, l: Pick<Loan, 'status' | 'sureties'>, m: Member | undefined, names: (id: string) => string | undefined): string | undefined {
    if (l.status === 'SURETY_PENDING') {
      const pending = l.sureties.filter((s) => s.status === 'PENDING' || s.status === 'DECLINED').map((s) => names(s.memberId)).filter(Boolean);
      return pending.length ? `Sureties: ${pending.join(', ')}` : 'Sureties';
    }
    if (l.status === 'RETURNED') return `${m?.name ?? 'Member'} (correction)`;
    const role = LOAN_STAGE_OWNER[l.status];
    if (!role) return undefined;
    if (role === 'DDO') {
      const dept = m ? w.depts.get(m.departmentId) : undefined;
      return `${(m && w.ddoNames.get(m.departmentId)) ?? dept?.ddoName ?? 'DDO'} (DDO, ${dept?.name ?? ''})`;
    }
    const name = w.staffNames.get(role);
    return name ? `${name} (${ROLE_LABELS[role as ConsoleRole]})` : ROLE_LABELS[role as ConsoleRole];
  }

  private toRow(w: World, l: LoanLite, members: Map<string, Member>): LoanRow {
    const m = members.get(l.memberId);
    const waitingOn = this.waitingOn(w, l, m, (id) => members.get(id)?.name);
    return {
      id: l.id,
      applicationNo: l.applicationNo,
      ...(l.loanNo ? { loanNo: l.loanNo } : {}),
      memberId: l.memberId,
      memberName: m?.name ?? '',
      generalNo: m?.generalNo ?? '',
      departmentId: m?.departmentId ?? '',
      departmentName: w.depts.get(m?.departmentId ?? '')?.name ?? '',
      product: l.product,
      productName: w.products.find((p) => p.code === l.product)?.name ?? l.product,
      status: l.status,
      group: loanStatusGroup(l.status) as LoanStatusGroup,
      isTopup: Boolean(l.parentLoanId),
      appliedAmount: l.appliedAmount,
      ...(l.sanctionedAmount ? { sanctionedAmount: l.sanctionedAmount } : {}),
      instalments: l.appliedInstalments,
      ...(l.emi ? { emi: l.emi } : {}),
      outstanding: l.outstandingPrincipal,
      appliedOn: l.appliedOn,
      ...(l.nextDue ? { nextDue: l.nextDue } : {}),
      ...(waitingOn ? { waitingOn } : {}),
    };
  }

  async detail(w: World, l: Loan, user: SessionUser): Promise<LoanDetail> {
    const m = await this.member(l.memberId);
    const a = await this.assess(w, m, inputOf(l), l.id);
    const leftover = calculateLeftoverService(m.dor, w.today);
    const parent = l.parentLoanId ? await this.repo.find(l.parentLoanId) : undefined;
    const pledged = l.pledgedDepositId ? (await this.holdings(m.id)).deposits.find((d) => d.id === l.pledgedDepositId) : undefined;
    const suretyNames = new Map((await Promise.all(l.sureties.map((s) => this.app.members.byId(s.memberId)))).filter((x) => x).map((x) => [x!.id, x!.name]));
    const waitingOn = this.waitingOn(w, l, m, (id) => suretyNames.get(id));
    const staff = isStaff(user);
    const actions = staff ? loanActionsFor({ status: l.status, memberDepartmentId: m.departmentId }, { role: user.role, ...(user.departmentId ? { departmentId: user.departmentId } : {}) }) : [];
    // Demo: staff may complete a stage owned by someone else (a surety, another DDO, another officer).
    const owner = LOAN_STAGE_OWNER[l.status];
    const ownedBySomeoneElse = l.status === 'SURETY_PENDING' || (owner !== undefined && owner !== 'MEMBER');
    const demoActAs = staff && !actions.length && ownedBySomeoneElse && (await this.app.permissions.has(user.role, 'demo.control')) ? waitingOn : undefined;
    return {
      loan: l,
      member: { id: m.id, name: m.name, generalNo: m.generalNo, departmentId: m.departmentId, departmentName: w.depts.get(m.departmentId)?.name ?? '', designation: m.designation, dob: m.dob, dor: m.dor, leftover, mobileMasked: m.mobileMasked },
      product: a.product,
      sureties: await this.suretyCards(w, { id: l.id, memberId: l.memberId, sureties: l.sureties, instalments: l.appliedInstalments }, l.sureties.filter((s) => s.status !== 'REPLACED').map((s) => s.memberId)),
      // Finished loans keep their history; re-running today's eligibility on them would only confuse.
      checks: ['ACTIVE', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(l.status) ? [] : a.checks,
      preview: a.preview,
      stages: loanStages(a.product, l),
      ...(waitingOn ? { waitingOn } : {}),
      actions,
      ...(demoActAs ? { demoActAs } : {}),
      ...(parent ? { parentLoan: { id: parent.id, applicationNo: parent.applicationNo, ...(parent.loanNo ? { loanNo: parent.loanNo } : {}), outstanding: parent.outstandingPrincipal } } : {}),
      ...(pledged ? { pledgedDeposit: { id: pledged.id, accountNo: pledged.accountNo, principal: pledged.principal ?? pledged.balance } } : {}),
    };
  }

  /** Staff never see a member's unsubmitted draft; DDOs only see their department. */
  staffCanSee(l: Pick<Loan, 'status' | 'channel'>, m: Pick<Member, 'departmentId'> | undefined, user: SessionUser): boolean {
    if (l.status === 'DRAFT' && l.channel !== 'COUNTER') return false;
    return user.role !== 'DDO' || m?.departmentId === user.departmentId;
  }

  async requireStaffView(user: SessionUser): Promise<void> {
    if (!isStaff(user)) fail('FORBIDDEN', 'Staff only.');
    if (!(await this.app.permissions.has(user.role, 'loans.view'))) fail('FORBIDDEN', 'You do not have access to loans.');
  }

  /** A loan staff may open (404 for drafts and other departments). */
  async staffLoan(user: SessionUser, id: string, tx?: Tx): Promise<Loan> {
    await this.requireStaffView(user);
    const l = await this.repo.find(id, tx);
    if (!l || !this.staffCanSee(l, await this.app.members.byId(l.memberId), user)) return fail('NOT_FOUND', 'This loan does not exist or is outside your department.');
    return l;
  }

  memberIdOf(user: SessionUser): string {
    if (user.role !== 'MEMBER' || !user.memberId) fail('FORBIDDEN', 'Members only.');
    return user.memberId!;
  }

  async myLoan(user: SessionUser, id: string): Promise<Loan> {
    const l = await this.repo.find(id);
    if (!l || l.memberId !== this.memberIdOf(user)) return fail('NOT_FOUND', 'Loan not found.');
    return l;
  }

  // ---- ST-20 / ST-23 / ST-21 (staff) ----
  async list(user: SessionUser, q: { q?: string; product?: string; group?: string; departmentId?: string; page?: number; pageSize?: number }): Promise<LoanList> {
    await this.requireStaffView(user);
    const [w, lite, all] = await Promise.all([this.world(), this.repo.lite(await businessCycle(this.app)), this.app.members.all()]);
    const members = new Map(all.map((m) => [m.id, m]));
    const scoped = lite.filter((l) => this.staffCanSee(l as Pick<Loan, 'status' | 'channel'>, members.get(l.memberId), user)).map((l) => this.toRow(w, l, members));
    const text = (q.q ?? '').trim().toLowerCase();
    const byProductFilter = (r: LoanRow) => !q.product || (q.product === 'TOPUP' ? r.isTopup : r.product === q.product);
    const rows = scoped
      .filter((r) => byProductFilter(r) && (!q.group || r.group === q.group) && (!q.departmentId || r.departmentId === q.departmentId) && (!text || r.memberName.toLowerCase().includes(text) || r.generalNo.includes(text) || r.applicationNo.toLowerCase().includes(text) || (r.loanNo ?? '').toLowerCase().includes(text)))
      .sort((a, b) => b.appliedOn.localeCompare(a.appliedOn) || b.applicationNo.localeCompare(a.applicationNo));
    const byProduct: LoanList['counts']['byProduct'] = { ALL: scoped.length, TOPUP: scoped.filter((r) => r.isTopup).length };
    for (const r of scoped) byProduct[r.product] = (byProduct[r.product] ?? 0) + 1;
    const byGroup: LoanList['counts']['byGroup'] = {};
    for (const r of scoped.filter(byProductFilter)) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
    const page = Math.max(1, q.page ?? 1);
    const dept = user.role === 'DDO' && user.departmentId ? w.depts.get(user.departmentId) : undefined;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
      counts: { byProduct, byGroup },
      scope: dept ? { departmentId: dept.id, departmentName: dept.name } : {},
      canCreate: await this.app.permissions.has(user.role, 'loans.create'),
    };
  }

  async getForStaff(user: SessionUser, id: string): Promise<LoanDetail> {
    const l = await this.staffLoan(user, id);
    return this.detail(await this.world(), l, user);
  }

  async contextForStaff(user: SessionUser, memberId: string): Promise<LoanContext> {
    await this.requireStaffView(user);
    const m = await this.app.members.byId(memberId);
    if (!m || (user.role === 'DDO' && m.departmentId !== user.departmentId)) return fail('NOT_FOUND', 'Member not found.');
    return this.context(await this.world(), m);
  }

  /** ST-21: the office enters a signed paper application (no OTP; the paper carries the signature). */
  async createCounter(request: FastifyRequest, body: Partial<LoanRequestInput> & { memberId?: string; submit?: boolean }): Promise<LoanDetail> {
    const user = sessionOf(request);
    if (!(await this.app.permissions.has(user.role, 'loans.create'))) fail('FORBIDDEN', 'Only the Super Admin and the Accountant enter applications on behalf of members.');
    const m = (body.memberId && (await this.app.members.byId(body.memberId))) || fail('VALIDATION_ERROR', 'Choose the member.', { fieldErrors: { memberId: 'Choose the member' } });
    const w = await this.world();
    const input = cleanInput(body);
    // Draft and submit in one transaction: a failed submit leaves nothing behind.
    const loan = await withTransaction(this.app.db, async (tx) => {
      const l = await this.newDraft(tx, w, m, input, 'COUNTER', user.name);
      if (body.submit) await this.submitChecked(tx, w, l, { id: user.id, name: user.name, role: user.role }, false);
      await this.app.audit.record(request, { action: body.submit ? 'submit' : 'draft', entity: 'loan', entityId: l.id, summary: `${body.submit ? 'Submitted' : 'Saved draft'} ${l.applicationNo} for ${m.name} (${formatINR(l.appliedAmount)})` }, tx);
      return l;
    });
    await this.afterSubmit(w, loan, m, body.submit === true);
    return this.detail(w, loan, user);
  }

  // ---- MB-03 … MB-05 (member) ----
  async mine(user: SessionUser): Promise<LoanRow[]> {
    const memberId = this.memberIdOf(user);
    const [w, lite, m] = await Promise.all([this.world(), this.repo.lite(await businessCycle(this.app), { memberId }), this.member(memberId)]);
    const sureties = new Set(lite.flatMap((l) => l.sureties.map((s) => s.memberId)));
    const members = new Map<string, Member>([[m.id, m]]);
    for (const id of sureties) {
      const s = await this.app.members.byId(id);
      if (s) members.set(id, s);
    }
    return lite.map((l) => this.toRow(w, l, members)).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
  }

  async myContext(user: SessionUser): Promise<LoanContext> {
    return this.context(await this.world(), await this.member(this.memberIdOf(user)));
  }

  async myDetail(user: SessionUser, id: string): Promise<LoanDetail> {
    return this.detail(await this.world(), await this.myLoan(user, id), user);
  }

  async createMine(request: FastifyRequest, body: Partial<LoanRequestInput>): Promise<LoanDetail> {
    const user = sessionOf(request);
    const m = await this.member(this.memberIdOf(user));
    const w = await this.world();
    const loan = await withTransaction(this.app.db, (tx) => this.newDraft(tx, w, m, cleanInput(body), 'APP', m.name));
    await this.sync([loan]);
    return this.detail(w, loan, user);
  }

  async updateMine(user: SessionUser, id: string, body: Partial<LoanRequestInput>): Promise<LoanDetail> {
    const mine = await this.myLoan(user, id);
    const w = await this.world();
    const input = cleanInput(body);
    const product = this.productOf(w, input.product);
    const loan = await withTransaction(this.app.db, async (tx) => {
      const l = (await this.repo.lock(tx, mine.id))!;
      if (!editable(l)) fail('INVALID_TRANSITION', 'This application has been submitted and can no longer be edited.');
      const next = await this.applyInput(w, l, input, product);
      await this.repo.save(tx, next);
      return next;
    });
    await this.sync([loan]);
    return this.detail(w, loan, user);
  }

  async discardMine(user: SessionUser, id: string): Promise<{ ok: true }> {
    const mine = await this.myLoan(user, id);
    await withTransaction(this.app.db, async (tx) => {
      const l = (await this.repo.lock(tx, mine.id))!;
      if (l.status !== 'DRAFT') fail('INVALID_TRANSITION', 'Only drafts can be discarded. Withdraw a submitted application instead.');
      await this.repo.remove(tx, l.id);
    });
    await this.app.members.sync({ deleteLoans: [mine.id] });
    return { ok: true };
  }

  /** Sign with OTP (D-031): checks everything first, so the code is only sent for a valid application. */
  async requestSign(user: SessionUser, id: string): Promise<OtpChallenge> {
    const l = await this.myLoan(user, id);
    if (!editable(l)) fail('INVALID_TRANSITION', 'Already submitted.');
    const w = await this.world();
    const m = await this.member(l.memberId);
    await this.checkSubmittable(w, l, m);
    return this.app.appAccounts.startCode(m.mobile, 'SIGN', l.id);
  }

  async submitMine(request: FastifyRequest, id: string, body: { otpRef?: string; otp?: string }): Promise<LoanDetail> {
    const user = sessionOf(request);
    const mine = await this.myLoan(user, id);
    if (!editable(mine)) fail('INVALID_TRANSITION', 'Already submitted.');
    await this.app.appAccounts.verifyCode('SIGN', mine.id, body.otpRef ?? '', body.otp ?? '');
    const w = await this.world();
    const m = await this.member(mine.memberId);
    const loan = await withTransaction(this.app.db, async (tx) => {
      const l = (await this.repo.lock(tx, mine.id))!;
      if (!editable(l)) fail('INVALID_TRANSITION', 'Already submitted.');
      await this.submitChecked(tx, w, l, { id: user.id, name: user.name, role: 'MEMBER' }, true);
      await this.app.audit.record(request, { action: 'submit', entity: 'loan', entityId: l.id, summary: `${user.name} applied for ${l.applicationNo} (${formatINR(l.appliedAmount)}) in the app` }, tx);
      return l;
    });
    await this.afterSubmit(w, loan, m, true);
    return this.detail(w, loan, user);
  }

  /** Live eligibility for an unsaved form (phone and console preview; the server repeats it on submit). */
  async assessForm(user: SessionUser, body: Partial<LoanRequestInput> & { memberId?: string; loanId?: string }) {
    let memberId: string;
    if (user.role === 'MEMBER') memberId = this.memberIdOf(user);
    else {
      await this.requireStaffView(user);
      memberId = body.memberId ?? '';
    }
    const m = await this.member(memberId);
    const input = cleanInput(body);
    const w = await this.world();
    const a = await this.assess(w, m, input, body.loanId);
    return { checks: a.checks, eligible: a.eligible, preview: a.preview, sureties: a.cards, fieldErrors: validateLoanRequest(input, a.product, m.id) };
  }

  /** Live surety cards for a form (BR-014 / BR-024 / item 10), before anything is saved. */
  async suretyPreview(user: SessionUser, body: { borrowerId?: string; sureties?: string[]; instalments?: number }): Promise<SuretyCard[]> {
    let borrowerId: string;
    if (user.role === 'MEMBER') borrowerId = this.memberIdOf(user);
    else {
      await this.requireStaffView(user);
      borrowerId = body.borrowerId ?? '';
    }
    return this.suretyCards(await this.world(), { id: '', memberId: borrowerId, sureties: [], instalments: Math.max(1, Number(body.instalments ?? 12)) }, (body.sureties ?? []).slice(0, 4));
  }

  /** ST-21 member picker and the surety picker (members first who can still stand surety). */
  async search(user: SessionUser, query: string): Promise<MemberPick[]> {
    if (user.role !== 'MEMBER') await this.requireStaffView(user);
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const [w, all] = await Promise.all([this.world(), this.app.members.all()]);
    const open = await this.repo.lite(w.cycle, { statuses: OPEN });
    const max = w.settings.maxGuaranteesPerSurety;
    return all
      .filter((m) => m.status === 'ACTIVE' && m.id !== user.memberId && (m.name.toLowerCase().includes(q) || m.generalNo.startsWith(q)) && (user.role !== 'DDO' || m.departmentId === user.departmentId))
      .map((m) => ({ id: m.id, name: m.name, generalNo: m.generalNo, departmentName: w.depts.get(m.departmentId)?.name ?? '', designation: m.designation, leftoverLabel: calculateLeftoverService(m.dor, w.today).label, activeGuarantees: this.guaranteesOf(open, m.id).length }))
      .sort((a, b) => Number(a.activeGuarantees >= max) - Number(b.activeGuarantees >= max) || a.name.localeCompare(b.name))
      .slice(0, 12);
  }

  // ---- writes ----
  private async newDraft(tx: Tx, w: World, m: Member, input: LoanRequestInput, channel: 'APP' | 'COUNTER', byName: string): Promise<Loan> {
    const product = this.productOf(w, input.product);
    const draft: Loan = {
      id: `loan-${randomUUID().slice(0, 8)}`,
      applicationNo: await this.repo.nextNumber(tx, 'application', w.today.slice(0, 4)),
      memberId: m.id,
      product: input.product,
      status: 'DRAFT',
      appliedAmount: 0,
      appliedInstalments: 0,
      purpose: '',
      ratePercent: product.ratePercent,
      outstandingPrincipal: 0,
      sureties: [],
      schedule: [],
      events: [],
      appliedOn: w.today,
      channel,
      createdByName: byName,
    };
    const loan = await this.applyInput(w, draft, input, product);
    await this.repo.insert(tx, loan);
    return loan;
  }

  /** Writes the request onto a draft (sureties who stay keep their answer: a returned loan does not need them to sign again). */
  private async applyInput(w: World, loan: Loan, input: LoanRequestInput, product: LoanProduct): Promise<Loan> {
    const last = lastInstalmentCycle(firstDueCycle(w.today), input.instalments);
    const sureties = [];
    if (product.suretiesRequired > 0) {
      for (const id of input.sureties) {
        const kept = loan.sureties.find((s) => s.memberId === id && s.status === 'ACCEPTED');
        sureties.push(kept ?? { memberId: id, status: 'PENDING' as const, retiresDuringLoan: ((await this.app.members.byId(id))?.dor.slice(0, 7) ?? '9999') < last });
      }
    }
    const { parentLoanId: _p, pledgedDepositId: _d, ...rest } = loan;
    return {
      ...rest,
      product: input.product,
      appliedAmount: input.amount,
      appliedInstalments: input.instalments,
      purpose: input.purpose.trim(),
      ratePercent: product.ratePercent,
      form: input.form,
      sureties,
      ...(input.topupOf ? { parentLoanId: input.topupOf } : {}),
      ...(input.pledgedDepositId && product.code === 'DEPOSIT' ? { pledgedDepositId: input.pledgedDepositId } : {}),
    };
  }

  private async checkSubmittable(w: World, l: Loan, m: Member): Promise<boolean> {
    const input = inputOf(l);
    const product = this.productOf(w, l.product);
    const fieldErrors = validateLoanRequest(input, product, m.id);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Some details are missing.', { fieldErrors });
    const block = (await this.assess(w, m, input, l.id)).checks.find((c) => !c.pass && c.severity === 'block');
    if (block) fail('RULE_VIOLATION', block.message, { ruleId: block.ruleId });
    return suretyProgress(l.sureties, product.suretiesRequired).allAccepted;
  }

  /** Full checks, then DRAFT → SURETY_PENDING / ACCOUNTANT_REVIEW (D-030). Mutates `l` and saves it in `tx`. */
  private async submitChecked(tx: Tx, w: World, l: Loan, actor: { id: string; name: string; role: string }, signed: boolean): Promise<void> {
    const m = await this.member(l.memberId);
    const allSuretiesAccepted = await this.checkSubmittable(w, l, m);
    const resubmit = l.status === 'RETURNED';
    const next = nextLoanStatus(l.status, resubmit ? 'resubmit' : 'submit', { product: this.productOf(w, l.product), allSuretiesAccepted });
    if (!next) return fail('INVALID_TRANSITION', 'This application cannot be submitted now.');
    const at = await businessNow(this.app);
    l.events = [...l.events, { at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action: resubmit ? 'resubmit' : 'submit', fromStatus: l.status, toStatus: next, ...(l.channel === 'COUNTER' && !resubmit ? { remarks: 'Entered by the office from the signed paper form' } : {}) }];
    l.status = next;
    l.submittedAt = at;
    if (!resubmit) l.appliedOn = w.today;
    delete l.returnInfo;
    if (signed) l.signature = { signedAt: at, textVersion: LOAN_TEXT_VERSION };
    await this.repo.save(tx, l);
  }

  /** After commit: reserve the FD, tell the sureties and the member, keep the mock in step. */
  private async afterSubmit(w: World, l: Loan, m: Member, submitted: boolean): Promise<void> {
    await this.sync([l]);
    if (!submitted) return;
    // Reserve the FD so it cannot be pledged twice (released if the loan is rejected or withdrawn).
    if (l.pledgedDepositId) await this.pledge(l.pledgedDepositId, l.id);
    const product = this.productOf(w, l.product);
    for (const s of l.sureties.filter((x) => x.status === 'PENDING')) await notifyMember(this.app, s.memberId, 'loan.surety', { borrower: m.name, product: product.name, amount: formatINR(l.appliedAmount) }, '/surety');
    if (l.events.at(-1)?.action === 'submit') await notifyMember(this.app, m.id, 'loan.submitted', { product: product.name, applicationNo: l.applicationNo, amount: formatINR(l.appliedAmount) }, `/loan/${l.id}`);
  }

  /** TODO(P6): FDs move to the backend; until then the mock holds the pledge. */
  async pledge(depositId: string, loanId: string | null): Promise<void> {
    await this.app.mockBridge?.send(undefined, 'POST', '/api/v1/__demo/legacy/pledge', { depositId, loanId }).catch((err) => this.app.log.warn({ err }, 'mock pledge failed'));
  }

  /** TODO(P7): the mock's work queue, dashboards, demand and collections read loans; keep them in step. */
  async sync(changed: Loan[]): Promise<void> {
    await this.app.members.sync({ loans: changed });
  }

  /** Reverse sync until P7: loans the mock's collections changed (outstanding, schedule, closure). */
  async pullFromMock(): Promise<number> {
    const bridge = this.app.mockBridge;
    if (!bridge) return 0;
    const { loans } = await bridge.getPublic<{ loans: Loan[] }>('/api/v1/__demo/legacy/dirty-loans');
    if (!loans.length) return 0;
    await withTransaction(this.app.db, async (tx) => {
      const known = new Set((await this.repo.byIds(loans.map((l) => l.id), tx)).map((l) => l.id));
      for (const l of loans) await (known.has(l.id) ? this.repo.save(tx, l) : this.repo.insert(tx, l));
    });
    return loans.length;
  }
}
