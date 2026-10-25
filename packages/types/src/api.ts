// API envelope types shared by the mock API and both clients (docs/11-api-contracts.md).
import type { Channel, Permission, Role } from './roles';
import type { Address, AppNotification, AuditEntry, SupportTicket, DemandComponent, DemandHead, DemandSheet, PaymentReport, Receipt, FdHolder, SanctionSheet, Cycle, Department, DepositAccount, ISODate, ISODateTime, Loan, LoanApplicationForm, LoanProduct, LoanProductCode, Member, MembershipApplication, Nominee, NotificationTemplate, Paise, ProfileChangeRequest, ProfileField, RecoveryMandate, ServiceEvent, ShareAccount, SocietyProfile, SocietySettings, StaffUser, TransferEvent } from './entities';
import type { DemandSheetStatus, DepositStatus, LoanStatus, MemberStatus, MembershipStatus, SuretyStatus } from './status';

export const API_PREFIX = '/api/v1';

export type ServiceErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'ALREADY_EXISTS'
  | 'ALREADY_POSTED'
  | 'RULE_VIOLATION'
  | 'NETWORK';

export interface ServiceErrorBody {
  code: ServiceErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  ruleId?: string;
}

export const ERROR_STATUS: Record<ServiceErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  ALREADY_EXISTS: 409,
  ALREADY_POSTED: 409,
  RULE_VIOLATION: 422,
  NETWORK: 503,
};

export interface ListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  filters?: Record<string, string | string[]>;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** Staff only: department scope for DDOs. */
  departmentId?: string;
  /** Members only. */
  memberId?: string;
  generalNo?: string;
}

export interface Session {
  token: string;
  user: SessionUser;
}

export interface Me {
  user: SessionUser;
  channel: Channel;
  permissions: Permission[];
}

/** Demo personas offered on the login screens (docs/13 §2). */
export interface Persona {
  id: string;
  name: string;
  role: Role;
  channel: Channel;
  /** What this persona lets you demo. */
  story: string;
}

export interface DemoState {
  today: ISODate;
  failureRate: number;
  latencyMs: [number, number];
  seedVersion: number;
}

export interface DashboardSummary {
  asOf: ISODate;
  currentCycle: string;
  lastPostedCycle: string;
  activeMembers: number;
  activeLoans: number;
  loanOutstanding: number;
  depositsHeld: number;
  /** 0–1, recovered ÷ demand in the last posted cycle. */
  collectionRate: number;
  collectionRatePrev: number;
  pipeline: Array<{ status: string; count: number; amount: number }>;
  /** Items waiting on the signed-in role (loans + memberships). */
  myQueue: number;
  collectionsTrend: Array<{ cycle: string; demand: number; recovered: number }>;
  /** Oldest items waiting on this role (or everything in flight, for the Super Admin). */
  needsAction: Array<{
    id: string;
    kind: 'loan' | 'membership';
    ref: string;
    title: string;
    subtitle: string;
    status: string;
    since: ISODate;
    amount?: number;
  }>;
  /** Last posted cycle, departments with the largest short recovery. */
  shortByDepartment: Array<{ departmentId: string; department: string; demand: number; recovered: number; short: number; shortMembers: number }>;
  retiringSoon: {
    count: number;
    outstanding: number;
    members: Array<{ id: string; name: string; generalNo: string; department: string; dor: ISODate; outstanding: number }>;
  };
}

export interface DatasetSummary {
  version: number;
  today: ISODate;
  currentCycle: string;
  counts: Record<string, number>;
  byStatus: Record<string, Record<string, number>>;
}

/** Small read-only slices for the design-system gallery and pattern previews. */
export interface DatasetSample {
  members: Array<{
    id: string;
    generalNo: string;
    name: string;
    department: string;
    designation: string;
    status: string;
    leftoverMonths: number;
    activeLoans: number;
    outstanding: number;
  }>;
  loans: Array<{
    id: string;
    applicationNo: string;
    member: string;
    generalNo: string;
    product: string;
    status: string;
    amount: number;
    appliedOn: ISODate;
    emi: number;
  }>;
}

/** OTP challenge (sign-up, sign with OTP). `demoOtp` is returned only by the mock API. */
export interface OtpChallenge {
  otpRef: string;
  expiresInSeconds: number;
  demoOtp?: string;
}

/** Reference data an applicant needs to fill the form (public, no PII). */
export interface JoiningReference {
  society: { name: string; shortName: string; registrationNo: string; address: string };
  departments: Array<{ id: string; name: string }>;
  designations: string[];
  shareValue: number;
  minShares: number;
  maxShares: number;
  requiredDocuments: Array<{ type: string; label: string; hint: string; required: boolean }>;
  /** Plain-language summary + full text, versioned (D-031). */
  agreements: Array<{ key: 'byelaws' | 'noOtherSociety' | 'recoveryMandate'; title: string; summary: string[]; text: string; version: string }>;
}

export interface Health {
  ok: true;
  service: 'tgseccsl-mock-api';
  version: string;
  today: ISODate;
}

