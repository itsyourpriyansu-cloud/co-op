// BR-013 / BR-019 state machines (docs/10 §1, §3, §4): who acts at each stage, which actions they
// get, and where each action leads. Pure: the API enforces them, the UIs decide which buttons to show.
import type { DemandSheetStatus, DepositStatus, LoanProduct, LoanStatus, Role } from '@tgs/types';

type Actor = { role: Role; departmentId?: string };

// ---- Loans (docs/10 §1) -----------------------------------------------------------------------

export type LoanAction =
  | 'submit'
  | 'resubmit'
  | 'withdraw'
  | 'suretyAccept'
  | 'suretyDecline'
  | 'forward'
  | 'returnToMember'
  | 'reject'
  | 'ddoCertify'
  | 'ddoRecordManual'
  | 'sendForSanction'
  | 'secretarySign'
  | 'presidentSign'
  | 'sendBack'
  | 'disburse';

/** Staff owner of each in-process loan stage. SURETY_PENDING / RETURNED wait on members. */
export const LOAN_STAGE_OWNER: Partial<Record<LoanStatus, Role>> = {
  SURETY_PENDING: 'MEMBER',
  RETURNED: 'MEMBER',
  ACCOUNTANT_REVIEW: 'ACCOUNTANT',
  DDO_CERTIFICATION: 'DDO',
  ASSESSMENT: 'ACCOUNTANT',
  SANCTION_SECRETARY: 'SECRETARY',
  SANCTION_PRESIDENT: 'PRESIDENT',
  SANCTIONED: 'CASHIER',
};

export const LOAN_PIPELINE: LoanStatus[] = ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED'];
export const isLoanInFlight = (s: LoanStatus) => LOAN_PIPELINE.includes(s) || s === 'RETURNED' || s === 'DRAFT';

/** Staff actions on a loan now. DDOs act only for borrowers in their own department. */
export function loanActionsFor(loan: { status: LoanStatus; memberDepartmentId: string }, user: Actor): LoanAction[] {
  switch (loan.status) {
    case 'ACCOUNTANT_REVIEW':
      return user.role === 'ACCOUNTANT' ? ['forward', 'returnToMember', 'reject'] : [];
    case 'DDO_CERTIFICATION':
      if (user.role === 'DDO') return user.departmentId === loan.memberDepartmentId ? ['ddoCertify', 'returnToMember', 'reject'] : [];
      return user.role === 'ACCOUNTANT' ? ['ddoRecordManual'] : [];
    case 'ASSESSMENT':
      return user.role === 'ACCOUNTANT' ? ['sendForSanction', 'returnToMember', 'reject'] : [];
    case 'SANCTION_SECRETARY':
      return user.role === 'SECRETARY' ? ['secretarySign', 'reject'] : [];
    case 'SANCTION_PRESIDENT':
      return user.role === 'PRESIDENT' ? ['presidentSign', 'sendBack', 'reject'] : [];
    case 'SANCTIONED':
      return user.role === 'CASHIER' ? ['disburse'] : [];
    default:
      return [];
  }
}

/** The default forward action at a stage (demo controls act for the owner with it). */
export const PRIMARY_LOAN_ACTION: Partial<Record<LoanStatus, LoanAction>> = {
  ACCOUNTANT_REVIEW: 'forward',
  DDO_CERTIFICATION: 'ddoCertify',
  ASSESSMENT: 'sendForSanction',
  SANCTION_SECRETARY: 'secretarySign',
  SANCTION_PRESIDENT: 'presidentSign',
  SANCTIONED: 'disburse',
};

/**
 * Where an action leads. `allSuretiesAccepted` decides whether a surety signature completes the
 * surety stage. Returns undefined when the action is not valid at this status.
 */
