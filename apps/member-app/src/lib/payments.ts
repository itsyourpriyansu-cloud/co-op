// Member payment hooks (MB-10, MB-18). Polls so a cashier's verification shows up without a refresh.
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const paymentKeys = { mine: ['my-payments'] as const, receipt: (id: string) => ['my-receipt', id] as const };

export function useMyPayments() {
  return useQuery({ queryKey: paymentKeys.mine, queryFn: api.myPayments.get, refetchInterval: 5000 });
}

export function useMyReceipt(id: string) {
  return useQuery({ queryKey: paymentKeys.receipt(id), queryFn: () => api.myPayments.receipt(id), enabled: Boolean(id) });
}

export const SOURCE_LABEL = { SALARY_RECOVERY: 'Salary deduction', CASH: 'Cash at the counter', BANK_TRANSFER: 'Bank transfer', ADJUSTMENT: 'Adjustment' } as const;
export const MODE_LABEL = { BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CHEQUE_DEPOSIT: 'Cheque deposit' } as const;
