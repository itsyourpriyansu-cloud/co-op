// ST-14 … ST-17: the staff side of joining (D-026, D-053).
// Every transition goes through applyMembershipAction, so console actions and demo controls
// write the same audit trail and sign-offs.
import type { Hono, MiddlewareHandler } from 'hono';
import {
  checkMembershipEligibility,
  daysInMonth,
  isMembershipInFlight,
  MEMBERSHIP_STAGE_OWNER,
  membershipActionsFor,
  membershipShareAmount,
  nextMembershipStatus,
  primaryMembershipAction,
} from '@tgs/domain';
import {
  F1_CERT_ITEMS,
  ROLE_LABELS,
  type ISODate,
  type Member,
  type MembershipAction,
  type MembershipActionInput,
  type MembershipApplication,
  type MembershipDetail,
  type MembershipFlag,
  type MembershipList,
  type MembershipRow,
  type MembershipStatus,
  type Role,
  type SessionUser,
  type StaffSignOff,
} from '@tgs/types';
import { nowIso } from './clock';
import { fail } from './errors';
import { AGREEMENTS, REQUIRED_DOCUMENTS } from './joining-reference';
import { permissionsFor } from './permissions';
import type { Db, Store } from './store';

type Env = { Variables: { session: SessionUser; token: string } };

export interface Actor {
  id: string;
  name: string;
  role: Role;
  departmentId?: string;
}

const daysBetween = (from: ISODate, to: ISODate) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));

// ---- who acts next ------------------------------------------------------------------------------

/** The person who owns the current stage (the department's DDO for DDO certification). */
export function stageOwner(db: Db, app: MembershipApplication): Actor | undefined {
  const role = MEMBERSHIP_STAGE_OWNER[app.status];
  if (!role || role === 'APPLICANT') return undefined;
  if (role === 'DDO') {
    const login = db.staffUsers.find((u) => u.role === 'DDO' && u.departmentId === app.departmentId);
    if (login) return { id: login.id, name: login.name, role: 'DDO', departmentId: app.departmentId };
    const dept = db.departments.find((d) => d.id === app.departmentId);
    return { id: `ddo-${app.departmentId}`, name: dept?.ddoName ?? 'Department DDO', role: 'DDO', departmentId: app.departmentId };
  }
  const user = db.staffUsers.find((u) => u.role === role);
  return user ? { id: user.id, name: user.name, role } : undefined;
}

function waitingOnLabel(db: Db, app: MembershipApplication): string | undefined {
  if (app.status === 'INFO_REQUESTED') return 'Applicant (correction)';
  const owner = stageOwner(db, app);
  if (!owner) return undefined;
  if (owner.role === 'DDO') return `${owner.name} (DDO, ${db.departments.find((d) => d.id === app.departmentId)?.name ?? ''})`;
  return `${owner.name} (${ROLE_LABELS[owner.role]})`;
}

// ---- read models --------------------------------------------------------------------------------

function flagsFor(db: Db, app: MembershipApplication): MembershipFlag[] {
  if (app.status === 'ACTIVE') return [];
  const flags: MembershipFlag[] = [];
  const e = app.eligibility;
  if (e && (!e.worksInSecretariatDept || !e.regularOrApprovedProbationer || e.memberOfOtherCreditSocietyWithDues)) flags.push('INELIGIBLE_ANSWER');
  const mobile = app.form?.personal?.mobile;
  const match = mobile ? db.members.find((m) => m.mobile === mobile) : undefined;
  if (match) flags.push(match.status === 'ACTIVE' ? 'EXISTING_MEMBER' : 'DUPLICATE_MOBILE');
  if (documentsOf(app).uploaded < documentsOf(app).required) flags.push('DOCUMENTS_MISSING');
  if (app.events.some((ev) => ev.toStatus === 'INFO_REQUESTED')) flags.push('RETURNED');
  return flags;
}

function documentsOf(app: MembershipApplication) {
  const required = REQUIRED_DOCUMENTS.filter((d) => d.required);
  return { uploaded: required.filter((d) => app.form?.documents?.some((x) => x.type === d.type)).length, required: required.length };
}