// ---- Joining: staff side (ST-14 … ST-17) --------------------------------------------------------

/** What a staff user can do to a membership application at its current stage. */
export type MembershipAction = 'sendToDdo' | 'certify' | 'returnToApplicant' | 'forward' | 'approve' | 'reject' | 'recordSharePayment' | 'activate';

/** Attention flags on a row (docs/06 ST-14). */
export type MembershipFlag = 'INELIGIBLE_ANSWER' | 'DUPLICATE_MOBILE' | 'EXISTING_MEMBER' | 'DOCUMENTS_MISSING' | 'RETURNED';

export interface MembershipRow {
  id: string;
  applicationNo: string;
  name: string;
  departmentId: string;
  departmentName: string;
  designation: string;
  status: MembershipStatus;
  submittedOn?: ISODate;
  /** Date the application entered its current stage. */
  stageSince: ISODate;
  daysInStage: number;
  documents: { uploaded: number; required: number };
  flags: MembershipFlag[];
  sharesProposed: number;
  /** The signed-in user is the one who has to act next. */
  waitingOnMe: boolean;
  /** Who acts next (person or role), e.g. "Kiran Kumar (DDO, Finance)". */
  waitingOn?: string;
  allottedGeneralNo?: string;
}

export interface MembershipList {
  asOf: ISODate;
  rows: MembershipRow[];
  counts: Partial<Record<MembershipStatus, number>>;
  waitingOnMe: number;
  /** DDOs only see their own department. */
  scope: { departmentId?: string; departmentName?: string };
}

export interface MembershipDetail {
  application: MembershipApplication;
  department: Department | null;
  actions: MembershipAction[];
  waitingOn?: string;
  /** The current stage belongs to someone else; demo users can act for them (docs/07 §6). */
  demoActAs?: { name: string; role: string };
  checks: Array<{ ruleId: string; pass: boolean; message: string; severity: 'block' | 'warn' }>;
  shareAmount: Paise;
  requiredDocuments: JoiningReference['requiredDocuments'];
  agreements: JoiningReference['agreements'];
}

export interface MembershipActionInput {
  remarks?: string;
  /** certify */
  items?: Partial<Record<string, 'OK' | 'FLAG'>>;
  mandateAgreed?: boolean;
  /** returnToApplicant */
  field?: string;
  /** approve (President): how the shares are paid (D-029). */
  sharePaymentRoute?: 'COUNTER' | 'FIRST_DEMAND';
  /** recordSharePayment */
  mode?: 'CASH' | 'UPI' | 'CHEQUE';
  reference?: string;
}

// ---- Settings & masters (ST-60 … ST-67, MB-16) ---------------------------------------------------

export interface SettingsBundle {
  society: SocietyProfile;
  settings: SocietySettings;
  loanProducts: LoanProduct[];
  /** Latest changes, newest first. */
  recentChanges: AuditEntry[];
  canEdit: boolean;
}

export interface DepartmentRow extends Department {
  memberCount: number;
  /** Staff login for this department's DDO, if any. */
  ddoUserId?: string;
}

export interface PermissionMatrix {
  roles: Array<{ role: Role; label: string }>;
  permissions: Array<{ key: Permission; label: string; group: string }>;
  grants: Record<string, Permission[]>;
}

/** What members see in MB-16 and the calculators. */
export interface RatesReference {
  loanProducts: Array<Pick<LoanProduct, 'code' | 'name' | 'ratePercent' | 'minAmount' | 'maxAmount' | 'maxInstalments' | 'emiMethod' | 'suretiesRequired' | 'shareDepositPercent' | 'placeholder'>>;
  fdSlabs: SocietySettings['fdSlabs'];
  savingsRatePercent: number;
  crdRatePercent: number;
  srdsRatePercent: number;
  updatedAt?: string;
}

// ---- Members (ST-10 … ST-13, ST-18, MB-02, MB-19) -------------------------------------------------

/** ST-10 row. Mobile is always masked in lists. */
export interface MemberRow {
  id: string;
  generalNo: string;
  name: string;
  employeeId: string;
  departmentId: string;
  departmentName: string;
  designation: string;
  mobileMasked: string;
  dor: ISODate;
  /** BR-001, derived from the demo date. */
  leftoverMonths: number;
  numberOfShares: number;
  activeLoans: number;
  outstanding: Paise;
  status: MemberStatus;
  mandateStatus?: RecoveryMandate['status'];
  pendingChanges: number;
}

export interface MemberList extends Paged<MemberRow> {
  asOf: ISODate;
  counts: { all: number; active: number; retiringSoon: number; mandatePending: number; changeRequests: number };
  scope: { departmentId?: string; departmentName?: string };
  canCreate: boolean;
}

export interface MemberListParams {
  q?: string;
  departmentId?: string;
  status?: MemberStatus | 'ALL';
  retiringWithinMonths?: number;
  hasActiveLoan?: boolean;
  mandatePending?: boolean;
  page?: number;
  pageSize?: number;
  sort?: 'generalNo' | 'name' | 'dor' | 'outstanding';
}

