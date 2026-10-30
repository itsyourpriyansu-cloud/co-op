import { randomUUID } from 'node:crypto';
import {
  AGREEMENTS,
  checkMembershipEligibility,
  expectedRetirementDate,
  isMembershipInFlight,
  MEMBERSHIP_STAGE_OWNER,
  membershipActionsFor,
  membershipShareAmount,
  nextMembershipStatus,
  primaryMembershipAction,
  REQUIRED_DOCUMENTS,
  TEXT_VERSION,
  validateMembershipForm,
} from '@tgs/domain';
import { DESIGNATIONS } from '@tgs/mock-data';
import {
  F1_CERT_ITEMS,
  ROLE_LABELS,
  type ConsoleRole,
  type ISODate,
  type JoiningReference,
  type Member,
  type MembershipAction,
  type MembershipActionInput,
  type MembershipApplication,
  type MembershipDetail,
  type MembershipFlag,
  type MembershipForm,
  type MembershipList,
  type MembershipRow,
  type MembershipStatus,
  type OtpChallenge,
  type SessionUser,
  type ShareAccount,
  type StaffSignOff,
} from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessNow, businessToday } from '../../common/utils/business-date';
import { withTransaction, type Tx } from '../../db/transaction';
import { ACCOUNT } from '../ledger/ledger.accounts';
import type { JoiningRepository } from './joining.repository';

type EligibilityAnswers = { worksInSecretariatDept: boolean; regularOrApprovedProbationer: boolean; memberOfOtherCreditSocietyWithDues: boolean };
interface Actor {
  id: string;
  name: string;
  role: ConsoleRole;
  departmentId?: string;
}

const requiredDocs = REQUIRED_DOCUMENTS.filter((d) => d.required);
const daysBetween = (from: ISODate, to: ISODate) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const stageSince = (a: MembershipApplication): ISODate => (a.events.at(-1)?.at ?? a.submittedOn ?? '').slice(0, 10);
const documentsOf = (a: MembershipApplication) => ({ uploaded: requiredDocs.filter((d) => a.form?.documents?.some((x) => x.type === d.type)).length, required: requiredDocs.length });
const editable = (a: MembershipApplication) => a.status === 'DRAFT' || a.status === 'INFO_REQUESTED';

function mergeForm(base: MembershipForm = {}, patch: MembershipForm = {}): MembershipForm {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, Array.isArray(v) ? v : typeof v === 'object' && v !== null ? { ...((base as Record<string, object>)[k] ?? {}), ...v } : v])),
  } as MembershipForm;
}

