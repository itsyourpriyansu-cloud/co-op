// Labels for the staff Loans screens, copied from the console's pages/loans (docs/23 §3).
import type { LoanProductCode, LoanStatusGroup } from '@tgs/types';

export const PRODUCT_TABS: Array<{ value: LoanProductCode | 'ALL' | 'TOPUP'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ORDINARY', label: 'Ordinary' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'TOPUP', label: 'Top-ups' },
];

export const GROUP_ITEMS: Array<{ value: LoanStatusGroup | ''; label: string }> = [
  { value: '', label: 'Every status' },
  { value: 'IN_PROCESS', label: 'In process' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REJECTED', label: 'Rejected / withdrawn' },
];

/** Which paper form a product uses (docs/16): F3 for Salary, F2 for the rest. */
export const formFor = (code: LoanProductCode) => (code === 'SALARY' ? 'F3' : 'F2');

export const ACTION_LABEL: Record<string, string> = {
  forward: 'Forward to DDO',
  returnToMember: 'Return to member',
  reject: 'Reject',
  ddoCertify: 'Certify items 1–5',
  ddoRecordManual: 'Record DDO certificate',
  sendForSanction: 'Send for sanction',
  secretarySign: 'Sign sanction (1 of 2)',
  presidentSign: 'Sign sanction (2 of 2)',
  sendBack: 'Send back to assessment',
  disburse: 'Disburse',
};

export const SECONDARY = new Set(['returnToMember', 'reject', 'sendBack']);
export const NEEDS_REASON = new Set(['returnToMember', 'reject', 'sendBack']);

export const TITLES: Record<string, { title: string; description: string }> = {
  forward: { title: 'Review application', description: 'Confirm the details and documents. The eligibility checks run again automatically.' },
  ddoCertify: { title: 'DDO certificate (items 1–5)', description: 'Confirm the particulars against the service register and that the loan can be recovered from salary.' },
  ddoRecordManual: { title: 'Record DDO certificate', description: 'For a certificate received on paper (Q-102). Enter the DDO and the letter details.' },
  sendForSanction: { title: 'Assessment · For Office Use', description: 'The sanction sheet is computed from the rules. You may reduce the amount or tenure.' },
  secretarySign: { title: 'Sanction (1 of 2)', description: 'Your signature sends the loan to the President.' },
  presidentSign: { title: 'Sanction (2 of 2)', description: 'Final sanction. The sanction letter is generated and the member is told.' },
  disburse: { title: 'Disburse', description: 'Record the payment. The loan becomes active and the repayment schedule starts.' },
  returnToMember: { title: 'Return to the member', description: 'The member sees your reason in the app, corrects the application and signs again.' },
  reject: { title: 'Reject application', description: 'This ends the application. The member sees your reason.' },
  sendBack: { title: 'Send back to assessment', description: 'The Accountant re-assesses; both signatures are needed again.' },
};