const stageSince = (app: MembershipApplication): ISODate => (app.events.at(-1)?.at ?? app.submittedOn ?? '').slice(0, 10);

function toRow(db: Db, app: MembershipApplication, user: SessionUser): MembershipRow {
  const since = stageSince(app) || db.demo.today;
  const waitingOn = waitingOnLabel(db, app);
  return {
    id: app.id,
    applicationNo: app.applicationNo,
    name: app.name,
    departmentId: app.departmentId,
    departmentName: db.departments.find((d) => d.id === app.departmentId)?.name ?? '',
    designation: app.designation,
    status: app.status,
    ...(app.submittedOn ? { submittedOn: app.submittedOn } : {}),
    stageSince: since,
    daysInStage: daysBetween(since, db.demo.today),
    documents: documentsOf(app),
    flags: flagsFor(db, app),
    sharesProposed: app.sharesProposed,
    waitingOnMe: membershipActionsFor(app, user).length > 0,
    ...(waitingOn ? { waitingOn } : {}),
    ...(app.allottedGeneralNo ? { allottedGeneralNo: app.allottedGeneralNo } : {}),
  };
}

function visibleTo(app: MembershipApplication, user: SessionUser) {
  return app.status !== 'DRAFT' && (user.role !== 'DDO' || app.departmentId === user.departmentId);
}

export function membershipDetail(db: Db, app: MembershipApplication, user: SessionUser): MembershipDetail {
  const dob = app.form?.personal?.dob;
  const e = app.eligibility;
  const checks: MembershipDetail['checks'] = e
    ? checkMembershipEligibility({ ...e, ...(dob ? { dob, today: db.demo.today } : {}) }).checks
    : [{ ruleId: 'BR-026', pass: false, message: 'Eligibility answers were not captured.', severity: 'warn' }];
  const mobile = app.form?.personal?.mobile;
  const sameMobile = mobile ? db.members.find((m) => m.mobile === mobile && m.generalNo !== app.allottedGeneralNo) : undefined;
  checks.push(
    sameMobile
      ? { ruleId: 'DUP-1', pass: false, message: `Mobile ${mobile} already belongs to ${sameMobile.name} (General No. ${sameMobile.generalNo}).`, severity: 'warn' }
      : { ruleId: 'DUP-1', pass: true, message: 'Mobile number is not registered to another member.', severity: 'warn' },
  );
  const empId = app.form?.employment?.employeeId;
  const sameEmp = empId ? db.members.find((m) => m.employeeId === empId && m.generalNo !== app.allottedGeneralNo) : undefined;
  checks.push(
    sameEmp
      ? { ruleId: 'DUP-2', pass: false, message: `Employee ID ${empId} already belongs to ${sameEmp.name}.`, severity: 'warn' }
      : { ruleId: 'DUP-2', pass: true, message: empId ? 'Employee ID is not registered to another member.' : 'No employee ID given.', severity: 'warn' },
  );
  const docs = documentsOf(app);
  checks.push(docs.uploaded >= docs.required ? { ruleId: 'DOC-1', pass: true, message: 'All required documents uploaded.', severity: 'block' } : { ruleId: 'DOC-1', pass: false, message: `${docs.required - docs.uploaded} required document(s) missing.`, severity: 'block' });
  const { minShares, maxShares } = db.settings;
  checks.push(
    app.sharesProposed >= minShares && app.sharesProposed <= maxShares
      ? { ruleId: 'BR-032', pass: true, message: `${app.sharesProposed} shares proposed (allowed ${minShares}–${maxShares}).`, severity: 'block' }
      : { ruleId: 'BR-032', pass: false, message: `Shares must be between ${minShares} and ${maxShares}.`, severity: 'block' },
  );

  const actions = membershipActionsFor(app, user);
  const owner = stageOwner(db, app);
  const waitingOn = waitingOnLabel(db, app);
  return {
    application: app,
    department: db.departments.find((d) => d.id === app.departmentId) ?? null,
    actions,
    ...(waitingOn ? { waitingOn } : {}),
    ...(!actions.length && owner && isMembershipInFlight(app.status) && permissionsFor(user.role).includes('demo.control') ? { demoActAs: { name: owner.name, role: owner.role } } : {}),
    checks,
    shareAmount: membershipShareAmount(app.sharesProposed, db.settings.shareValue),
    requiredDocuments: REQUIRED_DOCUMENTS,
    agreements: AGREEMENTS,
  };
}

