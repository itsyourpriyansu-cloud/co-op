// Loans core (M4): ST-20 list, ST-21 application on behalf, ST-23 detail, MB-03 … MB-05 on the phone.
// Every check comes from @tgs/domain (assessLoanApplication, checkSalaryLoan, checkSuretyEligibility,
// validateLoanRequest); the workflow after submission (surety signing, review, sanction) is M5.
import { randomUUID } from 'node:crypto';
import {
  assessLoanApplication,
  buildSanctionSheet,
  calculateLeftoverService,
  checkTopupEligibility,
  lastInterestChargedOn,
  LOAN_STAGE_OWNER as STAGE_OWNER,
  suretyProgress,
  checkSalaryLoan,
  checkSuretyEligibility,
  firstDueCycle,
  formatINR,
  lastInstalmentCycle,
  loanActionsFor,
  loanStages,
  loanStatusGroup,
  nextLoanStatus,
  validateLoanRequest,
  type RuleCheck,
} from '@tgs/domain';
import {
  ROLE_LABELS,
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
  type SuretyCard,
} from '@tgs/types';
import { audit, can, notify, nowIso, requireMember, requirePermission, requireStaff, type Api, type Guard } from './common';
import { fail } from './errors';
import type { Db, Store } from './store';

const DEMO_OTP = '123456';
export const LOAN_TEXT_VERSION = 'F2+F3-2026.1';
/** Plain-language versions of form F2 clause 12 and the F3 declaration (docs/16). */
const DECLARATION = {
  f2: 'I and my sureties authorise the Drawing & Disbursing Officer, and any future pay officer, to recover the instalments of this loan from our salaries as demanded by the society. If I am transferred, the new pay officer recovers as per the society’s demand. If I go on deputation, my sureties will tell the society my address.',
  f3: 'I authorise the pay disbursing officer to recover this salary loan from my salary.',
  version: LOAN_TEXT_VERSION,
};

const OPEN: LoanStatus[] = ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'RETURNED', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED', 'ACTIVE'];
const deptName = (db: Db, id: string) => db.departments.find((d) => d.id === id)?.name ?? id;
const productOf = (db: Db, code: LoanProductCode) => db.loanProducts.find((p) => p.code === code) ?? fail('VALIDATION_ERROR', 'Unknown loan type.', { fieldErrors: { product: 'Choose a loan type' } });

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

// ---- context + assessment (shared by phone, console and submit) --------------------------------

export function loanContext(db: Db, m: Member): LoanContext {
  const today = db.demo.today;
  const leftover = calculateLeftoverService(m.dor, today);
  const mine = db.loans.filter((l) => l.memberId === m.id);
  const running = (code: LoanProductCode) => mine.filter((l) => l.product === code && l.status === 'ACTIVE');
  const shares = db.shareAccounts.find((s) => s.memberId === m.id);
  const mandate = db.mandates.find((x) => x.memberId === m.id && x.status !== 'SUPERSEDED');
  return {
    member: { id: m.id, name: m.name, generalNo: m.generalNo, departmentName: deptName(db, m.departmentId), designation: m.designation, dob: m.dob, dor: m.dor, doj: m.doj, leftoverMonths: leftover.months, leftoverLabel: leftover.label, status: m.status, ...(mandate ? { mandateStatus: mandate.status } : {}) },
    products: db.loanProducts,
    activeProducts: mine.filter((l) => OPEN.includes(l.status)).map((l) => l.product),
    pay: m.payProfile,
    shares: { numberOfShares: shares?.numberOfShares ?? m.numberOfShares, shareCapital: shares?.shareCapital ?? 0, shareDepositBalance: shares?.shareDepositBalance ?? 0 },
    ordinaryLoanDues: running('ORDINARY').reduce((s, l) => s + (l.emi ?? 0), 0),
    balances: { ordinary: running('ORDINARY').reduce((s, l) => s + l.outstandingPrincipal, 0), salary: running('SALARY').reduce((s, l) => s + l.outstandingPrincipal, 0) },
    pledgeableDeposits: db.deposits.filter((d) => d.memberId === m.id && d.scheme === 'FD' && d.status === 'ACTIVE' && !d.pledgedToLoanId).map((d) => ({ id: d.id, accountNo: d.accountNo, principal: d.principal ?? d.balance, ...(d.maturityDate ? { maturityDate: d.maturityDate } : {}) })),
    topupCandidates: mine
      .filter((l) => l.status === 'ACTIVE' && db.loanProducts.find((p) => p.code === l.product)?.topupAllowed && !db.loans.some((x) => x.parentLoanId === l.id && OPEN.includes(x.status)))
      .map((l) => ({ id: l.id, loanNo: l.loanNo ?? l.applicationNo, product: l.product, outstanding: l.outstandingPrincipal, emi: l.emi ?? 0, ...(l.disbursedOn ? { disbursedOn: l.disbursedOn } : {}) })),
    settings: { emiToNetSalaryMaxPercent: db.settings.emiToNetSalaryMaxPercent, maxGuaranteesPerSurety: db.settings.maxGuaranteesPerSurety, shareValue: db.settings.shareValue },
    firstDueCycle: firstDueCycle(today),
    declaration: DECLARATION,
  };
}

