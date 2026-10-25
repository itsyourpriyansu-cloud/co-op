// Loan workflow (M5, J-02 … J-08): surety signing on the phone, the staff stages ST-24 … ST-28,
// the Work Queue (ST-02), withdraw / replace surety, and demo "act as" for stage owners.
// Every transition goes through applyLoanAction so console, phone and demo controls write the
// same events, sign-offs and notifications. Rules: @tgs/domain (nextLoanStatus, loanActionsFor,
// buildSanctionSheet, validateSanctionAdjustment, suretyProgress).
import { randomUUID } from 'node:crypto';
import {
  addMonths,
  buildSanctionSheet,
  checkTenureEligibility,
  calculateLeftoverService,
  formatCycle,
  formatINR,
  generateSchedule,
  lastInterestChargedOn,
  LOAN_STAGE_OWNER,
  loanActionsFor,
  membershipActionsFor,
  nextLoanStatus,
  PRIMARY_LOAN_ACTION,
  PROFILE_FIELDS,
  suretyProgress,
  toCycle,
  validateSanctionAdjustment,
  type LoanAction,
} from '@tgs/domain';
import {
  type Loan,
  type LoanActionInput,
  type LoanDetail,
  type OtpChallenge,
  type Role,
  type SanctionPreview,
  type SessionUser,
  type SuretyRequest,
  type SuretyRequests,
  type WorkItem,
  type WorkQueue,
} from '@tgs/types';
import { audit, can, notify, nowIso, requireMember, requireStaff, type Api, type Guard } from './common';
import { fail } from './errors';
import { collectionWorkItems } from './collections';
import { depositWorkItems } from './deposits';
import { assess, inputOf, loanContext, loanDetail, staffCanSee, suretyCards } from './loans';
import type { Db, Store } from './store';

const DEMO_OTP = '123456';
const SURETY_DECLARATION =
  'I agree to stand surety for this loan. If the borrower does not repay, I authorise the Drawing & Disbursing Officer, and any future pay officer, to recover the dues from my salary as demanded by the society (form F2, item 12).';

interface Actor {
  id: string;
  name: string;
  role: Role;
  departmentId?: string;
}

const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const productOf = (db: Db, l: Loan) => db.loanProducts.find((p) => p.code === l.product)!;

/** The person who owns the current stage (the borrower's DDO for certification). */
function stageOwner(db: Db, l: Loan): Actor | undefined {
  const role = LOAN_STAGE_OWNER[l.status];
  if (!role || role === 'MEMBER') return undefined;
  if (role === 'DDO') {
    const m = db.members.find((x) => x.id === l.memberId);
    const login = db.staffUsers.find((u) => u.role === 'DDO' && u.departmentId === m?.departmentId);
    const dept = db.departments.find((d) => d.id === m?.departmentId);
    return login ? { id: login.id, name: login.name, role: 'DDO', departmentId: login.departmentId! } : { id: `ddo-${dept?.id}`, name: dept?.ddoName ?? 'DDO', role: 'DDO', ...(dept ? { departmentId: dept.id } : {}) };
  }
  const u = db.staffUsers.find((x) => x.role === role);
  return u ? { id: u.id, name: u.name, role } : undefined;
}

function releasePledge(db: Db, l: Loan) {
  const fd = l.pledgedDepositId ? db.deposits.find((d) => d.id === l.pledgedDepositId && d.pledgedToLoanId === l.id) : undefined;
  if (fd) delete fd.pledgedToLoanId;
}

