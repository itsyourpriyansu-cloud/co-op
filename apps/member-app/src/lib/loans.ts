// Member loan hooks (MB-03 … MB-05). Lists poll so staff decisions show up without a refresh.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LoanRequestInput, LoanStatusGroup } from '@tgs/types';
import { api } from './api';

export const loanKeys = { mine: ['my-loans'] as const, one: (id: string) => ['my-loan', id] as const, context: ['loan-context'] as const };

export function useMyLoans() {
  return useQuery({ queryKey: loanKeys.mine, queryFn: api.myLoans.list, refetchInterval: 5000 });
}

export function useMyLoan(id: string) {
  return useQuery({ queryKey: loanKeys.one(id), queryFn: () => api.myLoans.get(id), refetchInterval: 5000, enabled: Boolean(id) });
}

export function useLoanContext() {
  return useQuery({ queryKey: loanKeys.context, queryFn: api.myLoans.context });
}

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Server-side eligibility for the form as typed (same rules the office sees). */
export function useAssessment(input: LoanRequestInput, enabled: boolean, loanId?: string) {
  const d = useDebounced(input);
  return useQuery({
    queryKey: ['loan-assess', d, loanId],
    queryFn: () => api.loans.assess({ ...d, ...(loanId ? { loanId } : {}) }),
    enabled: enabled && d.amount > 0 && d.instalments > 0,
    placeholderData: (p) => p,
  });
}

export function useMemberSearch(q: string) {
  const d = useDebounced(q.trim(), 350);
  return useQuery({ queryKey: ['member-search', d], queryFn: () => api.loans.searchMembers(d), enabled: d.length >= 2 });
}

export const SEGMENTS: Array<{ value: LoanStatusGroup; label: string }> = [
  { value: 'IN_PROCESS', label: 'In process' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'DRAFT', label: 'Drafts' },
];
