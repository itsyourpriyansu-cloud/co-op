// Labels and helpers shared by the Joining list, detail and action drawers (ST-14 … ST-17).
import type { F1CertItem, MembershipAction, MembershipApplication, MembershipFlag, MembershipStatus } from '@tgs/types';
import { formatDisplayDate } from '@tgs/domain';

/** Board columns (docs/06 ST-14), left to right. */
export const BOARD_COLUMNS: Array<{ status: MembershipStatus; title: string; hint: string }> = [
  { status: 'SUBMITTED', title: 'Received', hint: 'Intake check by the office' },
  { status: 'DDO_CERTIFICATION', title: 'Department', hint: 'DDO certifies items 1–7' },
  { status: 'OFFICE_REVIEW', title: 'Office review', hint: 'Accountant recommends' },
  { status: 'APPROVAL_SECRETARY', title: 'Secretary', hint: 'Approval 1 of 2' },
  { status: 'APPROVAL_PRESIDENT', title: 'President', hint: 'Approval 2 of 2' },
  { status: 'SHARE_PAYMENT_PENDING', title: 'Share payment', hint: 'Cashier receipt or first demand' },
  { status: 'INFO_REQUESTED', title: 'With applicant', hint: 'Correction requested' },
];

/** Stepper on the detail page. */
export const STEPS: Array<{ status: MembershipStatus; title: string }> = [
  { status: 'SUBMITTED', title: 'Received' },
  { status: 'DDO_CERTIFICATION', title: 'DDO' },
  { status: 'OFFICE_REVIEW', title: 'Office review' },
  { status: 'APPROVAL_SECRETARY', title: 'Secretary' },
  { status: 'APPROVAL_PRESIDENT', title: 'President' },
  { status: 'SHARE_PAYMENT_PENDING', title: 'Share payment' },
  { status: 'ACTIVE', title: 'Member' },
];

export const ACTION_LABEL: Record<MembershipAction, string> = {
  sendToDdo: 'Send to DDO',
  certify: 'Certify',
  forward: 'Recommend',
  approve: 'Approve',
  recordSharePayment: 'Record share payment',
  activate: 'Activate membership',
  returnToApplicant: 'Return to applicant',
  reject: 'Reject',
};

/** Primary actions first; Return / Reject are secondary. */
export const isPrimaryAction = (a: MembershipAction) => a !== 'returnToApplicant' && a !== 'reject';

export const FLAG_LABEL: Record<MembershipFlag, string> = {
  INELIGIBLE_ANSWER: 'Eligibility answer needs a look',
  DUPLICATE_MOBILE: 'Mobile used by a former member',
  EXISTING_MEMBER: 'Mobile belongs to an active member',
  DOCUMENTS_MISSING: 'Documents missing',
  RETURNED: 'Returned once for correction',
};

/** F1 items 1–7 with the applicant's answer (what the DDO certifies). */
export function certItems(app: MembershipApplication, departmentName: string): Array<{ key: F1CertItem; no: string; label: string; value: string }> {
  const f = app.form ?? {};
  const p = f.address?.present;
  return [
    { key: 'name', no: '1', label: 'Name in full', value: f.personal?.fullName ?? app.name },
    { key: 'fatherName', no: '2', label: "Father's name", value: f.personal?.fatherName ?? '—' },
    { key: 'dob', no: '3', label: 'Date of birth', value: f.personal?.dob ? formatDisplayDate(f.personal.dob) : '—' },
    { key: 'address', no: '4', label: 'Address & mobile', value: p ? `${[p.line1, p.city, p.pincode].filter(Boolean).join(', ')} · ${f.personal?.mobile ?? ''}` : '—' },
    { key: 'designation', no: '5', label: 'Designation', value: f.employment?.designation ?? app.designation },
    { key: 'office', no: '6', label: 'Office in which employed', value: departmentName },
    {
      key: 'appointment',
      no: '7',
      label: 'Date of regular appointment',
      value: `${app.regularAppointmentDate ? formatDisplayDate(app.regularAppointmentDate) : '—'}${f.employment?.employmentType === 'APPROVED_PROBATIONER' ? ` · approved probationer (${f.employment.probationServiceMonths ?? '?'} months)` : ''}`,
    },
  ];
}

/** Sections an applicant can be asked to correct (keys match the app's form paths). */
export const RETURN_FIELDS: Array<{ value: string; label: string }> = [
  { value: 'personal.fatherName', label: "Father's name" },
  { value: 'personal.dob', label: 'Date of birth' },
  { value: 'address.present.line1', label: 'Address' },
  { value: 'employment.designation', label: 'Designation' },
  { value: 'employment.regularAppointmentDate', label: 'Date of regular appointment' },
  { value: 'nominee.name', label: 'Nominee' },
  { value: 'documents.PHOTO', label: 'Photo' },
  { value: 'documents.ID_PROOF', label: 'ID card' },
  { value: 'documents.APPOINTMENT_ORDER', label: 'Appointment order' },
];

export const daysLabel = (n: number) => (n === 0 ? 'Today' : `${n} day${n === 1 ? '' : 's'}`);
/** Amber after 5 days in a stage, red after 10 (docs/06 ST-14). */
export const ageTone = (n: number) => (n > 10 ? 'danger' : n > 5 ? 'warning' : 'neutral');
