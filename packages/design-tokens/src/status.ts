// Status presentation (docs/18 §6): one tone + label per workflow status, shared by the console
// (Blend TagV2) and the app (native Tag). Staff see process language; members see plain language.
import type { AnyStatus } from '@tgs/types';
import type { SemanticColors } from './semantic';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'approval';

/** Blend TagV2/AlertV2 colour for each tone (TagV2Color / AlertV2Type values). */
export const toneToBlendColor = {
  neutral: 'neutral',
  info: 'primary',
  warning: 'warning',
  success: 'success',
  danger: 'error',
  approval: 'purple',
} as const satisfies Record<Tone, string>;

export function toneColors(tone: Tone, c: SemanticColors) {
  return c.status[tone === 'approval' ? 'approval' : tone];
}

interface Presentation {
  tone: Tone;
  staff: string;
  member: string;
}

const P = (tone: Tone, staff: string, member = staff): Presentation => ({ tone, staff, member });

/** Keyed by `${entity}:${status}` because some status names repeat across entities. */
const MAP: Record<string, Presentation> = {
  // Loans (docs/10 §1)
  'loan:DRAFT': P('neutral', 'Draft'),
  'loan:SURETY_PENDING': P('info', 'Awaiting sureties', 'Waiting for sureties'),
  'loan:ACCOUNTANT_REVIEW': P('info', 'Accountant review', 'Under review'),
  'loan:RETURNED': P('warning', 'Returned', 'Action needed'),
  'loan:DDO_CERTIFICATION': P('info', 'DDO certification', 'Department verification'),
  'loan:ASSESSMENT': P('info', 'Assessment', 'Under review'),
  'loan:SANCTION_SECRETARY': P('approval', 'Awaiting Secretary', 'Approval (1 of 2)'),
  'loan:SANCTION_PRESIDENT': P('approval', 'Awaiting President', 'Approval (2 of 2)'),
  'loan:SANCTIONED': P('success', 'Sanctioned', 'Approved, payout pending'),
  'loan:ACTIVE': P('success', 'Active'),
  'loan:CLOSED': P('neutral', 'Closed', 'Repaid'),
  'loan:CLOSED_BY_TOPUP': P('neutral', 'Closed by top-up', 'Replaced by top-up'),
  'loan:REJECTED': P('danger', 'Rejected', 'Not approved'),
  'loan:WITHDRAWN': P('neutral', 'Withdrawn'),
  // Membership (docs/10 §2)
  'membership:DRAFT': P('neutral', 'Draft'),
  'membership:SUBMITTED': P('info', 'Received', 'In the queue'),
  'membership:DDO_CERTIFICATION': P('info', 'DDO certification', 'Department verification'),
  'membership:OFFICE_REVIEW': P('info', 'Office review'),
  'membership:INFO_REQUESTED': P('warning', 'Info requested', 'Action needed'),
  'membership:APPROVAL_SECRETARY': P('approval', 'Awaiting Secretary', 'Approval (1 of 2)'),
  'membership:APPROVAL_PRESIDENT': P('approval', 'Awaiting President', 'Approval (2 of 2)'),
  'membership:SHARE_PAYMENT_PENDING': P('warning', 'Share payment pending', 'Pay for your shares'),
  'membership:ACTIVE': P('success', 'Member', 'Welcome!'),
  'membership:REJECTED': P('danger', 'Rejected', 'Not approved'),
  'membership:WITHDRAWN': P('neutral', 'Withdrawn'),
  // Deposits (docs/10 §3)
  'deposit:REQUESTED': P('info', 'Requested', 'Waiting for payment'),
  'deposit:PAYMENT_RECEIVED': P('info', 'Payment received', 'Payment received'),
  'deposit:ACCEPTANCE_SECRETARY': P('approval', 'Awaiting Secretary', 'Acceptance (1 of 2)'),
  'deposit:ACCEPTANCE_PRESIDENT': P('approval', 'Awaiting President', 'Acceptance (2 of 2)'),
  'deposit:ACTIVE': P('success', 'Active'),
  'deposit:MATURED': P('warning', 'Matured', 'Matured: visit the office'),
  'deposit:CLOSED': P('neutral', 'Closed'),
  'deposit:CANCELLED': P('neutral', 'Cancelled'),
  'deposit:REFUND_PENDING': P('warning', 'Refund pending'),
  'deposit:PLEDGED': P('approval', 'Pledged to loan', 'Pledged to a loan'),
  // Demand sheets (docs/10 §4)
  'demandSheet:NOT_GENERATED': P('neutral', 'Not generated'),
  'demandSheet:GENERATED': P('info', 'Generated'),
  'demandSheet:CERTIFIED': P('approval', 'Certified'),
  'demandSheet:SENT_TO_DDO': P('info', 'Sent to DDO'),
  'demandSheet:RECOVERY_POSTED': P('success', 'Recovery posted'),
  // Sureties, schedule rows, payment reports, change requests, members, tickets
  'surety:PENDING': P('warning', 'Pending'),
  'surety:ACCEPTED': P('success', 'Signed'),
  'surety:DECLINED': P('danger', 'Declined'),
  'surety:REPLACED': P('neutral', 'Replaced'),
  'schedule:UNPAID': P('neutral', 'Due'),
  'schedule:PARTIAL': P('warning', 'Part paid'),
  'schedule:PAID': P('success', 'Paid'),
  'paymentReport:REPORTED': P('info', 'Reported', 'Being verified'),
  'paymentReport:VERIFIED': P('success', 'Verified'),
  'paymentReport:REJECTED': P('danger', 'Rejected', 'Not matched'),
  'changeRequest:PENDING': P('info', 'Pending', 'Under review'),
  'changeRequest:APPROVED': P('success', 'Approved'),
  'changeRequest:REJECTED': P('danger', 'Rejected'),
  'member:ACTIVE': P('success', 'Active'),
  'member:RETIRED': P('neutral', 'Retired'),
  'member:RESIGNED': P('neutral', 'Resigned'),
  'member:DECEASED': P('neutral', 'Deceased'),
  'ticket:OPEN': P('info', 'Open'),
  'ticket:ANSWERED': P('success', 'Answered'),
  'ticket:CLOSED': P('neutral', 'Closed'),
};

export type StatusEntity =
  | 'loan'
  | 'membership'
  | 'deposit'
  | 'demandSheet'
  | 'surety'
  | 'schedule'
  | 'paymentReport'
  | 'changeRequest'
  | 'member'
  | 'ticket';

export function presentStatus(entity: StatusEntity, status: AnyStatus | 'PLEDGED', audience: 'staff' | 'member' = 'staff') {
  const p = MAP[`${entity}:${status}`];
  if (!p) return { tone: 'neutral' as Tone, label: status.replace(/_/g, ' ').toLowerCase() };
  return { tone: p.tone, label: audience === 'member' ? p.member : p.staff };
}

/** Every key, for the design-system gallery and tests. */
export const STATUS_PRESENTATION_KEYS = Object.keys(MAP);
