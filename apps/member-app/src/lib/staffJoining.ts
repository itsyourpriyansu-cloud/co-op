// Labels for the staff Joining screens, copied from the console's pages/joining/joining.ts (docs/23 §3).
import type { F1CertItem, MembershipAction, MembershipApplication, MembershipFlag, MembershipStatus } from '@tgs/types';
import { formatDisplayDate } from '@tgs/domain';

export const STAGES: Array<{ status: MembershipStatus; title: string }> = [
  { status: 'SUBMITTED', title: 'Received' },
  { status: 'DDO_CERTIFICATION', title: 'Department' },
  { status: 'OFFICE_REVIEW', title: 'Office review' },
  { status: 'APPROVAL_SECRETARY', title: 'Secretary' },
  { status: 'APPROVAL_PRESIDENT', title: 'President' },
  { status: 'SHARE_PAYMENT_PENDING', title: 'Share payment' },
  { status: 'INFO_REQUESTED', title: 'With applicant' },
];

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

export const ACTION_HINT: Record<MembershipAction, string> = {
  sendToDdo: 'Check the application is complete and send it to the department DDO.',
  certify: 'Verify items 1–7 with the service register and agree the salary recovery mandate.',
  forward: 'Review the DDO certificate and checks, then recommend to the Secretary.',
  approve: 'Approve or reject. The applicant sees each decision in the app.',
  recordSharePayment: 'Receipt the share capital to create the member and allot a General No.',
  activate: 'Activate now. Shares will be recovered on the first demand sheet.',
  returnToApplicant: '',
  reject: '',
};

export const isPrimaryAction = (a: MembershipAction) => a !== 'returnToApplicant' && a !== 'reject';

export const FLAG_LABEL: Record<MembershipFlag, string> = {
  INELIGIBLE_ANSWER: 'Eligibility answer needs a look',
  DUPLICATE_MOBILE: 'Mobile used by a former member',
  EXISTING_MEMBER: 'Mobile belongs to an active member',
  DOCUMENTS_MISSING: 'Documents missing',
  RETURNED: 'Returned once for correction',
};

export const EVENT_TITLE: Record<string, string> = {
  submit: 'Application submitted',
  resubmit: 'Corrected and resubmitted',
  sendToDdo: 'Sent to the department',
  certify: 'Certified by the DDO',
  forward: 'Recommended by the office',
  approve: 'Approved',
  returnToApplicant: 'Returned to the applicant',
  requestInfo: 'Returned to the applicant',
  reject: 'Rejected',
  recordSharePayment: 'Shares paid · member created',
  activate: 'Activated · shares on first demand',
};

export const ITEM_FIELD: Record<F1CertItem, string> = {
  name: 'personal.fullName',
  fatherName: 'personal.fatherName',
  dob: 'personal.dob',
  address: 'address.present.line1',
  designation: 'employment.designation',
  office: 'employment.departmentId',
  appointment: 'employment.regularAppointmentDate',
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
