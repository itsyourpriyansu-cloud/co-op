// Labels for the staff Collections screens, copied from the console's pages/collections (docs/23 §3).
import type { DemandHead, DemandSheetRow, Receipt } from '@tgs/types';

/** Columns on the demand sheet, in recovery priority (BR-011). */
export const HEAD_COLUMNS: Array<{ head: DemandHead; label: string }> = [
  { head: 'RRF', label: 'RRF' },
  { head: 'INSURANCE', label: 'Insurance' },
  { head: 'CRD', label: 'CRD' },
  { head: 'SRDS', label: 'SRDS' },
  { head: 'SHARE_CAPITAL', label: 'Shares' },
  { head: 'PENAL', label: 'Penal' },
  { head: 'INTEREST', label: 'Interest' },
  { head: 'PRINCIPAL', label: 'Principal' },
];

export const HEAD_LABEL = Object.fromEntries(HEAD_COLUMNS.map((c) => [c.head, c.label])) as Record<DemandHead, string>;
export const SOURCE_LABEL: Record<Receipt['source'], string> = { SALARY_RECOVERY: 'Salary recovery', CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', ADJUSTMENT: 'Adjustment' };
export const PURPOSE_LABEL: Record<NonNullable<Receipt['purpose']>, string> = { DUES: 'Dues', SHARE_CAPITAL: 'Share capital', FD: 'Fixed deposit', SURETY_RECOVERY: 'As surety', LOAN_CLOSURE: 'Loan closed early' };
export const REPORT_MODE_LABEL = { BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CHEQUE_DEPOSIT: 'Cheque deposit' } as const;
export const ENTRY_LABEL: Record<string, string> = { DRAFT: 'draft saved', SUBMITTED: 'submitted, waiting for the Accountant', UNDER_REVIEW: 'under review', REJECTED: 'sent back to the DDO', APPROVED: 'approved', POSTED: 'posted' };

export const SHEET_FILTERS: Array<{ label: string; value: string; match: (r: DemandSheetRow) => boolean }> = [
  { label: 'All departments', value: 'all', match: () => true },
  { label: 'Pending verification', value: 'pending', match: (r) => r.entryStatus === 'SUBMITTED' || r.entryStatus === 'UNDER_REVIEW' },
  { label: 'Entered online by the DDO', value: 'online', match: (r) => r.entrySource === 'DDO_ONLINE' },
  { label: 'Entered from a paper sheet', value: 'paper', match: (r) => r.entrySource === 'PHYSICAL_SHEET' },
  { label: 'Not sent on time', value: 'late', match: (r) => Boolean(r.sendLate) },
];

export const LINE_FILTERS = [
  { label: 'All members', value: 'all' },
  { label: 'Partly recovered', value: 'short' },
  { label: 'Fully recovered', value: 'full' },
  { label: 'With earlier dues', value: 'outstanding' },
  { label: 'Not entered yet', value: 'pending' },
];
