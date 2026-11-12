// G2 (D-112): year-end accounting. Pure functions; the backend posts what they return.
import type { ISODate, Paise } from '@tgs/types';
import type { JournalLineInput, LedgerAccountType } from './ledger';
import { signedBalance } from './ledger';

/** "2026-27" for a date in the year that starts in `startMonth` (4 = April). */
export function financialYearOf(date: ISODate, startMonth = 4): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= startMonth ? y : y - 1;
  return startMonth === 1 ? String(start) : `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** First and last day of a financial year written as by `financialYearOf`. */
export function financialYearRange(fy: string, startMonth = 4): { from: ISODate; to: ISODate } {
  if (!/^\d{4}(-\d{2})?$/.test(fy)) throw new Error(`Bad financial year ${fy}`);
  const start = Number(fy.slice(0, 4));
  const from = `${start}-${String(startMonth).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(start + 1, startMonth - 1, 0));
  return { from, to: end.toISOString().slice(0, 10) };
}

/** The last day of each month of the year, in order (12 dates). */
export function monthEnds(fy: string, startMonth = 4): ISODate[] {
  const start = Number(fy.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(start, startMonth + i, 0)).toISOString().slice(0, 10));
}

export type DepositInterestBasis = 'YEAR_END' | 'AVERAGE_MONTH_END';

/**
 * BR-044 [P]: a year's interest on a compulsory deposit or the share deposit. YEAR_END uses the
 * last month-end balance; AVERAGE_MONTH_END the average of the 12 month-end balances. Rounded to the paisa.
 */
export function annualDepositInterest(monthEndBalances: Paise[], ratePercent: number, basis: DepositInterestBasis): Paise {
  if (!monthEndBalances.length || ratePercent <= 0) return 0;
  const base = basis === 'YEAR_END' ? monthEndBalances[monthEndBalances.length - 1]! : monthEndBalances.reduce((a, b) => a + b, 0) / monthEndBalances.length;
  return Math.max(0, Math.round((base * ratePercent) / 100));
}

/** BR-045 [P]: dividend on a member's share capital at the year end. */
export function dividendOn(shareCapital: Paise, ratePercent: number): Paise {
  return ratePercent > 0 && shareCapital > 0 ? Math.round((shareCapital * ratePercent) / 100) : 0;
}

/**
 * BR-046 [P]: closing a year. Every income and expense account is brought to nil and the
 * difference goes to the surplus account (credit = surplus, debit = deficit).
 */
export function yearCloseLines(accounts: Array<{ code: string; type: LedgerAccountType; debit: Paise; credit: Paise }>, surplusCode: string): { lines: JournalLineInput[]; income: Paise; expense: Paise; surplus: Paise } {
  const lines: JournalLineInput[] = [];
  let income = 0;
  let expense = 0;
  for (const a of accounts) {
    if (a.type !== 'INCOME' && a.type !== 'EXPENSE') continue;
    const bal = signedBalance(a.type, a.debit, a.credit);
    if (!bal) continue;
    if (a.type === 'INCOME') income += bal;
    else expense += bal;
    // Reverse the account's balance: income (credit) is debited, expense (debit) is credited.
    const debitIt = (a.type === 'INCOME') === bal > 0;
    lines.push({ accountCode: a.code, debit: debitIt ? Math.abs(bal) : 0, credit: debitIt ? 0 : Math.abs(bal) });
  }
  const surplus = income - expense;
  if (surplus) lines.push({ accountCode: surplusCode, debit: surplus < 0 ? -surplus : 0, credit: surplus > 0 ? surplus : 0 });
  return { lines, income, expense, surplus };
}
