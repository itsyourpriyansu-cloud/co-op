// Every workflow status in the system (docs/10). One list per entity so UI, API and seed agree.

export const LOAN_STATUSES = [
  'DRAFT',
  'SURETY_PENDING',
  'ACCOUNTANT_REVIEW',
  'RETURNED',
  'DDO_CERTIFICATION',
  'ASSESSMENT',
  'SANCTION_SECRETARY',
  'SANCTION_PRESIDENT',
  'SANCTIONED',
  'ACTIVE',
  'CLOSED',
  'CLOSED_BY_TOPUP',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const MEMBERSHIP_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'DDO_CERTIFICATION',
  'OFFICE_REVIEW',
  'INFO_REQUESTED',
  'APPROVAL_SECRETARY',
  'APPROVAL_PRESIDENT',
  'SHARE_PAYMENT_PENDING',
  'ACTIVE',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const DEPOSIT_STATUSES = [
  'REQUESTED',
  'PAYMENT_RECEIVED',
  'ACCEPTANCE_SECRETARY',
  'ACCEPTANCE_PRESIDENT',
  'ACTIVE',
  'MATURED',
  'CLOSED',
  'CANCELLED',
  'REFUND_PENDING',
] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const DEMAND_SHEET_STATUSES = ['NOT_GENERATED', 'GENERATED', 'CERTIFIED', 'SENT_TO_DDO', 'RECOVERY_POSTED'] as const;
export type DemandSheetStatus = (typeof DEMAND_SHEET_STATUSES)[number];

export const SURETY_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'REPLACED'] as const;
export type SuretyStatus = (typeof SURETY_STATUSES)[number];

export const PAYMENT_REPORT_STATUSES = ['REPORTED', 'VERIFIED', 'REJECTED'] as const;
export type PaymentReportStatus = (typeof PAYMENT_REPORT_STATUSES)[number];

export const CHANGE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const MEMBER_STATUSES = ['ACTIVE', 'RETIRED', 'RESIGNED', 'DECEASED'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const SCHEDULE_PAID_STATUSES = ['UNPAID', 'PARTIAL', 'PAID'] as const;
export type SchedulePaidStatus = (typeof SCHEDULE_PAID_STATUSES)[number];

export const TICKET_STATUSES = ['OPEN', 'ANSWERED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Union of every status string — used by the shared status → tone/label presentation map. */
export type AnyStatus =
  | LoanStatus
  | MembershipStatus
  | DepositStatus
  | DemandSheetStatus
  | SuretyStatus
  | PaymentReportStatus
  | ChangeRequestStatus
  | MemberStatus
  | SchedulePaidStatus
  | TicketStatus;
