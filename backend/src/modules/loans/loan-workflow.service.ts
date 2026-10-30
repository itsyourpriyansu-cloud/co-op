import {
  addMonths,
  buildSanctionSheet,
  calculateLeftoverService,
  checkTenureEligibility,
  formatCycle,
  formatINR,
  generateSchedule,
  lastInterestChargedOn,
  LOAN_STAGE_OWNER,
  loanActionsFor,
  nextLoanStatus,
  PRIMARY_LOAN_ACTION,
  suretyProgress,
  toCycle,
  validateSanctionAdjustment,
  type JournalLineInput,
  type LoanAction,
} from '@tgs/domain';
import type { ConsoleRole, Loan, LoanActionInput, LoanDetail, Member, OtpChallenge, Role, SanctionPreview, SessionUser, SuretyRequest, SuretyRequests } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessNow } from '../../common/utils/business-date';
import { notifyMember } from '../../common/utils/notify';
import { withTransaction, type Tx } from '../../db/transaction';
import { ACCOUNT, LOAN_ACCOUNT } from '../ledger/ledger.accounts';
import { inputOf, type LoansService, type World } from './loans.service';

const SURETY_DECLARATION =
  'I agree to stand surety for this loan. If the borrower does not repay, I authorise the Drawing & Disbursing Officer, and any future pay officer, to recover the dues from my salary as demanded by the society (form F2, item 12).';
const INTEREST_INCOME = '4100';

interface Actor {
  id: string;
  name: string;
  role: Role;
  departmentId?: string;
}

/** Demo defaults for each stage, so "Act as …" can push a loan along in one click. */
function demoInput(action: LoanAction, today: string): LoanActionInput {
  switch (action) {
    case 'forward':
      return { checklist: { memberVerified: true, documentsVerified: true }, remarks: 'Documents verified. Forwarded.' };
    case 'ddoCertify':
      return { recoveryFeasible: true, remarks: 'Particulars 1–5 verified with the service register.' };
    case 'sendForSanction':
      return { remarks: 'Assessed as per rules.' };
    case 'disburse':
      return { disbursement: { mode: 'NEFT', reference: `UTR${Date.now().toString().slice(-9)}`, date: today } };
    default:
      return {};
  }
}

/**
 * Loan workflow (J-02…J-08): staff stages ST-24…ST-28, surety signing (MB-07), withdraw and
 * replace surety (MB-04), demo "act as". Every transition goes through `apply`, so console, phone
 * and demo controls write the same events, sign-offs and notifications. Disbursement posts to the
 * ledger in the same transaction.
 */