/** ST-26 sheet for an amount / tenure (defaults: what was applied). */
export function sanctionPreview(db: Db, l: Loan, amount?: number, instalments?: number): SanctionPreview {
  const m = db.members.find((x) => x.id === l.memberId)!;
  const product = productOf(db, l);
  const ctx = loanContext(db, m);
  const amt = amount ?? l.sanctionedAmount ?? l.appliedAmount;
  const inst = instalments ?? l.sanctionedInstalments ?? l.appliedInstalments;
  const maxInstalments = checkTenureEligibility(calculateLeftoverService(m.dor, db.demo.today).months, inst, product.maxInstalments).maxAllowed;
  const parent = l.parentLoanId ? db.loans.find((x) => x.id === l.parentLoanId) : undefined;
  const ordinary = db.loans.filter((x) => x.memberId === m.id && x.status === 'ACTIVE' && x.product === 'ORDINARY' && x.id !== parent?.id);
  const salary = db.loans.filter((x) => x.memberId === m.id && x.status === 'ACTIVE' && x.product === 'SALARY');
  const sheet = buildSanctionSheet({
    amount: amt,
    instalments: Math.max(1, inst),
    product,
    firstDueCycle: ctx.firstDueCycle,
    existingShareDeposit: ctx.shares.shareDepositBalance,
    today: db.demo.today,
    ...(parent ? { topup: { loanId: parent.id, loanNo: parent.loanNo ?? parent.applicationNo, outstandingPrincipal: parent.outstandingPrincipal, ratePercent: parent.ratePercent, lastInterestChargedOn: lastInterestChargedOn(parent, db.demo.today) } } : {}),
    balances: {
      ordinary: ordinary.reduce((s, x) => s + x.outstandingPrincipal, 0),
      salary: salary.reduce((s, x) => s + x.outstandingPrincipal, 0),
      ...(ordinary[0]?.disbursedOn ? { ordinaryTakenOn: ordinary[0].disbursedOn } : {}),
      ...(salary[0]?.disbursedOn ? { salaryTakenOn: salary[0].disbursedOn } : {}),
    },
  });
  return { sheet, maxInstalments, fieldErrors: validateSanctionAdjustment(amt, inst, { amount: l.appliedAmount, instalments: l.appliedInstalments }, maxInstalments) };
}

