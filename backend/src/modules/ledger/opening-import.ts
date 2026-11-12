import type { JournalLineInput } from '@tgs/domain';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { parseCsv } from '../../common/utils/csv';
import { withTransaction } from '../../db/transaction';
import { journalEntries } from '../../models';
import { isDate, rupees, type ImportResult } from '../members/register-import';
import { ACCOUNT } from './ledger.accounts';

// G6 (D-116, F-11): the rest of the society's trial balance at go-live (cash, bank, reserves,
// payables, investments...): every head that is not kept per member. One CSV row per head (template:
// backend/import/opening-balances-template.csv, rupees, debit or credit as in the trial balance),
// posted as ONE opening entry against 3900. Member heads come from the member, loan and deposit imports.
// Then `reconcileOpening` compares the books with the society's trial balance: when everything agrees,
// every head matches and 3900 Opening balance difference is nil.

export const OPENING_COLUMNS = ['accountCode', 'debit', 'credit'] as const;
const SOURCE_REF = 'opening-general';

const readTrialBalance = (csv: string, result: ImportResult, accounts: Map<string, { name: string; memberLevel: boolean; active: boolean }>, memberHeads: 'refuse' | 'allow') => {
  const rows = parseCsv(csv);
  result.rows = rows.length;
  const missing = OPENING_COLUMNS.filter((c) => rows[0] && !(c in rows[0]));
  if (!rows.length || missing.length) {
    result.errors.push({ row: 1, generalNo: '', fieldErrors: { header: rows.length ? `Missing columns: ${missing.join(', ')}` : 'The file has no rows.' } });
    return [];
  }
  const seen = new Set<string>();
  const out: Array<{ code: string; net: number }> = [];
  rows.forEach((r, i) => {
    const e: Record<string, string> = {};
    const code = (r.accountCode ?? '').trim();
    const a = accounts.get(code);
    const debit = r.debit?.trim() ? rupees(r.debit) : 0;
    const credit = r.credit?.trim() ? rupees(r.credit) : 0;
    if (!a) e.accountCode = 'Unknown head (Accounts → Heads lists the codes)';
    else if (seen.has(code)) e.accountCode = 'This head is already on an earlier row';
    else if (memberHeads === 'refuse' && a.memberLevel) e.accountCode = `${a.name} is kept per member; it comes from the member, loan and deposit imports`;
    else if (memberHeads === 'refuse' && code === ACCOUNT.OPENING_DIFFERENCE) e.accountCode = 'The difference head is worked out, not imported';
    else if (memberHeads === 'refuse' && !a.active) e.accountCode = `${a.name} is closed for posting`;
    if (!(debit >= 0) || !(credit >= 0) || (debit > 0 && credit > 0)) e.debit = 'One amount in rupees, on the debit or the credit side';
    if (Object.keys(e).length) result.errors.push({ row: i + 2, generalNo: '', fieldErrors: e });
    else {
      seen.add(code);
      out.push({ code, net: debit - credit });
    }
  });
  return out;
};

export async function importOpeningBalances(app: FastifyInstance, csv: string, opts: { commit: boolean; asOn: string; actor: { id: string; name: string } }): Promise<ImportResult> {
  if (!isDate(opts.asOn)) throw new Error('The as-on date must be YYYY-MM-DD.');
  const result: ImportResult = { rows: 0, committed: false, errors: [], totals: { debit: 0, credit: 0, difference: 0 } };
  const accounts = new Map((await app.ledger.repo.accounts()).map((a) => [a.code, a]));
  const heads = readTrialBalance(csv, result, accounts, 'refuse');
  const [done] = await app.db.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.source, 'OPENING'), eq(journalEntries.sourceRef, SOURCE_REF))).limit(1);
  if (done) result.errors.push({ row: 1, generalNo: '', fieldErrors: { file: 'The opening balances are already in the books; correct them with a journal voucher' } });
  if (result.errors.length) return result;

  const lines: JournalLineInput[] = heads.filter((h) => h.net).map((h) => ({ accountCode: h.code, debit: Math.max(h.net, 0), credit: Math.max(-h.net, 0) }));
  result.totals.debit = lines.reduce((s, l) => s + l.debit, 0);
  result.totals.credit = lines.reduce((s, l) => s + l.credit, 0);
  result.totals.difference = result.totals.debit - result.totals.credit;
  if (!opts.commit || !lines.length) return result;
  // 3900 takes the other side; once the member imports are in, it nets to nil if the books agree.
  if (result.totals.difference) lines.push({ accountCode: ACCOUNT.OPENING_DIFFERENCE, debit: Math.max(-result.totals.difference, 0), credit: Math.max(result.totals.difference, 0) });

  await withTransaction(app.db, async (tx) => {
    await app.ledger.post({ entryDate: opts.asOn, narration: 'Opening balances brought forward from the old books', source: 'OPENING', sourceRef: SOURCE_REF, lines, postedBy: opts.actor }, tx);
    await app.audit.record(undefined, { action: 'ledger.importOpening', entity: 'journal', summary: `Opening balances for ${lines.length} heads (as on ${opts.asOn})`, after: result.totals, actor: opts.actor }, tx);
  });
  result.committed = true;
  return result;
}

export interface ReconcileRow {
  code: string;
  name: string;
  /** Net debit (+) or credit (−), paise. */
  books: number;
  system: number;
  difference: number;
}

/** The society's trial balance (same CSV shape) against the system's as on the date, head by head. */
export async function reconcileOpening(app: FastifyInstance, csv: string, asOn: string): Promise<{ errors: ImportResult['errors']; rows: ReconcileRow[]; mismatches: number; openingDifference: number; balanced: boolean }> {
  if (!isDate(asOn)) throw new Error('The as-on date must be YYYY-MM-DD.');
  const accountRows = await app.ledger.repo.accounts();
  const accounts = new Map(accountRows.map((a) => [a.code, a]));
  const holder: ImportResult = { rows: 0, committed: false, errors: [], totals: {} };
  const books = new Map(readTrialBalance(csv, holder, accounts, 'allow').map((h) => [h.code, h.net]));
  const tb = await app.ledger.trialBalance(asOn);
  const system = new Map(tb.rows.map((r) => [r.code, r.debit - r.credit]));
  const codes = [...new Set([...books.keys(), ...system.keys()])].filter((c) => c !== ACCOUNT.OPENING_DIFFERENCE).sort();
  const rows = codes.map((code) => {
    const b = books.get(code) ?? 0;
    const s = system.get(code) ?? 0;
    return { code, name: accounts.get(code)?.name ?? code, books: b, system: s, difference: s - b };
  });
  const openingDifference = system.get(ACCOUNT.OPENING_DIFFERENCE) ?? 0;
  return { errors: holder.errors, rows, mismatches: rows.filter((r) => r.difference).length, openingDifference, balanced: tb.balanced };
}