export class LoanWorkflowService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly loans: LoansService,
  ) {}

  private get repo() {
    return this.loans.repo;
  }

  /** ST-26 sheet for an amount / tenure (defaults: what was applied). */
  async sanctionPreview(w: World, l: Loan, amount?: number, instalments?: number): Promise<SanctionPreview> {
    const m = await this.loans.member(l.memberId);
    const product = this.loans.productOf(w, l.product);
    const [own, holdings] = await Promise.all([this.repo.forMember(m.id), this.loans.holdings(m.id)]);
    const amt = amount ?? l.sanctionedAmount ?? l.appliedAmount;
    const inst = instalments ?? l.sanctionedInstalments ?? l.appliedInstalments;
    const maxInstalments = checkTenureEligibility(calculateLeftoverService(m.dor, w.today).months, inst, product.maxInstalments).maxAllowed;
    const parent = l.parentLoanId ? await this.repo.find(l.parentLoanId) : undefined;
    const ordinary = own.filter((x) => x.status === 'ACTIVE' && x.product === 'ORDINARY' && x.id !== parent?.id);
    const salary = own.filter((x) => x.status === 'ACTIVE' && x.product === 'SALARY');
    const sheet = buildSanctionSheet({
      amount: amt,
      instalments: Math.max(1, inst),
      product,
      firstDueCycle: (await this.loans.context(w, m, own)).firstDueCycle,
      existingShareDeposit: holdings.shares?.shareDepositBalance ?? 0,
      today: w.today,
      ...(parent ? { topup: { loanId: parent.id, loanNo: parent.loanNo ?? parent.applicationNo, outstandingPrincipal: parent.outstandingPrincipal, ratePercent: parent.ratePercent, lastInterestChargedOn: lastInterestChargedOn(parent, w.today) } } : {}),
      balances: {
        ordinary: ordinary.reduce((s, x) => s + x.outstandingPrincipal, 0),
        salary: salary.reduce((s, x) => s + x.outstandingPrincipal, 0),
        ...(ordinary[0]?.disbursedOn ? { ordinaryTakenOn: ordinary[0].disbursedOn } : {}),
        ...(salary[0]?.disbursedOn ? { salaryTakenOn: salary[0].disbursedOn } : {}),
      },
    });
    return { sheet, maxInstalments, fieldErrors: validateSanctionAdjustment(amt, inst, { amount: l.appliedAmount, instalments: l.appliedInstalments }, maxInstalments) };
  }

  async preview(user: SessionUser, id: string, amount?: number, instalments?: number): Promise<SanctionPreview> {
    const l = await this.loans.staffLoan(user, id);
    return this.sanctionPreview(await this.loans.world(), l, amount, instalments);
  }

  async act(request: FastifyRequest, id: string, action: LoanAction, input: LoanActionInput): Promise<LoanDetail> {
    const user = sessionOf(request);
    await this.loans.staffLoan(user, id);
    const actor: Actor = { id: user.id, name: user.name, role: user.role, ...(user.departmentId ? { departmentId: user.departmentId } : {}) };
    const w = await this.loans.world();
    const l = await this.apply(request, w, id, action, actor, input);
    return this.loans.detail(w, l, user);
  }

  /** Demo: complete the current stage as its owner (sureties, another department's DDO, …). */
  async demoAct(request: FastifyRequest, id: string): Promise<LoanDetail> {
    const user = sessionOf(request);
    if (!(await this.app.permissions.has(user.role, 'demo.control'))) fail('FORBIDDEN', 'Demo controls are off for this user.');
    let l = await this.loans.staffLoan(user, id);
    const w = await this.loans.world();
    if (l.status === 'SURETY_PENDING') {
      for (const s of l.sureties.filter((x) => x.status === 'PENDING')) l = await this.respond(request, w, l.id, s.memberId, true);
      if (l.status === 'SURETY_PENDING') fail('INVALID_TRANSITION', 'A surety declined. The member must choose another one in the app.');
    } else {
      const action = PRIMARY_LOAN_ACTION[l.status];
      const owner = await this.stageOwner(w, l);
      if (!action || !owner) return fail('INVALID_TRANSITION', `Nothing to do at "${l.status}".`);
      l = await this.apply(request, w, l.id, action, owner, demoInput(action, w.today), { demo: true });
    }
    return this.loans.detail(w, l, user);
  }

  private async stageOwner(w: World, l: Loan): Promise<Actor | undefined> {
    const role = LOAN_STAGE_OWNER[l.status];
    if (!role || role === 'MEMBER') return undefined;
    if (role === 'DDO') {
      const m = await this.app.members.byId(l.memberId);
      const dept = m ? w.depts.get(m.departmentId) : undefined;
      const loginId = m ? await this.app.departments.ddoLogin(m.departmentId) : undefined;
      return loginId ? { id: loginId, name: w.ddoNames.get(m!.departmentId) ?? 'DDO', role: 'DDO', departmentId: m!.departmentId } : { id: `ddo-${dept?.id}`, name: dept?.ddoName ?? 'DDO', role: 'DDO', ...(dept ? { departmentId: dept.id } : {}) };
    }
    const staff = await this.repo.staffByRole(role as ConsoleRole);
    return staff ? { ...staff, role } : undefined;
  }

  /** One transition with its side effects, in one transaction. `demo` lets a demo user act as the stage owner. */
  private async apply(request: FastifyRequest, w: World, id: string, action: LoanAction, actor: Actor, input: LoanActionInput, opts: { demo?: boolean } = {}): Promise<Loan> {
    const at = await businessNow(this.app);
    const notes: Array<[string, string, Record<string, string>, string]> = [];
    const changed: Loan[] = [];
    let pledgeRelease: string | undefined;
    let shareDeposit: number | undefined;
    let certified: Member | undefined;
    const saved = await withTransaction(this.app.db, async (tx) => {
      const l = (await this.repo.lock(tx, id)) ?? fail('NOT_FOUND', 'Loan not found.');
      const product = this.loans.productOf(w, l.product);
      const m = await this.loans.member(l.memberId);
      if (!opts.demo) {
        const allowed = loanActionsFor({ status: l.status, memberDepartmentId: m.departmentId }, { role: actor.role, ...(actor.departmentId ? { departmentId: actor.departmentId } : {}) });
        if (!allowed.includes(action)) fail(allowed.length ? 'FORBIDDEN' : 'INVALID_TRANSITION', allowed.length ? 'That action is not yours at this stage.' : `Nothing for you to do at "${l.status}".`);
      }
      const next = nextLoanStatus(l.status, action, { product, allSuretiesAccepted: suretyProgress(l.sureties, product.suretiesRequired).allAccepted });
      if (!next) return fail('INVALID_TRANSITION', `"${action}" is not possible at "${l.status}".`);
      const remarks = input.remarks?.trim();
      const signOff = { byId: actor.id, byName: actor.name, role: actor.role, at, ...(remarks ? { remarks } : {}) };
      const needReason = () => {
        if (!remarks) fail('VALIDATION_ERROR', 'Give a reason. The member sees it.', { fieldErrors: { remarks: 'Required' } });
      };
      l.signOffs ??= {};

      switch (action) {
        case 'forward': {
          if (!input.checklist?.memberVerified || !input.checklist.documentsVerified) fail('VALIDATION_ERROR', 'Tick every item on the checklist.', { fieldErrors: { checklist: 'Confirm member details and documents' } });
          const block = (await this.loans.assess(w, m, inputOf(l), l.id)).checks.find((c) => !c.pass && c.severity === 'block');
          if (block) fail('RULE_VIOLATION', block.message, { ruleId: block.ruleId });
          l.signOffs.review = signOff;
          break;
        }
        case 'returnToMember':
          needReason();
          l.returnInfo = { byName: actor.name, role: actor.role, at, reason: remarks! };
          notes.push([m.id, 'loan.returned', { applicationNo: l.applicationNo, reason: remarks! }, `/loan/${l.id}`]);
          break;
        case 'reject':
          needReason();
          l.rejection = signOff;
          pledgeRelease = l.pledgedDepositId;
          notes.push([m.id, 'loan.rejected', { applicationNo: l.applicationNo, reason: remarks! }, `/loan/${l.id}`]);
          break;
        case 'ddoCertify':
          if (input.recoveryFeasible !== true) fail('VALIDATION_ERROR', 'Confirm that the loan can be recovered from salary, or return the application.', { fieldErrors: { recoveryFeasible: 'Required' } });
          l.signOffs.ddo = { ...signOff, recoveryFeasible: true };
          // The DDO's certificate refreshes the member's pay profile (F2 items 4–5).
          if (l.form?.pay) {
            const p = l.form.pay;
            certified = await this.app.members.certifyPay(tx, m.id, { scaleOfPay: p.scaleOfPay, grossSalary: p.grossSalary, govtLoanDeductions: p.govtLoanDeductions, otherLoanDeductions: p.otherLoanDeductions }, w.today);
          }
          break;
        case 'ddoRecordManual': {
          const x = input.manual;
          if (!x?.ddoName?.trim() || !x.designation?.trim() || !x.date || !x.reference?.trim()) fail('VALIDATION_ERROR', 'Enter the DDO name, designation, date and letter reference.', { fieldErrors: { manual: 'All fields are required' } });
          l.signOffs.ddo = { ...signOff, recoveryFeasible: true, manual: { ddoName: x!.ddoName.trim(), designation: x!.designation.trim(), date: x!.date, reference: x!.reference.trim() } };
          break;
        }
        case 'sendForSanction': {
          const p = await this.sanctionPreview(w, l, input.amount, input.instalments);
          if (Object.keys(p.fieldErrors).length) fail('VALIDATION_ERROR', 'Check the amount and instalments.', { fieldErrors: p.fieldErrors });
          if (p.sheet.netDisbursable <= 0) fail('RULE_VIOLATION', 'Nothing would be paid out: the deductions exceed the amount.', { ruleId: 'BR-007' });
          Object.assign(l, {
            sanctionSheet: p.sheet,
            sanctionedAmount: p.sheet.amount,
            sanctionedInstalments: p.sheet.instalments,
            emi: p.sheet.emi,
            shareDepositDeduction: p.sheet.shareDeduction,
            netDisbursable: p.sheet.netDisbursable,
            ...(p.sheet.topup ? { topupSettlement: p.sheet.topup.settlement } : {}),
          });
          l.signOffs.assessment = signOff;
          delete l.signOffs.secretary;
          delete l.signOffs.president;
          break;
        }
        case 'secretarySign':
          l.signOffs.secretary = signOff;
          break;
        case 'presidentSign':
          // SOD-1 (D-027): two different people sign.
          if (l.signOffs.secretary?.byId === actor.id) fail('FORBIDDEN', 'The President cannot be the same person as the Secretary (SOD-1).');
          l.signOffs.president = signOff;
          l.sanctionLetterNo = await this.repo.nextNumber(tx, 'sanction', w.today.slice(0, 4));
          notes.push([m.id, 'loan.sanctioned', { product: product.name, amount: formatINR(l.sanctionedAmount ?? l.appliedAmount), emi: formatINR(l.emi ?? 0), firstCycle: formatCycle(l.sanctionSheet?.firstDueCycle ?? w.cycle) }, `/loan/${l.id}`]);
          break;
        case 'sendBack':
          needReason();
          delete l.signOffs.secretary;
          delete l.signOffs.assessment;
          break;
        case 'disburse': {
          const d = input.disbursement;
          const fieldErrors: Record<string, string> = {};
          if (!d?.mode) fieldErrors.mode = 'Choose how it is paid';
          if (!d?.reference?.trim()) fieldErrors.reference = 'Enter the UTR / cheque / transfer reference';
          if (!d?.date || d.date > w.today) fieldErrors.date = 'Enter the payment date (today or earlier)';
          if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Check the payment details.', { fieldErrors });
          const amount = l.sanctionedAmount ?? l.appliedAmount;
          const instalments = l.sanctionedInstalments ?? l.appliedInstalments;
          const firstDue = toCycle(addMonths(`${toCycle(d!.date)}-01`, 1));
          l.loanNo = await this.repo.nextNumber(tx, 'loan', d!.date.slice(0, 4));
          l.disbursedOn = d!.date;
          l.schedule = generateSchedule(amount, l.ratePercent, instalments, product.emiMethod, firstDue);
          l.emi = l.schedule[0]?.emi ?? l.emi;
          l.outstandingPrincipal = amount;
          l.disbursement = { mode: d!.mode, reference: d!.reference.trim(), date: d!.date, amount: l.netDisbursable ?? amount, byName: actor.name, at };
          // BR-004: the share deposit deduction is credited to the member's share deposit.
          if (l.shareDepositDeduction) shareDeposit = l.shareDepositDeduction;
          // J-07: a top-up closes the loan it settles.
          const parent = l.parentLoanId ? await this.repo.lock(tx, l.parentLoanId) : undefined;
          const settled = parent?.status === 'ACTIVE' ? { principal: parent.outstandingPrincipal, interest: l.sanctionSheet?.topup?.accruedInterest ?? 0, account: LOAN_ACCOUNT[parent.product] } : undefined;
          if (parent && settled) {
            parent.events = [...parent.events, { at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action: 'closedByTopup', fromStatus: 'ACTIVE', toStatus: 'CLOSED_BY_TOPUP', remarks: `Settled by top-up ${l.loanNo}` }];
            Object.assign(parent, { status: 'CLOSED_BY_TOPUP', outstandingPrincipal: 0, closedOn: d!.date });
            await this.repo.save(tx, parent);
            changed.push(parent);
          }
          await this.postDisbursement(tx, l, m, actor, amount, settled);
          notes.push([m.id, 'loan.disbursed', { netAmount: formatINR(l.disbursement.amount), loanNo: l.loanNo }, `/loan/${l.id}`]);
          break;
        }
        default:
          break;
      }
      l.events = [...l.events, { at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: l.status, toStatus: next, ...(remarks ? { remarks } : {}) }];
      l.status = next;
      await this.repo.save(tx, l);
      await this.app.audit.record(request, { action: `loan.${action}`, entity: 'loan', entityId: l.id, summary: `${actor.name}: ${action} on ${l.loanNo ?? l.applicationNo} (${m.name})${opts.demo ? ' [demo]' : ''}` }, tx);
      return l;
    });
    await this.loans.sync([saved, ...changed]);
    if (certified) await this.app.members.sync({ members: [certified] });
    if (pledgeRelease) await this.loans.pledge(pledgeRelease, null);
    if (shareDeposit) await this.creditShareDeposit(saved.memberId, shareDeposit);
    for (const [to, key, vars, link] of notes) await notifyMember(this.app, to, key, vars, link);
    return saved;
  }

  /**
   * The disbursement in the books (docs/22 §5.5): Dr the loan (member) = sanctioned amount; Cr bank =
   * net paid; Cr share deposit (member) = BR-004 deduction; top-up: Cr the old loan = its principal,
   * Cr interest on loans = accrued interest. TODO(P7): recoveries post here too once collections move.
   */
  private async postDisbursement(tx: Tx, l: Loan, m: Member, actor: Actor, amount: number, settled?: { principal: number; interest: number; account: string }) {
    const lines: JournalLineInput[] = [
      { accountCode: LOAN_ACCOUNT[l.product], debit: amount, credit: 0, memberId: m.id, refType: 'LOAN', refId: l.id },
      { accountCode: ACCOUNT.BANK, debit: 0, credit: l.disbursement!.amount },
    ];
    if (l.shareDepositDeduction) lines.push({ accountCode: ACCOUNT.SHARE_DEPOSIT, debit: 0, credit: l.shareDepositDeduction, memberId: m.id, refType: 'SHARE', refId: m.id });
    if (settled?.principal) lines.push({ accountCode: settled.account, debit: 0, credit: settled.principal, memberId: m.id, refType: 'LOAN', refId: l.parentLoanId! });
    if (settled?.interest) lines.push({ accountCode: INTEREST_INCOME, debit: 0, credit: settled.interest });
    await this.app.ledger.post({ entryDate: l.disbursedOn!, narration: `Disbursed ${l.loanNo} to ${m.name} (General No. ${m.generalNo}), ${l.disbursement!.mode} ${l.disbursement!.reference}`, source: 'LOAN_DISBURSEMENT', sourceRef: l.loanNo!, postedBy: { id: actor.id, name: actor.name }, lines }, tx);
  }

  /** TODO(P7): share accounts move to the backend with collections; until then the mock holds them. */
  private async creditShareDeposit(memberId: string, amount: number): Promise<void> {
    const { shares } = await this.loans.holdings(memberId);
    if (shares) await this.app.members.sync({ shareAccounts: [{ ...shares, shareDepositBalance: shares.shareDepositBalance + amount }] });
  }

  // ---- surety side (MB-07) ----
  private async suretyRequest(w: World, l: Loan, me: string): Promise<SuretyRequest> {
    const b = await this.loans.member(l.memberId);
    const mine = l.sureties.find((s) => s.memberId === me && s.status !== 'REPLACED')!;
    const [card] = await this.loans.suretyCards(w, { id: l.id, memberId: l.memberId, sureties: l.sureties, instalments: l.appliedInstalments }, [me]);
    const a = await this.loans.assess(w, b, inputOf(l), l.id);
    const others = await Promise.all(l.sureties.filter((s) => s.memberId !== me && s.status !== 'REPLACED').map(async (s) => ({ name: (await this.app.members.byId(s.memberId))?.name ?? '', status: s.status })));
    return {
      loanId: l.id,
      applicationNo: l.applicationNo,
      ...(l.loanNo ? { loanNo: l.loanNo } : {}),
      status: l.status,
      borrower: { name: b.name, generalNo: b.generalNo, departmentName: w.depts.get(b.departmentId)?.name ?? '', designation: b.designation },
      productName: this.loans.productOf(w, l.product).name,
      amount: l.sanctionedAmount ?? l.appliedAmount,
      instalments: l.sanctionedInstalments ?? l.appliedInstalments,
      emi: l.emi ?? a.preview.emi,
      outstanding: l.outstandingPrincipal,
      appliedOn: l.appliedOn,
      myStatus: mine.status,
      ...(mine.respondedAt ? { respondedAt: mine.respondedAt } : {}),
      me: card!,
      otherSureties: others,
      declaration: SURETY_DECLARATION,
    };
  }

  private async respond(request: FastifyRequest, w: World, loanId: string, memberId: string, accept: boolean, reason?: string): Promise<Loan> {
    const at = await businessNow(this.app);
    let note: [string, string, Record<string, string>, string] | undefined;
    const saved = await withTransaction(this.app.db, async (tx) => {
      const l = (await this.repo.lock(tx, loanId)) ?? fail('NOT_FOUND', 'Request not found.');
      if (l.status !== 'SURETY_PENDING') fail('INVALID_TRANSITION', 'This loan is no longer waiting for sureties.');
      const s = l.sureties.find((x) => x.memberId === memberId && x.status === 'PENDING');
      if (!s) return fail('INVALID_TRANSITION', 'You have already answered this request.');
      const surety = await this.loans.member(memberId);
      const product = this.loans.productOf(w, l.product);
      if (accept) {
        // BR-014 is re-checked at signing: the limit may have been reached since the request.
        const [card] = await this.loans.suretyCards(w, { id: l.id, memberId: l.memberId, sureties: l.sureties, instalments: l.appliedInstalments }, [memberId]);
        const check = card?.checks.find((c) => !c.pass && c.severity === 'block');
        if (check) fail('RULE_VIOLATION', check.message, { ruleId: check.ruleId });
        Object.assign(s, { status: 'ACCEPTED', respondedAt: at });
      } else {
        if (!reason?.trim()) fail('VALIDATION_ERROR', 'Tell the applicant why.', { fieldErrors: { reason: 'Required' } });
        Object.assign(s, { status: 'DECLINED', respondedAt: at, declineReason: reason!.trim() });
      }
      const next = nextLoanStatus(l.status, accept ? 'suretyAccept' : 'suretyDecline', { product, allSuretiesAccepted: suretyProgress(l.sureties, product.suretiesRequired).allAccepted })!;
      l.events = [...l.events, { at, actorId: surety.id, actorName: surety.name, actorRole: 'MEMBER', action: accept ? 'suretyAccept' : 'suretyDecline', fromStatus: l.status, toStatus: next, ...(reason?.trim() ? { remarks: reason.trim() } : {}) }];
      l.status = next;
      await this.repo.save(tx, l);
      await this.app.audit.record(request, { action: accept ? 'suretyAccept' : 'suretyDecline', entity: 'loan', entityId: l.id, summary: `${surety.name} ${accept ? 'signed as surety for' : 'declined to be surety for'} ${l.applicationNo}` }, tx);
      if (!accept) note = [l.memberId, 'loan.suretyDeclined', { surety: surety.name, applicationNo: l.applicationNo, reason: reason!.trim() }, `/loan/${l.id}`];
      else if (next === 'ACCOUNTANT_REVIEW') note = [l.memberId, 'loan.suretiesSigned', { applicationNo: l.applicationNo }, `/loan/${l.id}`];
      return l;
    });
    await this.loans.sync([saved]);
    if (note) await notifyMember(this.app, ...note);
    return saved;
  }

  async suretyRequests(user: SessionUser): Promise<SuretyRequests> {
    const me = this.loans.memberIdOf(user);
    const w = await this.loans.world();
    const mine = (await this.repo.asSurety(me)).filter((l) => l.status !== 'DRAFT' && l.sureties.some((s) => s.memberId === me && s.status !== 'REPLACED'));
    const requests = mine.filter((l) => l.status === 'SURETY_PENDING' && l.sureties.some((s) => s.memberId === me && s.status === 'PENDING'));
    const guaranteeing = mine.filter((l) => l.sureties.some((s) => s.memberId === me && s.status === 'ACCEPTED') && !['REJECTED', 'WITHDRAWN', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(l.status));
    return { requests: await Promise.all(requests.map((l) => this.suretyRequest(w, l, me))), guaranteeing: await Promise.all(guaranteeing.map((l) => this.suretyRequest(w, l, me))) };
  }

  private async openRequest(me: string, loanId: string): Promise<Loan> {
    const l = await this.repo.find(loanId);
    if (!l || l.status !== 'SURETY_PENDING' || !l.sureties.some((s) => s.memberId === me && s.status === 'PENDING')) return fail('NOT_FOUND', 'This request is no longer open.');
    return l;
  }

  async suretySignRequest(user: SessionUser, loanId: string): Promise<OtpChallenge> {
    const me = this.loans.memberIdOf(user);
    await this.openRequest(me, loanId);
    const m = await this.loans.member(me);
    // The code is bound to this surety and this loan.
    return this.app.appAccounts.startCode(m.mobile, 'SIGN', `${loanId}:${me}`);
  }

  async suretyAccept(request: FastifyRequest, loanId: string, body: { otpRef?: string; otp?: string }): Promise<SuretyRequest> {
    const me = this.loans.memberIdOf(sessionOf(request));
    await this.openRequest(me, loanId);
    await this.app.appAccounts.verifyCode('SIGN', `${loanId}:${me}`, body.otpRef ?? '', body.otp ?? '');
    const w = await this.loans.world();
    return this.suretyRequest(w, await this.respond(request, w, loanId, me, true), me);
  }

  async suretyDecline(request: FastifyRequest, loanId: string, reason?: string): Promise<SuretyRequest> {
    const me = this.loans.memberIdOf(sessionOf(request));
    const w = await this.loans.world();
    return this.suretyRequest(w, await this.respond(request, w, loanId, me, false, reason), me);
  }

  // ---- member: replace a declined surety, withdraw (MB-04) ----
  async replaceSurety(request: FastifyRequest, id: string, body: { oldId?: string; newId?: string }): Promise<LoanDetail> {
    const user = sessionOf(request);
    const me = this.loans.memberIdOf(user);
    await this.loans.myLoan(user, id);
    const w = await this.loans.world();
    let newcomer: Member | undefined;
    const saved = await withTransaction(this.app.db, async (tx) => {
      const l = (await this.repo.lock(tx, id))!;
      if (l.status !== 'SURETY_PENDING') fail('INVALID_TRANSITION', 'Sureties can only be changed while the loan waits for them.');
      const old = l.sureties.find((s) => s.memberId === body.oldId && (s.status === 'DECLINED' || s.status === 'PENDING')) ?? fail('VALIDATION_ERROR', 'Choose the surety to replace.');
      if (!body.newId || body.newId === me || l.sureties.some((s) => s.memberId === body.newId && s.status !== 'REPLACED')) fail('VALIDATION_ERROR', 'Choose a different member.', { fieldErrors: { newId: 'Choose a different member' } });
      const [card] = await this.loans.suretyCards(w, { id: l.id, memberId: me, sureties: l.sureties, instalments: l.appliedInstalments }, [body.newId!]);
      if (!card) return fail('NOT_FOUND', 'Member not found.');
      const block = card.checks.find((x) => !x.pass && x.severity === 'block');
      if (block) fail('RULE_VIOLATION', `${card.name}: ${block.message}`, { ruleId: block.ruleId });
      old.status = 'REPLACED';
      newcomer = await this.loans.member(body.newId!);
      const oldName = (await this.app.members.byId(body.oldId!))?.name ?? '';
      l.sureties = [...l.sureties, { memberId: body.newId!, status: 'PENDING', retiresDuringLoan: card.checks.some((x) => x.ruleId === 'BR-024' && !x.pass) }];
      l.events = [...l.events, { at: await businessNow(this.app), actorId: me, actorName: user.name, actorRole: 'MEMBER', action: 'replaceSurety', fromStatus: l.status, toStatus: l.status, remarks: `${oldName} → ${newcomer.name}` }];
      await this.repo.save(tx, l);
      await this.app.audit.record(request, { action: 'replaceSurety', entity: 'loan', entityId: l.id, summary: `${user.name} replaced surety ${oldName} with ${newcomer.name} on ${l.applicationNo}` }, tx);
      return l;
    });
    await this.loans.sync([saved]);
    await notifyMember(this.app, newcomer!.id, 'loan.surety', { borrower: user.name, product: this.loans.productOf(w, saved.product).name, amount: formatINR(saved.appliedAmount) }, '/surety');
    return this.loans.detail(w, saved, user);
  }

  async withdraw(request: FastifyRequest, id: string, reason?: string): Promise<LoanDetail> {
    const user = sessionOf(request);
    const me = this.loans.memberIdOf(user);
    await this.loans.myLoan(user, id);
    const w = await this.loans.world();
    const at = await businessNow(this.app);
    const saved = await withTransaction(this.app.db, async (tx) => {
      const l = (await this.repo.lock(tx, id))!;
      const next = l.status === 'DRAFT' ? undefined : nextLoanStatus(l.status, 'withdraw', { product: this.loans.productOf(w, l.product) });
      if (!next) return fail('INVALID_TRANSITION', 'This application can no longer be withdrawn. Contact the office.');
      l.events = [...l.events, { at, actorId: me, actorName: user.name, actorRole: 'MEMBER', action: 'withdraw', fromStatus: l.status, toStatus: next, ...(reason?.trim() ? { remarks: reason.trim() } : {}) }];
      l.status = next;
      await this.repo.save(tx, l);
      await this.app.audit.record(request, { action: 'withdraw', entity: 'loan', entityId: l.id, summary: `${user.name} withdrew ${l.applicationNo}` }, tx);
      return l;
    });
    await this.loans.sync([saved]);
    if (saved.pledgedDepositId) await this.loans.pledge(saved.pledgedDepositId, null);
    return this.loans.detail(w, saved, user);
  }
}
