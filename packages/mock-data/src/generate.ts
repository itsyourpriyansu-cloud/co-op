// Deterministic dataset generator (docs/13, docs/20). Every number is produced by @tgs/domain,
// so the demo shows the same results the API and calculators will compute.
import {
  addMonths,
  allocateRecovery,
  calculateFdMaturity,
  calculateInsuranceDue,
  calculateLeftoverService,
  calculateShareDeduction,
  checkSuretyRetirement,
  daysInMonth,
  fullMonthsBetween,
  changeRequestRoute,
  generateSchedule,
  profileFieldValue,
  toCycle,
} from '@tgs/domain';
import type {
  AppNotification,
  Cycle,
  DemandComponent,
  DemandLine,
  DemandSheet,
  DepositAccount,
  ISODate,
  Loan,
  LoanProductCode,
  LoanStatus,
  Member,
  MembershipApplication,
  MembershipStatus,
  Paise,
  PaymentReport,
  ProfileChangeRequest,
  ProfileField,
  Receipt,
  RecoveryMandate,
  ServiceEvent,
  ShareAccount,
  SupportTicket,
  TransferEvent,
  WorkflowEvent,
} from '@tgs/types';
import { CITIES, DESIGNATIONS, FIRST_NAMES_F, FIRST_NAMES_M, LOAN_PRODUCTS, LOAN_PURPOSES, SETTINGS, STREETS, SURNAMES } from './catalog';
import { departments } from './departments';
import { PERSONA_MEMBERS, staffUsers } from './personas';
import { createRng, type Rng } from './prng';

export const SEED_TODAY: ISODate = '2026-10-24';
export const CURRENT_CYCLE: Cycle = '2026-10';
/** M9 seed (no RNG): members short in Jul, Aug and Sep 2026 → defaulters at the default 3 cycles. */
const CHRONIC_DEFAULTERS = ['1030', '1062', '1202', '1447', '1569', '1595'];

/** 12 demand cycles: Nov 2025 … Oct 2026. The last one is generated but not yet recovered. */
export const DEMAND_CYCLES: Cycle[] = Array.from({ length: 12 }, (_, i) => toCycle(addMonths('2025-11-01', i)));
const POSTED_CYCLES = DEMAND_CYCLES.slice(0, -1);
const WINDOW_START: Cycle = DEMAND_CYCLES[0] ?? '2025-11';

const R = (rupees: number): Paise => Math.round(rupees * 100);
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const product = (code: LoanProductCode) => {
  const p = LOAN_PRODUCTS.find((x) => x.code === code);
  if (!p) throw new Error(`Unknown product ${code}`);
  return p;
};
const staff = (role: string) => {
  const s = staffUsers.find((u) => u.role === role);
  if (!s) throw new Error(`No staff for ${role}`);
  return s;
};
const cycleStart = (c: Cycle): ISODate => `${c}-01`;
/** "Sai Kumar" + "Kumar" → "Sai Kumar", not "Sai Kumar Kumar". */
const joinName = (first: string, surname: string) => (first.split(' ').at(-1) === surname ? first : `${first} ${surname}`);
const lastDay = (y: number, m: number): ISODate => `${y}-${pad(m, 2)}-${pad(daysInMonth(y, m), 2)}`;

function randomDate(rng: Rng, fromYear: number, toYear: number): ISODate {
  const y = rng.int(fromYear, toYear);
  const m = rng.int(1, 12);
  return `${y}-${pad(m, 2)}-${pad(rng.int(1, 28), 2)}`;
}

