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
  email?: string;
  mobile?: string;
  /** Inactive users cannot sign in (ST-61). Missing = active. */
  active?: boolean;
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
  /** Verified by OTP at sign-up (MJ-02). Never shown unmasked in lists. */
  mobile?: string;
  mobileMasked: string;
}

export type LoanProductCode = 'ORDINARY' | 'EDUCATION' | 'SALARY' | 'DEPOSIT';
export type EmiMethod = 'AMORTIZED' | 'EQUAL_PRINCIPAL';

export interface LoanProduct {
  code: LoanProductCode;
  name: string;
  ratePercent: number;
  /** BR-016 [P]: smallest amount accepted. */
  minAmount: Paise;
  maxAmount: Paise;
  maxInstalments: number;
  /** BR-018 [P]: active loans of this product a member may hold at once (more → top-up). */
  maxConcurrent: number;
  /** BR-015 [P]: Deposit loan may be at most this % of the pledged FD principal. */
  depositMarginPercent: number;
  /** BR-012 [UNKNOWN]: penal interest on overdue instalments (0 = off). */
  penalRatePercent: number;
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
  /** Paper form F2 / F3 as captured digitally (M4). Seeded historic loans may not have it. */
  form?: LoanApplicationForm;
  /** Where it was filled: the member in the app, or the office on behalf (ST-21) from a signed paper form. */
  channel?: 'APP' | 'COUNTER';
  createdByName?: string;
  submittedAt?: ISODateTime;
  signature?: { signedAt: ISODateTime; textVersion: string };
  /** M5 workflow records (ST-24 … ST-28), each with name and time. */
  signOffs?: LoanSignOffs;
  /** ST-26 assessment = "For Office Use" (F2/F3 back side). */
  sanctionSheet?: SanctionSheet;
  sanctionedInstalments?: number;
  sanctionLetterNo?: string;
  /** Last return to the member (RETURNED) or rejection. */
  returnInfo?: { byName: string; role: string; at: ISODateTime; reason: string };
  rejection?: StaffSignOff;
  disbursement?: { mode: 'NEFT' | 'CHEQUE' | 'TRANSFER'; reference: string; date: ISODate; amount: Paise; byName: string; at: ISODateTime };
}

export interface LoanSignOffs {
  review?: StaffSignOff;
  /** DDO certificate on items 1–5 (F2), or the accountant's record of an offline one (Q-102). */
  ddo?: StaffSignOff & { recoveryFeasible: boolean; manual?: { ddoName: string; designation: string; date: ISODate; reference: string } };
  assessment?: StaffSignOff;
  secretary?: StaffSignOff;
  president?: StaffSignOff;
}

/** ST-26 / ST-27: what the society sanctions and what the member receives. Money in paise. */
export interface SanctionSheet {
  amount: Paise;
  instalments: number;
  ratePercent: number;
  emi: Paise;
  lastEmi: Paise;
  totalInterest: Paise;
  firstDueCycle: Cycle;
  shareDeduction: Paise;
  /** Top-up only: what closes the old loan (BR-007). */
  topup?: { loanId: string; loanNo: string; outstandingPrincipal: Paise; accruedInterest: Paise; settlement: Paise };
  netDisbursable: Paise;
  /** Office-use balances (F3 back): OL / SL outstanding and their dates. */
  balances: { ordinary: Paise; salary: Paise; ordinaryTakenOn?: ISODate; salaryTakenOn?: ISODate };
}

/** F2 items 4–8 (Ordinary / Education) and F3 items 5–9 (Salary), docs/16. Money in paise. */
export interface LoanApplicationForm {
  /** F2 4b–5: pay details the DDO later certifies. */
  pay?: { scaleOfPay: string; officiatingServiceMonths?: number; grossSalary: Paise; govtLoanDeductions: Paise; otherLoanDeductions: Paise };
  /** F2 6c (Q-508). */
  additionalShares?: number;
  /** F2 item 8 (Q-507). */
  security?: { type: 'SURETY' | 'DEPOSIT_PLEDGE' | 'OTHER'; description?: string };
  /** F2 7b, Education loans [P, Q-311]. */
  education?: { studentName: string; relation: string; institution: string; course: string };
  /** F3 items 5–9, Salary loans. */
  salary?: { substantivePay: Paise; compulsoryDeductions: Array<{ label: string; amount: Paise }>; netPayEarnedToDate: Paise };
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
  minor?: { name: string; dob: ISODate; guardianName: string; guardianRelation?: string };
  pledgedToLoanId?: string;
  /** F4 (M6): full holder particulars for joint deposits (the primary holder is the member). */
  holders?: FdHolder[];
  nominee?: Nominee;
  /** Where the request came from: the member in the app (MB-15) or the office counter (ST-31). */
  channel?: 'APP' | 'COUNTER';
  requestedAt?: ISODateTime;
  signature?: { signedAt: ISODateTime; textVersion: string };
  /** ST-33 step 1: the cashier's receipt (cash with denominations, BR-029, or transfer). */
  payment?: { mode: 'CASH' | 'TRANSFER' | 'CHEQUE'; amount: Paise; date: ISODate; denominations?: Partial<Record<500 | 200 | 100 | 50 | 20 | 10, number>>; reference?: string; receiptNo: string; byName: string; at: ISODateTime };
  /** ST-33 steps 2–3 (D-027). */
  signOffs?: { secretary?: StaffSignOff; president?: StaffSignOff };
  rejection?: StaffSignOff;
  cancelledReason?: string;
  closedOn?: ISODate;
  /** Request → acceptance history (ST-32 activity, MB-09 tracker). */
  events?: WorkflowEvent[];
}

