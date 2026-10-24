// Entities (docs/08-data-model.md v0.4). Money is integer paise (D-018); dates are ISO strings.
import type { ConsoleRole } from './roles';
import type {
  ChangeRequestStatus,
  DemandSheetStatus,
  DepositStatus,
  LoanStatus,
  MemberStatus,
  MembershipStatus,
  PaymentReportStatus,
  SchedulePaidStatus,
  SuretyStatus,
  TicketStatus,
} from './status';

/** ISO calendar date `YYYY-MM-DD`. */
export type ISODate = string;
/** ISO date-time. */
export type ISODateTime = string;
/** Demand cycle `YYYY-MM`. */
export type Cycle = string;
/** Money is always integer paise (D-018). */
export type Paise = number;

export interface SocietyProfile {
  name: string;
  shortName: string;
  registrationNo: string;
  address: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  kind: 'SECRETARY_DEPT' | 'EXTERNAL_OFFICE';
  ddoName: string;
  ddoDesignation: string;
}

export interface StaffUser {
  id: string;
  name: string;
  userId: string;
  role: ConsoleRole;
  departmentId?: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  district: string;
  pincode: string;
}

export interface Nominee {
  name: string;
  relation: 'Spouse' | 'Son' | 'Daughter' | 'Father' | 'Mother' | 'Brother' | 'Sister';
  address?: string;
}

export interface PayProfile {
  scaleOfPay: string;
  substantivePay: Paise;
  officiatingPay?: Paise;
  grossSalary: Paise;
  govtLoanDeductions: Paise;
  otherLoanDeductions: Paise;
  certifiedAt?: ISODate;
}

export interface Member {
  id: string;
  /** "General No." printed on every society form (Q-501). */
  generalNo: string;
  employeeId: string;
  name: string;
  fatherName: string;
  gender: 'F' | 'M';
  dob: ISODate;
  mobile: string;
  mobileMasked: string;
  email?: string;
  presentAddress: Address;
  permanentAddress: Address;
  designation: string;
  departmentId: string;
  doj: ISODate;
  dor: ISODate;
  employmentType: 'REGULAR' | 'APPROVED_PROBATIONER';
  numberOfShares: number;
  nominee: Nominee;
  payProfile: PayProfile;
  anniversaryDate?: ISODate;
  status: MemberStatus;
  portalActivated: boolean;
  joinedSocietyOn: ISODate;
}

/** Lightweight member card used in lists, pickers and sessions. */
export interface MemberSummary {
  id: string;
  generalNo: string;
  name: string;
  departmentId: string;
  designation: string;
  mobileMasked: string;
}

export interface ApplicantSummary {
  id: string;
  name: string;
  mobileMasked: string;
}

export type LoanProductCode = 'ORDINARY' | 'EDUCATION' | 'SALARY' | 'DEPOSIT';
export type EmiMethod = 'AMORTIZED' | 'EQUAL_PRINCIPAL';

export interface LoanProduct {
  code: LoanProductCode;
  name: string;
  ratePercent: number;
  maxAmount: Paise;
  maxInstalments: number;
  suretiesRequired: number;
  ddoCertificationRequired: boolean;
  shareDepositPercent: number;
  topupAllowed: boolean;
  emiMethod: EmiMethod;
  /** Values the society has not confirmed yet (docs/09). Shown as "placeholder" in Settings. */
  placeholder: boolean;
}

export interface ScheduleRow {
  installmentNo: number;
  dueCycle: Cycle;
  opening: Paise;
  interest: Paise;
  principal: Paise;
  emi: Paise;
  closing: Paise;
  paidStatus: SchedulePaidStatus;
}

export interface LoanSurety {
  memberId: string;
  status: SuretyStatus;
  retiresDuringLoan: boolean;
  respondedAt?: ISODateTime;
  declineReason?: string;
}

export interface WorkflowEvent {
  at: ISODateTime;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  fromStatus?: string;
  toStatus: string;
  remarks?: string;
}

export interface Loan {
  id: string;
  applicationNo: string;
  loanNo?: string;
  memberId: string;
  product: LoanProductCode;
  status: LoanStatus;
  appliedAmount: Paise;
  appliedInstalments: number;
  purpose: string;
  sanctionedAmount?: Paise;
  ratePercent: number;
  emi?: Paise;
  shareDepositDeduction?: Paise;
  topupSettlement?: Paise;
  netDisbursable?: Paise;
  disbursedOn?: ISODate;
  outstandingPrincipal: Paise;
  parentLoanId?: string;
  pledgedDepositId?: string;
  sureties: LoanSurety[];
  schedule: ScheduleRow[];
  events: WorkflowEvent[];
  appliedOn: ISODate;
  closedOn?: ISODate;
}