// ---- transitions --------------------------------------------------------------------------------

/** Sensible inputs when a demo control acts on someone's behalf. */
export function demoInputFor(action: MembershipAction): MembershipActionInput {
  switch (action) {
    case 'certify':
      return { items: Object.fromEntries(F1_CERT_ITEMS.map((i) => [i, 'OK'])), mandateAgreed: true, remarks: 'Items 1 to 7 verified with the service register.' };
    case 'approve':
      return { sharePaymentRoute: 'COUNTER', remarks: 'Approved.' };
    case 'recordSharePayment':
      return { mode: 'CASH' };
    case 'returnToApplicant':
      return { field: 'employment.regularAppointmentDate', remarks: 'The date of regular appointment does not match the service register. Please check and correct it.' };
    case 'reject':
      return { remarks: 'Applicant is a member of another credit society with dues.' };
    case 'sendToDdo':
      return { remarks: 'Documents complete. Sent to the department for certification.' };
    case 'forward':
      return { remarks: 'Eligible. Recommended for admission.' };
    default:
      return {};
  }
}

/**
 * Applies one staff action. `demo: true` (demo controls only) skips the role check, so the
 * presenter can act for whoever owns the stage; stage validity and input rules still apply.
 */
export function applyMembershipAction(store: Store, app: MembershipApplication, action: MembershipAction, actor: Actor, input: MembershipActionInput = {}, opts: { demo?: boolean } = {}) {
  const db = store.db;
  const next = nextMembershipStatus(app.status, action) ?? (opts.demo && action === 'reject' && isMembershipInFlight(app.status) ? 'REJECTED' : undefined);
  if (!next) fail('INVALID_TRANSITION', `This application is now "${app.status}". Refresh to see the latest.`);
  if (!opts.demo && !membershipActionsFor(app, actor).includes(action)) fail('FORBIDDEN', 'This step belongs to someone else.');

  const remarks = input.remarks?.trim();
  const fieldErrors: Record<string, string> = {};
  if ((action === 'returnToApplicant' || action === 'reject') && (!remarks || remarks.length < 10)) fieldErrors.remarks = action === 'reject' ? 'Give the reason (at least 10 characters). The applicant will see it.' : 'Tell the applicant what to correct (at least 10 characters).';
  if (action === 'certify') {
    const flagged = F1_CERT_ITEMS.filter((i) => input.items?.[i] !== 'OK');
    if (flagged.length) fieldErrors.items = 'Confirm every item, or return the application with the items that need correction.';
    if (!input.mandateAgreed) fieldErrors.mandateAgreed = 'Agree to the salary recovery mandate to certify.';
  }
  if (action === 'approve' && app.status === 'APPROVAL_PRESIDENT' && !input.sharePaymentRoute) fieldErrors.sharePaymentRoute = 'Choose how the shares are paid.';
  if (action === 'recordSharePayment') {
    if (!input.mode) fieldErrors.mode = 'Choose how the money was received.';
    if (input.mode && input.mode !== 'CASH' && !input.reference?.trim()) fieldErrors.reference = 'Enter the UPI or cheque reference.';
  }
  if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });

  const at = nowIso();
  const signOff: StaffSignOff = { byId: actor.id, byName: actor.name, role: actor.role, at, ...(remarks ? { remarks } : {}) };
  const dept = db.departments.find((d) => d.id === app.departmentId);
  app.events.push({ at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: app.status, toStatus: next, ...(remarks ? { remarks } : {}) });

  switch (action) {
    case 'sendToDdo':
      app.intake = signOff;
      break;
    case 'certify':
      app.ddoCertification = { ...signOff, designation: dept?.ddoDesignation ?? 'DDO', departmentName: dept?.name ?? '', items: Object.fromEntries(F1_CERT_ITEMS.map((i) => [i, 'OK'])) as Record<(typeof F1_CERT_ITEMS)[number], 'OK'>, mandateAgreed: true };
      break;
    case 'forward':
      app.officeReview = signOff;
      break;
    case 'approve':
      if (app.status === 'APPROVAL_SECRETARY') app.secretaryApproval = signOff;
      else {
        if (app.secretaryApproval?.byId === actor.id) fail('FORBIDDEN', 'The President cannot be the same person as the Secretary (SOD-1).');
        app.presidentApproval = signOff;
        app.sharePaymentRoute = input.sharePaymentRoute ?? 'COUNTER';
      }
      break;
    case 'returnToApplicant':
      app.infoRequest = { by: actor.role === 'DDO' ? 'DDO' : 'Accountant', field: input.field ?? '', message: remarks ?? '' };
      break;
    case 'reject':
      app.rejection = signOff;
      break;
    case 'recordSharePayment':
    case 'activate': {
      const seq = db.membershipApplications.filter((a) => a.shareReceipt).length + 1;
      app.shareReceipt = {
        receiptNo: `SH-2026-${String(seq).padStart(4, '0')}`,
        at,
        amount: membershipShareAmount(app.sharesProposed, db.settings.shareValue),
        mode: action === 'activate' ? 'FIRST_DEMAND' : (input.mode ?? 'CASH'),
        ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
        byName: actor.name,
      };
      break;
    }
  }
  app.status = next;
  if (next === 'ACTIVE') activate(db, app);
  store.save();
  return app;
}