/** One transition with its side effects. `demo` lets a demo user act as the stage owner. */
export function applyLoanAction(store: Store, l: Loan, action: LoanAction, actor: Actor, input: LoanActionInput, opts: { demo?: boolean } = {}) {
  const db = store.db;
  const product = productOf(db, l);
  const m = db.members.find((x) => x.id === l.memberId)!;
  if (!opts.demo) {
    const allowed = loanActionsFor({ status: l.status, memberDepartmentId: m.departmentId }, { role: actor.role, ...(actor.departmentId ? { departmentId: actor.departmentId } : {}) });
    if (!allowed.includes(action)) fail(allowed.length ? 'FORBIDDEN' : 'INVALID_TRANSITION', allowed.length ? 'That action is not yours at this stage.' : `Nothing for you to do at "${l.status}".`);
  }
  const next = nextLoanStatus(l.status, action, { product, allSuretiesAccepted: suretyProgress(l.sureties, product.suretiesRequired).allAccepted });
  if (!next) return fail('INVALID_TRANSITION', `"${action}" is not possible at "${l.status}".`);
  const remarks = input.remarks?.trim();
  const at = nowIso();
  const signOff = { byId: actor.id, byName: actor.name, role: actor.role, at, ...(remarks ? { remarks } : {}) };
  const needReason = () => {
    if (!remarks) fail('VALIDATION_ERROR', 'Give a reason. The member sees it.', { fieldErrors: { remarks: 'Required' } });
  };
  l.signOffs ??= {};

  switch (action) {
    case 'forward': {
      if (!input.checklist?.memberVerified || !input.checklist.documentsVerified) fail('VALIDATION_ERROR', 'Tick every item on the checklist.', { fieldErrors: { checklist: 'Confirm member details and documents' } });
      const block = assess(db, m, inputOf(l), l.id).checks.find((c) => !c.pass && c.severity === 'block');
      if (block) fail('RULE_VIOLATION', block.message, { ruleId: block.ruleId });
      l.signOffs.review = signOff;
      break;
    }
    case 'returnToMember':
      needReason();
      l.returnInfo = { byName: actor.name, role: actor.role, at, reason: remarks! };
      notify(store, m.id, 'loan.returned', { applicationNo: l.applicationNo, reason: remarks! }, `/loan/${l.id}`);
      break;
    case 'reject':
      needReason();
      l.rejection = signOff;
      releasePledge(db, l);
      notify(store, m.id, 'loan.rejected', { applicationNo: l.applicationNo, reason: remarks! }, `/loan/${l.id}`);
      break;
    case 'ddoCertify':
      if (input.recoveryFeasible !== true) fail('VALIDATION_ERROR', 'Confirm that the loan can be recovered from salary, or return the application.', { fieldErrors: { recoveryFeasible: 'Required' } });
      l.signOffs.ddo = { ...signOff, recoveryFeasible: true };
      // The DDO's certificate refreshes the member's pay profile (F2 items 4–5).
      if (l.form?.pay) m.payProfile = { ...m.payProfile, scaleOfPay: l.form.pay.scaleOfPay, grossSalary: l.form.pay.grossSalary, govtLoanDeductions: l.form.pay.govtLoanDeductions, otherLoanDeductions: l.form.pay.otherLoanDeductions, certifiedAt: db.demo.today };
      break;
    case 'ddoRecordManual': {
      const x = input.manual;
      if (!x?.ddoName?.trim() || !x.designation?.trim() || !x.date || !x.reference?.trim()) fail('VALIDATION_ERROR', 'Enter the DDO name, designation, date and letter reference.', { fieldErrors: { manual: 'All fields are required' } });
      l.signOffs.ddo = { ...signOff, recoveryFeasible: true, manual: { ddoName: x!.ddoName.trim(), designation: x!.designation.trim(), date: x!.date, reference: x!.reference.trim() } };
      break;
    }
    case 'sendForSanction': {
      const p = sanctionPreview(db, l, input.amount, input.instalments);
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
      l.sanctionLetterNo = `SL-${db.demo.today.slice(0, 4)}-${String(db.loans.filter((x) => x.sanctionLetterNo).length + 1).padStart(4, '0')}`;
      notify(store, m.id, 'loan.sanctioned', { product: product.name, amount: formatINR(l.sanctionedAmount ?? l.appliedAmount), emi: formatINR(l.emi ?? 0), firstCycle: formatCycle(l.sanctionSheet?.firstDueCycle ?? db.currentCycle) }, `/loan/${l.id}`);
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
      if (!d?.date || d.date > db.demo.today) fieldErrors.date = 'Enter the payment date (today or earlier)';
      if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Check the payment details.', { fieldErrors });
      const amount = l.sanctionedAmount ?? l.appliedAmount;
      const instalments = l.sanctionedInstalments ?? l.appliedInstalments;
      const firstDue = toCycle(addMonths(`${toCycle(d!.date)}-01`, 1));
      l.loanNo = `LN-${d!.date.slice(0, 4)}-${String(db.loans.filter((x) => x.loanNo).length + 1).padStart(5, '0')}`;
      l.disbursedOn = d!.date;
      l.schedule = generateSchedule(amount, l.ratePercent, instalments, product.emiMethod, firstDue);
      l.emi = l.schedule[0]?.emi ?? l.emi;
      l.outstandingPrincipal = amount;
      l.disbursement = { mode: d!.mode, reference: d!.reference.trim(), date: d!.date, amount: l.netDisbursable ?? amount, byName: actor.name, at };
      // BR-004: the share deposit deduction is credited to the member's share deposit.
      const shares = db.shareAccounts.find((s) => s.memberId === m.id);
      if (shares && l.shareDepositDeduction) shares.shareDepositBalance += l.shareDepositDeduction;
      // J-07: a top-up closes the loan it settles.
      const parent = l.parentLoanId ? db.loans.find((x) => x.id === l.parentLoanId) : undefined;
      if (parent && parent.status === 'ACTIVE') {
        parent.events.push({ at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action: 'closedByTopup', fromStatus: 'ACTIVE', toStatus: 'CLOSED_BY_TOPUP', remarks: `Settled by top-up ${l.loanNo}` });
        Object.assign(parent, { status: 'CLOSED_BY_TOPUP', outstandingPrincipal: 0, closedOn: d!.date });
      }
      notify(store, m.id, 'loan.disbursed', { netAmount: formatINR(l.disbursement.amount), loanNo: l.loanNo }, `/loan/${l.id}`);
      break;
    }
    default:
      break;
  }
  l.events.push({ at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: l.status, toStatus: next, ...(remarks ? { remarks } : {}) });
  l.status = next;
  audit(store, { id: actor.id, name: actor.name, role: actor.role }, 'loan', l.id, action, `${actor.name}: ${action} on ${l.loanNo ?? l.applicationNo} (${m.name})${opts.demo ? ' [demo]' : ''}`);
  store.save();
  return l;
}