export function nextLoanStatus(
  status: LoanStatus,
  action: LoanAction,
  ctx: { product: Pick<LoanProduct, 'suretiesRequired' | 'ddoCertificationRequired'>; allSuretiesAccepted?: boolean },
): LoanStatus | undefined {
  const needsSureties = ctx.product.suretiesRequired > 0;
  switch (action) {
    case 'submit':
      return status === 'DRAFT' ? (needsSureties ? 'SURETY_PENDING' : 'ACCOUNTANT_REVIEW') : undefined;
    case 'resubmit':
      return status === 'RETURNED' ? (needsSureties && !ctx.allSuretiesAccepted ? 'SURETY_PENDING' : 'ACCOUNTANT_REVIEW') : undefined;
    case 'withdraw':
      return ['DRAFT', 'SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'RETURNED'].includes(status) ? 'WITHDRAWN' : undefined;
    case 'suretyAccept':
      return status === 'SURETY_PENDING' ? (ctx.allSuretiesAccepted ? 'ACCOUNTANT_REVIEW' : 'SURETY_PENDING') : undefined;
    case 'suretyDecline':
      return status === 'SURETY_PENDING' ? 'SURETY_PENDING' : undefined;
    case 'forward':
      return status === 'ACCOUNTANT_REVIEW' ? (ctx.product.ddoCertificationRequired ? 'DDO_CERTIFICATION' : 'ASSESSMENT') : undefined;
    case 'returnToMember':
      return ['ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT'].includes(status) ? 'RETURNED' : undefined;
    case 'reject':
      return ['ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT'].includes(status) ? 'REJECTED' : undefined;
    case 'ddoCertify':
    case 'ddoRecordManual':
      return status === 'DDO_CERTIFICATION' ? 'ASSESSMENT' : undefined;
    case 'sendForSanction':
      return status === 'ASSESSMENT' ? 'SANCTION_SECRETARY' : undefined;
    case 'secretarySign':
      return status === 'SANCTION_SECRETARY' ? 'SANCTION_PRESIDENT' : undefined;
    case 'presidentSign':
      return status === 'SANCTION_PRESIDENT' ? 'SANCTIONED' : undefined;
    case 'sendBack':
      return status === 'SANCTION_PRESIDENT' ? 'ASSESSMENT' : undefined;
    case 'disburse':
      return status === 'SANCTIONED' ? 'ACTIVE' : undefined;
  }
}

// ---- Fixed deposits: request → acceptance (docs/10 §3) ------------------------------------------

export type DepositAction = 'recordPayment' | 'cancel' | 'accept' | 'reject' | 'refund' | 'payout';

/** Owner and actions of each FD stage that needs someone (docs/10 §3). */
const DEPOSIT_STAGES: Partial<Record<DepositStatus, { owner: Role; actions: DepositAction[] }>> = {
  REQUESTED: { owner: 'CASHIER', actions: ['recordPayment', 'cancel'] },
  PAYMENT_RECEIVED: { owner: 'SECRETARY', actions: ['accept', 'reject'] },
  ACCEPTANCE_SECRETARY: { owner: 'SECRETARY', actions: ['accept', 'reject'] },
  ACCEPTANCE_PRESIDENT: { owner: 'PRESIDENT', actions: ['accept', 'reject'] },
  REFUND_PENDING: { owner: 'CASHIER', actions: ['refund'] },
  MATURED: { owner: 'CASHIER', actions: ['payout'] },
};

export const DEPOSIT_STAGE_OWNER: Partial<Record<DepositStatus, Role>> = Object.fromEntries(Object.entries(DEPOSIT_STAGES).map(([s, v]) => [s, v.owner]));

export function depositActionsFor(status: DepositStatus, user: Actor): DepositAction[] {
  const stage = DEPOSIT_STAGES[status];
  return stage && stage.owner === user.role ? [...stage.actions] : [];
}

export const PRIMARY_DEPOSIT_ACTION: Partial<Record<DepositStatus, DepositAction>> = {
  REQUESTED: 'recordPayment',
  PAYMENT_RECEIVED: 'accept',
  ACCEPTANCE_SECRETARY: 'accept',
  ACCEPTANCE_PRESIDENT: 'accept',
  REFUND_PENDING: 'refund',
  MATURED: 'payout',
};

export function nextDepositStatus(status: DepositStatus, action: DepositAction): DepositStatus | undefined {
  switch (action) {
    case 'recordPayment':
      return status === 'REQUESTED' ? 'ACCEPTANCE_SECRETARY' : undefined;
    case 'cancel':
      return status === 'REQUESTED' ? 'CANCELLED' : undefined;
    case 'accept':
      return status === 'PAYMENT_RECEIVED' || status === 'ACCEPTANCE_SECRETARY' ? 'ACCEPTANCE_PRESIDENT' : status === 'ACCEPTANCE_PRESIDENT' ? 'ACTIVE' : undefined;
    case 'reject':
      return ['PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT'].includes(status) ? 'REFUND_PENDING' : undefined;
    case 'refund':
      return status === 'REFUND_PENDING' ? 'CANCELLED' : undefined;
    case 'payout':
      return status === 'MATURED' ? 'CLOSED' : undefined;
  }
}

// ---- Demand sheets (docs/10 §4, BR-030) -----------------------------------------------------------

export type DemandSheetAction = 'certify' | 'sendToDdo' | 'postRecovery';

export function demandSheetActionsFor(status: DemandSheetStatus, user: Actor): DemandSheetAction[] {
  if (user.role !== 'ACCOUNTANT') return [];
  return status === 'GENERATED' ? ['certify'] : status === 'CERTIFIED' ? ['sendToDdo'] : status === 'SENT_TO_DDO' ? ['postRecovery'] : [];
}

export function nextDemandSheetStatus(status: DemandSheetStatus, action: DemandSheetAction): DemandSheetStatus | undefined {
  if (action === 'certify') return status === 'GENERATED' ? 'CERTIFIED' : undefined;
  if (action === 'sendToDdo') return status === 'CERTIFIED' ? 'SENT_TO_DDO' : undefined;
  return status === 'SENT_TO_DDO' ? 'RECOVERY_POSTED' : undefined;
}