/** Loans a member stands surety on that still carry risk (BR-014), optionally leaving one loan out. */
export function openGuarantees(db: Db, memberId: string, exceptLoanId?: string) {
  return db.loans.filter((l) => l.id !== exceptLoanId && OPEN.includes(l.status) && l.sureties.some((s) => s.memberId === memberId && (s.status === 'PENDING' || s.status === 'ACCEPTED')));
}

export function suretyCards(db: Db, loan: Pick<Loan, 'id' | 'memberId' | 'sureties'> & { instalments: number }, ids: string[]): SuretyCard[] {
  const last = lastInstalmentCycle(firstDueCycle(db.demo.today), loan.instalments);
  return ids.flatMap((id) => {
    const s = db.members.find((m) => m.id === id);
    if (!s) return [];
    const record = loan.sureties.find((x) => x.memberId === id);
    const guarantees = openGuarantees(db, id, loan.id);
    return [
      {
        memberId: s.id,
        name: s.name,
        generalNo: s.generalNo,
        departmentName: deptName(db, s.departmentId),
        designation: s.designation,
        dob: s.dob,
        dor: s.dor,
        leftoverLabel: calculateLeftoverService(s.dor, db.demo.today).label,
        substantivePay: s.payProfile.substantivePay,
        numberOfShares: s.numberOfShares,
        guarantees: guarantees.map((g) => {
          const b = db.members.find((m) => m.id === g.memberId);
          return { applicationNo: g.loanNo ?? g.applicationNo, borrower: b?.name ?? '', generalNo: b?.generalNo ?? '', product: db.loanProducts.find((p) => p.code === g.product)?.name ?? g.product, outstanding: g.outstandingPrincipal };
        }),
        ...(record ? { status: record.status, ...(record.respondedAt ? { respondedAt: record.respondedAt } : {}), ...(record.declineReason ? { declineReason: record.declineReason } : {}) } : {}),
        checks: checkSuretyEligibility({ suretyMemberId: s.id, borrowerMemberId: loan.memberId, suretyActive: s.status === 'ACTIVE', activeGuarantees: guarantees.length, maxGuarantees: db.settings.maxGuaranteesPerSurety, suretyDor: s.dor, lastInstalmentCycle: last }),
      },
    ];
  });
}