/** Demo defaults for each stage, so "Act as …" can push a loan along in one click. */
function demoInput(l: Loan, action: LoanAction, db: Db): LoanActionInput {
  switch (action) {
    case 'forward':
      return { checklist: { memberVerified: true, documentsVerified: true }, remarks: 'Documents verified. Forwarded.' };
    case 'ddoCertify':
      return { recoveryFeasible: true, remarks: 'Particulars 1–5 verified with the service register.' };
    case 'sendForSanction':
      return { remarks: 'Assessed as per rules.' };
    case 'disburse':
      return { disbursement: { mode: 'NEFT', reference: `UTR${Date.now().toString().slice(-9)}`, date: db.demo.today } };
    default:
      return {};
  }
}

// ---- surety side (MB-07) ------------------------------------------------------------------------

function suretyRequest(db: Db, l: Loan, me: string): SuretyRequest {
  const b = db.members.find((x) => x.id === l.memberId)!;
  const mine = l.sureties.find((s) => s.memberId === me && s.status !== 'REPLACED')!;
  const card = suretyCards(db, { id: l.id, memberId: l.memberId, sureties: l.sureties, instalments: l.appliedInstalments }, [me])[0]!;
  const a = assess(db, b, inputOf(l), l.id);
  return {
    loanId: l.id,
    applicationNo: l.applicationNo,
    ...(l.loanNo ? { loanNo: l.loanNo } : {}),
    status: l.status,
    borrower: { name: b.name, generalNo: b.generalNo, departmentName: db.departments.find((d) => d.id === b.departmentId)?.name ?? '', designation: b.designation },
    productName: productOf(db, l).name,
    amount: l.sanctionedAmount ?? l.appliedAmount,
    instalments: l.sanctionedInstalments ?? l.appliedInstalments,
    emi: l.emi ?? a.preview.emi,
    outstanding: l.outstandingPrincipal,
    appliedOn: l.appliedOn,
    myStatus: mine.status,
    ...(mine.respondedAt ? { respondedAt: mine.respondedAt } : {}),
    me: card,
    otherSureties: l.sureties.filter((s) => s.memberId !== me && s.status !== 'REPLACED').map((s) => ({ name: db.members.find((x) => x.id === s.memberId)?.name ?? '', status: s.status })),
    declaration: SURETY_DECLARATION,
  };
}

