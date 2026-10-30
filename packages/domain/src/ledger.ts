// Double-entry ledger rules (REQ-131, D-067 "every amount posts to the books", docs/22 P3).
// Pure functions: the backend's posting service and database checks enforce the same rules.
import type { Paise } from '@tgs/types';

export type LedgerAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type NormalSide = 'DEBIT' | 'CREDIT';

export interface JournalLineInput {
  accountCode: string;
  debit: Paise;
  credit: Paise;
  memberId?: string;
  refType?: string;
  refId?: string;
}

/** Assets and expenses grow on the debit side; liabilities, equity and income on the credit side. */
export function normalSide(type: LedgerAccountType): NormalSide {
  return type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
}

/** Balance in the account's own direction (positive = the usual side). */
export function signedBalance(type: LedgerAccountType, debit: Paise, credit: Paise): Paise {
  return normalSide(type) === 'DEBIT' ? debit - credit : credit - debit;
}

export interface JournalCheck {
  ok: boolean;
  totalDebit: Paise;
  totalCredit: Paise;
  /** Problems by line index (`lines.2`) or for the whole entry (`lines`). */
  errors: Record<string, string>;
}

/**
 * LED-1 at least two lines · LED-2 each line is a whole number of paise on exactly one side ·
 * LED-3 total debits = total credits (the entry balances).
 */
export function checkJournal(lines: JournalLineInput[]): JournalCheck {
  const errors: Record<string, string> = {};
  if (lines.length < 2) errors.lines = 'An entry needs at least two lines.';
  lines.forEach((l, i) => {
    const valid = (v: number) => Number.isInteger(v) && v >= 0;
    if (!l.accountCode) errors[`lines.${i}`] = 'Choose an account.';
    else if (!valid(l.debit) || !valid(l.credit)) errors[`lines.${i}`] = 'Amounts are whole paise, never negative.';
    else if ((l.debit > 0) === (l.credit > 0)) errors[`lines.${i}`] = 'Each line is either a debit or a credit.';
  });
  const totalDebit = lines.reduce((s, l) => s + (Number.isFinite(l.debit) ? l.debit : 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number.isFinite(l.credit) ? l.credit : 0), 0);
  if (!errors.lines && totalDebit !== totalCredit) errors.lines = `Debits (${totalDebit}) and credits (${totalCredit}) must be equal.`;
  return { ok: Object.keys(errors).length === 0, totalDebit, totalCredit, errors };
}

/** The mirror image of an entry: every debit becomes a credit and the reverse (corrections never edit). */
export function reverseLines(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}