export function assess(db: Db, m: Member, input: LoanRequestInput, loanId?: string) {
  const ctx = loanContext(db, m);
  const product = productOf(db, input.product);
  const pay = input.form.pay ?? m.payProfile;
  const pledged = input.pledgedDepositId ? db.deposits.find((d) => d.id === input.pledgedDepositId && d.memberId === m.id) : undefined;
  const others = db.loans.filter((l) => l.memberId === m.id && l.id !== loanId && OPEN.includes(l.status)).map((l) => l.product);
  const parent = input.topupOf ? db.loans.find((l) => l.id === input.topupOf) : undefined;
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
        today: db.demo.today,
        topup: { loanId: parent.id, loanNo: parent.loanNo ?? parent.applicationNo, outstandingPrincipal: parent.outstandingPrincipal, ratePercent: parent.ratePercent, lastInterestChargedOn: lastInterestChargedOn(parent, db.demo.today) },
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
  const cards = suretyCards(db, { id: loanId ?? '', memberId: m.id, sureties: [], instalments: input.instalments }, input.sureties);
  for (const c of cards) for (const k of c.checks.filter((x) => !x.pass)) checks.push({ ...k, message: `${c.name}: ${k.message}` });
  return {
    product,
    checks,
    cards,
    eligible: checks.every((c) => c.pass || c.severity === 'warn'),
    preview: { emi: a.emi.firstInstalment, lastInstalment: a.emi.lastInstalment, totalInterest: a.emi.totalInterest, shareDeduction: a.shareDeduction, netDisbursable, maxInstalments: a.maxInstalments, netSalary: a.netSalary, ...(topup ? { topup } : {}) },
  };
}

// ---- read models --------------------------------------------------------------------------------

export function waitingOnFor(db: Db, loan: Loan, m: Member | undefined): string | undefined {
  if (loan.status === 'SURETY_PENDING') {
    const pending = loan.sureties.filter((s) => s.status === 'PENDING' || s.status === 'DECLINED').map((s) => db.members.find((x) => x.id === s.memberId)?.name).filter(Boolean);
    return pending.length ? `Sureties: ${pending.join(', ')}` : 'Sureties';
  }
  if (loan.status === 'RETURNED') return `${m?.name ?? 'Member'} (correction)`;
  const role = STAGE_OWNER[loan.status];
  if (!role) return undefined;
  if (role === 'DDO') {
    const dept = db.departments.find((d) => d.id === m?.departmentId);
    const login = db.staffUsers.find((u) => u.role === 'DDO' && u.departmentId === m?.departmentId);
    return `${login?.name ?? dept?.ddoName ?? 'DDO'} (DDO, ${dept?.name ?? ''})`;
  }
  const u = db.staffUsers.find((x) => x.role === role);
  return u ? `${u.name} (${ROLE_LABELS[role]})` : ROLE_LABELS[role];
}

export function toRow(db: Db, l: Loan): LoanRow {
  const m = db.members.find((x) => x.id === l.memberId);
  const next = l.status === 'ACTIVE' ? l.schedule.find((r) => r.dueCycle >= db.currentCycle && r.paidStatus !== 'PAID') : undefined;
  const waitingOn = waitingOnFor(db, l, m);
  return {
    id: l.id,
    applicationNo: l.applicationNo,
    ...(l.loanNo ? { loanNo: l.loanNo } : {}),
    memberId: l.memberId,
    memberName: m?.name ?? '',
    generalNo: m?.generalNo ?? '',
    departmentId: m?.departmentId ?? '',
    departmentName: deptName(db, m?.departmentId ?? ''),
    product: l.product,
    productName: db.loanProducts.find((p) => p.code === l.product)?.name ?? l.product,
    status: l.status,
    group: loanStatusGroup(l.status) as LoanStatusGroup,
    isTopup: Boolean(l.parentLoanId),
    appliedAmount: l.appliedAmount,
    ...(l.sanctionedAmount ? { sanctionedAmount: l.sanctionedAmount } : {}),
    instalments: l.appliedInstalments,
    ...(l.emi ? { emi: l.emi } : {}),
    outstanding: l.outstandingPrincipal,
    appliedOn: l.appliedOn,
    ...(next ? { nextDue: { cycle: next.dueCycle, amount: next.emi } } : {}),
    ...(waitingOn ? { waitingOn } : {}),
  };
}

