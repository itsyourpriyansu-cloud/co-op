// Joining the society from the Member App (D-026, docs/10 §2, docs/16 §F1).
// Applicant: sign up (mobile + OTP) → eligibility → draft (autosave) → sign with OTP → submit → track.
// Staff stages live in membership.ts; the phone's demo controls act for the stage owner there.
import { randomUUID } from 'node:crypto';
import type { Hono, MiddlewareHandler } from 'hono';
import { checkMembershipEligibility, validateMembershipForm } from '@tgs/domain';
import { DESIGNATIONS } from '@tgs/mock-data';
import type {
  JoiningReference,
  MembershipApplication,
  MembershipForm,
  MembershipStatus,
  OtpChallenge,
  Session,
  SessionUser,
  WorkflowEvent,
} from '@tgs/types';
import { nowIso } from './clock';
import { fail } from './errors';
import { AGREEMENTS, REQUIRED_DOCUMENTS, TEXT_VERSION } from './joining-reference';
import { demoAct } from './membership';
import type { Store } from './store';

type Env = { Variables: { session: SessionUser; token: string } };

const DEMO_OTP = '123456';
const OTP_TTL_SECONDS = 300;


interface PendingOtp {
  purpose: 'signup' | 'sign';
  fullName?: string;
  mobile?: string;
  applicationId?: string;
  expiresAt: number;
}

/** Missing fields that block submission, keyed like the form (personal.fatherName …). Shared rule. */
export function validateForm(form: MembershipForm | undefined): Record<string, string> {
  return validateMembershipForm(form, REQUIRED_DOCUMENTS.filter((d) => d.required));
}

function mergeForm(base: MembershipForm = {}, patch: MembershipForm = {}): MembershipForm {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, Array.isArray(v) ? v : typeof v === 'object' && v !== null ? { ...((base as Record<string, object>)[k] ?? {}), ...v } : v]),
    ),
  } as MembershipForm;
}

