// BR-026 (form F1): membership eligibility + the staff workflow after submission (D-026, D-053).
import type { ISODate, MembershipAction, MembershipForm, MembershipStatus, Role } from '@tgs/types';
import { ageOn } from './members';
import { fail, pass, type RuleCheck } from './rules';

export interface EligibilityAnswers {
  worksInSecretariatDept: boolean;
  regularOrApprovedProbationer: boolean;
  memberOfOtherCreditSocietyWithDues: boolean;
  dob?: ISODate;
  today?: ISODate;
}

export function checkMembershipEligibility(a: EligibilityAnswers): { eligible: boolean; checks: RuleCheck[] } {
  const checks: RuleCheck[] = [
    a.worksInSecretariatDept
      ? pass('BR-026', 'Employed in a Telangana Secretariat department.')
      : fail('BR-026', 'Membership is open to employees of Telangana Secretariat departments.'),
    a.regularOrApprovedProbationer
      ? pass('BR-026', 'Regular appointment or approved probationer.')
      : fail('BR-026', 'You need a regular appointment or approved probation.'),
    !a.memberOfOtherCreditSocietyWithDues
      ? pass('BR-026', 'Not a member of another co-operative credit society with dues.')
      : fail('BR-026', 'Please clear dues and leave the other credit society before applying.'),
  ];
  if (a.dob && a.today) {
    checks.push(ageOn(a.dob, a.today) >= 18 ? pass('BR-026', 'Age 18 or above.') : fail('BR-026', 'Applicants must be 18 or older.'));
  }
  return { eligible: checks.every((c) => c.pass), checks };
}

/** Step-by-step completeness of the digital Membership form F1 (docs/16 §F1). Shared by app + API. */
export function validateMembershipForm(form: MembershipForm | undefined, requiredDocuments: Array<{ type: string; label: string }>): Record<string, string> {
  const e: Record<string, string> = {};
  const f = form ?? {};
  const req = (path: string, v: unknown, msg = 'Required') => {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v))) e[path] = msg;
  };
  req('personal.fullName', f.personal?.fullName);
  req('personal.fatherName', f.personal?.fatherName);
  req('personal.dob', f.personal?.dob, 'Enter a valid date of birth');
  req('personal.gender', f.personal?.gender);
  if (f.personal?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.personal.email)) e['personal.email'] = 'Enter a valid email or leave it blank';
  req('address.present.line1', f.address?.present?.line1);
  req('address.present.city', f.address?.present?.city);
  req('address.present.pincode', f.address?.present?.pincode);
  if (f.address?.present?.pincode && !/^\d{6}$/.test(f.address.present.pincode)) e['address.present.pincode'] = 'PIN code must be 6 digits';
  if (!f.address?.sameAsPresent) {
    req('address.permanent.line1', f.address?.permanent?.line1);
    req('address.permanent.city', f.address?.permanent?.city);
  }
  req('employment.departmentId', f.employment?.departmentId);
  req('employment.designation', f.employment?.designation);
  req('employment.employmentType', f.employment?.employmentType);
  req('employment.regularAppointmentDate', f.employment?.regularAppointmentDate, 'Enter a valid date');
  if (f.employment?.employmentType === 'APPROVED_PROBATIONER') req('employment.probationServiceMonths', f.employment?.probationServiceMonths);
  req('shares.sharesProposed', f.shares?.sharesProposed);
  req('nominee.name', f.nominee?.name);
  req('nominee.relation', f.nominee?.relation);
  for (const d of requiredDocuments) if (!f.documents?.some((x) => x.type === d.type)) e[`documents.${d.type}`] = `${d.label} is required`;
  if (!f.declarations?.byelawsAccepted) e['declarations.byelawsAccepted'] = 'Please accept the bye-laws';
  if (!f.declarations?.noOtherSociety) e['declarations.noOtherSociety'] = 'Please confirm this declaration';
  if (!f.declarations?.recoveryMandateAccepted) e['declarations.recoveryMandateAccepted'] = 'Please accept the salary recovery agreement';
  return e;
}

// ---- Staff workflow (docs/10 §2, D-053) ---------------------------------------------------------
// Received → DDO certification → Office review → Secretary → President → Share payment → Member.

/** Who acts at each in-flight stage. INFO_REQUESTED waits for the applicant. */
export const MEMBERSHIP_STAGE_OWNER: Partial<Record<MembershipStatus, Role>> = {
  SUBMITTED: 'ACCOUNTANT',
  DDO_CERTIFICATION: 'DDO',
  OFFICE_REVIEW: 'ACCOUNTANT',
  APPROVAL_SECRETARY: 'SECRETARY',
  APPROVAL_PRESIDENT: 'PRESIDENT',
  SHARE_PAYMENT_PENDING: 'CASHIER',
  INFO_REQUESTED: 'APPLICANT',
};