export type DepositScheme = 'FD' | 'CRD' | 'SRDS' | 'SAVINGS';
export type PayoutFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ON_MATURITY';

export interface DepositAccount {
  id: string;
  accountNo: string;
  fdrNo?: string;
  memberId: string;
  scheme: DepositScheme;
  status: DepositStatus;
  openedOn: ISODate;
  principal?: Paise;
  monthlyAmount?: Paise;
  tenureMonths?: number;
  ratePercent: number;
  payoutFrequency?: PayoutFrequency;
  maturityDate?: ISODate;
  maturityValue?: Paise;
  balance: Paise;
  operationMode: 'SINGLE' | 'EITHER_OR_SURVIVOR' | 'ANY_ONE_OR_SURVIVOR';
  jointHolders: string[];
  minor?: { name: string; dob: ISODate; guardianName: string };
  pledgedToLoanId?: string;
}

export type DemandHead = 'RRF' | 'INSURANCE' | 'CRD' | 'SRDS' | 'SHARE_CAPITAL' | 'PENAL' | 'INTEREST' | 'PRINCIPAL';

export interface DemandComponent {
  head: DemandHead;
  loanId?: string;
  loanProduct?: LoanProductCode;
  amount: Paise;
  allocated: Paise;
}

export interface DemandLine {
  memberId: string;
  components: DemandComponent[];
  totalDemand: Paise;
  recovered?: Paise;
}

export interface DemandSheet {
  id: string;
  cycle: Cycle;
  departmentId: string;
  status: DemandSheetStatus;
  lines: DemandLine[];
  totalDemand: Paise;
  totalRecovered: Paise;
  certifiedBy?: string;
}

export type ReceiptSource = 'SALARY_RECOVERY' | 'CASH' | 'BANK_TRANSFER' | 'ADJUSTMENT';

export interface Receipt {
  id: string;
  receiptNo: string;
  memberId: string;
  date: ISODate;
  source: ReceiptSource;
  amount: Paise;
  denominations?: Partial<Record<500 | 200 | 100 | 50 | 20 | 10, number>>;
  cycle?: Cycle;
  allocations: Array<{ head: DemandHead; loanId?: string; amount: Paise }>;
}

export interface MembershipApplication {
  id: string;
  applicationNo: string;
  applicantId: string;
  name: string;
  departmentId: string;
  designation: string;
  regularAppointmentDate: ISODate;
  sharesProposed: number;
  status: MembershipStatus;
  submittedOn?: ISODate;
  infoRequest?: { by: string; field: string; message: string };
  sharePaymentRoute?: 'COUNTER' | 'FIRST_DEMAND';
  allottedGeneralNo?: string;
  events: WorkflowEvent[];
}

export interface PaymentReport {
  id: string;
  memberId: string;
  amount: Paise;
  paidOn: ISODate;
  mode: 'BANK_TRANSFER' | 'UPI' | 'CHEQUE_DEPOSIT';
  reference: string;
  status: PaymentReportStatus;
  rejectReason?: string;
}

export interface ProfileChangeRequest {
  id: string;
  memberId: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  status: ChangeRequestStatus;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  title: string;
  body: string;
  channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP' | 'SMS';
  createdAt: ISODateTime;
  read: boolean;
  link?: string;
}

export interface ShareAccount {
  memberId: string;
  numberOfShares: number;
  shareCapital: Paise;
  /** Credited from Ordinary-loan deductions (BR-004). */
  shareDepositBalance: Paise;
}

export interface TransferEvent {
  memberId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveCycle: Cycle;
  orderRef: string;
}

/** Society settings seed (docs/13 §3). `placeholders` lists values awaiting the society (docs/09). */
export interface SocietySettings {
  shareValue: Paise;
  insurance: { loaneeAmount: Paise; nonLoaneeAmount: Paise; collectionMonth: number };
  rrfMonthly: Paise;
  crdMonthly: Paise;
  srdsMonthly: Paise;
  retirementAge: number;
  defaulterCycles: number;
  fdSlabs: Array<{ fromMonths: number; toMonths: number; ratePercent: number }>;
  savingsRatePercent: number;
  placeholders: string[];
}

export interface SupportTicket {
  id: string;
  memberId: string;
  subject: string;
  status: TicketStatus;
  createdAt: ISODateTime;
}
