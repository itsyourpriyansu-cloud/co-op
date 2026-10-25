// Member deposit hooks (MB-08, MB-09, MB-15). Lists poll so office decisions show up without a refresh.
import { useQuery } from '@tanstack/react-query';
import type { DepositRow } from '@tgs/types';
import { api } from './api';

export const depositKeys = { mine: ['my-deposits'] as const, one: (id: string) => ['my-deposit', id] as const, context: ['deposit-context'] as const };

export function useMyDeposits() {
  return useQuery({ queryKey: depositKeys.mine, queryFn: api.myDeposits.list, refetchInterval: 5000 });
}

export function useMyDeposit(id: string) {
  return useQuery({ queryKey: depositKeys.one(id), queryFn: () => api.myDeposits.get(id), refetchInterval: 5000, enabled: Boolean(id) });
}

export function useDepositContext() {
  return useQuery({ queryKey: depositKeys.context, queryFn: api.myDeposits.context });
}

export type DepositSegment = 'FD' | 'REQUESTS' | 'OTHER';

const REQUEST_STATUSES = ['REQUESTED', 'PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT', 'REFUND_PENDING'];

/** Which segment a deposit belongs to on MB-08. Cancelled requests drop off the list. */
export function segmentOf(d: DepositRow): DepositSegment | undefined {
  if (d.scheme !== 'FD') return 'OTHER';
  if (REQUEST_STATUSES.includes(d.status)) return 'REQUESTS';
  return d.status === 'CANCELLED' ? undefined : 'FD';
}

export const SCHEME_LABEL: Record<DepositRow['scheme'], string> = { FD: 'Fixed deposit', CRD: 'CRD', SRDS: 'SRDS', SAVINGS: 'Savings' };

export const PAYOUT_LABEL = { MONTHLY: 'Every month', QUARTERLY: 'Every 3 months', HALF_YEARLY: 'Every 6 months', ON_MATURITY: 'At maturity' } as const;