/** On share payment: create the member, allot the next General No., upgrade the applicant's session. */
function activate(db: Db, app: MembershipApplication) {
  const f = app.form ?? {};
  const generalNo = String(Math.max(...db.members.map((m) => Number(m.generalNo))) + 1);
  app.allottedGeneralNo = generalNo;
  const dob = f.personal?.dob ?? '1995-01-01';
  const [y, m] = [Number(dob.slice(0, 4)), Number(dob.slice(5, 7))];
  const mobile = f.personal?.mobile ?? db.applicants.find((a) => a.id === app.applicantId)?.mobile ?? '9000000000';
  const present = { line1: '', city: '', district: '', pincode: '', ...f.address?.present };
  const member: Member = {
    id: `mem-${generalNo}`,
    generalNo,
    employeeId: f.employment?.employeeId ?? `TS${generalNo}`,
    name: app.name,
    fatherName: f.personal?.fatherName ?? '',
    gender: f.personal?.gender ?? 'M',
    dob,
    mobile,
    mobileMasked: `${mobile.slice(0, 2)}XXXXXX${mobile.slice(-2)}`,
    ...(f.personal?.email ? { email: f.personal.email } : {}),
    presentAddress: present,
    permanentAddress: f.address?.sameAsPresent ? present : { line1: '', city: '', district: '', pincode: '', ...f.address?.permanent },
    designation: app.designation,
    departmentId: app.departmentId,
    doj: app.regularAppointmentDate || db.demo.today,
    dor: `${y + db.settings.retirementAge}-${String(m).padStart(2, '0')}-${String(daysInMonth(y + db.settings.retirementAge, m)).padStart(2, '0')}`,
    employmentType: f.employment?.employmentType ?? 'REGULAR',
    numberOfShares: app.sharesProposed,
    nominee: { name: f.nominee?.name ?? '', relation: f.nominee?.relation ?? 'Spouse', ...(f.nominee?.address ? { address: f.nominee.address } : {}) },
    payProfile: { scaleOfPay: '', substantivePay: 0, grossSalary: 0, govtLoanDeductions: 0, otherLoanDeductions: 0 },
    status: 'ACTIVE',
    portalActivated: true,
    joinedSocietyOn: db.demo.today,
  };
  db.members.push(member);
  const paidNow = app.shareReceipt?.mode !== 'FIRST_DEMAND';
  db.shareAccounts.push({ memberId: member.id, numberOfShares: member.numberOfShares, shareCapital: paidNow ? member.numberOfShares * db.settings.shareValue : 0, shareDepositBalance: 0 });
  // Same login, now a member: every session of this applicant becomes a member session.
  for (const s of Object.values(db.sessions)) {
    if (s.id === app.applicantId) Object.assign(s, { id: member.id, role: 'MEMBER', memberId: member.id, generalNo });
  }
}