export interface MemberDocument {
  type: string;
  label: string;
  fileName: string;
  uploadedOn: ISODate;
  uploadedBy: string;
}

export interface MemberLoanRow {
  id: string;
  applicationNo: string;
  loanNo?: string;
  product: LoanProductCode;
  productName: string;
  status: LoanStatus;
  amount: Paise;
  outstanding: Paise;
  emi?: Paise;
  appliedOn: ISODate;
  /** For guarantees: whose loan, and this member's surety status. */
  borrower?: { id: string; name: string; generalNo: string };
  suretyStatus?: SuretyStatus;
}

export interface MemberLedgerRow {
  cycle: Cycle;
  departmentName: string;
  demand: Paise;
  recovered?: Paise;
  sheetStatus: DemandSheetStatus;
}

export interface MemberDetail {
  member: Member;
  department: Department | null;
  leftover: { months: number; label: string };
  ageYears: number;
  /** BR-001 check: DOR should be the last day of the month the member reaches retirement age. */
  dorWarning?: string;
  shares: ShareAccount | null;
  loans: MemberLoanRow[];
  guarantees: MemberLoanRow[];
  deposits: Array<Pick<DepositAccount, 'id' | 'accountNo' | 'scheme' | 'status' | 'balance' | 'principal' | 'monthlyAmount' | 'ratePercent' | 'maturityDate' | 'openedOn'>>;
  serviceEvents: ServiceEvent[];
  mandate: RecoveryMandate | null;
  /** A transfer whose demand-sheet move is still ahead (BR-010). */
  upcomingTransfer?: TransferEvent & { toDepartmentName: string; fromDepartmentName: string };
  documents: MemberDocument[];
  changeRequests: ProfileChangeRequest[];
  ledger: MemberLedgerRow[];
  /** What the signed-in staff user may do here. */
  can: { edit: boolean; transfer: boolean; agreeMandate: boolean; seeFullMobile: boolean };
  /** The mandate is waiting on a DDO without a login: demo users may record it for them. */
  demoAgreeAs?: string;
}

/** ST-11 create / edit. Money in paise. Department changes go through a transfer (ST-13). */
export interface MemberInput {
  name: string;
  fatherName: string;
  gender: 'F' | 'M';
  dob: ISODate;
  mobile: string;
  email?: string;
  presentAddress: Address;
  permanentAddress: Address;
  employeeId: string;
  departmentId: string;
  designation: string;
  doj: ISODate;
  dor: ISODate;
  employmentType: Member['employmentType'];
  numberOfShares: number;
  nominee: Nominee;
  payProfile: { scaleOfPay: string; grossSalary: Paise; substantivePay: Paise; govtLoanDeductions: Paise; otherLoanDeductions: Paise };
  anniversaryDate?: ISODate;
}

export interface TransferInput {
  toDepartmentId: string;
  effectiveDate: ISODate;
  orderRef?: string;
  remarks?: string;
}

/** ST-18 list row. */
export interface ChangeRequestRow extends ProfileChangeRequest {
  memberName: string;
  generalNo: string;
  departmentId: string;
  departmentName: string;
  /** Who acts next, e.g. "Kiran Kumar (DDO, Finance)" or "Accountant". */
  waitingOn?: string;
  /** Certify (DDO) or decide (Accountant) for the signed-in user. */
  myAction?: 'certify' | 'decide';
  /** Waiting on a DDO without a login: demo users may certify for them. */
  demoCertifyAs?: string;
}

export interface ChangeRequestList {
  rows: ChangeRequestRow[];
  counts: { pending: number; waitingOnMe: number };
}

/** MB-02: the member's own profile. */
export interface MyProfile {
  member: Member;
  departmentName: string;
  leftover: { months: number; label: string };
  shares: ShareAccount | null;
  serviceEvents: ServiceEvent[];
  mandate: RecoveryMandate | null;
  documents: MemberDocument[];
  changeRequests: ProfileChangeRequest[];
  /** Fields with a request still pending (cannot be requested again). */
  pendingFields: ProfileField[];
}

export interface ContactUpdateInput {
  email?: string;
  presentAddress?: Address;
}

export interface ChangeRequestInput {
  fields: Array<{ field: ProfileField; newValue: string }>;
  reason: string;
  documentName?: string;
}

// ---- Loans core (ST-20, ST-21, ST-23, MB-03 … MB-05) -------------------------------------------

export type LoanStatusGroup = 'IN_PROCESS' | 'ACTIVE' | 'CLOSED' | 'REJECTED' | 'DRAFT';