export function registerJoining(api: Hono<Env>, store: Store, requireSession: MiddlewareHandler<Env>) {
  const otps = new Map<string, PendingOtp>();

  const challenge = (pending: Omit<PendingOtp, 'expiresAt'>): OtpChallenge => {
    const otpRef = randomUUID();
    otps.set(otpRef, { ...pending, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 });
    return { otpRef, expiresInSeconds: OTP_TTL_SECONDS, demoOtp: DEMO_OTP };
  };

  const consumeOtp = (otpRef: string | undefined, otp: string | undefined, purpose: PendingOtp['purpose']) => {
    const pending = otpRef ? otps.get(otpRef) : undefined;
    if (!pending || pending.purpose !== purpose) return fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    if (Date.now() > pending.expiresAt) {
      otps.delete(otpRef ?? '');
      return fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    }
    if (otp !== DEMO_OTP) fail('VALIDATION_ERROR', "That code doesn't match. Check the SMS and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    otps.delete(otpRef ?? '');
    return pending;
  };

  const requireApplicant = (user: SessionUser) => {
    if (user.role !== 'APPLICANT') fail('FORBIDDEN', 'Only applicants can use the joining flow.');
  };

  const findMine = (applicantId: string) => store.db.membershipApplications.find((a) => a.applicantId === applicantId);

  const event = (a: MembershipApplication, toStatus: MembershipStatus, action: string, actorName: string, actorRole: string, remarks?: string): WorkflowEvent => ({
    at: nowIso(),
    actorId: actorRole === 'APPLICANT' ? a.applicantId : 'system',
    actorName,
    actorRole,
    action,
    fromStatus: a.status,
    toStatus,
    ...(remarks ? { remarks } : {}),
  });

  // ---- reference data (public) ---------------------------------------------------------------
  api.get('/joining/reference', (c) => {
    const db = store.db;
    return c.json<JoiningReference>({
      society: db.society,
      departments: db.departments.map((d) => ({ id: d.id, name: d.name })),
      designations: DESIGNATIONS.map((d) => d.title),
      shareValue: db.settings.shareValue,
      minShares: db.settings.minShares,
      maxShares: db.settings.maxShares,
      requiredDocuments: REQUIRED_DOCUMENTS,
      agreements: AGREEMENTS,
    });
  });

  // ---- MJ-02 sign-up -------------------------------------------------------------------------
  api.post('/joining/signup', async (c) => {
    type Body = { fullName?: string; mobile?: string };
    const { fullName = '', mobile = '' } = await c.req.json<Body>().catch((): Body => ({}));
    const fieldErrors: Record<string, string> = {};
    if (fullName.trim().length < 3) fieldErrors.fullName = 'Enter your full name as in service records';
    if (!/^[6-9]\d{9}$/.test(mobile)) fieldErrors.mobile = 'Enter a 10-digit mobile number';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    if (store.db.members.some((m) => m.mobile === mobile && m.status === 'ACTIVE')) {
      fail('ALREADY_EXISTS', 'This mobile number belongs to a member. Sign in or activate your account instead.', { fieldErrors: { mobile: 'Already a member' } });
    }
    return c.json(challenge({ purpose: 'signup', fullName: fullName.trim(), mobile }));
  });

  api.post('/joining/verify', async (c) => {
    const { otpRef, otp } = await c.req.json<{ otpRef?: string; otp?: string }>().catch(() => ({}) as { otpRef?: string; otp?: string });
    const pending = consumeOtp(otpRef, otp, 'signup');
    const db = store.db;
    let applicant = db.applicants.find((a) => a.mobile === pending.mobile);
    if (!applicant) {
      applicant = { id: `apl-${randomUUID().slice(0, 8)}`, name: pending.fullName ?? 'Applicant', mobile: pending.mobile, mobileMasked: `${pending.mobile?.slice(0, 2)}XXXXXX${pending.mobile?.slice(-2)}` };
      db.applicants.push(applicant);
    }
    const user: SessionUser = { id: applicant.id, name: applicant.name, role: 'APPLICANT' };
    const token = randomUUID();
    db.sessions[token] = user;
    store.save();
    return c.json<Session>({ token, user });
  });

  // ---- MJ-03 … MJ-05 (applicant session) -----------------------------------------------------
  api.get('/membership/me', requireSession, (c) => {
    const user = c.get('session');
    // Right after activation the session is already MEMBER; the tracker still needs the
    // application to show the welcome screen with the General No. (read-only).
    if (user.role === 'MEMBER' && user.generalNo) {
      return c.json<MembershipApplication | null>(store.db.membershipApplications.find((a) => a.allottedGeneralNo === user.generalNo) ?? null);
    }
    requireApplicant(user);
    return c.json<MembershipApplication | null>(findMine(user.id) ?? null);
  });

  api.post('/membership/me/eligibility', requireSession, async (c) => {
    const user = c.get('session');
    requireApplicant(user);
    const answers = await c.req.json<{ worksInSecretariatDept: boolean; regularOrApprovedProbationer: boolean; memberOfOtherCreditSocietyWithDues: boolean }>();
    const result = checkMembershipEligibility(answers);
    let app = findMine(user.id);
    if (!app) {
      const seq = store.db.membershipApplications.length + 1;
      app = {
        id: `mapp-${randomUUID().slice(0, 8)}`,
        applicationNo: `MEM-2026-${String(seq).padStart(4, '0')}`,
        applicantId: user.id,
        name: user.name,
        departmentId: '',
        designation: '',
        regularAppointmentDate: '',
        sharesProposed: 0,
        status: 'DRAFT',
        events: [],
        form: { personal: { fullName: user.name, mobile: store.db.applicants.find((a) => a.id === user.id)?.mobile } },
      };
      store.db.membershipApplications.push(app);
    }
    app.eligibility = { ...answers, checkedAt: nowIso() };
    store.save();
    return c.json({ ...result, application: app });
  });

  api.put('/membership/me/draft', requireSession, async (c) => {
    const user = c.get('session');
    requireApplicant(user);
    const app = findMine(user.id);
    if (!app) return fail('NOT_FOUND', 'Start with the eligibility check.');
    if (app.status !== 'DRAFT' && app.status !== 'INFO_REQUESTED') fail('INVALID_TRANSITION', 'This application has been submitted and can no longer be edited.');
    const patch = await c.req.json<MembershipForm>();
    // D-065: the server stamps uploads with the demo date; a re-sent document keeps its first stamp.
    if (patch.documents) {
      const before = app.form?.documents ?? [];
      patch.documents = patch.documents.map((d) => ({ ...d, uploadedAt: before.find((b) => b.type === d.type && b.fileName === d.fileName)?.uploadedAt ?? nowIso() }));
    }
    app.form = mergeForm(app.form, patch);
    store.save();
    return c.json(app);
  });

  api.post('/membership/me/sign/request', requireSession, (c) => {
    const user = c.get('session');
    requireApplicant(user);
    const app = findMine(user.id);
    if (!app) return fail('NOT_FOUND', 'No application found.');
    const fieldErrors = validateForm(app.form);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Some details are missing.', { fieldErrors });
    return c.json(challenge({ purpose: 'sign', applicationId: app.id }));
  });

  api.post('/membership/me/submit', requireSession, async (c) => {
    const user = c.get('session');
    requireApplicant(user);
    const app = findMine(user.id);
    if (!app) return fail('NOT_FOUND', 'No application found.');
    const { otpRef, otp } = await c.req.json<{ otpRef?: string; otp?: string }>();
    const pending = consumeOtp(otpRef, otp, 'sign');
    if (pending.applicationId !== app.id) fail('VALIDATION_ERROR', 'This code was issued for a different application.');
    if (app.status !== 'DRAFT' && app.status !== 'INFO_REQUESTED') fail('INVALID_TRANSITION', 'Already submitted.');
    const f = app.form ?? {};
    const resubmit = app.status === 'INFO_REQUESTED';
    // A corrected application goes back to the stage that returned it.
    const returnedFrom = [...app.events].reverse().find((e) => e.toStatus === 'INFO_REQUESTED')?.fromStatus as MembershipStatus | undefined;
    const back: MembershipStatus = !resubmit ? 'SUBMITTED' : returnedFrom && returnedFrom !== 'INFO_REQUESTED' ? returnedFrom : app.infoRequest?.by === 'DDO' ? 'DDO_CERTIFICATION' : 'OFFICE_REVIEW';
    app.events.push(event(app, back, resubmit ? 'resubmit' : 'submit', f.personal?.fullName ?? user.name, 'APPLICANT'));
    Object.assign(app, {
      status: back,
      name: f.personal?.fullName ?? app.name,
      departmentId: f.employment?.departmentId ?? '',
      designation: f.employment?.designation ?? '',
      regularAppointmentDate: f.employment?.regularAppointmentDate ?? '',
      sharesProposed: f.shares?.sharesProposed ?? 0,
      submittedOn: app.submittedOn ?? store.db.demo.today,
      signature: { signedAt: nowIso(), textVersion: TEXT_VERSION, method: 'OTP' },
    });
    delete app.infoRequest;
    store.save();
    return c.json(app);
  });

  // ---- Demo controls on the phone tracker: act for whoever owns the stage (membership.ts) -----
  const loadApp = (id: string) => store.db.membershipApplications.find((a) => a.id === id) ?? fail('NOT_FOUND', 'Unknown application.');

  api.post('/__demo/membership/:id/advance', (c) => c.json(demoAct(store, loadApp(c.req.param('id')))));

  api.post('/__demo/membership/:id/request-info', async (c) => {
    const app = loadApp(c.req.param('id'));
    const body = await c.req.json<{ field?: string; message?: string }>().catch(() => ({}) as { field?: string; message?: string });
    return c.json(demoAct(store, app, 'returnToApplicant', { ...(body.field ? { field: body.field } : {}), ...(body.message ? { remarks: body.message } : {}) }));
  });

  api.post('/__demo/membership/:id/reject', (c) => c.json(demoAct(store, loadApp(c.req.param('id')), 'reject')));
}