export function loanDetail(db: Db, l: Loan, user: SessionUser): LoanDetail {
  const m = db.members.find((x) => x.id === l.memberId)!;
  const a = assess(db, m, inputOf(l), l.id);
  const product = a.product;
  const leftover = calculateLeftoverService(m.dor, db.demo.today);
  const parent = l.parentLoanId ? db.loans.find((x) => x.id === l.parentLoanId) : undefined;
  const pledged = l.pledgedDepositId ? db.deposits.find((d) => d.id === l.pledgedDepositId) : undefined;
  const waitingOn = waitingOnFor(db, l, m);
  const staff = user.role !== 'MEMBER' && user.role !== 'APPLICANT';
  const actions = staff ? loanActionsFor({ status: l.status, memberDepartmentId: m.departmentId }, { role: user.role, ...(user.departmentId ? { departmentId: user.departmentId } : {}) }) : [];
  // Demo: staff may complete a stage owned by someone else (a surety, another DDO, another officer).
  const owner = STAGE_OWNER[l.status];
  const ownedBySomeoneElse = l.status === 'SURETY_PENDING' || (owner !== undefined && owner !== 'MEMBER');
  const demoActAs = staff && !actions.length && ownedBySomeoneElse && can(user, 'demo.control') ? waitingOn : undefined;
  return {
    loan: l,
    member: { id: m.id, name: m.name, generalNo: m.generalNo, departmentId: m.departmentId, departmentName: deptName(db, m.departmentId), designation: m.designation, dob: m.dob, dor: m.dor, leftover, mobileMasked: m.mobileMasked },
    product,
    sureties: suretyCards(db, { id: l.id, memberId: l.memberId, sureties: l.sureties, instalments: l.appliedInstalments }, l.sureties.filter((s) => s.status !== 'REPLACED').map((s) => s.memberId)),
    // Finished loans keep their history; re-running today's eligibility on them would only confuse.
    checks: ['ACTIVE', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(l.status) ? [] : a.checks,
    preview: a.preview,
    stages: loanStages(product, l),
    ...(waitingOn ? { waitingOn } : {}),
    actions,
    ...(demoActAs ? { demoActAs } : {}),
    ...(parent ? { parentLoan: { id: parent.id, applicationNo: parent.applicationNo, ...(parent.loanNo ? { loanNo: parent.loanNo } : {}), outstanding: parent.outstandingPrincipal } } : {}),
    ...(pledged ? { pledgedDeposit: { id: pledged.id, accountNo: pledged.accountNo, principal: pledged.principal ?? pledged.balance } } : {}),
  };
}

// ---- writes -------------------------------------------------------------------------------------

export function nextApplicationNo(db: Db): string {
  const year = db.demo.today.slice(0, 4);
  const max = Math.max(0, ...db.loans.filter((l) => l.applicationNo.startsWith(`APP-${year}-`)).map((l) => Number(l.applicationNo.slice(9))));
  return `APP-${year}-${String(max + 1).padStart(5, '0')}`;
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

/** Writes the request onto a draft (keeps surety responses for sureties that stay). */
function applyInput(db: Db, loan: Loan, input: LoanRequestInput, product: LoanProduct) {
  const last = lastInstalmentCycle(firstDueCycle(db.demo.today), input.instalments);
  Object.assign(loan, {
    product: input.product,
    appliedAmount: input.amount,
    appliedInstalments: input.instalments,
    purpose: input.purpose.trim(),
    ratePercent: product.ratePercent,
    form: input.form,
    // Sureties who stay keep their answer (a returned loan does not need them to sign again).
    sureties:
      product.suretiesRequired > 0
        ? input.sureties.map((id) => {
            const kept = loan.sureties.find((s) => s.memberId === id && s.status === 'ACCEPTED');
            return kept ?? { memberId: id, status: 'PENDING' as const, retiresDuringLoan: (db.members.find((x) => x.id === id)?.dor.slice(0, 7) ?? '9999') < last };
          })
        : [],
  });
  if (input.topupOf) loan.parentLoanId = input.topupOf;
  else delete loan.parentLoanId;
  if (input.pledgedDepositId && product.code === 'DEPOSIT') loan.pledgedDepositId = input.pledgedDepositId;
  else delete loan.pledgedDepositId;
}

/** Full checks, then DRAFT → SURETY_PENDING / ACCOUNTANT_REVIEW (D-030 via nextLoanStatus). */
export function submitLoan(store: Store, loan: Loan, actor: { id: string; name: string; role: string }, signed: boolean) {
  const db = store.db;
  const m = db.members.find((x) => x.id === loan.memberId)!;
  const input = inputOf(loan);
  const resubmit = loan.status === 'RETURNED';
  const product = productOf(db, loan.product);
  const fieldErrors = validateLoanRequest(input, product, m.id);
  if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Some details are missing.', { fieldErrors });
  const a = assess(db, m, input, loan.id);
  const block = a.checks.find((c) => !c.pass && c.severity === 'block');
  if (block) fail('RULE_VIOLATION', block.message, { ruleId: block.ruleId });
  const allSuretiesAccepted = suretyProgress(loan.sureties, product.suretiesRequired).allAccepted;
  const next = nextLoanStatus(loan.status, resubmit ? 'resubmit' : 'submit', { product, allSuretiesAccepted });
  if (!next) return fail('INVALID_TRANSITION', 'This application cannot be submitted now.');
  const at = nowIso();
  loan.events.push({ at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action: resubmit ? 'resubmit' : 'submit', fromStatus: loan.status, toStatus: next, ...(loan.channel === 'COUNTER' && !resubmit ? { remarks: 'Entered by the office from the signed paper form' } : {}) });
  loan.status = next;
  loan.submittedAt = at;
  if (!resubmit) loan.appliedOn = db.demo.today;
  delete loan.returnInfo;
  if (signed) loan.signature = { signedAt: at, textVersion: LOAN_TEXT_VERSION };
  // Reserve the FD so it cannot be pledged twice (released if the loan is rejected, M5).
  const fd = loan.pledgedDepositId ? db.deposits.find((d) => d.id === loan.pledgedDepositId) : undefined;
  if (fd) fd.pledgedToLoanId = loan.id;
  for (const s of loan.sureties.filter((x) => x.status === 'PENDING')) notify(store, s.memberId, 'loan.surety', { borrower: m.name, product: product.name, amount: formatINR(loan.appliedAmount) }, '/surety');
  if (!resubmit) notify(store, m.id, 'loan.submitted', { product: product.name, applicationNo: loan.applicationNo, amount: formatINR(loan.appliedAmount) }, `/loan/${loan.id}`);
  store.save();
}

function newDraft(db: Db, m: Member, input: LoanRequestInput, channel: 'APP' | 'COUNTER', byName: string): Loan {
  const product = productOf(db, input.product);
  const loan: Loan = {
    id: `loan-${randomUUID().slice(0, 8)}`,
    applicationNo: nextApplicationNo(db),
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
    appliedOn: db.demo.today,
    channel,
    createdByName: byName,
  };
  applyInput(db, loan, input, product);
  db.loans.push(loan);
  return loan;
}

/** Staff never see a member's unsubmitted draft; DDOs only see their department. */
export function staffCanSee(db: Db, l: Loan, user: SessionUser) {
  if (l.status === 'DRAFT' && l.channel !== 'COUNTER') return false;
  if (user.role !== 'DDO') return true;
  return db.members.find((m) => m.id === l.memberId)?.departmentId === user.departmentId;
}

// ---- routes -------------------------------------------------------------------------------------

export function registerLoans(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const otps = new Map<string, { loanId: string; expiresAt: number }>();
  const staffView = (user: SessionUser) => {
    requireStaff(user);
    requirePermission(user, 'loans.view', 'You do not have access to loans.');
  };
  const staffVisible = (l: Loan, user: SessionUser) => staffCanSee(db(), l, user);
  const myMember = (user: SessionUser) => {
    const id = requireMember(user);
    return db().members.find((m) => m.id === id) ?? fail('NOT_FOUND', 'Member record not found.');
  };
  const myLoan = (user: SessionUser, id: string) => {
    const l = db().loans.find((x) => x.id === id && x.memberId === requireMember(user));
    return l ?? fail('NOT_FOUND', 'Loan not found.');
  };

  // ---- member / surety search (ST-21 member picker, MB-05 / ST-21 surety picker) -------------
  api.get('/members/search', requireSession, (c) => {
    const user = c.get('session');
    if (user.role !== 'MEMBER') staffView(user);
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    if (q.length < 2) return c.json<MemberPick[]>([]);
    const rows = db()
      .members.filter((m) => m.status === 'ACTIVE' && m.id !== user.memberId && (m.name.toLowerCase().includes(q) || m.generalNo.startsWith(q)) && (user.role !== 'DDO' || m.departmentId === user.departmentId))
      .map((m) => ({ id: m.id, name: m.name, generalNo: m.generalNo, departmentName: deptName(db(), m.departmentId), designation: m.designation, leftoverLabel: calculateLeftoverService(m.dor, db().demo.today).label, activeGuarantees: openGuarantees(db(), m.id).length }))
      // Members who can still stand surety come first (BR-014), then by name.
      .sort((a, b) => Number(a.activeGuarantees >= db().settings.maxGuaranteesPerSurety) - Number(b.activeGuarantees >= db().settings.maxGuaranteesPerSurety) || a.name.localeCompare(b.name))
      .slice(0, 12);
    return c.json<MemberPick[]>(rows);
  });

  /** Live surety cards for a form (BR-014 / BR-024 / item 10), before anything is saved. */
  api.post('/loans/surety-preview', requireSession, async (c) => {
    const user = c.get('session');
    const body = await c.req.json<{ borrowerId?: string; sureties?: string[]; instalments?: number }>().catch(() => ({}) as { borrowerId?: string; sureties?: string[]; instalments?: number });
    const borrowerId = user.role === 'MEMBER' ? requireMember(user) : (staffView(user), body.borrowerId ?? '');
    return c.json<SuretyCard[]>(suretyCards(db(), { id: '', memberId: borrowerId, sureties: [], instalments: Math.max(1, Number(body.instalments ?? 12)) }, (body.sureties ?? []).slice(0, 4)));
  });

  // ---- ST-20 / ST-23 (staff) -------------------------------------------------------------------
  api.get('/loans', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    const product = c.req.query('product');
    const group = c.req.query('group');
    const departmentId = c.req.query('departmentId');
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 25)));
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const scoped = db().loans.filter((l) => staffVisible(l, user)).map((l) => toRow(db(), l));
    const byProductFilter = (r: LoanRow) => !product || (product === 'TOPUP' ? r.isTopup : r.product === product);
    const rows = scoped
      .filter((r) => byProductFilter(r) && (!group || r.group === group) && (!departmentId || r.departmentId === departmentId) && (!q || r.memberName.toLowerCase().includes(q) || r.generalNo.includes(q) || r.applicationNo.toLowerCase().includes(q) || (r.loanNo ?? '').toLowerCase().includes(q)))
      .sort((a, b) => b.appliedOn.localeCompare(a.appliedOn) || b.applicationNo.localeCompare(a.applicationNo));
    const byProduct: LoanList['counts']['byProduct'] = { ALL: scoped.length, TOPUP: scoped.filter((r) => r.isTopup).length };
    for (const r of scoped) byProduct[r.product] = (byProduct[r.product] ?? 0) + 1;
    const byGroup: LoanList['counts']['byGroup'] = {};
    for (const r of scoped.filter(byProductFilter)) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
    const dept = user.role === 'DDO' && user.departmentId ? db().departments.find((d) => d.id === user.departmentId) : undefined;
    return c.json<LoanList>({
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
      counts: { byProduct, byGroup },
      scope: dept ? { departmentId: dept.id, departmentName: dept.name } : {},
      canCreate: can(user, 'loans.create'),
    });
  });

  api.get('/loans/:id', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const l = db().loans.find((x) => x.id === c.req.param('id') || x.applicationNo === c.req.param('id'));
    if (!l || !staffVisible(l, user)) return fail('NOT_FOUND', 'This loan does not exist or is outside your department.');
    return c.json<LoanDetail>(loanDetail(db(), l, user));
  });

  api.get('/members/:id/loan-context', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const m = db().members.find((x) => x.id === c.req.param('id'));
    if (!m || (user.role === 'DDO' && m.departmentId !== user.departmentId)) return fail('NOT_FOUND', 'Member not found.');
    return c.json<LoanContext>(loanContext(db(), m));
  });

  /** ST-21: the office enters a signed paper application (no OTP; the paper carries the signature). */
  api.post('/loans', requireSession, async (c) => {
    const user = c.get('session');
    requirePermission(user, 'loans.create', 'Only the Super Admin and the Accountant enter applications on behalf of members.');
    const body = await c.req.json<Partial<LoanRequestInput> & { memberId?: string; submit?: boolean }>().catch(() => ({}) as Partial<LoanRequestInput> & { memberId?: string; submit?: boolean });
    const m = db().members.find((x) => x.id === body.memberId) ?? fail('VALIDATION_ERROR', 'Choose the member.', { fieldErrors: { memberId: 'Choose the member' } });
    const loan = newDraft(db(), m, cleanInput(body), 'COUNTER', user.name);
    try {
      if (body.submit) submitLoan(store, loan, { id: user.id, name: user.name, role: user.role }, false);
    } catch (e) {
      // A failed submit must not leave a half-made application behind.
      db().loans.splice(db().loans.indexOf(loan), 1);
      throw e;
    }
    audit(store, user, 'loan', loan.id, body.submit ? 'submit' : 'draft', `${body.submit ? 'Submitted' : 'Saved draft'} ${loan.applicationNo} for ${m.name} (${formatINR(loan.appliedAmount)})`);
    store.save();
    return c.json<LoanDetail>(loanDetail(db(), loan, user), 201);
  });

  // ---- MB-03 … MB-05 (member) -----------------------------------------------------------------
  api.get('/me/loans', requireSession, (c) => {
    const m = myMember(c.get('session'));
    return c.json<LoanRow[]>(db().loans.filter((l) => l.memberId === m.id).map((l) => toRow(db(), l)).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn)));
  });

  api.get('/me/loans/context', requireSession, (c) => c.json<LoanContext>(loanContext(db(), myMember(c.get('session')))));

  api.get('/me/loans/:id', requireSession, (c) => {
    const user = c.get('session');
    return c.json<LoanDetail>(loanDetail(db(), myLoan(user, c.req.param('id')), user));
  });

  api.post('/me/loans', requireSession, async (c) => {
    const user = c.get('session');
    const m = myMember(user);
    const loan = newDraft(db(), m, cleanInput(await c.req.json<Partial<LoanRequestInput>>().catch(() => ({}))), 'APP', m.name);
    store.save();
    return c.json<LoanDetail>(loanDetail(db(), loan, user), 201);
  });

  api.put('/me/loans/:id', requireSession, async (c) => {
    const user = c.get('session');
    const loan = myLoan(user, c.req.param('id'));
    if (loan.status !== 'DRAFT' && loan.status !== 'RETURNED') fail('INVALID_TRANSITION', 'This application has been submitted and can no longer be edited.');
    const input = cleanInput(await c.req.json<Partial<LoanRequestInput>>().catch(() => ({})));
    applyInput(db(), loan, input, productOf(db(), input.product));
    store.save();
    return c.json<LoanDetail>(loanDetail(db(), loan, user));
  });

  api.delete('/me/loans/:id', requireSession, (c) => {
    const user = c.get('session');
    const loan = myLoan(user, c.req.param('id'));
    if (loan.status !== 'DRAFT') fail('INVALID_TRANSITION', 'Only drafts can be discarded. Withdraw a submitted application instead (M5).');
    db().loans.splice(db().loans.indexOf(loan), 1);
    store.save();
    return c.json({ ok: true });
  });

  /** Sign with OTP (D-031): checks everything first, so the code is only sent for a valid application. */
  api.post('/me/loans/:id/sign/request', requireSession, (c) => {
    const user = c.get('session');
    const loan = myLoan(user, c.req.param('id'));
    if (loan.status !== 'DRAFT' && loan.status !== 'RETURNED') fail('INVALID_TRANSITION', 'Already submitted.');
    const m = myMember(user);
    const input = inputOf(loan);
    const fieldErrors = validateLoanRequest(input, productOf(db(), loan.product), m.id);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Some details are missing.', { fieldErrors });
    const block = assess(db(), m, input, loan.id).checks.find((x) => !x.pass && x.severity === 'block');
    if (block) fail('RULE_VIOLATION', block.message, { ruleId: block.ruleId });
    const otpRef = randomUUID();
    otps.set(otpRef, { loanId: loan.id, expiresAt: Date.now() + 300_000 });
    return c.json<OtpChallenge>({ otpRef, expiresInSeconds: 300, demoOtp: DEMO_OTP });
  });

  api.post('/me/loans/:id/submit', requireSession, async (c) => {
    const user = c.get('session');
    const loan = myLoan(user, c.req.param('id'));
    const { otpRef = '', otp } = await c.req.json<{ otpRef?: string; otp?: string }>().catch(() => ({}) as { otpRef?: string; otp?: string });
    const pending = otps.get(otpRef);
    if (!pending || pending.loanId !== loan.id || Date.now() > pending.expiresAt) fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    if (otp !== DEMO_OTP) fail('VALIDATION_ERROR', "That code doesn't match. Check the SMS and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    otps.delete(otpRef);
    if (loan.status !== 'DRAFT' && loan.status !== 'RETURNED') fail('INVALID_TRANSITION', 'Already submitted.');
    submitLoan(store, loan, { id: user.id, name: user.name, role: 'MEMBER' }, true);
    audit(store, user, 'loan', loan.id, 'submit', `${user.name} applied for ${loan.applicationNo} (${formatINR(loan.appliedAmount)}) in the app`);
    store.save();
    return c.json<LoanDetail>(loanDetail(db(), loan, user));
  });

  /** Live eligibility for an unsaved form (phone and console preview; the server repeats it on submit). */
  api.post('/loans/assess', requireSession, async (c) => {
    const user = c.get('session');
    const body = await c.req.json<Partial<LoanRequestInput> & { memberId?: string; loanId?: string }>().catch(() => ({}) as Partial<LoanRequestInput> & { memberId?: string; loanId?: string });
    const memberId = user.role === 'MEMBER' ? requireMember(user) : (staffView(user), body.memberId ?? '');
    const m = db().members.find((x) => x.id === memberId) ?? fail('NOT_FOUND', 'Member not found.');
    const input = cleanInput(body);
    const a = assess(db(), m, input, body.loanId);
    return c.json({ checks: a.checks, eligible: a.eligible, preview: a.preview, sureties: a.cards, fieldErrors: validateLoanRequest(input, a.product, m.id) });
  });
}