function suretyRespond(store: Store, l: Loan, memberId: string, accept: boolean, reason?: string) {
  const db = store.db;
  if (l.status !== 'SURETY_PENDING') fail('INVALID_TRANSITION', 'This loan is no longer waiting for sureties.');
  const s = l.sureties.find((x) => x.memberId === memberId && x.status === 'PENDING');
  if (!s) return fail('INVALID_TRANSITION', 'You have already answered this request.');
  const surety = db.members.find((x) => x.id === memberId)!;
  const product = productOf(db, l);
  const at = nowIso();
  if (accept) {
    // BR-014 is re-checked at signing: the limit may have been reached since the request.
    const check = suretyCards(db, { id: l.id, memberId: l.memberId, sureties: l.sureties, instalments: l.appliedInstalments }, [memberId])[0]?.checks.find((c) => !c.pass && c.severity === 'block');
    if (check) fail('RULE_VIOLATION', check.message, { ruleId: check.ruleId });
    Object.assign(s, { status: 'ACCEPTED', respondedAt: at });
  } else {
    if (!reason?.trim()) fail('VALIDATION_ERROR', 'Tell the applicant why.', { fieldErrors: { reason: 'Required' } });
    Object.assign(s, { status: 'DECLINED', respondedAt: at, declineReason: reason!.trim() });
  }
  const next = nextLoanStatus(l.status, accept ? 'suretyAccept' : 'suretyDecline', { product, allSuretiesAccepted: suretyProgress(l.sureties, product.suretiesRequired).allAccepted })!;
  l.events.push({ at, actorId: surety.id, actorName: surety.name, actorRole: 'MEMBER', action: accept ? 'suretyAccept' : 'suretyDecline', fromStatus: l.status, toStatus: next, ...(reason?.trim() ? { remarks: reason.trim() } : {}) });
  l.status = next;
  if (!accept) notify(store, l.memberId, 'loan.suretyDeclined', { surety: surety.name, applicationNo: l.applicationNo, reason: reason!.trim() }, `/loan/${l.id}`);
  else if (next === 'ACCOUNTANT_REVIEW') notify(store, l.memberId, 'loan.suretiesSigned', { applicationNo: l.applicationNo }, `/loan/${l.id}`);
  store.save();
}

// ---- Work Queue (ST-02) ---------------------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  ACCOUNTANT_REVIEW: 'Review',
  DDO_CERTIFICATION: 'DDO certificate',
  ASSESSMENT: 'Assessment',
  SANCTION_SECRETARY: 'Sanction',
  SANCTION_PRESIDENT: 'Sanction',
  SANCTIONED: 'Disbursement',
  membership: 'Joining',
  profile: 'Profile changes',
  mandate: 'Mandates',
  deposit: 'Deposits',
  demand: 'Demand sheets',
  payments: 'Reported payments',
};
const ACTION_TEXT: Record<string, string> = {
  forward: 'Review',
  ddoCertify: 'Certify',
  ddoRecordManual: 'Record DDO certificate',
  sendForSanction: 'Assess',
  secretarySign: 'Sign sanction',
  presidentSign: 'Sign sanction',
  disburse: 'Disburse',
};

