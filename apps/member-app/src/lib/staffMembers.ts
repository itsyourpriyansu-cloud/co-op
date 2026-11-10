// Shared bits for the staff Members screens, copied from the console's pages/members/members.ts (docs/23 §3).
import { PROFILE_FIELDS, formatINR } from '@tgs/domain';
import type { Member, MemberInput, ProfileFieldChange, RecoveryMandate, ServiceEventType } from '@tgs/types';

export const EVENT_LABEL: Record<ServiceEventType, string> = {
  JOINED: 'Joined the society',
  TRANSFERRED: 'Department transfer',
  DESIGNATION_CHANGED: 'Designation changed',
  RETIREMENT_DATE_CHANGED: 'Retirement date changed',
  PROFILE_UPDATED: 'Profile updated',
  RETIRED: 'Retired',
  RESIGNED: 'Resigned',
  DECEASED: 'Deceased',
};

export const MANDATE_LABEL: Record<RecoveryMandate['status'], string> = {
  AGREED: 'Agreed by the DDO',
  PENDING_NEW_DDO: 'Waiting for the new DDO',
  SUPERSEDED: 'Replaced',
};

export const RELATIONS: Member['nominee']['relation'][] = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];
export const SCHEME_LABEL: Record<string, string> = { FD: 'Fixed deposit', CRD: 'CRD', SRDS: 'SRDS', SAVINGS: 'Savings' };

export function changeValue(c: Pick<ProfileFieldChange, 'field'>, value: string): string {
  if (!value) return '—';
  return PROFILE_FIELDS[c.field].kind === 'money' ? formatINR(Number(value) * 100) : value;
}

export const fieldLabel = (c: Pick<ProfileFieldChange, 'field'>) => PROFILE_FIELDS[c.field].label;

const blankAddress = { line1: '', line2: '', city: '', district: '', pincode: '' };

export function emptyMemberInput(): MemberInput {
  return {
    name: '',
    fatherName: '',
    gender: 'F',
    caste: '',
    dob: '',
    mobile: '',
    email: '',
    presentAddress: { ...blankAddress },
    permanentAddress: { ...blankAddress },
    employeeId: '',
    departmentId: '',
    designation: '',
    doj: '',
    dor: '',
    employmentType: 'REGULAR',
    numberOfShares: 10,
    nominee: { name: '', relation: 'Spouse' },
    payProfile: { scaleOfPay: '', grossSalary: 0, substantivePay: 0, govtLoanDeductions: 0, otherLoanDeductions: 0 },
  };
}

export function memberToInput(m: Member): MemberInput {
  return {
    name: m.name,
    fatherName: m.fatherName,
    gender: m.gender,
    caste: m.caste ?? '',
    dob: m.dob,
    mobile: m.mobile,
    email: m.email ?? '',
    presentAddress: { ...blankAddress, ...m.presentAddress },
    permanentAddress: { ...blankAddress, ...m.permanentAddress },
    employeeId: m.employeeId,
    departmentId: m.departmentId,
    designation: m.designation,
    doj: m.doj,
    dor: m.dor,
    employmentType: m.employmentType,
    numberOfShares: m.numberOfShares,
    nominee: { ...m.nominee },
    payProfile: { scaleOfPay: m.payProfile.scaleOfPay, grossSalary: m.payProfile.grossSalary, substantivePay: m.payProfile.substantivePay, govtLoanDeductions: m.payProfile.govtLoanDeductions, otherLoanDeductions: m.payProfile.otherLoanDeductions },
    ...(m.anniversaryDate ? { anniversaryDate: m.anniversaryDate } : {}),
  };
}

export function retiringLabel(leftoverMonths: number, status: Member['status']): string | undefined {
  if (status !== 'ACTIVE') return undefined;
  if (leftoverMonths <= 0) return 'Retires this month';
  if (leftoverMonths <= 12) return `Retires in ${leftoverMonths} mth${leftoverMonths === 1 ? '' : 's'}`;
  return undefined;
}
