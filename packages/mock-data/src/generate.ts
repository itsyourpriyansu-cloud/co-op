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
  generateSchedule,
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
  Receipt,
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
  const name = override.name ?? `${first} ${surname}`;
  const statusRoll = rng.next();
  const status: Member['status'] = override.status ?? (statusRoll < 0.92 ? 'ACTIVE' : statusRoll < 0.98 ? 'RETIRED' : statusRoll < 0.995 ? 'RESIGNED' : 'DECEASED');
  const age = ageOverride ?? (status === 'RETIRED' ? rng.int(61, 65) : rng.int(24, 59));
  const birthYear = 2026 - age;
  const birthMonth = rng.int(1, 12);
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
    transfers.push({ memberId: m.id, fromDepartmentId: m.departmentId, toDepartmentId: to.id, effectiveCycle, orderRef: `GAD/TR/${2026}/${pad(100 + i, 4)}` });
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
  const pickSureties = (borrower: Member, count: number, status: Loan['sureties'][number]['status'], lastCycle: Cycle) => {
    const chosen: Loan['sureties'] = [];
    let guard = 0;
    while (chosen.length < count && guard++ < 50) {
      const s = rng.pick(active);
      if (s.id === borrower.id || isPersona(s) || chosen.some((c) => c.memberId === s.id)) continue;
      chosen.push({ memberId: s.id, status, retiresDuringLoan: !checkSuretyRetirement(s.dor, lastCycle).pass });
    }
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
      sureties: p.suretiesRequired > 0 ? pickSureties(m, p.suretiesRequired, suretyStatus, lastCycle) : [],
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
    deposits.push({ id: `dep-crd-${m.generalNo}`, accountNo: `CRD-${m.generalNo}`, memberId: m.id, scheme: 'CRD', status: 'ACTIVE', openedOn: m.joinedSocietyOn, monthlyAmount: SETTINGS.crdMonthly, ratePercent: 6, balance: monthsBeforeWindow(m.joinedSocietyOn) * SETTINGS.crdMonthly, operationMode: 'SINGLE', jointHolders: [] });
    if (rng.chance(0.2)) deposits.push({ id: `dep-srds-${m.generalNo}`, accountNo: `SRDS-${m.generalNo}`, memberId: m.id, scheme: 'SRDS', status: 'ACTIVE', openedOn: addMonths(m.joinedSocietyOn, rng.int(1, 24)), monthlyAmount: SETTINGS.srdsMonthly, ratePercent: 6.5, balance: 0, operationMode: 'SINGLE', jointHolders: [] });
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
    deposits.push({ id: `dep-fdreq-${i + 1}`, accountNo: `REQ-${pad(i + 1, 4)}`, memberId: m.id, scheme: 'FD', status, openedOn: addDays(SEED_TODAY, -rng.int(0, 6)), principal, tenureMonths: tenure, ratePercent: slabRate(tenure), payoutFrequency: 'ON_MATURITY', balance: 0, operationMode: 'SINGLE', jointHolders: [] });
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
          const recovered = forcedShort ? Math.round((totalDemand * 0.4) / 100) * 100 : roll < 0.9 ? totalDemand : roll < 0.98 ? Math.round((totalDemand * (0.4 + rng.next() * 0.5)) / 100) * 100 : 0;
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
      const name = isRavi ? 'Ravi Teja K' : `${gender === 'F' ? rng.pick(FIRST_NAMES_F) : rng.pick(FIRST_NAMES_M)} ${rng.pick(SURNAMES)}`;
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
        ...(status === 'INFO_REQUESTED' ? { infoRequest: { by: i === 0 ? 'DDO' : 'Accountant', field: i === 0 ? 'regularAppointmentDate' : 'documents.appointmentOrder', message: i === 0 ? 'Date of regular appointment does not match the service register.' : 'Please upload a clear copy of the appointment order.' } } : {}),
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

  const pcrPlan: Array<[ProfileChangeRequest['status'], string, string, string]> = [
    ['PENDING', 'nominee.name', 'Old nominee', 'New nominee after marriage'],
    ['PENDING', 'designation', 'Junior Assistant', 'Senior Assistant'],
    ['PENDING', 'permanentAddress', 'Warangal', 'Hyderabad'],
    ['APPROVED', 'email', '', 'updated@example.org'],
    ['APPROVED', 'nominee.relation', 'Father', 'Spouse'],
    ['REJECTED', 'dob', '1985-04-12', '1986-04-12'],
  ];
  const profileChangeRequests: ProfileChangeRequest[] = pcrPlan.map(([status, field, oldValue, newValue], i) => ({
    id: `pcr-${pad(i + 1, 3)}`,
    memberId: i === 0 ? lakshmi.id : (active[(i * 53 + 4) % active.length]?.id ?? lakshmi.id),
    field,
    oldValue,
    newValue,
    reason: status === 'REJECTED' ? 'Date of birth changes need a service register extract.' : 'Updated personal details',
    status,
  }));

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

  return { members, shareAccounts, loans, deposits, transfers, demandSheets, receipts, membershipApplications, paymentReports, profileChangeRequests, notifications, supportTickets };
}