export function workQueue(db: Db, user: SessionUser): WorkQueue {
  const today = db.demo.today;
  const dept = (id: string) => db.departments.find((d) => d.id === id)?.name ?? '';
  const items: WorkItem[] = [];
  const actor = { role: user.role, ...(user.departmentId ? { departmentId: user.departmentId } : {}) };
  for (const l of db.loans) {
    if (!staffCanSee(db, l, user)) continue;
    const m = db.members.find((x) => x.id === l.memberId);
    if (!m) continue;
    const acts = loanActionsFor({ status: l.status, memberDepartmentId: m.departmentId }, actor);
    if (!acts.length) continue;
    const since = (l.events.at(-1)?.at ?? l.appliedOn).slice(0, 10);
    const primary = PRIMARY_LOAN_ACTION[l.status] && acts.includes(PRIMARY_LOAN_ACTION[l.status]!) ? PRIMARY_LOAN_ACTION[l.status]! : acts[0]!;
    const stage = l.status === 'SANCTION_PRESIDENT' ? 'SANCTION_SECRETARY' : l.status;
    items.push({ kind: 'loan', id: l.id, ref: l.applicationNo, title: m.name, subtitle: `${productOf(db, l).name}${l.parentLoanId ? ' top-up' : ''} · ${l.sanctionedInstalments ?? l.appliedInstalments} months`, stage, stageLabel: STAGE_LABEL[stage] ?? stage, status: l.status, departmentName: dept(m.departmentId), amount: l.sanctionedAmount ?? l.appliedAmount, since, days: daysBetween(since, today), actionLabel: ACTION_TEXT[primary] ?? primary, link: `/loans/${l.id}` });
  }
  if (can(user, 'membership.view')) {
    for (const a of db.membershipApplications) {
      if (a.status === 'DRAFT' || (user.role === 'DDO' && a.departmentId !== user.departmentId)) continue;
      if (!membershipActionsFor(a, user).length) continue;
      const since = (a.events.at(-1)?.at ?? a.submittedOn ?? today).slice(0, 10);
      items.push({ kind: 'membership', id: a.id, ref: a.applicationNo, title: a.name, subtitle: `Membership · ${a.designation}`, stage: 'membership', stageLabel: STAGE_LABEL.membership!, status: a.status, departmentName: dept(a.departmentId), since, days: daysBetween(since, today), actionLabel: 'Open', link: `/joining/${a.id}` });
    }
  }
  for (const r of db.profileChangeRequests) {
    if (r.status !== 'PENDING') continue;
    const m = db.members.find((x) => x.id === r.memberId);
    if (!m) continue;
    const needsDdo = r.route === 'DDO_THEN_OFFICE' && !r.ddoCertified;
    const mine = needsDdo ? user.role === 'DDO' && user.departmentId === m.departmentId : can(user, 'members.decideChanges');
    if (!mine) continue;
    const since = (r.ddoCertified?.at ?? r.createdAt).slice(0, 10);
    items.push({ kind: 'changeRequest', id: r.id, ref: `General No. ${m.generalNo}`, title: m.name, subtitle: `Change of ${r.fields.map((f) => PROFILE_FIELDS[f.field].label.toLowerCase()).join(', ')}`, stage: 'profile', stageLabel: STAGE_LABEL.profile!, departmentName: dept(m.departmentId), since, days: daysBetween(since, today), actionLabel: needsDdo ? 'Certify' : 'Decide', link: '/members/change-requests' });
  }
  if (user.role === 'DDO') {
    for (const x of db.mandates) {
      if (x.status !== 'PENDING_NEW_DDO' || x.departmentId !== user.departmentId) continue;
      const m = db.members.find((y) => y.id === x.memberId);
      if (!m) continue;
      items.push({ kind: 'mandate', id: x.id, ref: `General No. ${m.generalNo}`, title: m.name, subtitle: 'Transferred in · agree the salary recovery mandate', stage: 'mandate', stageLabel: STAGE_LABEL.mandate!, departmentName: dept(m.departmentId), since: x.signedOn, days: daysBetween(x.signedOn, today), actionLabel: 'Agree', link: `/members/${m.id}` });
    }
  }
  items.push(...depositWorkItems(db, user));
  items.push(...collectionWorkItems(db, user));
  items.sort((a, b) => b.days - a.days);
  const tabs = [...new Set(items.map((i) => i.stage))].map((key) => ({ key, label: STAGE_LABEL[key] ?? key, count: items.filter((i) => i.stage === key).length }));
  const d = user.role === 'DDO' && user.departmentId ? db.departments.find((x) => x.id === user.departmentId) : undefined;
  return { items, tabs, scope: d ? { departmentName: d.name } : {} };
}

// ---- routes -------------------------------------------------------------------------------------