/** F4 joint holder (docs/16): items 2–4 for a second or third depositor. */
export interface FdHolder {
  name: string;
  fatherOrHusbandName: string;
  occupation: string;
  address: string;
  phone: string;
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
  /** M7 sign-offs (ST-41 generate, BR-030 certify, send to DDO, ST-43 post). */
  generated?: StaffSignOff;
  certified?: StaffSignOff;
  sent?: StaffSignOff;
  posted?: StaffSignOff;
  events?: WorkflowEvent[];
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
  allocations: Array<{ head: DemandHead; loanId?: string; amount: Paise; cycle?: Cycle }>;
  /** What a counter / bank receipt was for. Salary recoveries have none (they follow the demand). */
  purpose?: 'FD' | 'DUES' | 'SHARE_CAPITAL';
  depositId?: string;
  reference?: string;
  /** M7: who took the money (cashier), from which sheet or member report. */
  sheetId?: string;
  paymentReportId?: string;
  byName?: string;
  byId?: string;
  at?: ISODateTime;
  remarks?: string;
}

export type MembershipDocumentType = 'PHOTO' | 'ID_PROOF' | 'APPOINTMENT_ORDER' | 'SERVICE_CERTIFICATE';

/** The digital Membership form F1 (docs/16 §F1). Every section is optional while it is a draft. */
export interface MembershipForm {
  personal?: { fullName?: string; fatherName?: string; dob?: ISODate; gender?: 'F' | 'M'; mobile?: string; email?: string };
  address?: { present?: Partial<Address>; permanent?: Partial<Address>; sameAsPresent?: boolean };
  employment?: {
    departmentId?: string;
    designation?: string;
    employeeId?: string;
    employmentType?: 'REGULAR' | 'APPROVED_PROBATIONER';
    regularAppointmentDate?: ISODate;
    probationServiceMonths?: number;
  };
  shares?: { sharesProposed?: number };
  nominee?: { name?: string; relation?: Nominee['relation']; address?: string };
  documents?: Array<{ type: MembershipDocumentType; fileName: string; uploadedAt: ISODateTime }>;
  declarations?: { byelawsAccepted?: boolean; noOtherSociety?: boolean; recoveryMandateAccepted?: boolean };
}

/** Sign with OTP (D-031): who, when and which text version was agreed. */
export interface SignatureRecord {
  signedAt: ISODateTime;
  textVersion: string;
  method: 'OTP';
}

/** F1 items 1–7 that the DDO certifies (docs/16 §F1 "Certified that items 1 to 7 are correct"). */
export const F1_CERT_ITEMS = ['name', 'fatherName', 'dob', 'address', 'designation', 'office', 'appointment'] as const;
export type F1CertItem = (typeof F1_CERT_ITEMS)[number];

/** A staff action recorded on a workflow item: who, when, what they said. */
export interface StaffSignOff {
  byId: string;
  byName: string;
  role: string;
  at: ISODateTime;
  remarks?: string;
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
  form?: MembershipForm;
  signature?: SignatureRecord;
  eligibility?: { worksInSecretariatDept: boolean; regularOrApprovedProbationer: boolean; memberOfOtherCreditSocietyWithDues: boolean; checkedAt: ISODateTime };
  // Staff sign-offs, in workflow order (docs/06 ST-15…17).
  intake?: StaffSignOff;
  ddoCertification?: StaffSignOff & { designation: string; departmentName: string; items: Record<F1CertItem, 'OK' | 'FLAG'>; mandateAgreed: boolean };
  officeReview?: StaffSignOff;
  secretaryApproval?: StaffSignOff;
  presidentApproval?: StaffSignOff;
  rejection?: StaffSignOff;
  shareReceipt?: { receiptNo: string; at: ISODateTime; amount: Paise; mode: 'CASH' | 'UPI' | 'CHEQUE' | 'FIRST_DEMAND'; reference?: string; byName: string };
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
  /** MB-18 (D-043): what the money was for. */
  towards?: 'DUES' | 'SHARE_CAPITAL';
  reportedAt?: ISODateTime;
  /** Prototype: only the file name of the attached screenshot is kept. */
  screenshotName?: string;
  /** ST-47: the cashier's decision. */
  decided?: StaffSignOff;
  receiptId?: string;
}