/** Sensible inputs when a demo control acts on someone's behalf (same as the prototype). */
function demoInputFor(action: MembershipAction): MembershipActionInput {
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
 * Joining the society (D-026, docs/10 §2): the applicant's draft, OTP signature and submission
 * (MJ-02…05), then the staff stages (ST-14…17) intake → DDO certification → office review →
 * Secretary → President → share payment. Payment admits the member: next General No., member
 * record, mandate, Member App sign-in, and the share receipt posted to the ledger.
 */
export class JoiningService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: JoiningRepository,
  ) {}

  // ---- MJ reference (public) ----
  async reference(): Promise<JoiningReference> {
    const [society, departments, settings] = await Promise.all([this.app.masters.society(), this.app.departments.all(), this.app.masters.settings()]);
    return {
      society,
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
      // shortcut: designations come from the demo catalogue; move to a master when the society sends its list.
      designations: DESIGNATIONS.map((d) => d.title),
      shareValue: settings.shareValue,
      minShares: settings.minShares,
      maxShares: settings.maxShares,
      requiredDocuments: REQUIRED_DOCUMENTS,
      agreements: AGREEMENTS,
    };
  }

  // ---- MJ-03 … MJ-05 applicant ----
  async me(user: SessionUser): Promise<MembershipApplication | null> {
    // Right after activation the session is already MEMBER; the tracker shows the welcome with the General No.
    if (user.role === 'MEMBER' && user.generalNo) return (await this.repo.byGeneralNo(user.generalNo)) ?? null;
    this.requireApplicant(user);
    return (await this.repo.byApplicant(user.id)) ?? null;
  }

  async eligibility(user: SessionUser, answers: EligibilityAnswers) {
    this.requireApplicant(user);
    const result = checkMembershipEligibility(answers);
    const now = await businessNow(this.app);
    const app = await withTransaction(this.app.db, async (tx) => {
      const existing = await this.repo.byApplicant(user.id);
      if (existing) {
        const next = { ...existing, eligibility: { ...answers, checkedAt: now } };
        await this.repo.save(tx, next);
        return next;
      }
      const created: MembershipApplication = {
        id: `mapp-${randomUUID().slice(0, 8)}`,
        applicationNo: await this.repo.nextApplicationNo(tx, now.slice(0, 4)),
        applicantId: user.id,
        name: user.name,
        departmentId: '',
        designation: '',
        regularAppointmentDate: '',
        sharesProposed: 0,
        status: 'DRAFT',
        events: [],
        form: { personal: { fullName: user.name, mobile: await this.app.appAccounts.mobileOf(user.id) } },
        eligibility: { ...answers, checkedAt: now },
      };
      await this.repo.insert(tx, created);
      return created;
    });
    await this.sync(app);
    return { ...result, application: app };
  }

  async saveDraft(user: SessionUser, patch: MembershipForm): Promise<MembershipApplication> {
    this.requireApplicant(user);
    const now = await businessNow(this.app);
    const app = await withTransaction(this.app.db, async (tx) => {
      const mine = await this.repo.byApplicant(user.id);
      const a = (mine && (await this.repo.lock(tx, mine.id))) ?? fail('NOT_FOUND', 'Start with the eligibility check.');
      if (!editable(a)) fail('INVALID_TRANSITION', 'This application has been submitted and can no longer be edited.');
      // D-065: uploads are stamped with the business date; a re-sent document keeps its first stamp.
      if (patch.documents) {
        const before = a.form?.documents ?? [];
        patch = { ...patch, documents: patch.documents.map((d) => ({ ...d, uploadedAt: before.find((b) => b.type === d.type && b.fileName === d.fileName)?.uploadedAt ?? now })) };
      }
      const next = { ...a, form: mergeForm(a.form, patch) };
      await this.repo.save(tx, next);
      return next;
    });
    await this.sync(app);
    return app;
  }

  async requestSign(user: SessionUser): Promise<OtpChallenge> {
    this.requireApplicant(user);
    const a = (await this.repo.byApplicant(user.id)) ?? fail('NOT_FOUND', 'No application found.');
    const fieldErrors = validateMembershipForm(a.form, requiredDocs);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Some details are missing.', { fieldErrors });
    const mobile = (await this.app.appAccounts.mobileOf(user.id)) ?? a.form?.personal?.mobile ?? fail('VALIDATION_ERROR', 'No mobile number to send the code to.');
    return this.app.appAccounts.startCode(mobile, 'SIGN', a.id);
  }

  /** Sign with OTP (D-031) and submit; a corrected application goes back to the stage that returned it. */
  async submit(request: FastifyRequest, body: { otpRef?: string; otp?: string }): Promise<MembershipApplication> {
    const user = sessionOf(request);
    this.requireApplicant(user);
    const mine = (await this.repo.byApplicant(user.id)) ?? fail('NOT_FOUND', 'No application found.');
    if (!editable(mine)) fail('INVALID_TRANSITION', 'Already submitted.');
    await this.app.appAccounts.verifyCode('SIGN', mine.id, body.otpRef ?? '', body.otp ?? '');
    const [now, today] = [await businessNow(this.app), await businessToday(this.app)];
    const app = await withTransaction(this.app.db, async (tx) => {
      const a = (await this.repo.lock(tx, mine.id))!;
      if (!editable(a)) fail('INVALID_TRANSITION', 'Already submitted.');
      const f = a.form ?? {};
      const resubmit = a.status === 'INFO_REQUESTED';
      const returnedFrom = [...a.events].reverse().find((e) => e.toStatus === 'INFO_REQUESTED')?.fromStatus as MembershipStatus | undefined;
      const back: MembershipStatus = !resubmit ? 'SUBMITTED' : returnedFrom && returnedFrom !== 'INFO_REQUESTED' ? returnedFrom : a.infoRequest?.by === 'DDO' ? 'DDO_CERTIFICATION' : 'OFFICE_REVIEW';
      const { infoRequest: _done, ...rest } = a;
      const next: MembershipApplication = {
        ...rest,
        events: [...a.events, { at: now, actorId: a.applicantId, actorName: f.personal?.fullName ?? user.name, actorRole: 'APPLICANT', action: resubmit ? 'resubmit' : 'submit', fromStatus: a.status, toStatus: back }],
        status: back,
        name: f.personal?.fullName ?? a.name,
        departmentId: f.employment?.departmentId ?? '',
        designation: f.employment?.designation ?? '',
        regularAppointmentDate: f.employment?.regularAppointmentDate ?? '',
        sharesProposed: f.shares?.sharesProposed ?? 0,
        submittedOn: a.submittedOn ?? today,
        signature: { signedAt: now, textVersion: TEXT_VERSION, method: 'OTP' },
      };
      await this.repo.save(tx, next);
      await this.app.audit.record(request, { action: resubmit ? 'resubmit' : 'submit', entity: 'membershipApplication', entityId: a.id, summary: `${next.name} ${resubmit ? 'resubmitted' : 'submitted'} membership application ${a.applicationNo}` }, tx);
      return next;
    });
    await this.sync(app);
    return app;
  }

  // ---- ST-14 … ST-17 staff ----
  async list(user: SessionUser): Promise<MembershipList> {
    await this.requireView(user);
    const [all, today, departments] = await Promise.all([this.repo.all(), businessToday(this.app), this.app.departments.all()]);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const rows: MembershipRow[] = [];
    for (const a of all.filter((x) => this.visible(x, user))) {
      const since = stageSince(a) || today;
      const waitingOn = await this.waitingOn(a);
      rows.push({
        id: a.id,
        applicationNo: a.applicationNo,
        name: a.name,
        departmentId: a.departmentId,
        departmentName: deptName.get(a.departmentId) ?? '',
        designation: a.designation,
        status: a.status,
        ...(a.submittedOn ? { submittedOn: a.submittedOn } : {}),
        stageSince: since,
        daysInStage: daysBetween(since, today),
        documents: documentsOf(a),
        flags: await this.flags(a),
        sharesProposed: a.sharesProposed,
        waitingOnMe: membershipActionsFor(a, user).length > 0,
        ...(waitingOn ? { waitingOn } : {}),
        ...(a.allottedGeneralNo ? { allottedGeneralNo: a.allottedGeneralNo } : {}),
      });
    }
    rows.sort((a, b) => Number(b.waitingOnMe) - Number(a.waitingOnMe) || a.stageSince.localeCompare(b.stageSince));
    const counts: Partial<Record<MembershipStatus, number>> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const scope = user.departmentId ? departments.find((d) => d.id === user.departmentId) : undefined;
    return { asOf: today, rows, counts, waitingOnMe: rows.filter((r) => r.waitingOnMe).length, scope: scope ? { departmentId: scope.id, departmentName: scope.name } : {} };
  }

  async detail(user: SessionUser, id: string): Promise<MembershipDetail> {
    await this.requireView(user);
    const a = await this.repo.find(id);
    if (!a || !this.visible(a, user)) return fail('NOT_FOUND', 'This application does not exist or is outside your department.');
    return this.toDetail(a, user);
  }

  async act(request: FastifyRequest, id: string, action: MembershipAction, input: MembershipActionInput): Promise<MembershipDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    const actor: Actor = { id: user.id, name: user.name, role: user.role as ConsoleRole, ...(user.departmentId ? { departmentId: user.departmentId } : {}) };
    const a = await this.apply(request, id, () => ({ action, actor, input }), { visibleTo: user });
    return this.toDetail(a, user);
  }

  /** Console demo control: act for the stage owner (e.g. another department's DDO). */
  async demoActFor(request: FastifyRequest, id: string): Promise<MembershipDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    if (!(await this.app.permissions.has(user.role, 'demo.control'))) fail('FORBIDDEN', 'Demo controls are off for this user.');
    const a = await this.demoAct(request, id, undefined, undefined, user);
    return this.toDetail(a, user);
  }

  /** Demo controls (phone tracker, console): act as whoever owns the current stage. */
  async demoAct(request: FastifyRequest, id: string, action?: MembershipAction, input?: MembershipActionInput, visibleTo?: SessionUser): Promise<MembershipApplication> {
    return this.apply(
      request,
      id,
      async (a) => {
        const chosen = action ?? primaryMembershipAction(a.status, a.sharePaymentRoute);
        if (!chosen) fail('INVALID_TRANSITION', `Nothing to do at "${a.status}". ${a.status === 'INFO_REQUESTED' ? 'The applicant must resubmit first.' : ''}`.trim());
        const owner = (await this.stageOwner(a)) ?? { id: 'stf-accountant', name: 'Accountant', role: 'ACCOUNTANT' as const };
        return { action: chosen!, actor: owner, input: { ...demoInputFor(chosen!), ...input } };
      },
      { demo: true, ...(visibleTo ? { visibleTo } : {}) },
    );
  }

  // ---- the one transition path (console actions and demo controls alike) ----
  private async apply(
    request: FastifyRequest,
    id: string,
    decide: (a: MembershipApplication) => { action: MembershipAction; actor: Actor; input: MembershipActionInput } | Promise<{ action: MembershipAction; actor: Actor; input: MembershipActionInput }>,
    opts: { demo?: boolean; visibleTo?: SessionUser },
  ): Promise<MembershipApplication> {
    const [now, today, settings] = await Promise.all([businessNow(this.app), businessToday(this.app), this.app.masters.settings()]);
    let admitted: { member: Member; records: Record<string, unknown[]> } | undefined;
    const saved = await withTransaction(this.app.db, async (tx) => {
      const a = await this.repo.lock(tx, id);
      if (!a || (opts.visibleTo && !this.visible(a, opts.visibleTo))) return fail('NOT_FOUND', 'This application does not exist or is outside your department.');
      const { action, actor, input } = await decide(a);
      const next = nextMembershipStatus(a.status, action) ?? (opts.demo && action === 'reject' && isMembershipInFlight(a.status) ? 'REJECTED' : undefined);
      if (!next) fail('INVALID_TRANSITION', `This application is now "${a.status}". Refresh to see the latest.`);
      if (!opts.demo && !membershipActionsFor(a, actor).includes(action)) fail('FORBIDDEN', 'This step belongs to someone else.');

      const remarks = input.remarks?.trim();
      const fieldErrors: Record<string, string> = {};
      if ((action === 'returnToApplicant' || action === 'reject') && (!remarks || remarks.length < 10)) fieldErrors.remarks = action === 'reject' ? 'Give the reason (at least 10 characters). The applicant will see it.' : 'Tell the applicant what to correct (at least 10 characters).';
      if (action === 'certify') {
        if (F1_CERT_ITEMS.some((i) => input.items?.[i] !== 'OK')) fieldErrors.items = 'Confirm every item, or return the application with the items that need correction.';
        if (!input.mandateAgreed) fieldErrors.mandateAgreed = 'Agree to the salary recovery mandate to certify.';
      }
      if (action === 'approve' && a.status === 'APPROVAL_PRESIDENT' && !input.sharePaymentRoute) fieldErrors.sharePaymentRoute = 'Choose how the shares are paid.';
      if (action === 'recordSharePayment') {
        if (!input.mode) fieldErrors.mode = 'Choose how the money was received.';
        if (input.mode && input.mode !== 'CASH' && !input.reference?.trim()) fieldErrors.reference = 'Enter the UPI or cheque reference.';
      }
      if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });

      const signOff: StaffSignOff = { byId: actor.id, byName: actor.name, role: actor.role, at: now, ...(remarks ? { remarks } : {}) };
      const dept = await this.app.departments.get(a.departmentId);
      const out: MembershipApplication = { ...a, events: [...a.events, { at: now, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, fromStatus: a.status, toStatus: next!, ...(remarks ? { remarks } : {}) }], status: next! };
      switch (action) {
        case 'sendToDdo':
          out.intake = signOff;
          break;
        case 'certify':
          out.ddoCertification = { ...signOff, designation: dept?.ddoDesignation ?? 'DDO', departmentName: dept?.name ?? '', items: Object.fromEntries(F1_CERT_ITEMS.map((i) => [i, 'OK'])) as NonNullable<MembershipApplication['ddoCertification']>['items'], mandateAgreed: true };
          break;
        case 'forward':
          out.officeReview = signOff;
          break;
        case 'approve':
          if (a.status === 'APPROVAL_SECRETARY') out.secretaryApproval = signOff;
          else {
            if (a.secretaryApproval?.byId === actor.id) fail('FORBIDDEN', 'The President cannot be the same person as the Secretary (SOD-1).');
            out.presidentApproval = signOff;
            out.sharePaymentRoute = input.sharePaymentRoute ?? 'COUNTER';
          }
          break;
        case 'returnToApplicant':
          out.infoRequest = { by: actor.role === 'DDO' ? 'DDO' : 'Accountant', field: input.field ?? '', message: remarks ?? '' };
          break;
        case 'reject':
          out.rejection = signOff;
          break;
        case 'recordSharePayment':
        case 'activate':
          out.shareReceipt = {
            receiptNo: await this.repo.nextReceiptNo(tx, today.slice(0, 4)),
            at: now,
            amount: membershipShareAmount(a.sharesProposed, settings.shareValue),
            mode: action === 'activate' ? 'FIRST_DEMAND' : (input.mode ?? 'CASH'),
            ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
            byName: actor.name,
          };
          break;
      }
      if (next === 'ACTIVE') admitted = await this.admit(tx, out, actor, today, settings.retirementAge);
      await this.repo.save(tx, out);
      await this.app.audit.record(request, { action: `membership.${action}`, entity: 'membershipApplication', entityId: a.id, summary: `${actor.name} (${ROLE_LABELS[actor.role]}${opts.demo ? ', demo control' : ''}): ${action} on ${a.applicationNo}${admitted ? `, admitted as General No. ${admitted.member.generalNo}` : ''}` }, tx);
      return out;
    });
    await this.app.members.sync({ ...(admitted?.records ?? {}), membershipApplications: [saved] });
    return saved;
  }

  /** On share payment: the new member, their sign-in, and the receipt in the books. */
  private async admit(tx: Tx, a: MembershipApplication, actor: Actor, today: ISODate, retirementAge: number) {
    const f = a.form ?? {};
    const dob = f.personal?.dob ?? '1995-01-01';
    // The sign-up mobile was proven by a code, so it is the member's mobile and sign-in.
    const mobile = (await this.app.appAccounts.mobileOf(a.applicantId)) ?? f.personal?.mobile ?? '';
    const present = { line1: '', city: '', district: '', pincode: '', ...f.address?.present };
    const { member, mandate, event } = await this.app.members.admit(
      tx,
      {
        employeeId: f.employment?.employeeId ?? `TS${a.applicationNo.slice(-4)}`,
        name: a.name,
        fatherName: f.personal?.fatherName ?? '',
        gender: f.personal?.gender ?? 'M',
        dob,
        mobile,
        ...(f.personal?.email ? { email: f.personal.email } : {}),
        presentAddress: present,
        permanentAddress: f.address?.sameAsPresent ? present : { line1: '', city: '', district: '', pincode: '', ...f.address?.permanent },
        designation: a.designation,
        departmentId: a.departmentId,
        doj: a.regularAppointmentDate || today,
        dor: expectedRetirementDate(dob, retirementAge),
        employmentType: f.employment?.employmentType ?? 'REGULAR',
        numberOfShares: a.sharesProposed,
        nominee: { name: f.nominee?.name ?? '', relation: f.nominee?.relation ?? 'Spouse', ...(f.nominee?.address ? { address: f.nominee.address } : {}) },
        payProfile: { scaleOfPay: '', substantivePay: 0, grossSalary: 0, govtLoanDeductions: 0, otherLoanDeductions: 0 },
        status: 'ACTIVE',
        portalActivated: true,
        joinedSocietyOn: today,
      },
      a.ddoCertification?.byName ?? 'DDO',
      actor.name,
    );
    a.allottedGeneralNo = member.generalNo;
    const receipt = a.shareReceipt!;
    const paidNow = receipt.mode !== 'FIRST_DEMAND';
    // Money received at the counter: Dr cash / bank, Cr the member's share capital. Paid by the
    // first demand: nothing yet; the recovery posts it (P7).
    if (paidNow) {
      await this.app.ledger.post(
        {
          entryDate: today,
          narration: `Share capital, ${a.sharesProposed} shares, General No. ${member.generalNo} (receipt ${receipt.receiptNo})`,
          source: 'SHARE_RECEIPT',
          sourceRef: receipt.receiptNo,
          postedBy: { id: actor.id, name: actor.name },
          lines: [
            { accountCode: receipt.mode === 'CASH' ? ACCOUNT.CASH : ACCOUNT.BANK, debit: receipt.amount, credit: 0 },
            { accountCode: ACCOUNT.SHARE_CAPITAL, debit: 0, credit: receipt.amount, memberId: member.id, refType: 'SHARE', refId: member.id },
          ],
        },
        tx,
      );
    }
    // TODO(P5): share accounts move with loans; until then the mock keeps them.
    const share: ShareAccount = { memberId: member.id, numberOfShares: member.numberOfShares, shareCapital: paidNow ? receipt.amount : 0, shareDepositBalance: 0 };
    return { member, records: { members: [member], mandates: [mandate], serviceEvents: [event], shareAccounts: [share] } };
  }

  // ---- read helpers ----
  private async toDetail(a: MembershipApplication, user: SessionUser): Promise<MembershipDetail> {
    const [today, settings, department] = await Promise.all([businessToday(this.app), this.app.masters.settings(), this.app.departments.get(a.departmentId)]);
    const dob = a.form?.personal?.dob;
    const e = a.eligibility;
    const checks: MembershipDetail['checks'] = e
      ? checkMembershipEligibility({ ...e, ...(dob ? { dob, today } : {}) }).checks
      : [{ ruleId: 'BR-026', pass: false, message: 'Eligibility answers were not captured.', severity: 'warn' }];
    const mobile = a.form?.personal?.mobile;
    const empId = a.form?.employment?.employeeId;
    const others = (await this.app.members.duplicates(mobile, empId)).filter((m) => m.generalNo !== a.allottedGeneralNo);
    const sameMobile = mobile ? others.find((m) => m.mobile === mobile) : undefined;
    const sameEmp = empId ? others.find((m) => m.employeeId === empId) : undefined;
    checks.push(
      sameMobile
        ? { ruleId: 'DUP-1', pass: false, message: `Mobile ${mobile} already belongs to ${sameMobile.name} (General No. ${sameMobile.generalNo}).`, severity: 'warn' }
        : { ruleId: 'DUP-1', pass: true, message: 'Mobile number is not registered to another member.', severity: 'warn' },
      sameEmp
        ? { ruleId: 'DUP-2', pass: false, message: `Employee ID ${empId} already belongs to ${sameEmp.name}.`, severity: 'warn' }
        : { ruleId: 'DUP-2', pass: true, message: empId ? 'Employee ID is not registered to another member.' : 'No employee ID given.', severity: 'warn' },
    );
    const docs = documentsOf(a);
    checks.push(docs.uploaded >= docs.required ? { ruleId: 'DOC-1', pass: true, message: 'All required documents uploaded.', severity: 'block' } : { ruleId: 'DOC-1', pass: false, message: `${docs.required - docs.uploaded} required document(s) missing.`, severity: 'block' });
    const { minShares, maxShares } = settings;
    checks.push(
      a.sharesProposed >= minShares && a.sharesProposed <= maxShares
        ? { ruleId: 'BR-032', pass: true, message: `${a.sharesProposed} shares proposed (allowed ${minShares}–${maxShares}).`, severity: 'block' }
        : { ruleId: 'BR-032', pass: false, message: `Shares must be between ${minShares} and ${maxShares}.`, severity: 'block' },
    );
    const actions = membershipActionsFor(a, user);
    const [owner, waitingOn] = [await this.stageOwner(a), await this.waitingOn(a)];
    const demo = !actions.length && owner && isMembershipInFlight(a.status) && (await this.app.permissions.has(user.role, 'demo.control'));
    return {
      application: a,
      department: department ?? null,
      actions,
      ...(waitingOn ? { waitingOn } : {}),
      ...(demo ? { demoActAs: { name: owner!.name, role: owner!.role } } : {}),
      checks,
      shareAmount: membershipShareAmount(a.sharesProposed, settings.shareValue),
      requiredDocuments: REQUIRED_DOCUMENTS,
      agreements: AGREEMENTS,
    };
  }

  private async flags(a: MembershipApplication): Promise<MembershipFlag[]> {
    if (a.status === 'ACTIVE') return [];
    const flags: MembershipFlag[] = [];
    const e = a.eligibility;
    if (e && (!e.worksInSecretariatDept || !e.regularOrApprovedProbationer || e.memberOfOtherCreditSocietyWithDues)) flags.push('INELIGIBLE_ANSWER');
    const mobile = a.form?.personal?.mobile;
    const match = mobile ? (await this.app.members.duplicates(mobile, undefined))[0] : undefined;
    if (match) flags.push(match.status === 'ACTIVE' ? 'EXISTING_MEMBER' : 'DUPLICATE_MOBILE');
    const docs = documentsOf(a);
    if (docs.uploaded < docs.required) flags.push('DOCUMENTS_MISSING');
    if (a.events.some((ev) => ev.toStatus === 'INFO_REQUESTED')) flags.push('RETURNED');
    return flags;
  }

  /** The person who owns the current stage (the department's DDO for DDO certification). */
  private async stageOwner(a: MembershipApplication): Promise<Actor | undefined> {
    const role = MEMBERSHIP_STAGE_OWNER[a.status];
    if (!role || role === 'APPLICANT') return undefined;
    if (role === 'DDO') {
      const [loginId, loginName, dept] = await Promise.all([this.app.departments.ddoLogin(a.departmentId), this.app.departments.ddoLoginName(a.departmentId), this.app.departments.get(a.departmentId)]);
      if (loginId) return { id: loginId, name: loginName ?? 'DDO', role: 'DDO', departmentId: a.departmentId };
      return { id: `ddo-${a.departmentId}`, name: dept?.ddoName ?? 'Department DDO', role: 'DDO', departmentId: a.departmentId };
    }
    const staff = await this.repo.staffByRole(role as ConsoleRole);
    return staff ? { ...staff, role: role as ConsoleRole } : undefined;
  }

  private async waitingOn(a: MembershipApplication): Promise<string | undefined> {
    if (a.status === 'INFO_REQUESTED') return 'Applicant (correction)';
    const owner = await this.stageOwner(a);
    if (!owner) return undefined;
    if (owner.role === 'DDO') return `${owner.name} (DDO, ${(await this.app.departments.get(a.departmentId))?.name ?? ''})`;
    return `${owner.name} (${ROLE_LABELS[owner.role]})`;
  }

  private visible(a: MembershipApplication, user: SessionUser): boolean {
    return a.status !== 'DRAFT' && (user.role !== 'DDO' || a.departmentId === user.departmentId);
  }

  private requireApplicant(user: SessionUser): void {
    if (user.role !== 'APPLICANT') fail('FORBIDDEN', 'Only applicants can use the joining flow.');
  }

  private async requireView(user: SessionUser): Promise<void> {
    if (!(await this.app.permissions.has(user.role, 'membership.view'))) fail('FORBIDDEN', 'You do not have access to membership applications.');
  }

  /** TODO(P9): the mock's dashboards and search still read applications; keep them in step. */
  private async sync(a: MembershipApplication): Promise<void> {
    await this.app.members.sync({ membershipApplications: [a] });
  }
}