export function registerLoanWorkflow(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const otps = new Map<string, { loanId: string; memberId: string; expiresAt: number }>();
  const staffLoan = (id: string, user: SessionUser) => {
    requireStaff(user);
    const l = db().loans.find((x) => x.id === id);
    if (!l || !staffCanSee(db(), l, user)) return fail('NOT_FOUND', 'This loan does not exist or is outside your department.');
    return l;
  };
  const actorOf = (u: SessionUser): Actor => ({ id: u.id, name: u.name, role: u.role, ...(u.departmentId ? { departmentId: u.departmentId } : {}) });

  api.get('/work-queue', requireSession, (c) => {
    const user = c.get('session');
    requireStaff(user);
    return c.json<WorkQueue>(workQueue(db(), user));
  });

  api.get('/loans/:id/sanction-preview', requireSession, (c) => {
    const user = c.get('session');
    const l = staffLoan(c.req.param('id'), user);
    const amount = c.req.query('amount');
    const instalments = c.req.query('instalments');
    return c.json<SanctionPreview>(sanctionPreview(db(), l, amount ? Number(amount) : undefined, instalments ? Number(instalments) : undefined));
  });

  api.post('/loans/:id/actions/:action', requireSession, async (c) => {
    const user = c.get('session');
    const l = staffLoan(c.req.param('id'), user);
    const input = await c.req.json<LoanActionInput>().catch((): LoanActionInput => ({}));
    applyLoanAction(store, l, c.req.param('action') as LoanAction, actorOf(user), input);
    return c.json<LoanDetail>(loanDetail(db(), l, user));
  });

  /** Demo: complete the current stage as its owner (sureties, another department's DDO, …). */
  api.post('/loans/:id/demo-act', requireSession, (c) => {
    const user = c.get('session');
    if (!can(user, 'demo.control')) fail('FORBIDDEN', 'Demo controls are off for this user.');
    const l = staffLoan(c.req.param('id'), user);
    if (l.status === 'SURETY_PENDING') {
      for (const s of l.sureties.filter((x) => x.status === 'PENDING')) suretyRespond(store, l, s.memberId, true);
      if (l.status === 'SURETY_PENDING') fail('INVALID_TRANSITION', 'A surety declined. The member must choose another one in the app.');
    } else {
      const action = PRIMARY_LOAN_ACTION[l.status];
      const owner = stageOwner(db(), l);
      if (!action || !owner) return fail('INVALID_TRANSITION', `Nothing to do at "${l.status}".`);
      applyLoanAction(store, l, action, owner, demoInput(l, action, db()), { demo: true });
    }
    return c.json<LoanDetail>(loanDetail(db(), l, user));
  });

  // ---- member: surety requests (MB-07) -------------------------------------------------------
  api.get('/me/surety-requests', requireSession, (c) => {
    const me = requireMember(c.get('session'));
    const mine = db().loans.filter((l) => l.status !== 'DRAFT' && l.sureties.some((s) => s.memberId === me && s.status !== 'REPLACED'));
    const requests = mine.filter((l) => l.status === 'SURETY_PENDING' && l.sureties.some((s) => s.memberId === me && s.status === 'PENDING')).map((l) => suretyRequest(db(), l, me));
    const guaranteeing = mine.filter((l) => l.sureties.some((s) => s.memberId === me && s.status === 'ACCEPTED') && !['REJECTED', 'WITHDRAWN', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(l.status)).map((l) => suretyRequest(db(), l, me));
    return c.json<SuretyRequests>({ requests, guaranteeing });
  });

  api.post('/me/surety-requests/:loanId/sign/request', requireSession, (c) => {
    const me = requireMember(c.get('session'));
    const l = db().loans.find((x) => x.id === c.req.param('loanId') && x.sureties.some((s) => s.memberId === me && s.status === 'PENDING'));
    if (!l || l.status !== 'SURETY_PENDING') return fail('NOT_FOUND', 'This request is no longer open.');
    const otpRef = randomUUID();
    otps.set(otpRef, { loanId: l.id, memberId: me, expiresAt: Date.now() + 300_000 });
    return c.json<OtpChallenge>({ otpRef, expiresInSeconds: 300, demoOtp: DEMO_OTP });
  });

  api.post('/me/surety-requests/:loanId/accept', requireSession, async (c) => {
    const user = c.get('session');
    const me = requireMember(user);
    const { otpRef = '', otp } = await c.req.json<{ otpRef?: string; otp?: string }>().catch(() => ({}) as { otpRef?: string; otp?: string });
    const pending = otps.get(otpRef);
    if (!pending || pending.memberId !== me || pending.loanId !== c.req.param('loanId') || Date.now() > pending.expiresAt) fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    if (otp !== DEMO_OTP) fail('VALIDATION_ERROR', "That code doesn't match. Check the SMS and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    otps.delete(otpRef);
    const l = db().loans.find((x) => x.id === pending!.loanId)!;
    suretyRespond(store, l, me, true);
    audit(store, user, 'loan', l.id, 'suretyAccept', `${user.name} signed as surety for ${l.applicationNo}`);
    return c.json<SuretyRequest>(suretyRequest(db(), l, me));
  });

  api.post('/me/surety-requests/:loanId/decline', requireSession, async (c) => {
    const user = c.get('session');
    const me = requireMember(user);
    const l = db().loans.find((x) => x.id === c.req.param('loanId')) ?? fail('NOT_FOUND', 'Request not found.');
    const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string });
    suretyRespond(store, l, me, false, reason);
    audit(store, user, 'loan', l.id, 'suretyDecline', `${user.name} declined to be surety for ${l.applicationNo}`);
    return c.json<SuretyRequest>(suretyRequest(db(), l, me));
  });

  // ---- member: replace a declined surety, withdraw (MB-04) ------------------------------------
  api.post('/me/loans/:id/sureties/replace', requireSession, async (c) => {
    const user = c.get('session');
    const me = requireMember(user);
    const l = db().loans.find((x) => x.id === c.req.param('id') && x.memberId === me) ?? fail('NOT_FOUND', 'Loan not found.');
    if (l.status !== 'SURETY_PENDING') fail('INVALID_TRANSITION', 'Sureties can only be changed while the loan waits for them.');
    const { oldId, newId } = await c.req.json<{ oldId?: string; newId?: string }>().catch(() => ({}) as { oldId?: string; newId?: string });
    const old = l.sureties.find((s) => s.memberId === oldId && (s.status === 'DECLINED' || s.status === 'PENDING')) ?? fail('VALIDATION_ERROR', 'Choose the surety to replace.');
    if (!newId || newId === me || l.sureties.some((s) => s.memberId === newId && s.status !== 'REPLACED')) fail('VALIDATION_ERROR', 'Choose a different member.', { fieldErrors: { newId: 'Choose a different member' } });
    const card = suretyCards(db(), { id: l.id, memberId: me, sureties: l.sureties, instalments: l.appliedInstalments }, [newId!])[0] ?? fail('NOT_FOUND', 'Member not found.');
    const block = card.checks.find((x) => !x.pass && x.severity === 'block');
    if (block) fail('RULE_VIOLATION', `${card.name}: ${block.message}`, { ruleId: block.ruleId });
    old.status = 'REPLACED';
    const n = db().members.find((x) => x.id === newId)!;
    l.sureties.push({ memberId: newId!, status: 'PENDING', retiresDuringLoan: card.checks.some((x) => x.ruleId === 'BR-024' && !x.pass) });
    l.events.push({ at: nowIso(), actorId: me, actorName: user.name, actorRole: 'MEMBER', action: 'replaceSurety', fromStatus: l.status, toStatus: l.status, remarks: `${db().members.find((x) => x.id === oldId)?.name ?? ''} → ${n.name}` });
    notify(store, newId!, 'loan.surety', { borrower: user.name, product: productOf(db(), l).name, amount: formatINR(l.appliedAmount) }, '/surety');
    store.save();
    return c.json<LoanDetail>(loanDetail(db(), l, user));
  });

  api.post('/me/loans/:id/withdraw', requireSession, async (c) => {
    const user = c.get('session');
    const me = requireMember(user);
    const l = db().loans.find((x) => x.id === c.req.param('id') && x.memberId === me) ?? fail('NOT_FOUND', 'Loan not found.');
    const next = l.status === 'DRAFT' ? undefined : nextLoanStatus(l.status, 'withdraw', { product: productOf(db(), l) });
    if (!next) return fail('INVALID_TRANSITION', 'This application can no longer be withdrawn. Contact the office.');
    const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string });
    l.events.push({ at: nowIso(), actorId: me, actorName: user.name, actorRole: 'MEMBER', action: 'withdraw', fromStatus: l.status, toStatus: next, ...(reason?.trim() ? { remarks: reason.trim() } : {}) });
    l.status = next;
    releasePledge(db(), l);
    audit(store, user, 'loan', l.id, 'withdraw', `${user.name} withdrew ${l.applicationNo}`);
    store.save();
    return c.json<LoanDetail>(loanDetail(db(), l, user));
  });
}