/** Member-requestable profile fields (MB-19, docs/06). Employment and pay fields need the DDO first (D-057). */
export type ProfileField =
  | 'name'
  | 'fatherName'
  | 'dob'
  | 'designation'
  | 'doj'
  | 'dor'
  | 'nominee.name'
  | 'nominee.relation'
  | 'payProfile.scaleOfPay'
  | 'payProfile.grossSalary';

export interface ProfileFieldChange {
  field: ProfileField;
  /** Display values (money in rupees, dates ISO). */
  oldValue: string;
  newValue: string;
}

/** ST-18 / MB-19 (docs/08 v0.4, REQ-123, D-044). */
export interface ProfileChangeRequest {
  id: string;
  memberId: string;
  fields: ProfileFieldChange[];
  reason: string;
  /** Simulated upload: file name only. */
  documentName?: string;
  route: 'OFFICE' | 'DDO_THEN_OFFICE';
  status: ChangeRequestStatus;
  createdAt: ISODateTime;
  /** DDO certified the employment / pay values (route DDO_THEN_OFFICE). */
  ddoCertified?: { byName: string; at: ISODateTime; remarks?: string };
  decidedByName?: string;
  decidedAt?: ISODateTime;
  remarks?: string;
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

/** BR-010 department transfer (ST-13). The member moves on `effectiveCycle`'s demand sheet. */
export interface TransferEvent {
  id: string;
  memberId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveCycle: Cycle;
  effectiveDate?: ISODate;
  orderRef: string;
  remarks?: string;
  recordedAt?: ISODateTime;
  recordedByName?: string;
}

export type ServiceEventType = 'JOINED' | 'TRANSFERRED' | 'DESIGNATION_CHANGED' | 'RETIREMENT_DATE_CHANGED' | 'PROFILE_UPDATED' | 'RETIRED';

/** Service history timeline on ST-12 / MB-02 (docs/08). */
export interface ServiceEvent {
  id: string;
  memberId: string;
  type: ServiceEventType;
  date: ISODate;
  summary: string;
  effectiveCycle?: Cycle;
  byName?: string;
}

/** BR-028 salary-recovery mandate (paper forms F5/F6). The current DDO must agree it. */
export interface RecoveryMandate {
  id: string;
  memberId: string;
  departmentId: string;
  status: 'AGREED' | 'PENDING_NEW_DDO' | 'SUPERSEDED';
  signedOn: ISODate;
  agreedOn?: ISODate;
  agreedByName?: string;
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
  /** Q-313 [P, D-060]: smallest fixed deposit accepted. */
  fdMinAmount: Paise;
  /** Annual rates on the compulsory deposits (placeholders). */
  crdRatePercent: number;
  srdsRatePercent: number;
  /** BR-032 [P] membership: shares allowed on joining and the admission fee (0 = none, Q-506). */
  minShares: number;
  maxShares: number;
  admissionFee: Paise;
  /** BR-014 [P]: loans one member may guarantee at the same time. */
  maxGuaranteesPerSurety: number;
  /** [P] capacity guard: first EMI may use at most this % of net salary (warning only). */
  emiToNetSalaryMaxPercent: number;
  /** BR-012 [P]: grace days before penal interest applies (unused while penal is 0). */
  penalGraceDays: number;
  /** ST-60: financial year starts in this month (4 = April). */
  financialYearStartMonth: number;
  placeholders: string[];
}

export interface SupportTicket {
  id: string;
  memberId: string;
  subject: string;
  status: TicketStatus;
  createdAt: ISODateTime;
  /** MB-13 (M8): topic and the conversation with the society office. */
  category?: 'LOAN' | 'DEPOSIT' | 'PAYMENT' | 'PROFILE' | 'APP' | 'OTHER';
  messages?: Array<{ from: 'MEMBER' | 'OFFICE'; byName: string; at: ISODateTime; text: string }>;
  updatedAt?: ISODateTime;
}

export type NotificationChannel = 'IN_APP' | 'SMS' | 'EMAIL' | 'WHATSAPP';

/** ST-63: message text per event. `{name}`-style placeholders are filled when sent (simulated). */
export interface NotificationTemplate {
  key: string;
  event: string;
  title: string;
  body: string;
  channels: NotificationChannel[];
  audience: 'MEMBER' | 'APPLICANT' | 'STAFF';
}

/** Who changed what (settings, masters). ST-68 shows the full list later. */
export interface AuditEntry {
  id: string;
  at: ISODateTime;
  actorId: string;
  actorName: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
}
