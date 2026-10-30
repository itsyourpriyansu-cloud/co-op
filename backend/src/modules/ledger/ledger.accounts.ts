import type { LedgerAccountType } from '@tgs/domain';
import type { DepositScheme, LoanProductCode } from '@tgs/types';

/**
 * Chart of accounts [P] (D-080, Q-401: the society has not given one). Heads come from the
 * agreement (§3.2 deposits, §3.4 loans + share deposit, §3.5 insurance, §3.6 RRF/CRD/penal) and the
 * society's answers (D-067: admission fee, FD premature penalty, ledgers). Seeded into
 * ledger_accounts; codes are what postings use, names can change.
 */
export const CHART_OF_ACCOUNTS: Array<{ code: string; name: string; type: LedgerAccountType; memberLevel: boolean; description?: string }> = [
  { code: '1100', name: 'Cash in hand', type: 'ASSET', memberLevel: false },
  { code: '1200', name: 'Bank', type: 'ASSET', memberLevel: false },
  { code: '1300', name: 'Ordinary loans', type: 'ASSET', memberLevel: true },
  { code: '1310', name: 'Education loans', type: 'ASSET', memberLevel: true },
  { code: '1320', name: 'Salary loans', type: 'ASSET', memberLevel: true },
  { code: '1330', name: 'Loans against deposits', type: 'ASSET', memberLevel: true },
  { code: '1400', name: 'Interest receivable on loans', type: 'ASSET', memberLevel: true },
  { code: '1500', name: 'Recoveries receivable from departments', type: 'ASSET', memberLevel: false, description: 'Demand sent to DDOs, not yet received' },
  { code: '2100', name: 'Share deposit', type: 'LIABILITY', memberLevel: true, description: '10% of Ordinary loans (BR-004)' },
  { code: '2200', name: 'Fixed deposits', type: 'LIABILITY', memberLevel: true },
  { code: '2210', name: 'Interest payable on fixed deposits', type: 'LIABILITY', memberLevel: true },
  { code: '2300', name: 'CRD deposits', type: 'LIABILITY', memberLevel: true },
  { code: '2310', name: 'SRDS deposits', type: 'LIABILITY', memberLevel: true },
  { code: '2320', name: 'RRF', type: 'LIABILITY', memberLevel: false, description: 'Risk / Replace Reserve Fund (Q-301)' },
  { code: '2330', name: 'Savings deposits (closed scheme)', type: 'LIABILITY', memberLevel: true, description: 'D-067: no savings accounts; holds older balances only' },
  { code: '2400', name: 'Insurance contributions', type: 'LIABILITY', memberLevel: false, description: '₹200 / ₹1,000 a year (BR-008)' },
  { code: '2900', name: 'Unidentified receipts', type: 'LIABILITY', memberLevel: false, description: 'Money received but not yet matched to a member' },
  { code: '3100', name: 'Share capital', type: 'EQUITY', memberLevel: true },
  { code: '3900', name: 'Opening balance difference', type: 'EQUITY', memberLevel: false, description: 'Balances brought in from the old books' },
  { code: '4100', name: 'Interest on loans', type: 'INCOME', memberLevel: false },
  { code: '4200', name: 'Penal interest', type: 'INCOME', memberLevel: false },
  { code: '4300', name: 'Admission fees', type: 'INCOME', memberLevel: false },
  { code: '4400', name: 'FD premature-withdrawal penalty', type: 'INCOME', memberLevel: false },
  { code: '5100', name: 'Interest on fixed deposits', type: 'EXPENSE', memberLevel: false },
  { code: '5200', name: 'Interest on CRD and SRDS', type: 'EXPENSE', memberLevel: false },
];

/** Where each loan product's principal sits (P5 posts disbursements and recoveries here). */
export const LOAN_ACCOUNT: Record<LoanProductCode, string> = { ORDINARY: '1300', EDUCATION: '1310', SALARY: '1320', DEPOSIT: '1330' };

/** Where each deposit scheme's balance sits (P6 / P7). */
export const DEPOSIT_ACCOUNT: Record<DepositScheme, string> = { FD: '2200', CRD: '2300', SRDS: '2310', SAVINGS: '2330' };

export const ACCOUNT = {
  CASH: '1100',
  BANK: '1200',
  SHARE_DEPOSIT: '2100',
  SHARE_CAPITAL: '3100',
  OPENING_DIFFERENCE: '3900',
} as const;