function at(date: ISODate, rng: Rng): string {
  return `${date}T${pad(rng.int(10, 17), 2)}:${pad(rng.step(0, 55, 5), 2)}:00+05:30`;
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

function weightedDesignation(rng: Rng) {
  const total = DESIGNATIONS.reduce((s, d) => s + d.weight, 0);
  let roll = rng.int(1, total);
  for (const d of DESIGNATIONS) {
    roll -= d.weight;
    if (roll <= 0) return d;
  }
  return DESIGNATIONS[0] as (typeof DESIGNATIONS)[number];
}

function makeMember(rng: Rng, generalNo: number, overrideIn?: Partial<Member> & { age?: number }): Member {
  const { age: ageOverride, ...override } = overrideIn ?? ({} as Partial<Member> & { age?: number });
  const gender = override.gender ?? (rng.chance(0.42) ? 'F' : 'M');
  const first = gender === 'F' ? rng.pick(FIRST_NAMES_F) : rng.pick(FIRST_NAMES_M);
  const surname = rng.pick(SURNAMES);
  const name = override.name ?? joinName(first, surname);
  const statusRoll = rng.next();
  const status: Member['status'] = override.status ?? (statusRoll < 0.92 ? 'ACTIVE' : statusRoll < 0.98 ? 'RETIRED' : statusRoll < 0.995 ? 'RESIGNED' : 'DECEASED');
  const age = ageOverride ?? (status === 'RETIRED' ? rng.int(61, 65) : rng.int(24, 59));
  // ~4.5% of active members retire within the next 1–6 months (docs/13 §1: retirement report, gratuity risk).
  const retiringSoon = !override.dob && ageOverride === undefined && status === 'ACTIVE' && rng.chance(0.045);
  const retireOn = retiringSoon ? addMonths(SEED_TODAY, rng.int(1, 6)) : undefined;
  const birthYear = retireOn ? Number(retireOn.slice(0, 4)) - SETTINGS.retirementAge : 2026 - age;
  const birthMonth = retireOn ? Number(retireOn.slice(5, 7)) : rng.int(1, 12);
  const dob = override.dob ?? `${birthYear}-${pad(birthMonth, 2)}-${pad(rng.int(1, 28), 2)}`;
  const dobY = Number(dob.slice(0, 4));
  const dobM = Number(dob.slice(5, 7));
  const dor = lastDay(dobY + SETTINGS.retirementAge, dobM);
  const joinAge = Math.min(age - 1, rng.int(21, 34));
  const doj = `${dobY + joinAge}-${pad(rng.int(1, 12), 2)}-${pad(rng.int(1, 28), 2)}`;
  const joined = addMonths(doj, rng.int(0, 18));
  const joinedSocietyOn = joined > SEED_TODAY ? doj : joined;
  const desig = override.designation ? DESIGNATIONS.find((d) => d.title === override.designation) ?? weightedDesignation(rng) : weightedDesignation(rng);
  const gross = R(rng.step(desig.gross[0], desig.gross[1], 100));
  const loc = rng.pick(CITIES);
  const address = {
    line1: `H.No ${rng.int(1, 16)}-${rng.int(1, 240)}, ${rng.pick(STREETS)}`,
    city: loc.city,
    district: loc.district,
    pincode: `${loc.pin}${pad(rng.int(1, 99), 2)}`,
  };
  const idx = generalNo - 1000;
  const mobile = `9000${100000 + idx}`;
  return {
    id: `mem-${generalNo}`,
    generalNo: String(generalNo),
    employeeId: `TS${pad(rng.int(10000, 99999), 5)}`,
    name,
    fatherName: `${rng.pick(FIRST_NAMES_M)} ${surname}`,
    gender,
    dob,
    mobile,
    mobileMasked: `90XXXXXX${mobile.slice(-2)}`,
    ...(rng.chance(0.6) ? { email: `${name.split(' ')[0]?.toLowerCase()}.${generalNo}@example.org` } : {}),
    presentAddress: address,
    permanentAddress: rng.chance(0.7) ? address : { ...address, line1: `D.No ${rng.int(1, 30)}-${rng.int(1, 99)}, Main Road`, city: 'Warangal', district: 'Hanumakonda', pincode: '5060' + pad(rng.int(1, 20), 2) },
    designation: desig.title,
    departmentId: override.departmentId ?? rng.pick(departments).id,
    doj,
    dor,
    employmentType: rng.chance(0.93) ? 'REGULAR' : 'APPROVED_PROBATIONER',
    numberOfShares: rng.step(10, 50, 5),
    nominee: { name: `${rng.pick(gender === 'F' ? FIRST_NAMES_M : FIRST_NAMES_F)} ${surname}`, relation: rng.pick(['Spouse', 'Spouse', 'Son', 'Daughter', 'Mother', 'Father'] as const) },
    payProfile: {
      scaleOfPay: desig.scale,
      substantivePay: Math.round((gross * 0.62) / 100) * 100,
      grossSalary: gross,
      govtLoanDeductions: R(rng.step(0, Math.round(gross / 100 / 12), 100)),
      otherLoanDeductions: R(rng.step(0, Math.round(gross / 100 / 20), 100)),
      certifiedAt: addMonths(SEED_TODAY, -rng.int(1, 30)),
    },
    ...(rng.chance(0.55) ? { anniversaryDate: randomDate(rng, 1990, 2022) } : {}),
    status,
    portalActivated: override.portalActivated ?? rng.chance(0.7),
    joinedSocietyOn,
    ...override,
  } as Member;
}

// ---------------------------------------------------------------------------------------------
// Loan workflow helpers
// ---------------------------------------------------------------------------------------------

const PIPELINE: Record<'WITH_SURETY' | 'DIRECT', LoanStatus[]> = {
  WITH_SURETY: ['DRAFT', 'SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED', 'ACTIVE'],
  DIRECT: ['DRAFT', 'ACCOUNTANT_REVIEW', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED', 'ACTIVE'],
};

const ACTION_FOR: Partial<Record<LoanStatus, string>> = {
  SURETY_PENDING: 'submit',
  ACCOUNTANT_REVIEW: 'suretiesSigned',
  DDO_CERTIFICATION: 'forward',
  ASSESSMENT: 'ddoCertify',
  SANCTION_SECRETARY: 'sendForSanction',
  SANCTION_PRESIDENT: 'secretarySign',
  SANCTIONED: 'presidentSign',
  ACTIVE: 'disburse',
};

function pipelineFor(code: LoanProductCode) {
  const p = product(code);
  return p.suretiesRequired > 0 || p.ddoCertificationRequired ? PIPELINE.WITH_SURETY : PIPELINE.DIRECT;
}

function actorFor(status: LoanStatus, member: Member): Pick<WorkflowEvent, 'actorId' | 'actorName' | 'actorRole'> {
  const dept = departments.find((d) => d.id === member.departmentId);
  switch (status) {
    case 'SURETY_PENDING':
      return { actorId: member.id, actorName: member.name, actorRole: 'MEMBER' };
    case 'ACCOUNTANT_REVIEW':
      return { actorId: 'system', actorName: 'System', actorRole: 'SYSTEM' };
    case 'DDO_CERTIFICATION':
    case 'SANCTION_SECRETARY':
    case 'RETURNED':
      return { actorId: staff('ACCOUNTANT').id, actorName: staff('ACCOUNTANT').name, actorRole: 'ACCOUNTANT' };
    case 'ASSESSMENT':
      return member.departmentId === 'dept-fin'
        ? { actorId: 'stf-ddo-fin', actorName: 'Kiran Kumar', actorRole: 'DDO' }
        : { actorId: `ddo-${dept?.code.toLowerCase() ?? 'x'}`, actorName: dept?.ddoName ?? 'DDO', actorRole: 'DDO' };
    case 'SANCTION_PRESIDENT':
      return { actorId: staff('SECRETARY').id, actorName: staff('SECRETARY').name, actorRole: 'SECRETARY' };
    case 'SANCTIONED':
      return { actorId: staff('PRESIDENT').id, actorName: staff('PRESIDENT').name, actorRole: 'PRESIDENT' };
    case 'ACTIVE':
      return { actorId: staff('CASHIER').id, actorName: staff('CASHIER').name, actorRole: 'CASHIER' };
    default:
      return { actorId: member.id, actorName: member.name, actorRole: 'MEMBER' };
  }
}

function buildEvents(rng: Rng, member: Member, code: LoanProductCode, target: LoanStatus, appliedOn: ISODate, endOn?: ISODate): WorkflowEvent[] {
  const steps = pipelineFor(code);
  const stopAt = steps.indexOf(target);
  const reach = stopAt === -1 ? steps.indexOf('ACCOUNTANT_REVIEW') : stopAt;
  const events: WorkflowEvent[] = [];
  let date = appliedOn;
  const span = endOn ? Math.max(1, fullMonthsBetween(appliedOn, endOn) * 30) : 20;
  for (let i = 1; i <= reach; i++) {
    const status = steps[i];
    const prev = steps[i - 1];
    if (!status || !prev) continue;
    const action = status === 'ACCOUNTANT_REVIEW' && pipelineFor(code) === PIPELINE.DIRECT ? 'submit' : ACTION_FOR[status] ?? 'update';
    events.push({ at: at(date, rng), ...actorFor(status, member), action, fromStatus: prev, toStatus: status });
    const step = Math.max(1, Math.round(span / Math.max(1, reach)));
    date = addDays(date, rng.int(1, Math.min(4, step)));
    if (date > SEED_TODAY) date = SEED_TODAY;
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// Membership applications: full F1 form + staff sign-offs (docs/16 §F1, D-053)
// ---------------------------------------------------------------------------------------------

/** Who moved an application into each status, and what that action is called. */
function membershipActor(to: MembershipStatus, app: MembershipApplication, route: MembershipApplication['sharePaymentRoute']) {
  const dept = departments.find((d) => d.id === app.departmentId);
  const s = (role: string) => ({ actorId: staff(role).id, actorName: staff(role).name, actorRole: role });
  switch (to) {
    case 'DDO_CERTIFICATION':
      return { ...s('ACCOUNTANT'), action: 'sendToDdo', remarks: 'Documents complete. Sent to the department for certification.' };
    case 'OFFICE_REVIEW':
      return { actorId: `ddo-${app.departmentId}`, actorName: dept?.ddoName ?? 'DDO', actorRole: 'DDO', action: 'certify', remarks: 'Items 1 to 7 verified with the service register.' };
    case 'APPROVAL_SECRETARY':
      return { ...s('ACCOUNTANT'), action: 'forward', remarks: 'Eligible. Recommended for admission.' };
    case 'APPROVAL_PRESIDENT':
      return { ...s('SECRETARY'), action: 'approve', remarks: 'Approved.' };
    case 'SHARE_PAYMENT_PENDING':
      return { ...s('PRESIDENT'), action: 'approve', remarks: route === 'FIRST_DEMAND' ? 'Approved. Shares on the first demand.' : 'Approved. Shares at the counter.' };
    case 'ACTIVE':
      return { ...s('CASHIER'), action: route === 'FIRST_DEMAND' ? 'activate' : 'recordSharePayment', remarks: undefined };
    default:
      return undefined;
  }
}

function enrichApplication(rng: Rng, app: MembershipApplication, existingMobile?: string) {
  const dept = departments.find((d) => d.id === app.departmentId);
  const [first = '', ...rest] = app.name.split(' ');
  const surname = rest.at(-1) ?? first;
  const female = (FIRST_NAMES_F as readonly string[]).includes(first);
  const loc = rng.pick(CITIES);
  const present = { line1: `H.No ${rng.int(1, 16)}-${rng.int(1, 240)}, ${rng.pick(STREETS)}`, city: loc.city, district: loc.district, pincode: `${loc.pin}${pad(rng.int(1, 99), 2)}` };
  const dob = `${rng.int(1992, 2002)}-${pad(rng.int(1, 12), 2)}-${pad(rng.int(1, 28), 2)}`;
  const mobile = existingMobile ?? `98480${pad(rng.int(10000, 99999), 5)}`;
  const submittedAt = app.events[0]?.at ?? `${app.submittedOn ?? SEED_TODAY}T10:00:00+05:30`;
  const docAt = submittedAt;
  app.form = {
    personal: { fullName: app.name, fatherName: `${rng.pick(FIRST_NAMES_M)} ${surname}`, dob, gender: female ? 'F' : 'M', mobile, ...(rng.chance(0.5) ? { email: `${first.toLowerCase()}.${app.id.slice(-3)}@example.org` } : {}) },
    address: { present, sameAsPresent: rng.chance(0.75) },
    employment: { departmentId: app.departmentId, designation: app.designation, employeeId: `TS${pad(rng.int(10000, 99999), 5)}`, employmentType: 'REGULAR', regularAppointmentDate: app.regularAppointmentDate },
    shares: { sharesProposed: app.sharesProposed },
    nominee: { name: `${rng.pick(female ? FIRST_NAMES_M : FIRST_NAMES_F)} ${surname}`, relation: rng.pick(['Spouse', 'Mother', 'Father'] as const), address: `${present.line1}, ${present.city}` },
    documents: [
      { type: 'PHOTO', fileName: 'photo.jpg', uploadedAt: docAt },
      { type: 'ID_PROOF', fileName: 'employee-id-card.pdf', uploadedAt: docAt },
      { type: 'APPOINTMENT_ORDER', fileName: 'appointment-order.pdf', uploadedAt: docAt },
    ],
    declarations: { byelawsAccepted: true, noOtherSociety: true, recoveryMandateAccepted: true },
  };
  if (app.form.address && !app.form.address.sameAsPresent) app.form.address.permanent = { line1: `D.No ${rng.int(1, 30)}-${rng.int(1, 99)}, Main Road`, city: 'Warangal', district: 'Hanumakonda', pincode: `5060${pad(rng.int(1, 20), 2)}` };
  app.eligibility = { worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: false, checkedAt: submittedAt };
  app.signature = { signedAt: submittedAt, textVersion: 'F1+F6-2026.1', method: 'OTP' };

  // Real stage owners on the audit trail + structured sign-offs for each stage passed.
  for (const e of app.events) {
    const who = e.actorRole === 'APPLICANT' ? undefined : membershipActor(e.toStatus as MembershipStatus, app, app.sharePaymentRoute);
    if (e.toStatus === 'INFO_REQUESTED') {
      const byDdo = app.infoRequest?.by === 'DDO';
      Object.assign(e, byDdo ? { actorId: `ddo-${app.departmentId}`, actorName: dept?.ddoName ?? 'DDO', actorRole: 'DDO' } : { actorId: staff('ACCOUNTANT').id, actorName: staff('ACCOUNTANT').name, actorRole: 'ACCOUNTANT' }, { action: 'returnToApplicant' });
      continue;
    }
    if (e.toStatus === 'REJECTED') {
      app.rejection = { byId: e.actorId, byName: e.actorName, role: e.actorRole, at: e.at, ...(e.remarks ? { remarks: e.remarks } : {}) };
      continue;
    }
    if (!who) continue;
    Object.assign(e, { actorId: who.actorId, actorName: who.actorName, actorRole: who.actorRole, action: who.action }, who.remarks ? { remarks: who.remarks } : {});
    const signOff = { byId: who.actorId, byName: who.actorName, role: who.actorRole, at: e.at, ...(who.remarks ? { remarks: who.remarks } : {}) };
    if (e.toStatus === 'DDO_CERTIFICATION') app.intake = signOff;
    if (e.toStatus === 'OFFICE_REVIEW')
      app.ddoCertification = { ...signOff, designation: dept?.ddoDesignation ?? 'DDO', departmentName: dept?.name ?? '', items: { name: 'OK', fatherName: 'OK', dob: 'OK', address: 'OK', designation: 'OK', office: 'OK', appointment: 'OK' }, mandateAgreed: true };
    if (e.toStatus === 'APPROVAL_SECRETARY') app.officeReview = signOff;
    if (e.toStatus === 'APPROVAL_PRESIDENT') app.secretaryApproval = signOff;
    if (e.toStatus === 'SHARE_PAYMENT_PENDING') app.presidentApproval = signOff;
    if (e.toStatus === 'ACTIVE')
      app.shareReceipt = { receiptNo: `SH-2026-${app.id.slice(-3)}`, at: e.at, amount: app.sharesProposed * SETTINGS.shareValue, mode: app.sharePaymentRoute === 'FIRST_DEMAND' ? 'FIRST_DEMAND' : 'CASH', byName: who.actorName };
  }
}

function addDays(iso: ISODate, days: number): ISODate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------------------------

export interface GeneratedData {
  members: Member[];
  shareAccounts: ShareAccount[];
  loans: Loan[];
  deposits: DepositAccount[];
  transfers: TransferEvent[];
  demandSheets: DemandSheet[];
  receipts: Receipt[];
  membershipApplications: MembershipApplication[];
  paymentReports: PaymentReport[];
  profileChangeRequests: ProfileChangeRequest[];
  serviceEvents: ServiceEvent[];
  mandates: RecoveryMandate[];
  notifications: AppNotification[];
  supportTickets: SupportTicket[];
}

export function generateData(seed: number): GeneratedData {
  const rng = createRng(seed);

  // ---- members (1001…1600) ----------------------------------------------------------------
  const personaByNo = new Map<string, Partial<Member> & { age?: number }>([
    ['1101', { ...PERSONA_MEMBERS.lakshmi, status: 'ACTIVE', portalActivated: true, age: 44 } as Partial<Member>],
    ['1102', { ...PERSONA_MEMBERS.ramaiah, status: 'ACTIVE', portalActivated: true, dob: '1966-12-09' } as Partial<Member>],
    ['1103', { ...PERSONA_MEMBERS.sravani, status: 'ACTIVE', portalActivated: true, age: 31 } as Partial<Member>],
    ['1104', { ...PERSONA_MEMBERS.mahesh, status: 'ACTIVE', portalActivated: true, age: 39 } as Partial<Member>],
  ]);
  const members: Member[] = [];
  for (let no = 1001; no <= 1600; no++) members.push(makeMember(rng, no, personaByNo.get(String(no))));
  const byId = new Map(members.map((m) => [m.id, m]));
  const active = members.filter((m) => m.status === 'ACTIVE');
  const leftover = (m: Member) => calculateLeftoverService(m.dor, SEED_TODAY).months;
  const isPersona = (m: Member) => personaByNo.has(m.generalNo);

  // ---- transfers (BR-010): 12, of which 2 take effect next cycle ---------------------------
  const transfers: TransferEvent[] = [];
  const transferable = active.filter((m) => !isPersona(m));
  for (let i = 0; i < 12; i++) {
    const m = transferable[(i * 37 + 11) % transferable.length];
    if (!m || transfers.some((t) => t.memberId === m.id)) continue;
    const to = departments[(departments.findIndex((d) => d.id === m.departmentId) + 1 + (i % 5)) % departments.length];
    if (!to) continue;
    const effectiveCycle = i < 2 ? toCycle(addMonths(cycleStart(CURRENT_CYCLE), 1)) : DEMAND_CYCLES[1 + (i % 10)] ?? CURRENT_CYCLE;
    // Recorded ten days before the month it takes effect (no RNG: keeps the rest of the dataset stable).
    const effectiveDate = `${effectiveCycle}-01`;
    transfers.push({ id: `trf-${pad(i + 1, 3)}`, memberId: m.id, fromDepartmentId: m.departmentId, toDepartmentId: to.id, effectiveCycle, effectiveDate, orderRef: `GAD/TR/${2026}/${pad(100 + i, 4)}`, recordedAt: `${addDays(effectiveDate, -10)}T10:30:00.000Z`, recordedByName: staff('ACCOUNTANT').name });
    m.departmentId = to.id;
  }
  const deptAt = (m: Member, c: Cycle) => {
    const t = transfers.find((x) => x.memberId === m.id);
    return t && c < t.effectiveCycle ? t.fromDepartmentId : m.departmentId;
  };

  // ---- loans -------------------------------------------------------------------------------
  const loans: Loan[] = [];
  const shareDeposit = new Map<string, Paise>();
  let appSeq = 1;
  let loanSeq = 1;
  // BR-014 [P]: a member stands surety on at most `maxGuaranteesPerSurety` open loans.
  const openGuarantees = new Map<string, number>();
  const pickSureties = (borrower: Member, count: number, status: Loan['sureties'][number]['status'], lastCycle: Cycle, open: boolean) => {
    const chosen: Loan['sureties'] = [];
    let guard = 0;
    while (chosen.length < count && guard++ < 200) {
      const s = rng.pick(active);
      if (s.id === borrower.id || isPersona(s) || chosen.some((c) => c.memberId === s.id)) continue;
      if (open && (openGuarantees.get(s.id) ?? 0) >= SETTINGS.maxGuaranteesPerSurety) continue;
      chosen.push({ memberId: s.id, status, retiresDuringLoan: !checkSuretyRetirement(s.dor, lastCycle).pass });
    }
    if (open) for (const c of chosen) openGuarantees.set(c.memberId, (openGuarantees.get(c.memberId) ?? 0) + 1);
    return chosen;
  };

  function createLoan(m: Member, code: LoanProductCode, status: LoanStatus, opts: { amount?: Paise; instalments?: number; disbursedOn?: ISODate; appliedOn?: ISODate; parentLoanId?: string; suretyStatus?: 'PENDING' | 'ACCEPTED' } = {}): Loan {
    const p = product(code);
    const maxInst = Math.max(6, Math.min(p.maxInstalments, leftover(m) - 1));
    const instalments = opts.instalments ?? Math.max(6, Math.min(maxInst, rng.int(12, p.maxInstalments)));
    const amount = opts.amount ?? R(rng.step(code === 'SALARY' ? 10000 : 50000, p.maxAmount / 100 / (code === 'ORDINARY' ? 1 : 1.2), 5000));
    const disbursedOn = opts.disbursedOn;
    const appliedOn = opts.appliedOn ?? (disbursedOn ? addDays(disbursedOn, -rng.int(12, 30)) : addDays(SEED_TODAY, -rng.int(1, 25)));
    const firstDue: Cycle = disbursedOn ? toCycle(addMonths(cycleStart(toCycle(disbursedOn)), 1)) : toCycle(addMonths(cycleStart(CURRENT_CYCLE), 1));
    const sanctioned = ['ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED', 'ACTIVE', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(status);
    const schedule = sanctioned ? generateSchedule(amount, p.ratePercent, instalments, p.emiMethod, firstDue) : [];
    const lastCycle = schedule.at(-1)?.dueCycle ?? toCycle(addMonths(cycleStart(firstDue), instalments - 1));
    const share = code === 'ORDINARY' && sanctioned ? calculateShareDeduction(amount, p.shareDepositPercent, shareDeposit.get(m.id) ?? 0) : undefined;
    if (share && ['ACTIVE', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(status)) shareDeposit.set(m.id, (shareDeposit.get(m.id) ?? 0) + share.deduction);
    const suretyStatus = opts.suretyStatus ?? (status === 'DRAFT' || status === 'SURETY_PENDING' ? 'PENDING' : 'ACCEPTED');
    const loan: Loan = {
      id: `loan-${pad(loanSeq++, 4)}`,
      applicationNo: `APP-${appliedOn.slice(0, 4)}-${pad(appSeq++, 5)}`,
      ...(disbursedOn ? { loanNo: `LN-${disbursedOn.slice(0, 4)}-${pad(loanSeq, 5)}` } : {}),
      memberId: m.id,
      product: code,
      status,
      appliedAmount: amount,
      appliedInstalments: instalments,
      purpose: rng.pick(LOAN_PURPOSES[code]),
      ratePercent: p.ratePercent,
      ...(sanctioned ? { sanctionedAmount: amount, emi: schedule[0]?.emi ?? 0 } : {}),
      ...(share ? { shareDepositDeduction: share.deduction } : {}),
      ...(sanctioned ? { netDisbursable: amount - (share?.deduction ?? 0) } : {}),
      ...(disbursedOn ? { disbursedOn } : {}),
      outstandingPrincipal: disbursedOn ? amount : 0,
      ...(opts.parentLoanId ? { parentLoanId: opts.parentLoanId } : {}),
      sureties: p.suretiesRequired > 0 ? pickSureties(m, p.suretiesRequired, suretyStatus, lastCycle, !['CLOSED', 'CLOSED_BY_TOPUP', 'REJECTED', 'WITHDRAWN', 'DRAFT'].includes(status)) : [],
      schedule,
      events: buildEvents(rng, m, code, status === 'CLOSED' || status === 'CLOSED_BY_TOPUP' ? 'ACTIVE' : status, appliedOn, disbursedOn),
      appliedOn,
    };
    loans.push(loan);
    return loan;
  }

  const recentDisbursal = (m: Member, maxBack: number) => {
    const back = rng.int(2, Math.max(2, maxBack));
    return addDays(cycleStart(toCycle(addMonths(SEED_TODAY, -back))), rng.int(2, 25));
  };

  // Persona loans
  const lakshmi = byId.get('mem-1101');
  const mahesh = byId.get('mem-1104');
  const ramaiah = byId.get('mem-1102');
  const sravani = byId.get('mem-1103');
  if (!lakshmi || !mahesh || !ramaiah || !sravani) throw new Error('persona members missing');
  createLoan(lakshmi, 'ORDINARY', 'ACTIVE', { amount: R(10000), instalments: 24, disbursedOn: '2025-06-12' });
  createLoan(mahesh, 'ORDINARY', 'ACTIVE', { amount: R(250000), instalments: 60, disbursedOn: '2024-08-20' });
  createLoan(mahesh, 'EDUCATION', 'ACTIVE', { amount: R(120000), instalments: 36, disbursedOn: '2025-07-05' });

  // Book of active and closed loans
  for (const m of active) {
    if (isPersona(m)) continue;
    const left = leftover(m);
    // Retiring soon: an old 60-instalment Ordinary loan that ends just before retirement (still owing).
    if (left <= 6 && rng.chance(0.6)) {
      createLoan(m, 'ORDINARY', 'ACTIVE', { instalments: 60, disbursedOn: addDays(cycleStart(toCycle(addMonths(SEED_TODAY, -(60 - left + 1)))), rng.int(2, 20)) });
      continue;
    }
    if (left > 30 && rng.chance(0.55)) {
      const inst = Math.min(100, left - 1, rng.int(36, 100));
      createLoan(m, 'ORDINARY', 'ACTIVE', { instalments: inst, disbursedOn: recentDisbursal(m, Math.min(inst - 3, 54)) });
    }
    if (left > 24 && rng.chance(0.1)) {
      const inst = Math.min(60, left - 1, rng.int(24, 60));
      createLoan(m, 'EDUCATION', 'ACTIVE', { instalments: inst, disbursedOn: recentDisbursal(m, Math.min(inst - 3, 30)) });
    }
    if (left > 12 && rng.chance(0.08)) {
      const inst = rng.int(6, 24);
      createLoan(m, 'SALARY', 'ACTIVE', { instalments: inst, disbursedOn: recentDisbursal(m, Math.min(inst - 2, 12)) });
    }
    if (rng.chance(0.6)) {
      const disbursedOn = randomDate(rng, 2014, 2019);
      const loan = createLoan(m, 'ORDINARY', 'CLOSED', { instalments: rng.int(24, 60), disbursedOn });
      loan.schedule = loan.schedule.map((r) => ({ ...r, paidStatus: 'PAID' }));
      loan.outstandingPrincipal = 0;
      loan.closedOn = `${loan.schedule.at(-1)?.dueCycle ?? '2020-01'}-28`;
      loan.events.push({ at: at(loan.closedOn, rng), actorId: 'system', actorName: 'System', actorRole: 'SYSTEM', action: 'close', fromStatus: 'ACTIVE', toStatus: 'CLOSED', remarks: 'Fully repaid' });
    }
  }

  // Pipeline: every in-process status, with the persona-driven ones placed deliberately
  const pool = active.filter((m) => !isPersona(m) && leftover(m) > 40 && !loans.some((l) => l.memberId === m.id && l.product === 'ORDINARY' && l.status === 'ACTIVE'));
  let poolIdx = 0;
  const next = (pred: (m: Member) => boolean = () => true) => {
    for (let i = 0; i < pool.length; i++) {
      const m = pool[(poolIdx + i) % pool.length];
      if (m && pred(m)) {
        poolIdx = (poolIdx + i + 1) % pool.length;
        return m;
      }
    }
    throw new Error('pipeline pool exhausted');
  };
  const inFin = (m: Member) => m.departmentId === 'dept-fin';
  const plan: Array<[LoanStatus, LoanProductCode, number, ((m: Member) => boolean)?]> = [
    ['DRAFT', 'ORDINARY', 4],
    ['SURETY_PENDING', 'ORDINARY', 4],
    ['SURETY_PENDING', 'EDUCATION', 1],
    ['ACCOUNTANT_REVIEW', 'ORDINARY', 3],
    ['ACCOUNTANT_REVIEW', 'SALARY', 1],
    ['DDO_CERTIFICATION', 'ORDINARY', 2, inFin],
    ['DDO_CERTIFICATION', 'EDUCATION', 2],
    ['ASSESSMENT', 'ORDINARY', 3],
    ['SANCTION_SECRETARY', 'ORDINARY', 2],
    ['SANCTION_SECRETARY', 'SALARY', 1],
    ['SANCTION_PRESIDENT', 'ORDINARY', 2],
    ['SANCTIONED', 'ORDINARY', 2],
  ];
  for (const [status, code, count, pred] of plan) for (let i = 0; i < count; i++) createLoan(next(pred), code, status);

  // Sravani is the pending surety on one SURETY_PENDING loan; another has a declined surety
  const pendingSurety = loans.filter((l) => l.status === 'SURETY_PENDING');
  const sp0 = pendingSurety[0];
  const sp1 = pendingSurety[1];
  if (sp0?.sureties[0]) sp0.sureties[0] = { memberId: sravani.id, status: 'PENDING', retiresDuringLoan: false };
  if (sp0?.sureties[1]) sp0.sureties[1] = { ...sp0.sureties[1], status: 'ACCEPTED', respondedAt: at(addDays(SEED_TODAY, -2), rng) };
  if (sp1?.sureties[0]) sp1.sureties[0] = { ...sp1.sureties[0], status: 'DECLINED', respondedAt: at(addDays(SEED_TODAY, -1), rng), declineReason: 'Already a surety on two loans' };
  // One assessed loan whose surety retires during the loan (BR-024 warning demo)
  const warn = loans.find((l) => l.status === 'ASSESSMENT');
  const retiringSurety = active.find((s) => !isPersona(s) && leftover(s) < 20 && leftover(s) > 3);
  if (warn?.sureties[0] && retiringSurety) warn.sureties[0] = { memberId: retiringSurety.id, status: 'ACCEPTED', retiresDuringLoan: true };

  // Returned, rejected, withdrawn
  for (let i = 0; i < 3; i++) {
    const loan = createLoan(next(), 'ORDINARY', 'ACCOUNTANT_REVIEW');
    loan.status = 'RETURNED';
    loan.events.push({ at: at(addDays(SEED_TODAY, -1), rng), ...actorFor('RETURNED', byId.get(loan.memberId) ?? lakshmi), action: 'return', fromStatus: 'ACCOUNTANT_REVIEW', toStatus: 'RETURNED', remarks: 'Pay slip for the latest month is missing.' });
  }
  const rejectAt: LoanStatus[] = ['ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT'];
  for (let i = 0; i < 15; i++) {
    const stage = rejectAt[i % rejectAt.length] ?? 'ACCOUNTANT_REVIEW';
    const m = next();
    const loan = createLoan(m, 'ORDINARY', stage, { appliedOn: addDays(SEED_TODAY, -rng.int(20, 200)) });
    loan.status = 'REJECTED';
    loan.schedule = [];
    loan.events.push({ at: at(addDays(loan.appliedOn, 6), rng), ...actorFor(stage === 'ACCOUNTANT_REVIEW' ? 'RETURNED' : stage === 'DDO_CERTIFICATION' ? 'ASSESSMENT' : stage === 'SANCTION_SECRETARY' ? 'SANCTION_PRESIDENT' : 'SANCTIONED', m), action: 'reject', fromStatus: stage, toStatus: 'REJECTED', remarks: 'Repayment capacity is insufficient for the requested amount.' });
  }
  for (let i = 0; i < 8; i++) {
    const loan = createLoan(next(), 'ORDINARY', i % 2 ? 'ACCOUNTANT_REVIEW' : 'SURETY_PENDING', { appliedOn: addDays(SEED_TODAY, -rng.int(15, 120)) });
    const from = loan.status;
    loan.status = 'WITHDRAWN';
    loan.schedule = [];
    loan.events.push({ at: at(addDays(loan.appliedOn, 4), rng), actorId: loan.memberId, actorName: byId.get(loan.memberId)?.name ?? '', actorRole: 'MEMBER', action: 'withdraw', fromStatus: from, toStatus: 'WITHDRAWN', remarks: 'No longer required.' });
  }
  // Completed top-ups: old loan CLOSED_BY_TOPUP, new ACTIVE loan linked to it
  for (let i = 0; i < 6; i++) {
    const m = next();
    const old = createLoan(m, 'ORDINARY', 'CLOSED_BY_TOPUP', { instalments: 60, disbursedOn: addDays(SEED_TODAY, -rng.int(700, 1000)) });
    const topupOn = addDays(SEED_TODAY, -rng.int(60, 300));
    old.closedOn = topupOn;
    old.schedule = old.schedule.map((r) => ({ ...r, paidStatus: r.dueCycle < toCycle(topupOn) ? 'PAID' : 'UNPAID' }));
    old.outstandingPrincipal = 0;
    const settled = old.schedule.filter((r) => r.paidStatus === 'UNPAID').reduce((s, r) => s + r.principal, 0);
    old.events.push({ at: at(topupOn, rng), actorId: 'system', actorName: 'System', actorRole: 'SYSTEM', action: 'settledByTopup', fromStatus: 'ACTIVE', toStatus: 'CLOSED_BY_TOPUP' });
    const fresh = createLoan(m, 'ORDINARY', 'ACTIVE', { instalments: Math.min(100, leftover(m) - 1), disbursedOn: topupOn, parentLoanId: old.id, amount: old.appliedAmount + R(rng.step(50000, 200000, 10000)) });
    fresh.topupSettlement = settled;
    fresh.netDisbursable = (fresh.netDisbursable ?? fresh.appliedAmount) - settled;
  }

  // ---- deposits ----------------------------------------------------------------------------
  const deposits: DepositAccount[] = [];
  let fdSeq = 1;
  const slabRate = (months: number) => SETTINGS.fdSlabs.find((s) => months >= s.fromMonths && months <= s.toMonths)?.ratePercent ?? 7;
  const monthsBeforeWindow = (from: ISODate) => Math.max(0, fullMonthsBetween(from, cycleStart(WINDOW_START)));
  for (const m of active) {
    deposits.push({ id: `dep-crd-${m.generalNo}`, accountNo: `CRD-${m.generalNo}`, memberId: m.id, scheme: 'CRD', status: 'ACTIVE', openedOn: m.joinedSocietyOn, monthlyAmount: SETTINGS.crdMonthly, ratePercent: SETTINGS.crdRatePercent, balance: monthsBeforeWindow(m.joinedSocietyOn) * SETTINGS.crdMonthly, operationMode: 'SINGLE', jointHolders: [] });
    if (rng.chance(0.2)) deposits.push({ id: `dep-srds-${m.generalNo}`, accountNo: `SRDS-${m.generalNo}`, memberId: m.id, scheme: 'SRDS', status: 'ACTIVE', openedOn: addMonths(m.joinedSocietyOn, rng.int(1, 24)), monthlyAmount: SETTINGS.srdsMonthly, ratePercent: SETTINGS.srdsRatePercent, balance: 0, operationMode: 'SINGLE', jointHolders: [] });
    if (rng.chance(0.3)) deposits.push({ id: `dep-sav-${m.generalNo}`, accountNo: `SAV-${m.generalNo}`, memberId: m.id, scheme: 'SAVINGS', status: 'ACTIVE', openedOn: m.joinedSocietyOn, ratePercent: SETTINGS.savingsRatePercent, balance: R(rng.step(2000, 80000, 100)), operationMode: 'SINGLE', jointHolders: [] });
  }
  for (const d of deposits) if (d.scheme === 'SRDS') d.balance = monthsBeforeWindow(d.openedOn) * SETTINGS.srdsMonthly;

  const fdHolders = active.filter((m) => !isPersona(m) || m.generalNo === '1101');
  let joint = 0;
  let minors = 0;
  for (let i = 0; i < 150; i++) {
    const m = i === 0 ? lakshmi : fdHolders[(i * 13 + 5) % fdHolders.length];
    if (!m) continue;
    const tenure = rng.pick([12, 24, 36, 48, 60] as const);
    const principal = R(rng.step(25000, 500000, 5000));
    const openedOn = addDays(SEED_TODAY, -rng.int(30, tenure * 30 + 120));
    const payout = rng.pick(['ON_MATURITY', 'ON_MATURITY', 'QUARTERLY', 'MONTHLY', 'HALF_YEARLY'] as const);
    const rate = slabRate(tenure);
    const mat = calculateFdMaturity({ principal, ratePercent: rate, tenureMonths: tenure, payout, openedOn });
    const isJoint = joint < 10 && rng.chance(0.15);
    const isMinor = !isJoint && minors < 3 && rng.chance(0.05);
    if (isJoint) joint++;
    if (isMinor) minors++;
    deposits.push({
      id: `dep-fd-${pad(fdSeq, 4)}`,
      accountNo: `FD-${pad(fdSeq, 5)}`,
      fdrNo: `FDR-${openedOn.slice(0, 4)}-${pad(fdSeq++, 5)}`,
      memberId: m.id,
      scheme: 'FD',
      status: mat.maturityDate <= SEED_TODAY ? 'MATURED' : 'ACTIVE',
      openedOn,
      principal,
      tenureMonths: tenure,
      ratePercent: rate,
      payoutFrequency: payout,
      maturityDate: mat.maturityDate,
      maturityValue: mat.maturityValue,
      balance: principal,
      operationMode: isJoint ? 'EITHER_OR_SURVIVOR' : 'SINGLE',
      jointHolders: isJoint ? [`${rng.pick(FIRST_NAMES_F)} ${m.name.split(' ').at(-1)}`] : [],
      ...(isMinor ? { minor: { name: `${rng.pick(FIRST_NAMES_M)} ${m.name.split(' ').at(-1)}`, dob: randomDate(rng, 2012, 2019), guardianName: m.name } } : {}),
    });
  }
  // FD requests in every acceptance state (D-027, BR-027)
  const requestStates = ['REQUESTED', 'REQUESTED', 'PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT', 'CANCELLED'] as const;
  requestStates.forEach((status, i) => {
    const m = i === 0 ? lakshmi : fdHolders[(i * 29 + 3) % fdHolders.length];
    if (!m) return;
    const tenure = 24;
    const principal = R(rng.step(50000, 300000, 10000));
    const openedOn = addDays(SEED_TODAY, -rng.int(0, 6));
    // Fill each request as far as its stage (no RNG below, so the rest of the dataset is unchanged).
    const paid = status !== 'REQUESTED' && status !== 'CANCELLED';
    const requestedAt = `${openedOn}T09:15:00.000Z`;
    const paidAt = `${openedOn}T12:30:00.000Z`;
    const cashier = staff('CASHIER');
    const secretary = staff('SECRETARY');
    const events: WorkflowEvent[] = [{ at: requestedAt, actorId: m.id, actorName: m.name, actorRole: 'MEMBER', action: 'request', toStatus: 'REQUESTED' }];
    if (paid) events.push({ at: paidAt, actorId: cashier.id, actorName: cashier.name, actorRole: 'CASHIER', action: 'recordPayment', fromStatus: 'REQUESTED', toStatus: 'ACCEPTANCE_SECRETARY' });
    if (status === 'ACCEPTANCE_PRESIDENT') events.push({ at: `${openedOn}T15:00:00.000Z`, actorId: secretary.id, actorName: secretary.name, actorRole: 'SECRETARY', action: 'accept', fromStatus: 'ACCEPTANCE_SECRETARY', toStatus: 'ACCEPTANCE_PRESIDENT' });
    if (status === 'CANCELLED') events.push({ at: `${openedOn}T16:00:00.000Z`, actorId: m.id, actorName: m.name, actorRole: 'MEMBER', action: 'cancel', fromStatus: 'REQUESTED', toStatus: 'CANCELLED' });
    deposits.push({
      id: `dep-fdreq-${i + 1}`,
      accountNo: `REQ-${pad(i + 1, 4)}`,
      memberId: m.id,
      scheme: 'FD',
      status,
      openedOn,
      principal,
      tenureMonths: tenure,
      ratePercent: slabRate(tenure),
      payoutFrequency: 'ON_MATURITY',
      balance: 0,
      operationMode: 'SINGLE',
      jointHolders: [],
      nominee: m.nominee,
      channel: 'APP',
      requestedAt,
      signature: { signedAt: requestedAt, textVersion: 'F4-2026.1' },
      events,
      ...(paid ? { payment: { mode: 'CASH' as const, amount: principal, date: openedOn, denominations: { 500: principal / 50000 }, receiptNo: `RCT-FD-${pad(i + 1, 4)}`, byName: cashier.name, at: paidAt } } : {}),
      ...(status === 'ACCEPTANCE_PRESIDENT' ? { signOffs: { secretary: { byId: secretary.id, byName: secretary.name, role: 'SECRETARY', at: `${openedOn}T15:00:00.000Z` } } } : {}),
      ...(status === 'CANCELLED' ? { cancelledReason: 'Changed my mind' } : {}),
    });
  });
  // Deposit loans pledge an active FD (D-045)
  for (const fd of deposits.filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE').slice(5, 9)) {
    const m = byId.get(fd.memberId);
    if (!m || leftover(m) < 40) continue;
    const loan = createLoan(m, 'DEPOSIT', 'ACTIVE', { amount: Math.round((fd.principal ?? 0) * 0.9 / 100 / 5000) * 5000 * 100, instalments: 24, disbursedOn: addDays(SEED_TODAY, -rng.int(60, 400)) });
    loan.pledgedDepositId = fd.id;
    fd.pledgedToLoanId = loan.id;
  }

  // ---- demand sheets, recovery and receipts (BR-008…BR-011) -----------------------------------
  const demandSheets: DemandSheet[] = [];
  const receipts: Receipt[] = [];
  let receiptSeq = 1;
  const srdsOf = new Map(deposits.filter((d) => d.scheme === 'SRDS').map((d) => [d.memberId, d]));
  const crdOf = new Map(deposits.filter((d) => d.scheme === 'CRD').map((d) => [d.memberId, d]));
  const loansOf = new Map<string, Loan[]>();
  for (const l of loans) if (l.disbursedOn) loansOf.set(l.memberId, [...(loansOf.get(l.memberId) ?? []), l]);
  const principalPaid = new Map<string, Paise>();

  DEMAND_CYCLES.forEach((cycle) => {
    const isCurrent = cycle === CURRENT_CYCLE;
    const isCollection = Number(cycle.slice(5, 7)) === SETTINGS.insurance.collectionMonth;
    departments.forEach((dept, deptIdx) => {
      if (isCurrent && deptIdx >= 12) return; // three departments not generated yet this cycle
      const lines: DemandLine[] = [];
      for (const m of active) {
        if (deptAt(m, cycle) !== dept.id || m.joinedSocietyOn > lastDay(Number(cycle.slice(0, 4)), Number(cycle.slice(5, 7)))) continue;
        const memberLoans = (loansOf.get(m.id) ?? []).filter((l) => l.schedule.some((r) => r.dueCycle === cycle) && (!l.closedOn || l.closedOn >= cycleStart(cycle)));
        const components: DemandComponent[] = [{ head: 'RRF', amount: SETTINGS.rrfMonthly, allocated: 0 }];
        const ins = calculateInsuranceDue({ isLoanee: memberLoans.length > 0, isCollectionCycle: isCollection, loaneeAmount: SETTINGS.insurance.loaneeAmount, nonLoaneeAmount: SETTINGS.insurance.nonLoaneeAmount });
        if (ins) components.push({ head: 'INSURANCE', amount: ins, allocated: 0 });
        if (crdOf.has(m.id)) components.push({ head: 'CRD', amount: SETTINGS.crdMonthly, allocated: 0 });
        const srds = srdsOf.get(m.id);
        if (srds && srds.openedOn <= cycleStart(cycle)) components.push({ head: 'SRDS', amount: SETTINGS.srdsMonthly, allocated: 0 });
        for (const l of memberLoans) {
          const row = l.schedule.find((r) => r.dueCycle === cycle);
          if (!row) continue;
          components.push({ head: 'INTEREST', loanId: l.id, loanProduct: l.product, amount: row.interest, allocated: 0 });
          components.push({ head: 'PRINCIPAL', loanId: l.id, loanProduct: l.product, amount: row.principal, allocated: 0 });
        }
        const totalDemand = components.reduce((s, c) => s + c.amount, 0);
        const line: DemandLine = { memberId: m.id, components, totalDemand };
        if (!isCurrent) {
          const roll = rng.next();
          const forcedShort = m.id === mahesh.id && cycle === '2026-09';
          // M9: six chronic defaulters (BR-020, 3 cycles in a row) so the Defaulters report and notice have data.
          const chronic = CHRONIC_DEFAULTERS.indexOf(m.generalNo);
          const recovered = chronic >= 0 && cycle >= '2026-07' ? (chronic % 2 ? Math.round((totalDemand * 0.3) / 100) * 100 : 0) : forcedShort ? Math.round((totalDemand * 0.4) / 100) * 100 : roll < 0.9 ? totalDemand : roll < 0.98 ? Math.round((totalDemand * (0.4 + rng.next() * 0.5)) / 100) * 100 : 0;
          const result = allocateRecovery(components, recovered);
          line.components = result.components;
          line.recovered = recovered;
          if (recovered > 0) {
            receipts.push({
              id: `rcpt-${pad(receiptSeq, 6)}`,
              receiptNo: `RCP-${cycle.replace('-', '')}-${pad(receiptSeq++, 6)}`,
              memberId: m.id,
              date: `${cycle}-28`,
              source: 'SALARY_RECOVERY',
              amount: recovered,
              cycle,
              allocations: result.components.filter((c) => c.allocated > 0).map((c) => ({ head: c.head, ...(c.loanId ? { loanId: c.loanId } : {}), amount: c.allocated })),
            });
          }
          for (const c of result.components) {
            if (c.head === 'PRINCIPAL' && c.loanId) principalPaid.set(c.loanId, (principalPaid.get(c.loanId) ?? 0) + c.allocated);
            if (c.head === 'CRD') { const d = crdOf.get(m.id); if (d) d.balance += c.allocated; }
            if (c.head === 'SRDS' && srds) srds.balance += c.allocated;
          }
          for (const l of memberLoans) {
            const row = l.schedule.find((r) => r.dueCycle === cycle);
            const p = result.components.find((c) => c.head === 'PRINCIPAL' && c.loanId === l.id);
            const i = result.components.find((c) => c.head === 'INTEREST' && c.loanId === l.id);
            if (row && p && i) row.paidStatus = p.allocated === p.amount && i.allocated === i.amount ? 'PAID' : p.allocated + i.allocated > 0 ? 'PARTIAL' : 'UNPAID';
          }
        }
        lines.push(line);
      }
      const status: DemandSheet['status'] = !isCurrent ? 'RECOVERY_POSTED' : deptIdx < 4 ? 'SENT_TO_DDO' : deptIdx < 8 ? 'CERTIFIED' : 'GENERATED';
      demandSheets.push({
        id: `ds-${cycle}-${dept.code.toLowerCase()}`,
        cycle,
        departmentId: dept.id,
        status,
        lines,
        totalDemand: lines.reduce((s, l) => s + l.totalDemand, 0),
        totalRecovered: lines.reduce((s, l) => s + (l.recovered ?? 0), 0),
        ...(status !== 'GENERATED' ? { certifiedBy: staff('ACCOUNTANT').id } : {}),
      });
    });
  });
  // M7 sign-offs on every sheet (no RNG): generated the 5th, certified the 6th, sent the 7th, posted the 28th.
  for (const sh of demandSheets) {
    const acc = staff('ACCOUNTANT');
    const so = (day: string, time: string, remarks?: string) => ({ byId: acc.id, byName: acc.name, role: 'ACCOUNTANT', at: `${sh.cycle}-${day}T${time}:00+05:30`, ...(remarks ? { remarks } : {}) });
    sh.generated = so('05', '10:30');
    if (sh.status !== 'GENERATED') sh.certified = so('06', '11:15', 'Certified correct (BR-030).');
    if (sh.status === 'SENT_TO_DDO' || sh.status === 'RECOVERY_POSTED') sh.sent = so('07', '12:00');
    if (sh.status === 'RECOVERY_POSTED') sh.posted = so('28', '16:00');
  }

  // Rows before the window are settled; outstanding = sanctioned − principal recovered.
  for (const l of loans) {
    if (!l.disbursedOn || l.status !== 'ACTIVE') continue;
    let before = 0;
    for (const r of l.schedule) if (r.dueCycle < WINDOW_START) { r.paidStatus = 'PAID'; before += r.principal; }
    l.outstandingPrincipal = (l.sanctionedAmount ?? l.appliedAmount) - before - (principalPaid.get(l.id) ?? 0);
  }

  // Counter receipts with denominations (BR-029) and bank transfers
  const notes = [500, 200, 100, 50, 20, 10] as const;
  for (let i = 0; i < 60; i++) {
    const m = active[(i * 17 + 7) % active.length];
    if (!m) continue;
    const amount = R(rng.step(500, 25000, 10));
    const cash = rng.chance(0.6);
    let left = amount / 100;
    const denominations: Receipt['denominations'] = {};
    if (cash) for (const n of notes) { const k = Math.floor(left / n); if (k) { denominations[n] = k; left -= k * n; } }
    receipts.push({ id: `rcpt-${pad(receiptSeq, 6)}`, receiptNo: `RCP-C-${pad(receiptSeq++, 6)}`, memberId: m.id, date: addDays(SEED_TODAY, -rng.int(0, 120)), source: cash ? 'CASH' : 'BANK_TRANSFER', amount, ...(cash ? { denominations } : {}), allocations: [{ head: 'CRD', amount }] });
  }

  // ---- share accounts ------------------------------------------------------------------------
  const shareAccounts: ShareAccount[] = members.map((m) => ({
    memberId: m.id,
    numberOfShares: m.numberOfShares,
    shareCapital: m.numberOfShares * SETTINGS.shareValue,
    shareDepositBalance: shareDeposit.get(m.id) ?? 0,
  }));

  // ---- membership applications (D-026) --------------------------------------------------------
  const membershipApplications: MembershipApplication[] = [];
  const appPlan: Array<[MembershipStatus, number]> = [
    ['SUBMITTED', 3], ['DDO_CERTIFICATION', 2], ['OFFICE_REVIEW', 2], ['INFO_REQUESTED', 2], ['APPROVAL_SECRETARY', 2], ['APPROVAL_PRESIDENT', 1], ['SHARE_PAYMENT_PENDING', 1], ['REJECTED', 1], ['ACTIVE', 5],
  ];
  const appSteps: MembershipStatus[] = ['DRAFT', 'SUBMITTED', 'DDO_CERTIFICATION', 'OFFICE_REVIEW', 'APPROVAL_SECRETARY', 'APPROVAL_PRESIDENT', 'SHARE_PAYMENT_PENDING', 'ACTIVE'];
  let aSeq = 1;
  let newGeneralNo = 1601;
  for (const [status, count] of appPlan) {
    for (let i = 0; i < count; i++) {
      const isRavi = status === 'DDO_CERTIFICATION' && i === 0;
      const gender = rng.chance(0.45) ? 'F' : 'M';
      const name = isRavi ? 'Ravi Teja K' : joinName(gender === 'F' ? rng.pick(FIRST_NAMES_F) : rng.pick(FIRST_NAMES_M), rng.pick(SURNAMES));
      const deptId = isRavi || (status === 'SUBMITTED' && i === 0) ? 'dept-fin' : rng.pick(departments).id;
      const submittedOn = addDays(SEED_TODAY, -rng.int(1, 20));
      const reach = status === 'INFO_REQUESTED' ? appSteps.indexOf('OFFICE_REVIEW') : status === 'REJECTED' ? appSteps.indexOf('OFFICE_REVIEW') : appSteps.indexOf(status);
      const events: WorkflowEvent[] = [];
      let d = submittedOn;
      for (let s = 1; s <= reach; s++) {
        const to = appSteps[s];
        const from = appSteps[s - 1];
        if (!to || !from) continue;
        events.push({ at: at(d, rng), actorId: s === 1 ? `apl-${aSeq}` : 'system', actorName: s === 1 ? name : 'System', actorRole: s === 1 ? 'APPLICANT' : 'SYSTEM', action: s === 1 ? 'submit' : 'advance', fromStatus: from, toStatus: to });
        d = addDays(d, rng.int(1, 3));
        if (d > SEED_TODAY) d = SEED_TODAY;
      }
      const app: MembershipApplication = {
        id: `mapp-${pad(aSeq, 3)}`,
        applicationNo: `MEM-2026-${pad(aSeq, 4)}`,
        applicantId: isRavi ? 'apl-ravi' : `apl-gen-${aSeq}`,
        name,
        departmentId: deptId,
        designation: rng.pick(['Junior Assistant', 'Record Assistant', 'Assistant Section Officer', 'Office Subordinate']),
        regularAppointmentDate: randomDate(rng, 2019, 2025),
        sharesProposed: rng.step(10, 30, 5),
        status,
        submittedOn,
        ...(status === 'INFO_REQUESTED' ? { infoRequest: { by: i === 0 ? 'DDO' : 'Accountant', field: i === 0 ? 'employment.regularAppointmentDate' : 'documents.APPOINTMENT_ORDER', message: i === 0 ? 'Date of regular appointment does not match the service register.' : 'Please upload a clear copy of the appointment order.' } } : {}),
        ...(status === 'SHARE_PAYMENT_PENDING' || status === 'ACTIVE' ? { sharePaymentRoute: rng.chance(0.5) ? 'COUNTER' : 'FIRST_DEMAND' } : {}),
        ...(status === 'ACTIVE' ? { allottedGeneralNo: String(newGeneralNo++) } : {}),
        events,
      };
      if (status === 'REJECTED') app.events.push({ at: at(SEED_TODAY, rng), actorId: staff('ACCOUNTANT').id, actorName: staff('ACCOUNTANT').name, actorRole: 'ACCOUNTANT', action: 'reject', fromStatus: 'OFFICE_REVIEW', toStatus: 'REJECTED', remarks: 'Applicant is a member of another credit society with dues.' });
      if (status === 'INFO_REQUESTED') app.events.push({ at: at(SEED_TODAY, rng), actorId: 'system', actorName: app.infoRequest?.by ?? 'Staff', actorRole: 'STAFF', action: 'requestInfo', fromStatus: 'OFFICE_REVIEW', toStatus: 'INFO_REQUESTED', remarks: app.infoRequest?.message });
      membershipApplications.push(app);
      aSeq++;
    }
  }
  // Full F1 form + staff sign-offs on every seeded application. A separate RNG stream keeps the
  // rest of the dataset identical. The second "Received" application reuses a member's mobile
  // so the duplicate check has something to find.
  const formRng = createRng(seed + 2026);
  membershipApplications.forEach((app, i) => enrichApplication(formRng, app, i === 1 ? members[49]?.mobile : undefined));

  // New members activated this month exist as members too (General No. 1601…)
  for (const app of membershipApplications.filter((a) => a.status === 'ACTIVE')) {
    const m = makeMember(rng, Number(app.allottedGeneralNo), { name: app.name, departmentId: app.departmentId, designation: app.designation, status: 'ACTIVE', portalActivated: true, joinedSocietyOn: addDays(SEED_TODAY, -rng.int(1, 10)), age: rng.int(24, 32) });
    m.numberOfShares = app.sharesProposed;
    members.push(m);
    shareAccounts.push({ memberId: m.id, numberOfShares: m.numberOfShares, shareCapital: m.numberOfShares * SETTINGS.shareValue, shareDepositBalance: 0 });
  }

  // ---- payment reports, profile change requests, notifications, tickets ----------------------
  const prStates: Array<PaymentReport['status']> = ['REPORTED', 'REPORTED', 'REPORTED', 'VERIFIED', 'VERIFIED', 'VERIFIED', 'VERIFIED', 'REJECTED'];
  const paymentReports: PaymentReport[] = prStates.map((status, i) => ({
    id: `prep-${pad(i + 1, 3)}`,
    memberId: i === 0 ? mahesh.id : (active[(i * 41 + 9) % active.length]?.id ?? mahesh.id),
    amount: R(rng.step(1000, 20000, 100)),
    paidOn: addDays(SEED_TODAY, -rng.int(0, 20)),
    mode: rng.pick(['BANK_TRANSFER', 'UPI', 'CHEQUE_DEPOSIT'] as const),
    reference: `UTR${rng.int(100000000, 999999999)}`,
    status,
    ...(status === 'REJECTED' ? { rejectReason: 'No matching credit found in the bank statement.' } : {}),
  }));
  // M7 (no RNG): open reports belong to members who really owe from a short cycle; Mahesh reports his
  // September short exactly, so the cashier can verify it and the dues clear (D-043, D-061).
  const arrearsOf = new Map<string, Paise>();
  for (const sh of demandSheets) {
    if (sh.status !== 'RECOVERY_POSTED') continue;
    for (const l of sh.lines) {
      const short = l.totalDemand - (l.recovered ?? 0);
      if (short > 0) arrearsOf.set(l.memberId, (arrearsOf.get(l.memberId) ?? 0) + short);
    }
  }
  const owing = [...arrearsOf.entries()].filter(([id]) => id !== mahesh.id).sort((a, b) => a[0].localeCompare(b[0]));
  let open = 0;
  paymentReports.forEach((r, i) => {
    r.towards = 'DUES';
    r.reportedAt = `${r.paidOn}T18:20:00+05:30`;
    if (r.status === 'REPORTED') {
      const [memberId, owed] = i === 0 ? [mahesh.id, arrearsOf.get(mahesh.id) ?? r.amount] : (owing[(open++ * 37) % Math.max(1, owing.length)] ?? [r.memberId, r.amount]);
      r.memberId = memberId;
      r.amount = Math.floor(owed / 100) * 100;
      if (i === 0) r.screenshotName = 'upi-payment-screenshot.jpg';
    } else {
      r.decided = { byId: staff('CASHIER').id, byName: staff('CASHIER').name, role: 'CASHIER', at: `${r.paidOn}T15:00:00+05:30`, ...(r.status === 'REJECTED' ? { remarks: r.rejectReason } : {}) };
    }
  });

  // ST-18 / MB-19 (D-057). No RNG: values come from the members themselves.
  const finance = active.filter((m) => m.departmentId === 'dept-fin' && !isPersona(m));
  const other = (i: number) => active.filter((m) => m.departmentId !== 'dept-fin' && !isPersona(m))[(i * 53 + 4) % 400] ?? mahesh;
  const changed: Record<ProfileField, (m: Member) => string> = {
    name: (m) => `${m.name} K`,
    fatherName: (m) => `${m.fatherName} Rao`,
    dob: (m) => addDays(m.dob, 365),
    designation: (m) => (m.designation === 'Senior Assistant' ? 'Superintendent' : 'Senior Assistant'),
    doj: (m) => addDays(m.doj, -30),
    dor: (m) => addDays(m.dor, 31),
    'nominee.name': (m) => m.nominee.name.replace(' ', ' K '),
    'nominee.relation': (m) => (m.nominee.relation === 'Spouse' ? 'Son' : 'Spouse'),
    'payProfile.scaleOfPay': () => '42300-115270',
    'payProfile.grossSalary': (m) => String(Math.round(m.payProfile.grossSalary / 100) + 4200),
  };
  const pcrPlan: Array<{ m: Member; fields: ProfileField[]; status: ProfileChangeRequest['status']; daysAgo: number; reason: string; doc?: string; ddo?: boolean }> = [
    { m: lakshmi, fields: ['nominee.name'], status: 'PENDING', daysAgo: 2, reason: 'Nominee name corrected as per Aadhaar' },
    { m: finance[3] ?? sravani, fields: ['designation', 'payProfile.grossSalary'], status: 'PENDING', daysAgo: 4, reason: 'Promoted from 01 Sep 2026', doc: 'promotion-order.pdf' },
    { m: other(1), fields: ['designation'], status: 'PENDING', daysAgo: 6, reason: 'Promotion order dated 12 Aug 2026', doc: 'go-promotion.pdf', ddo: true },
    { m: other(2), fields: ['fatherName'], status: 'PENDING', daysAgo: 1, reason: 'Spelling as in the service register' },
    { m: other(3), fields: ['nominee.relation'], status: 'APPROVED', daysAgo: 20, reason: 'Married in June 2026' },
    { m: other(4), fields: ['dor'], status: 'APPROVED', daysAgo: 35, reason: 'Retirement date corrected by the department', doc: 'dor-correction.pdf', ddo: true },
    { m: other(5), fields: ['dob'], status: 'REJECTED', daysAgo: 15, reason: 'Date of birth is wrong in the records' },
  ];
  const profileChangeRequests: ProfileChangeRequest[] = pcrPlan.map((p, i) => {
    const route = changeRequestRoute(p.fields);
    const createdAt = `${addDays(SEED_TODAY, -p.daysAgo)}T09:30:00.000Z`;
    const later = (d: number) => `${addDays(SEED_TODAY, -p.daysAgo + d)}T15:00:00.000Z`;
    const ddoName = departments.find((d) => d.id === p.m.departmentId)?.ddoName ?? 'DDO';
    return {
      id: `pcr-${pad(i + 1, 3)}`,
      memberId: p.m.id,
      fields: p.fields.map((field) => ({ field, oldValue: profileFieldValue(p.m, field), newValue: changed[field](p.m) })),
      reason: p.reason,
      ...(p.doc ? { documentName: p.doc } : {}),
      route,
      status: p.status,
      createdAt,
      ...(route === 'DDO_THEN_OFFICE' && (p.ddo || p.status !== 'PENDING') ? { ddoCertified: { byName: ddoName, at: later(1) } } : {}),
      ...(p.status !== 'PENDING' ? { decidedByName: staff('ACCOUNTANT').name, decidedAt: later(2) } : {}),
      ...(p.status === 'REJECTED' ? { remarks: 'Date of birth changes need a service register extract.' } : {}),
    };
  });
  // Approved requests are already applied to the member master.
  for (const r of profileChangeRequests.filter((x) => x.status === 'APPROVED')) {
    const m = byId.get(r.memberId);
    for (const f of r.fields) {
      if (!m) continue;
      if (f.field === 'nominee.relation') m.nominee = { ...m.nominee, relation: f.newValue as Member['nominee']['relation'] };
      if (f.field === 'dor') m.dor = f.newValue;
    }
  }

  const notifications: AppNotification[] = [];
  let nSeq = 1;
  const notify = (recipientId: string, title: string, body: string, daysAgo: number, read: boolean, link?: string) =>
    notifications.push({ id: `ntf-${pad(nSeq++, 4)}`, recipientId, title, body, channel: 'IN_APP', createdAt: at(addDays(SEED_TODAY, -daysAgo), rng), read, ...(link ? { link } : {}) });
  notify(sravani.id, 'Surety request', `${byId.get(sp0?.memberId ?? '')?.name ?? 'A member'} asked you to be a surety.`, 0, false, '/surety');
  notify(lakshmi.id, 'EMI recovered', 'Your October deduction has been recovered in full.', 3, true);
  notify(mahesh.id, 'Short recovery', 'September deduction was short. See how it was applied.', 25, false, '/payments');
  notify(ramaiah.id, 'Retirement reminder', 'You retire in 14 months. Plan loan tenures accordingly.', 10, false);
  for (let i = 0; i < 196; i++) {
    const m = active[(i * 7 + 3) % active.length];
    if (m) notify(m.id, rng.pick(['EMI recovered', 'FD maturing soon', 'Demand sheet generated', 'Loan sanctioned']), 'Demo notification.', rng.int(0, 60), rng.chance(0.6));
  }

  const supportTickets: SupportTicket[] = (['OPEN', 'OPEN', 'ANSWERED', 'ANSWERED', 'CLOSED', 'CLOSED'] as const).map((status, i) => ({
    id: `tkt-${pad(i + 1, 3)}`,
    memberId: i === 0 ? lakshmi.id : (active[(i * 61 + 2) % active.length]?.id ?? lakshmi.id),
    subject: ['FD receipt not received', 'Correct my nominee name', 'Loan statement request', 'Insurance deduction query', 'Change of mobile number', 'App login help'][i] ?? 'Query',
    status,
    createdAt: at(addDays(SEED_TODAY, -rng.int(1, 40)), rng),
  }));
  // MB-13 (M8, no RNG): the conversation on each ticket; answered / closed ones carry the office reply.
  const TICKET_TEXT: Array<[SupportTicket['category'], string, string]> = [
    ['DEPOSIT', 'I opened an FD last week but have not received the FD receipt yet.', 'Your FDR is issued once the President accepts the deposit. You will see it in the app under Deposits.'],
    ['PROFILE', 'My nominee name is spelt wrongly. Please correct it.', 'Please raise a change request from Profile → Request a change with your corrected nominee details.'],
    ['LOAN', 'Please send me the statement of my ordinary loan.', 'Your statement is in the app: Loans → your loan → Repayment schedule. A printed copy is ready at the counter.'],
    ['PAYMENT', 'Why was ₹1,000 deducted as insurance this month?', 'The yearly insurance contribution is collected in April: ₹1,000 for members with a loan, ₹200 otherwise (BR-008).'],
    ['PROFILE', 'I changed my mobile number. How do I update it?', 'Go to Profile → Edit and change the mobile number; we send an OTP to the new number to confirm.'],
    ['APP', 'I cannot sign in to the app.', 'Use Forgot password on the sign-in screen. The OTP goes to your registered mobile.'],
  ];
  supportTickets.forEach((t, i) => {
    const [category, ask, reply] = TICKET_TEXT[i] ?? ['OTHER', t.subject, 'We have answered your query.'];
    const member = byId.get(t.memberId);
    t.category = category;
    t.messages = [{ from: 'MEMBER', byName: member?.name ?? 'Member', at: t.createdAt, text: ask }];
    if (t.status !== 'OPEN') t.messages.push({ from: 'OFFICE', byName: staff('ACCOUNTANT').name, at: t.createdAt.replace(/T(\d\d)/, (_, h: string) => `T${String(Math.min(19, Number(h) + 2)).padStart(2, '0')}`), text: reply });
    t.updatedAt = t.messages.at(-1)!.at;
  });

  const { serviceEvents, mandates } = buildServiceHistory(members, transfers);

  // M9 ST-03: a few in-app notifications for each staff persona (fixed times, no RNG, so nothing else shifts).
  const staffNote = (recipientId: string, title: string, body: string, daysAgo: number, hour: number, read: boolean, link?: string) =>
    notifications.push({ id: `ntf-s${pad(nSeq++, 4)}`, recipientId, title, body, channel: 'IN_APP', createdAt: `${addDays(SEED_TODAY, -daysAgo)}T${String(hour).padStart(2, '0')}:15:00.000Z`, read, ...(link ? { link } : {}) });
  staffNote('stf-admin', 'Demand sheets pending', 'Three departments have no demand sheet for the current month yet.', 0, 5, false, '/demand-sheets');
  staffNote('stf-admin', 'Interest rates reviewed', 'The FD slab table was last changed 30 days ago. Check it against the board resolution.', 3, 6, true, '/settings/rates');
  staffNote('stf-admin', 'Monthly MIS ready', 'Department-wise collections for the last month are ready in Reports.', 6, 4, true, '/reports');
  staffNote('stf-accountant', 'Payment reported by a member', `${mahesh.name} reported a bank payment towards the short months. Verify it against the statement.`, 0, 4, false, '/payments?tab=REPORTED');
  staffNote('stf-accountant', 'New loan applications', 'Loan applications are waiting for your review in the Work Queue.', 1, 5, false, '/queue');
  staffNote('stf-accountant', 'Member question', `${lakshmi.name} asked about an FD receipt. Answer it from Notifications → Member questions.`, 2, 6, true, '/notifications?tab=questions');
  staffNote('stf-secretary', 'Loans waiting for sanction', 'Loans assessed by the Accountant are waiting for your signature.', 0, 5, false, '/queue');
  staffNote('stf-secretary', 'Fixed deposit to accept', 'A fixed deposit whose payment has been received is waiting for your acceptance.', 2, 4, true, '/queue?tab=deposit');
  staffNote('stf-president', 'Final sanction pending', 'Loans signed by the Secretary are waiting for your final sanction.', 0, 6, false, '/queue');
  staffNote('stf-president', 'Membership approvals', 'Membership applications approved by the Secretary are waiting for you.', 4, 5, true, '/queue?tab=membership');
  staffNote('stf-cashier', 'Ready to disburse', 'Sanctioned loans are waiting for payment.', 0, 4, false, '/queue?tab=SANCTIONED');
  staffNote('stf-cashier', 'Payment reported by a member', 'A member reported a UPI payment. Match it with the bank statement.', 1, 7, false, '/payments?tab=REPORTED');
  staffNote('stf-ddo-fin', 'Applications to certify', 'Finance department applications are waiting for your certificate.', 0, 5, false, '/queue');
  staffNote('stf-ddo-fin', 'Demand sheet received', 'The society sent this month’s demand for the Finance department.', 7, 6, true, '/demand-sheets');

  return { members, shareAccounts, loans, deposits, transfers, demandSheets, receipts, membershipApplications, paymentReports, profileChangeRequests, notifications, supportTickets, serviceEvents, mandates };
}

// ---------------------------------------------------------------------------------------------
// Service history + recovery mandates (ST-12, BR-028). Derived, no RNG.
// ---------------------------------------------------------------------------------------------

function buildServiceHistory(members: Member[], transfers: TransferEvent[]) {
  const serviceEvents: ServiceEvent[] = [];
  const mandates: RecoveryMandate[] = [];
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
  const ddoName = (id: string) => departments.find((d) => d.id === id)?.ddoName ?? 'DDO';
  let seq = 1;
  const event = (e: Omit<ServiceEvent, 'id'>) => serviceEvents.push({ id: `sev-${pad(seq++, 5)}`, ...e });
  for (const m of members) {
    const t = transfers.find((x) => x.memberId === m.id);
    const firstDept = t?.fromDepartmentId ?? m.departmentId;
    event({ memberId: m.id, type: 'JOINED', date: m.joinedSocietyOn, summary: `Joined the society (General No. ${m.generalNo}) from ${deptName(firstDept)} as ${m.designation}` });
    mandates.push({ id: `mdt-${m.generalNo}-1`, memberId: m.id, departmentId: firstDept, status: t ? 'SUPERSEDED' : 'AGREED', signedOn: m.joinedSocietyOn, agreedOn: m.joinedSocietyOn, agreedByName: ddoName(firstDept) });
    if (t) {
      const recorded = (t.recordedAt ?? `${t.effectiveCycle}-01`).slice(0, 10);
      event({ memberId: m.id, type: 'TRANSFERRED', date: recorded, effectiveCycle: t.effectiveCycle, summary: `Transferred from ${deptName(t.fromDepartmentId)} to ${deptName(t.toDepartmentId)} (order ${t.orderRef})`, ...(t.recordedByName ? { byName: t.recordedByName } : {}) });
      // Next-cycle transfers still wait for the new DDO to agree the salary recovery (BR-028).
      const pending = t.effectiveCycle > CURRENT_CYCLE;
      mandates.push({ id: `mdt-${m.generalNo}-2`, memberId: m.id, departmentId: t.toDepartmentId, status: pending ? 'PENDING_NEW_DDO' : 'AGREED', signedOn: recorded, ...(pending ? {} : { agreedOn: addDays(recorded, 3), agreedByName: ddoName(t.toDepartmentId) }) });
    }
    if (m.status === 'RETIRED') event({ memberId: m.id, type: 'RETIRED', date: m.dor <= SEED_TODAY ? m.dor : SEED_TODAY, summary: 'Retired from service' });
  }
  return { serviceEvents, mandates };
}
