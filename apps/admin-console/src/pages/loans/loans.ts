// Shared bits for the Loans module (ST-20 … ST-23).
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

/** M5 builds the decision drawers; until then the detail page names the action that is coming. */
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