/** Stages shown on the console pipeline, in order. */
export const MEMBERSHIP_PIPELINE: MembershipStatus[] = ['SUBMITTED', 'DDO_CERTIFICATION', 'OFFICE_REVIEW', 'APPROVAL_SECRETARY', 'APPROVAL_PRESIDENT', 'SHARE_PAYMENT_PENDING', 'ACTIVE'];

export const isMembershipInFlight = (s: MembershipStatus) => !['DRAFT', 'ACTIVE', 'REJECTED', 'WITHDRAWN'].includes(s);

/**
 * Actions a staff user may take on an application now. Pure: the API enforces it, the console
 * uses it to decide which buttons to show. DDOs act only for their own department.
 */
export function membershipActionsFor(
  app: { status: MembershipStatus; departmentId: string; sharePaymentRoute?: 'COUNTER' | 'FIRST_DEMAND' },
  user: { role: Role; departmentId?: string },
): MembershipAction[] {
  const owner = MEMBERSHIP_STAGE_OWNER[app.status];
  if (!owner || owner !== user.role) return [];
  if (user.role === 'DDO' && user.departmentId !== app.departmentId) return [];
  switch (app.status) {
    case 'SUBMITTED':
      return ['sendToDdo', 'returnToApplicant', 'reject'];
    case 'DDO_CERTIFICATION':
      return ['certify', 'returnToApplicant'];
    case 'OFFICE_REVIEW':
      return ['forward', 'returnToApplicant', 'reject'];
    case 'APPROVAL_SECRETARY':
    case 'APPROVAL_PRESIDENT':
      return ['approve', 'reject'];
    case 'SHARE_PAYMENT_PENDING':
      return [app.sharePaymentRoute === 'FIRST_DEMAND' ? 'activate' : 'recordSharePayment'];
    default:
      return [];
  }
}

/** The default "move forward" action at a stage (used by demo controls to act for the owner). */
export function primaryMembershipAction(status: MembershipStatus, sharePaymentRoute?: 'COUNTER' | 'FIRST_DEMAND'): MembershipAction | undefined {
  return (
    {
      SUBMITTED: 'sendToDdo',
      DDO_CERTIFICATION: 'certify',
      OFFICE_REVIEW: 'forward',
      APPROVAL_SECRETARY: 'approve',
      APPROVAL_PRESIDENT: 'approve',
      SHARE_PAYMENT_PENDING: sharePaymentRoute === 'FIRST_DEMAND' ? 'activate' : 'recordSharePayment',
    } as Partial<Record<MembershipStatus, MembershipAction>>
  )[status];
}

/** Where an action leads. Returns undefined when the action is not valid at this stage. */
export function nextMembershipStatus(status: MembershipStatus, action: MembershipAction): MembershipStatus | undefined {
  if (action === 'reject') return ['SUBMITTED', 'OFFICE_REVIEW', 'APPROVAL_SECRETARY', 'APPROVAL_PRESIDENT'].includes(status) ? 'REJECTED' : undefined;
  if (action === 'returnToApplicant') return ['SUBMITTED', 'DDO_CERTIFICATION', 'OFFICE_REVIEW'].includes(status) ? 'INFO_REQUESTED' : undefined;
  const forward: Partial<Record<MembershipStatus, [MembershipAction, MembershipStatus]>> = {
    SUBMITTED: ['sendToDdo', 'DDO_CERTIFICATION'],
    DDO_CERTIFICATION: ['certify', 'OFFICE_REVIEW'],
    OFFICE_REVIEW: ['forward', 'APPROVAL_SECRETARY'],
    APPROVAL_SECRETARY: ['approve', 'APPROVAL_PRESIDENT'],
    APPROVAL_PRESIDENT: ['approve', 'SHARE_PAYMENT_PENDING'],
  };
  const f = forward[status];
  if (f && f[0] === action) return f[1];
  if (status === 'SHARE_PAYMENT_PENDING' && (action === 'recordSharePayment' || action === 'activate')) return 'ACTIVE';
  return undefined;
}

/** BR-032 Share capital due on joining: shares × share value (value is a setting, D-053). */
export const membershipShareAmount = (sharesProposed: number, shareValue: number) => sharesProposed * shareValue;
