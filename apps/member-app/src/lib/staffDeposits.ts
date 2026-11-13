// Labels for the staff Deposits screens, copied from the console's pages/deposits (docs/23 §3).
import type { DepositTab, FdHolder } from '@tgs/types';

export const TABS: Array<{ value: DepositTab; label: string }> = [
  { value: 'FD', label: 'Fixed deposits' },
  { value: 'REQUESTS', label: 'FD requests' },
  { value: 'CRD', label: 'CRD' },
  { value: 'SRDS', label: 'SRDS' },
  { value: 'SAVINGS', label: 'Savings' },
];

export const MATURING = [
  { label: 'Any maturity', value: '' },
  { label: 'Maturing in 30 days', value: '30' },
  { label: 'Maturing in 60 days', value: '60' },
  { label: 'Maturing in 90 days', value: '90' },
];

export const ACTION_LABEL: Record<string, string> = { recordPayment: 'Record payment', accept: 'Accept', reject: 'Reject', cancel: 'Cancel request', refund: 'Refund', payout: 'Pay out', renew: 'Renew', withdraw: 'Withdraw early' };
export const MODE: Record<string, string> = { CASH: 'Cash', TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', RENEWAL: 'Renewal' };
export const METHOD: Record<string, string> = { RATE_CUT: 'rate cut', SHARE_OF_INTEREST: 'share of interest' };
export const SCHEME: Record<string, string> = { FD: 'Fixed deposit', CRD: 'CRD', SRDS: 'SRDS', SAVINGS: 'Savings' };
export const PAYOUT: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', HALF_YEARLY: 'Half-yearly', ON_MATURITY: 'On maturity' };
export const PAYOUTS = [
  { value: 'ON_MATURITY', label: 'On maturity' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'MONTHLY', label: 'Monthly' },
] as const;
export const blankHolder: FdHolder = { name: '', fatherOrHusbandName: '', occupation: '', address: '', phone: '' };
export const isSecondary = (a: string) => a === 'reject' || a === 'cancel' || a === 'withdraw';
