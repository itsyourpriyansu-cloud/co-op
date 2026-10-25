import type { Cycle, ISODate, Member, MemberInput, Nominee, ProfileField, ProfileFieldChange } from '@tgs/types';
import { addMonths, daysInMonth, formatDuration, fullMonthsBetween, parseISODate, toCycle } from './dates';

/** BR-001: whole months from today until the date of retirement (never stored, always derived). */
export function calculateLeftoverService(dor: ISODate, today: ISODate): { months: number; label: string } {
  const months = Math.max(0, fullMonthsBetween(today, dor));
  return { months, label: formatDuration(months) };
}

/** Age in completed years. */
export function ageOn(dob: ISODate, today: ISODate): number {
  return Math.floor(fullMonthsBetween(dob, today) / 12);
}

/** Lists never show a full mobile number: "9876543210" → "98XXXXXX10". */
export function maskMobile(mobile: string): string {
  return mobile.length < 4 ? mobile : `${mobile.slice(0, 2)}XXXXXX${mobile.slice(-2)}`;
}

/** BR-001 [ASSUMPTION]: retirement falls on the last day of the month the member reaches `retirementAge`. */
export function expectedRetirementDate(dob: ISODate, retirementAge: number): ISODate {
  const { y, m } = parseISODate(dob);
  const ry = y + retirementAge;
  return `${ry}-${String(m).padStart(2, '0')}-${String(daysInMonth(ry, m)).padStart(2, '0')}`;
}

const isIsoDate = (v: string | undefined): v is string => {
  if (!v) return false;
  try {
    parseISODate(v);
    return true;
  } catch {
    return false;
  }
};

export const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MemberValidationContext {
  today: ISODate;
  minShares: number;
  maxShares: number;
  /** Other members, for the duplicate Employee ID / mobile check. */
  others: Array<Pick<Member, 'id' | 'employeeId' | 'mobile' | 'name' | 'generalNo'>>;
  /** Set when editing, so the member does not clash with itself. */
  selfId?: string;
}

/**
 * ST-11 validation (docs/06, AC-J09): required [A] fields, mobile, DOB < DOJ < DOR, joined at 18 or older,
 * shares within the settings range, no duplicate Employee ID or mobile. Returns field → message.
 */
export function validateMemberInput(input: Partial<MemberInput>, ctx: MemberValidationContext): Record<string, string> {
  const e: Record<string, string> = {};
  const text = (path: string, v: string | undefined, msg = 'Required') => {
    if (!v?.trim()) e[path] = msg;
  };
  text('name', input.name);
  text('fatherName', input.fatherName);
  if (input.gender !== 'F' && input.gender !== 'M') e.gender = 'Required';
  if (!isIsoDate(input.dob)) e.dob = 'Enter a valid date';
  if (!MOBILE_PATTERN.test(input.mobile ?? '')) e.mobile = 'Enter a 10-digit mobile number starting with 6–9';
  if (input.email && !EMAIL_PATTERN.test(input.email)) e.email = 'Enter a valid email or leave it blank';
  for (const key of ['presentAddress', 'permanentAddress'] as const) {
    const a = input[key];
    text(`${key}.line1`, a?.line1);
    text(`${key}.city`, a?.city);
    if (!/^\d{6}$/.test(a?.pincode ?? '')) e[`${key}.pincode`] = 'PIN code must be 6 digits';
  }
  text('employeeId', input.employeeId);
  text('departmentId', input.departmentId);
  text('designation', input.designation);
  if (!isIsoDate(input.doj)) e.doj = 'Enter a valid date';
  if (!isIsoDate(input.dor)) e.dor = 'Enter a valid date';
  if (isIsoDate(input.dob) && isIsoDate(input.doj)) {
    if (input.doj <= input.dob) e.doj = 'Date of joining must be after the date of birth';
    else if (ageOn(input.dob, input.doj) < 18) e.doj = 'The member must have been 18 or older on joining';
  }
  if (isIsoDate(input.doj) && isIsoDate(input.dor) && input.dor <= input.doj) e.dor = 'Date of retirement must be after the date of joining';
  if (isIsoDate(input.doj) && input.doj > ctx.today) e.doj = 'Date of joining cannot be in the future';
  if (input.employmentType !== 'REGULAR' && input.employmentType !== 'APPROVED_PROBATIONER') e.employmentType = 'Required';
  const shares = input.numberOfShares;
  if (shares === undefined || !Number.isInteger(shares) || shares < ctx.minShares || shares > ctx.maxShares) e.numberOfShares = `Between ${ctx.minShares} and ${ctx.maxShares} shares`;
  text('nominee.name', input.nominee?.name);
  if (!input.nominee?.relation) e['nominee.relation'] = 'Required';
  const pay = input.payProfile;
  if (pay && pay.grossSalary < 0) e['payProfile.grossSalary'] = 'Cannot be negative';
  for (const other of ctx.others) {
    if (other.id === ctx.selfId) continue;
    if (input.employeeId && other.employeeId.toLowerCase() === input.employeeId.trim().toLowerCase()) e.employeeId = `Already used by ${other.name} (General No. ${other.generalNo})`;
    if (input.mobile && other.mobile === input.mobile) e.mobile = `Already used by ${other.name} (General No. ${other.generalNo})`;
  }
  return e;
}

