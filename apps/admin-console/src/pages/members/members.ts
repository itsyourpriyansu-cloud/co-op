// Shared bits for the Members module (ST-10 … ST-13, ST-18).
import { BadgeCheck, Briefcase, CalendarClock, LogOut, PenLine, Repeat2, UserPlus, type LucideIcon } from 'lucide-react';
import { PROFILE_FIELDS, formatINR } from '@tgs/domain';
import type { Member, MemberInput, ProfileFieldChange, RecoveryMandate, ServiceEventType } from '@tgs/types';

export const EVENT_META: Record<ServiceEventType, { icon: LucideIcon; label: string }> = {
  JOINED: { icon: UserPlus, label: 'Joined the society' },
  TRANSFERRED: { icon: Repeat2, label: 'Department transfer' },
  DESIGNATION_CHANGED: { icon: Briefcase, label: 'Designation changed' },
  RETIREMENT_DATE_CHANGED: { icon: CalendarClock, label: 'Retirement date changed' },
  PROFILE_UPDATED: { icon: PenLine, label: 'Profile updated' },
  RETIRED: { icon: LogOut, label: 'Retired' },
};

export const MANDATE_LABEL: Record<RecoveryMandate['status'], string> = {
  AGREED: 'Agreed by the DDO',
  PENDING_NEW_DDO: 'Waiting for the new DDO',
  SUPERSEDED: 'Replaced',
};

export const MandateIcon = BadgeCheck;

export const RELATIONS: Member['nominee']['relation'][] = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];

/** A change shown the way people read it: money with ₹, everything else as typed. */
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

/** "Retiring in 5 mths" style chip text, or undefined when far away. */
export function retiringLabel(leftoverMonths: number, status: Member['status']): string | undefined {
  if (status !== 'ACTIVE') return undefined;
  if (leftoverMonths <= 0) return 'Retires this month';
  if (leftoverMonths <= 12) return `Retires in ${leftoverMonths} mth${leftoverMonths === 1 ? '' : 's'}`;
  return undefined;
}