/** Demo controls (phone tracker, console): act as whoever owns the current stage. */
export function demoAct(store: Store, app: MembershipApplication, action?: MembershipAction, input?: MembershipActionInput) {
  const db = store.db;
  const chosen = action ?? primaryMembershipAction(app.status, app.sharePaymentRoute);
  if (!chosen) fail('INVALID_TRANSITION', `Nothing to do at "${app.status}". ${app.status === 'INFO_REQUESTED' ? 'The applicant must resubmit first.' : ''}`.trim());
  const owner = stageOwner(db, app) ?? { id: 'stf-accountant', name: 'Suresh Goud', role: 'ACCOUNTANT' as Role };
  return applyMembershipAction(store, app, chosen, owner, { ...demoInputFor(chosen), ...input }, { demo: true });
}

// ---- routes -------------------------------------------------------------------------------------

export function registerMembership(api: Hono<Env>, store: Store, requireSession: MiddlewareHandler<Env>) {
  const requireView = (user: SessionUser) => {
    if (!permissionsFor(user.role).includes('membership.view')) fail('FORBIDDEN', 'You do not have access to membership applications.');
  };
  const load = (id: string, user: SessionUser) => {
    const app = store.db.membershipApplications.find((a) => a.id === id);
    if (!app || !visibleTo(app, user)) fail('NOT_FOUND', 'This application does not exist or is outside your department.');
    return app;
  };

  api.get('/membership/applications', requireSession, (c) => {
    const user = c.get('session');
    requireView(user);
    const db = store.db;
    const rows = db.membershipApplications
      .filter((a) => visibleTo(a, user))
      .map((a) => toRow(db, a, user))
      .sort((a, b) => Number(b.waitingOnMe) - Number(a.waitingOnMe) || a.stageSince.localeCompare(b.stageSince));
    const counts: Partial<Record<MembershipStatus, number>> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const dept = user.departmentId ? db.departments.find((d) => d.id === user.departmentId) : undefined;
    return c.json<MembershipList>({
      asOf: db.demo.today,
      rows,
      counts,
      waitingOnMe: rows.filter((r) => r.waitingOnMe).length,
      scope: dept ? { departmentId: dept.id, departmentName: dept.name } : {},
    });
  });

  api.get('/membership/applications/:id', requireSession, (c) => {
    const user = c.get('session');
    requireView(user);
    return c.json<MembershipDetail>(membershipDetail(store.db, load(c.req.param('id'), user), user));
  });

  api.post('/membership/applications/:id/actions/:action', requireSession, async (c) => {
    const user = c.get('session');
    requireView(user);
    const app = load(c.req.param('id'), user);
    const input = await c.req.json<MembershipActionInput>().catch((): MembershipActionInput => ({}));
    applyMembershipAction(store, app, c.req.param('action') as MembershipAction, { id: user.id, name: user.name, role: user.role, ...(user.departmentId ? { departmentId: user.departmentId } : {}) }, input);
    return c.json<MembershipDetail>(membershipDetail(store.db, app, user));
  });

  /** Demo: act for the stage owner (e.g. another department's DDO). */
  api.post('/membership/applications/:id/demo-act', requireSession, (c) => {
    const user = c.get('session');
    requireView(user);
    if (!permissionsFor(user.role).includes('demo.control')) fail('FORBIDDEN', 'Demo controls are off for this user.');
    const app = load(c.req.param('id'), user);
    demoAct(store, app);
    return c.json<MembershipDetail>(membershipDetail(store.db, app, user));
  });
}