/** ST-20 / MB-03 row. */
export interface LoanRow {
  id: string;
  applicationNo: string;
  loanNo?: string;
  memberId: string;
  memberName: string;
  generalNo: string;
  departmentId: string;
  departmentName: string;
  product: LoanProductCode;
  productName: string;
  status: LoanStatus;
  group: LoanStatusGroup;
  isTopup: boolean;
  appliedAmount: Paise;
  sanctionedAmount?: Paise;
  instalments: number;
  emi?: Paise;
  outstanding: Paise;
  appliedOn: ISODate;
  /** The next EMI due (active loans). */
  nextDue?: { cycle: Cycle; amount: Paise };
  waitingOn?: string;
}

export interface LoanList extends Paged<LoanRow> {
  counts: { byProduct: Partial<Record<LoanProductCode | 'ALL' | 'TOPUP', number>>; byGroup: Partial<Record<LoanStatusGroup, number>> };
  scope: { departmentId?: string; departmentName?: string };
  canCreate: boolean;
}

export interface LoanListParams {
  q?: string;
  product?: LoanProductCode | 'TOPUP';
  group?: LoanStatusGroup;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

/** Surety card on ST-21 / ST-23 / MB-05 (F2 items 9–10, auto-filled). */
export interface SuretyCard {
  memberId: string;
  name: string;
  generalNo: string;
  departmentName: string;
  designation: string;
  dob: ISODate;
  dor: ISODate;
  leftoverLabel: string;
  substantivePay: Paise;
  numberOfShares: number;
  /** Item 10: loans this member already guarantees. */
  guarantees: Array<{ applicationNo: string; borrower: string; generalNo: string; product: string; outstanding: Paise }>;
  status?: SuretyStatus;
  respondedAt?: ISODateTime;
  declineReason?: string;
  /** BR-014 / BR-024 results for this loan. */
  checks: Array<{ ruleId: string; pass: boolean; message: string; severity: 'block' | 'warn' }>;
}

/** Stage tracker (MB-04 labels, docs/06 v0.4). Product-skipped steps are left out. */
export interface LoanStage {
  key: string;
  title: string;
  status: 'done' | 'current' | 'todo' | 'failed' | 'attention';
  date?: ISODate;
  by?: string;
}

export interface LoanDetail {
  loan: Loan;
  member: { id: string; name: string; generalNo: string; departmentId: string; departmentName: string; designation: string; dob: ISODate; dor: ISODate; leftover: { months: number; label: string }; mobileMasked: string };
  product: LoanProduct;
  sureties: SuretyCard[];
  checks: Array<{ ruleId: string; pass: boolean; message: string; severity: 'block' | 'warn' }>;
  preview: { emi: Paise; lastInstalment: Paise; totalInterest: Paise; shareDeduction: Paise; netDisbursable: Paise; maxInstalments: number; netSalary: Paise; topup?: { loanNo: string; outstandingPrincipal: Paise; accruedInterest: Paise; settlement: Paise } };
  stages: LoanStage[];
  waitingOn?: string;
  /** Workflow actions for this user (the drawers arrive in M5). */
  actions: string[];
  /** The stage belongs to someone else; demo users can act for them (docs/07 §6). */
  demoActAs?: string;
  parentLoan?: { id: string; applicationNo: string; loanNo?: string; outstanding: Paise };
  pledgedDeposit?: { id: string; accountNo: string; principal: Paise };
}

/** Everything a form needs to preview eligibility for one member (MB-05, ST-21). */
export interface LoanContext {
  member: { id: string; name: string; generalNo: string; departmentName: string; designation: string; dob: ISODate; dor: ISODate; doj: ISODate; leftoverMonths: number; leftoverLabel: string; status: string; mandateStatus?: RecoveryMandate['status'] };
  products: LoanProduct[];
  activeProducts: LoanProductCode[];
  pay: Member['payProfile'];
  shares: { numberOfShares: number; shareCapital: Paise; shareDepositBalance: Paise };
  /** F3 item 7: monthly dues of running Ordinary loans. */
  ordinaryLoanDues: Paise;
  /** OL / SL balances (office use panel preview). */
  balances: { ordinary: Paise; salary: Paise };
  pledgeableDeposits: Array<{ id: string; accountNo: string; principal: Paise; maturityDate?: ISODate }>;
  /** J-07: running loans this member may top up (Q-110, D-059). */
  topupCandidates: Array<{ id: string; loanNo: string; product: LoanProductCode; outstanding: Paise; emi: Paise; disbursedOn?: ISODate }>;
  settings: { emiToNetSalaryMaxPercent: number; maxGuaranteesPerSurety: number; shareValue: Paise };
  firstDueCycle: Cycle;
  /** Clause 12 / F3 declaration text the applicant signs. */
  declaration: { f2: string; f3: string; version: string };
}

/** What both apps send to create / update an application. */
export interface LoanRequestInput {
  product: LoanProductCode;
  amount: Paise;
  instalments: number;
  purpose: string;
  sureties: string[];
  pledgedDepositId?: string;
  /** Top-up (J-07): the running loan this one settles and replaces. */
  topupOf?: string;
  form: LoanApplicationForm;
}

export interface CheckResult {
  ruleId: string;
  pass: boolean;
  message: string;
  severity: 'block' | 'warn';
}

/** POST /loans/assess: live eligibility for an unsaved form. */
export interface LoanAssessment {
  eligible: boolean;
  checks: CheckResult[];
  preview: LoanDetail['preview'];
  sureties: SuretyCard[];
  fieldErrors: Record<string, string>;
}

/** Member picker (surety search, ST-21 member search). */
export interface MemberPick {
  id: string;
  name: string;
  generalNo: string;
  departmentName: string;
  designation: string;
  leftoverLabel: string;
  activeGuarantees: number;
}

export type { ISODateTime, NotificationTemplate, StaffUser };

// ---- Loan workflow (M5: ST-02, ST-22, ST-24 … ST-28, MB-06, MB-07) ------------------------------

export interface LoanActionInput {
  remarks?: string;
  /** ST-24 review checklist. */
  checklist?: { memberVerified: boolean; documentsVerified: boolean };
  /** ST-25 DDO: salary recovery can be effected. */
  recoveryFeasible?: boolean;
  /** ST-25 accountant records an offline DDO certificate (Q-102). */
  manual?: { ddoName: string; designation: string; date: ISODate; reference: string };
  /** ST-26 assessment: may only reduce. */
  amount?: Paise;
  instalments?: number;
  /** ST-28 disbursement. */
  disbursement?: { mode: 'NEFT' | 'CHEQUE' | 'TRANSFER'; reference: string; date: ISODate };
}

export interface SanctionPreview {
  sheet: SanctionSheet;
  fieldErrors: Record<string, string>;
  maxInstalments: number;
}

/** ST-02 Work Queue item: anything waiting on the signed-in user. */
export interface WorkItem {
  kind: 'loan' | 'membership' | 'changeRequest' | 'mandate' | 'deposit' | 'demandSheet' | 'paymentReport';
  id: string;
  ref: string;
  title: string;
  subtitle: string;
  /** Tab key, e.g. ACCOUNTANT_REVIEW, DDO_CERTIFICATION, membership, profile, mandate. */
  stage: string;
  stageLabel: string;
  status?: string;
  departmentName: string;
  amount?: Paise;
  since: ISODate;
  days: number;
  actionLabel: string;
  link: string;
}

export interface WorkQueue {
  items: WorkItem[];
  tabs: Array<{ key: string; label: string; count: number }>;
  scope: { departmentName?: string };
}

/** MB-07: a loan this member is asked to guarantee, or already guarantees. */
export interface SuretyRequest {
  loanId: string;
  applicationNo: string;
  loanNo?: string;
  status: LoanStatus;
  borrower: { name: string; generalNo: string; departmentName: string; designation: string };
  productName: string;
  amount: Paise;
  instalments: number;
  emi: Paise;
  outstanding: Paise;
  appliedOn: ISODate;
  myStatus: SuretyStatus;
  respondedAt?: ISODateTime;
  /** My own particulars as they will print on the form (F2 item 9). */
  me: SuretyCard;
  otherSureties: Array<{ name: string; status: SuretyStatus }>;
  declaration: string;
}

export interface SuretyRequests {
  requests: SuretyRequest[];
  guaranteeing: SuretyRequest[];
}

// ---- Deposits (M6: ST-30 … ST-33, MB-08, MB-09, MB-15) -------------------------------------------

export type DepositTab = 'FD' | 'REQUESTS' | 'CRD' | 'SRDS' | 'SAVINGS';

export interface DepositRow {
  id: string;
  accountNo: string;
  fdrNo?: string;
  memberId: string;
  memberName: string;
  generalNo: string;
  departmentName: string;
  scheme: DepositAccount['scheme'];
  status: DepositStatus;
  openedOn: ISODate;
  /** FD principal, or the running balance for CRD / SRDS / Savings. */
  amount: Paise;
  monthlyAmount?: Paise;
  ratePercent: number;
  tenureMonths?: number;
  maturityDate?: ISODate;
  maturityValue?: Paise;
  daysToMaturity?: number;
  pledged: boolean;
  joint: boolean;
  minor: boolean;
  waitingOn?: string;
}

export interface DepositList extends Paged<DepositRow> {
  counts: Partial<Record<DepositTab, number>>;
  totals: { fdPrincipal: Paise; crd: Paise; srds: Paise; savings: Paise; maturing30: number; requestsOpen: number };
  scope: { departmentName?: string };
  canOpen: boolean;
}

export interface DepositListParams {
  tab?: DepositTab;
  status?: DepositStatus;
  maturingWithinDays?: number;
  departmentId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface DepositLedgerRow {
  date: ISODate;
  particulars: string;
  credit?: Paise;
  debit?: Paise;
  balance: Paise;
}

export interface DepositDetail {
  deposit: DepositAccount;
  member: { id: string; name: string; generalNo: string; departmentName: string; designation: string; mobileMasked: string; fatherName: string };
  /** FD maturity (computed from the request until it is accepted). */
  maturity?: { date: ISODate; value: Paise; totalInterest: Paise; periodicInterest: Paise };
  payouts: Array<{ date: ISODate; amount: Paise; paid: boolean }>;
  ledger: DepositLedgerRow[];
  stages: LoanStage[];
  actions: string[];
  waitingOn?: string;
  demoActAs?: string;
  pledgedLoan?: { id: string; loanNo: string; outstanding: Paise };
  /** MB-09 loan against FD (BR-015): the most that can be borrowed now. */
  loanAgainst?: { maxAmount: Paise; marginPercent: number };
  rules: string[];
}

/** MB-15 / ST-31 form. */
export interface FdRequestInput {
  principal: Paise;
  tenureMonths: number;
  payoutFrequency: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ON_MATURITY';
  holding: 'SINGLE' | 'JOINT' | 'MINOR';
  holders?: FdHolder[];
  minor?: { name: string; dob: ISODate; guardianRelation: string };
  nominee: Nominee;
}

export interface DepositContext {
  member: { id: string; name: string; generalNo: string; nominee: Nominee };
  slabs: SocietySettings['fdSlabs'];
  minAmount: Paise;
  rules: string[];
  textVersion: string;
  /** Where to transfer the money for an app request (fictional demo account). */
  payTo: { accountName: string; accountNo: string; ifsc: string; counter: string };
  today: ISODate;
}

export interface DepositActionInput {
  remarks?: string;
  /** ST-33 step 1. */
  payment?: { mode: 'CASH' | 'TRANSFER' | 'CHEQUE'; date: ISODate; denominations?: Partial<Record<500 | 200 | 100 | 50 | 20 | 10, number>>; reference?: string };
}

// ---- M7 Demand & collections (ST-40 … ST-47, MB-10, MB-18) ---------------------------------------

/** One department in a cycle (ST-40). `id` is missing when the sheet is not generated yet. */
export interface DemandSheetRow {
  id?: string;
  cycle: Cycle;
  departmentId: string;
  departmentName: string;
  ddoName: string;
  status: DemandSheetStatus;
  members: number;
  demand: Paise;
  recovered: Paise;
  short: Paise;
  shortMembers: number;
  /** Next step for the signed-in user, if any (certify / send / post). */
  myAction?: string;
}

export interface DemandCycleOverview {
  cycle: Cycle;
  /** Cycles that have sheets, plus the next one that can be generated. Newest first. */
  cycles: Cycle[];
  currentCycle: Cycle;
  rows: DemandSheetRow[];
  totals: { demand: Paise; recovered: Paise; short: Paise; generated: number; notGenerated: number; posted: number };
  canGenerate: boolean;
  scope: { departmentName?: string };
}

/** ST-41 preview for one department. */
export interface DemandPreviewRow {
  departmentId: string;
  departmentName: string;
  members: number;
  heads: Partial<Record<DemandHead, Paise>>;
  total: Paise;
  alreadyGenerated: boolean;
  warnings: string[];
}

export interface DemandPreview {
  cycle: Cycle;
  rows: DemandPreviewRow[];
  insuranceMonth: boolean;
}

/** One member's line as shown on ST-42 / ST-43 / MB-10. */
export interface DemandLineView {
  memberId: string;
  generalNo: string;
  name: string;
  designation: string;
  heads: Partial<Record<DemandHead, Paise>>;
  components: Array<DemandComponent & { loanNo?: string; label: string }>;
  totalDemand: Paise;
  recovered?: Paise;
  short?: Paise;
}

export interface DemandSheetDetail {
  sheet: Omit<DemandSheet, 'lines'>;
  department: Department | null;
  lines: DemandLineView[];
  totals: { heads: Partial<Record<DemandHead, Paise>>; demand: Paise; recovered: Paise; short: Paise; shortMembers: number };
  stages: LoanStage[];
  actions: string[];
  waitingOn?: string;
  demoActAs?: string;
}

/** Recovery entry (ST-43): recovered amount per member, in paise. Missing = recovered in full. */
export interface RecoveryInput {
  recovered: Record<string, Paise>;
  remarks?: string;
}

/** What a member still owes from posted sheets (short recoveries), oldest first (ST-45, MB-10). */
export interface MemberDues {
  memberId: string;
  name: string;
  generalNo: string;
  departmentName: string;
  arrears: Array<{ cycle: Cycle; sheetId: string; components: Array<DemandComponent & { loanNo?: string; label: string; unpaid: Paise }>; unpaid: Paise }>;
  totalArrears: Paise;
  /** New member who chose shares on the first demand and has not paid yet (D-029). */
  shareCapitalDue: Paise;
}

export interface ReceiptRow {
  id: string;
  receiptNo: string;
  date: ISODate;
  memberId: string;
  memberName: string;
  generalNo: string;
  departmentName: string;
  source: Receipt['source'];
  purpose?: Receipt['purpose'];
  amount: Paise;
  heads: DemandHead[];
  cycle?: Cycle;
  byName?: string;
}

export type ReceiptTab = 'ALL' | 'SALARY_RECOVERY' | 'COUNTER' | 'REPORTED';

export interface ReceiptList extends Paged<ReceiptRow> {
  counts: Record<ReceiptTab, number>;
  totals: { today: Paise; thisMonth: Paise; reportedOpen: number };
  canReceive: boolean;
}

export interface ReceiptListParams {
  tab?: Exclude<ReceiptTab, 'REPORTED'>;
  q?: string;
  cycle?: Cycle;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

export interface ReceiptDetail {
  receipt: Receipt;
  member: { id: string; name: string; generalNo: string; departmentName: string; designation: string };
  lines: Array<{ head: DemandHead; label: string; cycle?: Cycle; loanNo?: string; amount: Paise }>;
  amountInWords: string;
  sheet?: { id: string; cycle: Cycle; departmentName: string };
  report?: PaymentReport;
}

export interface NewReceiptInput {
  memberId: string;
  purpose: 'DUES' | 'SHARE_CAPITAL';
  mode: 'CASH' | 'BANK_TRANSFER' | 'ADJUSTMENT';
  amount: Paise;
  date: ISODate;
  denominations?: Partial<Record<500 | 200 | 100 | 50 | 20 | 10, number>>;
  reference?: string;
  remarks?: string;
}

export interface PaymentReportRow extends PaymentReport {
  memberName: string;
  generalNo: string;
  departmentName: string;
  totalArrears: Paise;
}

/** MB-10 for the signed-in member. */
export interface MyPayments {
  months: Array<{ cycle: Cycle; sheetStatus: DemandSheetStatus; demand: Paise; recovered?: Paise; short?: Paise; components: DemandLineView['components'] }>;
  receipts: ReceiptRow[];
  reports: PaymentReport[];
  dues: MemberDues;
  payTo: { accountName: string; accountNo: string; ifsc: string; upi: string; counter: string };
}

export interface ReportPaymentInput {
  amount: Paise;
  paidOn: ISODate;
  mode: PaymentReport['mode'];
  reference: string;
  towards: 'DUES' | 'SHARE_CAPITAL';
  screenshotName?: string;
}

// ---- M8 Member app completion (MA-01…03, MB-01, MB-12…14, MB-17) -------------------------------

/** OTP sent to the member's registered mobile (activation, forgot password). */
export interface AccountOtp {
  otpRef: string;
  expiresInSeconds: number;
  mobileMasked: string;
  name: string;
  demoOtp?: string;
}

/** After the OTP: a short-lived token that allows setting a password. */
export interface PasswordToken {
  passwordToken: string;
  expiresInSeconds: number;
}

/** Demo helper for MA-02: a real seeded member who has not activated the app yet. */
export interface ActivationSample {
  name: string;
  generalNo: string;
  employeeId: string;
  mobile: string;
}

export interface MemberHome {
  member: { name: string; generalNo: string; designation: string; departmentName: string; leftoverMonths: number; leftoverLabel: string };
  shares: { count: number; capital: Paise; shareDeposit: Paise };
  deposits: { total: Paise; fd: Paise; fdCount: number; crd: Paise; srds: Paise; savings: Paise; nextMaturity?: { date: ISODate; amount: Paise; fdrNo: string } };
  loans: Array<{ id: string; productName: string; loanNo: string; outstanding: Paise; nextDue?: { cycle: Cycle; amount: Paise } }>;
  loansOutstanding: Paise;
  thisMonth?: { cycle: Cycle; demand: Paise; status: DemandSheetStatus };
  unpaid: Paise;
  /** Things that need the member (MB-01 "Pending actions"). */
  actions: Array<{ key: string; title: string; detail: string; link: string; tone: 'warning' | 'primary' | 'danger' }>;
  unreadNotifications: number;
}

export interface MyNotifications {
  items: Array<AppNotification & { alsoSentVia?: Array<'SMS' | 'EMAIL' | 'WHATSAPP'> }>;
  unread: number;
}

export interface MemberPreferences {
  channels: { SMS: boolean; WHATSAPP: boolean; EMAIL: boolean };
  /** English only for now; Telugu is Q-008. */
  language: 'en';
  email?: string;
}

export interface SupportCenter {
  office: { name: string; address: string; phone: string; email: string; whatsapp: string; hours: string };
  faqs: Array<{ q: string; a: string; topic: string }>;
  tickets: SupportTicket[];
}

export interface PasswordCheck {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  checks: Array<{ ruleId: string; pass: boolean; message: string; severity: 'block' | 'warn' }>;
}

// ---- M9 dashboards, notifications & reports (ST-01, ST-03, ST-50…52, D-063) ----------------------

export type DashboardVariant = 'ADMIN' | 'ACCOUNTANT' | 'SIGNER' | 'CASHIER' | 'DDO';

/** ST-01 role block (docs/04 §5). The Admin variant adds DashboardSummary's charts. */
export interface RoleDashboard {
  variant: DashboardVariant;
  asOf: ISODate;
  currentCycle: Cycle;
  scope: { departmentName?: string };
  tiles: Array<{ key: string; label: string; value: number; format: 'count' | 'money' | 'percent'; sub?: string; link?: string; tone?: 'neutral' | 'warning' | 'danger' | 'success' }>;
  /** Work Queue stages waiting on this role. */
  queue: Array<{ key: string; label: string; count: number; amount: Paise; oldestDays: number; link: string }>;
  oldest: WorkItem[];
  /** What this role finished in the current month (signed, disbursed, certified …). */
  done: { label: string; count: number; amount: Paise };
  /** Accountant / DDO: this cycle's demand sheets. */
  demand?: { cycle: Cycle; byStatus: Array<{ status: DemandSheetStatus | 'NOT_GENERATED'; count: number }>; demand: Paise; recovered: Paise; toPost: number };
  /** Accountant: latest applications · Cashier: latest disbursements and receipts. */
  recent: Array<{ id: string; ref: string; title: string; subtitle: string; status?: string; entity: 'loan' | 'deposit' | 'membership' | 'receipt'; amount?: Paise; at: ISODate; link: string }>;
}

export type ReportId = 'dues' | 'defaulters' | 'dept-unpaid' | 'dept-less' | 'maturity' | 'member-ledger' | 'loans-ledger' | 'retirement';
export type ReportFilterKey = 'cycle' | 'departmentId' | 'minCycles' | 'from' | 'to' | 'scheme' | 'memberId' | 'product' | 'withinMonths';

export interface ReportDef {
  id: ReportId | string;
  title: string;
  group: 'Collections' | 'Loans' | 'Deposits & Shares' | 'Members' | 'Cash & Accounts';
  description: string;
  reqId: string;
  /** false = listed in the catalogue but not in the MVP (P2 / needs the accounting module). */
  available: boolean;
  /** table = runs in ST-51; print = opens an ST-52 printable. */
  kind: 'table' | 'print';
  printLink?: string;
  filters: ReportFilterKey[];
  note?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'money' | 'number' | 'date' | 'percent' | 'cycle';
  /** Summed into subtotals and the grand total. */
  total?: boolean;
}

export type ReportCell = string | number | null;

export interface ReportResult {
  def: ReportDef;
  asOf: ISODate;
  generatedAt: ISODateTime;
  /** Filters actually applied (defaults filled in), with labels for the print header. */
  filters: Partial<Record<ReportFilterKey, string>>;
  filterLabels: string[];
  columns: ReportColumn[];
  /** Grouped rows; a report without grouping has one group with an empty label. */
  groups: Array<{ label: string; rows: Array<Record<string, ReportCell>>; subtotal: Record<string, number> }>;
  totals: Record<string, number>;
  rowCount: number;
  /** Row → console link (member, loan, deposit). */
  links?: Record<string, string>;
}

export interface ReportOptions {
  cycles: Cycle[];
  departments: Array<{ id: string; name: string }>;
  products: Array<{ code: LoanProductCode; name: string }>;
  defaulterCycles: number;
}

/** ST-03 */
export interface StaffNotifications {
  items: AppNotification[];
  unread: number;
}

export type MessageChannel = 'SMS' | 'WHATSAPP' | 'EMAIL';
export type MessageAudience = { kind: 'MEMBER'; memberId: string } | { kind: 'DEPARTMENT'; departmentId: string } | { kind: 'DEFAULTERS' } | { kind: 'RETIRING'; withinMonths: number };

export interface ComposeInput {
  channel: MessageChannel;
  audience: MessageAudience;
  templateKey?: string;
  title: string;
  body: string;
}

export interface ComposePreview {
  recipients: number;
  audienceLabel: string;
  sample: Array<{ memberId: string; name: string; generalNo: string; to: string; title: string; body: string }>;
  /** Members without the address this channel needs (e.g. no email). */
  skipped: number;
}

export interface OutboxMessage {
  id: string;
  at: ISODateTime;
  byId: string;
  byName: string;
  channel: MessageChannel;
  audienceLabel: string;
  recipients: number;
  skipped: number;
  title: string;
  body: string;
  templateKey?: string;
  status: 'DELIVERED_SIMULATED';
}

export interface StaffTicketRow extends SupportTicket {
  member: { id: string; name: string; generalNo: string; departmentName: string };
}

/** ST-52 Defaulter notice (REQ-066). */
export interface DefaulterNotice {
  member: { id: string; name: string; generalNo: string; designation: string; departmentName: string; address: Address };
  asOf: ISODate;
  refNo: string;
  rows: Array<{ cycle: Cycle; demand: Paise; recovered: Paise; unpaid: Paise }>;
  totalUnpaid: Paise;
  consecutiveShort: number;
  defaulterCycles: number;
  isDefaulter: boolean;
  text: { greeting: string; body: string; closing: string };
  payTo: { accountName: string; accountNo: string; ifsc: string; upi: string; counter: string };
}


/** M10 topbar global search (docs/04 §3, D-064). */
export interface SearchHit {
  kind: 'member' | 'loan' | 'deposit' | 'application' | 'receipt';
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  link: string;
}