/**
 * BR-010 [A + P interpretation]: the member moves on the first cycle, from the effective month on,
 * whose sheet has not been generated yet for the old department. Generated sheets never change.
 */
export function transferEffectiveCycle(effectiveDate: ISODate, generatedCyclesForOldDept: Cycle[]): Cycle {
  const generated = new Set(generatedCyclesForOldDept);
  let cycle = toCycle(effectiveDate);
  while (generated.has(cycle)) cycle = toCycle(addMonths(`${cycle}-01`, 1));
  return cycle;
}

// ---- Profile change requests (MB-19, ST-18, D-044, D-057) ---------------------------------------

export type ProfileFieldKind = 'text' | 'date' | 'money' | 'relation';

export const NOMINEE_RELATIONS: Nominee['relation'][] = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];

/** What a member may ask to change, and which need the DDO to certify first (employment and pay). */
export const PROFILE_FIELDS: Record<ProfileField, { label: string; kind: ProfileFieldKind; group: 'personal' | 'employment' | 'nominee' | 'pay'; ddo: boolean }> = {
  name: { label: 'Name', kind: 'text', group: 'personal', ddo: false },
  fatherName: { label: "Father's name", kind: 'text', group: 'personal', ddo: false },
  dob: { label: 'Date of birth', kind: 'date', group: 'personal', ddo: false },
  designation: { label: 'Designation', kind: 'text', group: 'employment', ddo: true },
  doj: { label: 'Date of joining service', kind: 'date', group: 'employment', ddo: true },
  dor: { label: 'Date of retirement', kind: 'date', group: 'employment', ddo: true },
  'nominee.name': { label: 'Nominee name', kind: 'text', group: 'nominee', ddo: false },
  'nominee.relation': { label: 'Nominee relation', kind: 'relation', group: 'nominee', ddo: false },
  'payProfile.scaleOfPay': { label: 'Scale of pay', kind: 'text', group: 'pay', ddo: true },
  'payProfile.grossSalary': { label: 'Gross salary', kind: 'money', group: 'pay', ddo: true },
};

/** D-057 [P]: any employment or pay field sends the whole request to the DDO first. */
export function changeRequestRoute(fields: ProfileField[]): 'OFFICE' | 'DDO_THEN_OFFICE' {
  return fields.some((f) => PROFILE_FIELDS[f].ddo) ? 'DDO_THEN_OFFICE' : 'OFFICE';
}

/** Current value as the member sees it (money in whole rupees, dates ISO). */
export function profileFieldValue(member: Member, field: ProfileField): string {
  switch (field) {
    case 'nominee.name':
      return member.nominee.name;
    case 'nominee.relation':
      return member.nominee.relation;
    case 'payProfile.scaleOfPay':
      return member.payProfile.scaleOfPay;
    case 'payProfile.grossSalary':
      return String(Math.round(member.payProfile.grossSalary / 100));
    default:
      return member[field];
  }
}

/** Writes an approved value onto a copy of the member. */
export function applyProfileChange(member: Member, change: Pick<ProfileFieldChange, 'field' | 'newValue'>): Member {
  const v = change.newValue.trim();
  switch (change.field) {
    case 'nominee.name':
      return { ...member, nominee: { ...member.nominee, name: v } };
    case 'nominee.relation':
      return { ...member, nominee: { ...member.nominee, relation: v as Nominee['relation'] } };
    case 'payProfile.scaleOfPay':
      return { ...member, payProfile: { ...member.payProfile, scaleOfPay: v } };
    case 'payProfile.grossSalary':
      return { ...member, payProfile: { ...member.payProfile, grossSalary: Math.round(Number(v) * 100) } };
    default:
      return { ...member, [change.field]: v };
  }
}

/**
 * MB-19: at least one changed field, valid values, a reason, and no field that already has a pending request.
 * Errors are keyed `fields.<field>` or `reason` / `fields`.
 */
export function validateChangeRequest(member: Member, input: { fields: Array<{ field: ProfileField; newValue: string }>; reason: string }, pendingFields: ProfileField[], today: ISODate): Record<string, string> {
  const e: Record<string, string> = {};
  if (!input.fields.length) e.fields = 'Choose at least one detail to change';
  for (const { field, newValue } of input.fields) {
    const key = `fields.${field}`;
    const meta = PROFILE_FIELDS[field];
    if (!meta) {
      e[key] = 'This detail cannot be changed here';
      continue;
    }
    const v = newValue.trim();
    if (!v) e[key] = 'Enter the new value';
    else if (v === profileFieldValue(member, field)) e[key] = 'This is the same as the current value';
    else if (meta.kind === 'date' && (!isIsoDate(v) || (field === 'dob' && v >= today))) e[key] = 'Enter a valid date';
    else if (meta.kind === 'money' && !(Number(v) > 0)) e[key] = 'Enter an amount in rupees';
    else if (meta.kind === 'relation' && !NOMINEE_RELATIONS.includes(v as Nominee['relation'])) e[key] = 'Choose a relation';
    else if (pendingFields.includes(field)) e[key] = 'You already have a pending request for this';
  }
  if (input.reason.trim().length < 5) e.reason = 'Tell the office why (a few words)';
  return e;
}
