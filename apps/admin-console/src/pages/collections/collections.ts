// Labels and helpers shared by the collection screens (ST-40 … ST-47).
import { formatCycle } from '@tgs/domain';
import type { DemandHead, Receipt } from '@tgs/types';

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

export const HEAD_LABEL: Record<DemandHead, string> = Object.fromEntries(HEAD_COLUMNS.map((c) => [c.head, c.label])) as Record<DemandHead, string>;

export const SOURCE_LABEL: Record<Receipt['source'], string> = { SALARY_RECOVERY: 'Salary recovery', CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', ADJUSTMENT: 'Adjustment' };

export const PURPOSE_LABEL: Record<NonNullable<Receipt['purpose']>, string> = { DUES: 'Dues', SHARE_CAPITAL: 'Share capital', FD: 'Fixed deposit' };

export const REPORT_MODE_LABEL = { BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CHEQUE_DEPOSIT: 'Cheque deposit' } as const;

export const cycleLabel = (c: string) => formatCycle(c);

/** CSV for "Export (Excel)" — opens in Excel; the real file format is simulated (docs/06 ST-42). */
export function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const text = rows.map((r) => r.map((v) => (typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`)).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
