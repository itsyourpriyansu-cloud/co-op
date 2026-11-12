import { and, asc, count, desc, eq, gte, inArray, lte, max, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { financialYears, journalEntries, journalLines, ledgerAccounts } from '../../models';

export type AccountRow = typeof ledgerAccounts.$inferSelect;
export type EntryRow = typeof journalEntries.$inferSelect;
export type LineRow = typeof journalLines.$inferSelect;

export interface DateRange {
  from?: string;
  to?: string;
}

const inRange = ({ from, to }: DateRange): SQL[] => [
  ...(from ? [gte(journalEntries.entryDate, from)] : []),
  ...(to ? [lte(journalEntries.entryDate, to)] : []),
];

export class LedgerRepository {
  constructor(private readonly db: Database) {}

  accounts(tx?: Tx): Promise<AccountRow[]> {
    return (tx ?? this.db).select().from(ledgerAccounts).orderBy(asc(ledgerAccounts.sortOrder), asc(ledgerAccounts.code));
  }

  async accountsByCode(codes: string[], tx?: Tx): Promise<Map<string, AccountRow>> {
    if (!codes.length) return new Map();
    const rows = await (tx ?? this.db).select().from(ledgerAccounts).where(inArray(ledgerAccounts.code, codes));
    return new Map(rows.map((r) => [r.code, r]));
  }

  async insertEntry(tx: Tx, entry: typeof journalEntries.$inferInsert, lines: Array<Omit<typeof journalLines.$inferInsert, 'entryId' | 'lineNo'>>): Promise<EntryRow> {
    const [row] = await tx.insert(journalEntries).values(entry).returning();
    await tx.insert(journalLines).values(lines.map((l, i) => ({ ...l, entryId: row!.id, lineNo: i + 1 })));
    return row!;
  }

  async entry(id: string): Promise<EntryRow | undefined> {
    const [row] = await this.db.select().from(journalEntries).where(eq(journalEntries.id, id));
    return row;
  }

  async reversalOf(id: string): Promise<EntryRow | undefined> {
    const [row] = await this.db.select().from(journalEntries).where(eq(journalEntries.reversesEntryId, id));
    return row;
  }

  linesOf(entryId: string): Promise<LineRow[]> {
    return this.db.select().from(journalLines).where(eq(journalLines.entryId, entryId)).orderBy(asc(journalLines.lineNo));
  }

  async entries(filter: DateRange & { source?: string }, page: number, pageSize: number): Promise<{ rows: EntryRow[]; total: number }> {
    const where = and(...inRange(filter), ...(filter.source ? [eq(journalEntries.source, filter.source)] : []));
    const [rows, [{ n } = { n: 0 }]] = await Promise.all([
      this.db.select().from(journalEntries).where(where).orderBy(desc(journalEntries.entryNo)).limit(pageSize).offset((page - 1) * pageSize),
      this.db.select({ n: count() }).from(journalEntries).where(where),
    ]);
    return { rows, total: n };
  }

  /** Debit and credit totals per account up to a date (trial balance). */
  totalsByAccount(asOf?: string) {
    return this.db
      .select({
        accountCode: journalLines.accountCode,
        debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`,
        credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(...inRange({ to: asOf })))
      .groupBy(journalLines.accountCode);
  }

  /** G2 (D-112): the last day of the latest closed financial year (nothing may be posted on or before it). */
  async closedThrough(tx?: Tx): Promise<string | null> {
    const [row] = await (tx ?? this.db).select({ d: max(financialYears.endDate) }).from(financialYears);
    return row?.d ?? null;
  }

  async bySource(source: string, sourceRef: string, tx?: Tx): Promise<EntryRow | undefined> {
    const [row] = await (tx ?? this.db).select().from(journalEntries).where(and(eq(journalEntries.source, source), eq(journalEntries.sourceRef, sourceRef))).limit(1);
    return row;
  }

  /** Debit and credit totals per account for entries dated in a range, leaving out some sources (e.g. YEAR_CLOSE for a P&L). */
  totalsBetween(range: DateRange, exceptSources: string[] = [], tx?: Tx) {
    return (tx ?? this.db)
      .select({
        accountCode: journalLines.accountCode,
        debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`,
        credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(...inRange(range), ...(exceptSources.length ? [notInArray(journalEntries.source, exceptSources)] : [])))
      .groupBy(journalLines.accountCode);
  }

  /** G2: each member's balance (credit − debit) on member-level accounts at each of `dates`. */
  async memberCreditBalancesAt(codes: string[], dates: string[], tx?: Tx): Promise<Array<{ d: string; memberId: string; accountCode: string; balance: number }>> {
    // Dates and codes are checked here and inlined: an array parameter would expand to a list.
    if (!dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) || !codes.every((c) => /^[\d.]+$/.test(c))) throw new Error('Bad date or account code');
    const res = await (tx ?? this.db).execute<{ d: string; member_id: string; account_code: string; balance: string }>(sql`
      select to_char(me.d, 'YYYY-MM-DD') as d, l.member_id, l.account_code, sum(l.credit - l.debit) as balance
      from unnest(${sql.raw(`array[${dates.map((d) => `'${d}'`).join(',')}]::date[]`)}) as me(d)
      join journal_entries e on e.entry_date <= me.d
      join journal_lines l on l.entry_id = e.id
      where l.member_id is not null and l.account_code in ${sql.raw(`(${codes.map((c) => `'${c}'`).join(',')})`)}
      group by me.d, l.member_id, l.account_code`);
    return res.rows.map((r) => ({ d: r.d, memberId: r.member_id, accountCode: r.account_code, balance: Number(r.balance) }));
  }

  /** Lines with their entry, oldest first, for a statement or an account ledger. */
  lines(filter: DateRange & { accountCode?: string; memberId?: string }, limit: number) {
    return this.db
      .select({ line: journalLines, entry: journalEntries })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(
        and(
          ...inRange(filter),
          ...(filter.accountCode ? [eq(journalLines.accountCode, filter.accountCode)] : []),
          ...(filter.memberId ? [eq(journalLines.memberId, filter.memberId)] : []),
        ),
      )
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNo), asc(journalLines.lineNo))
      .limit(limit);
  }

  /** Balance brought forward before `from` (per account, for one member or one account). */
  openingTotals(before: string, filter: { accountCode?: string; memberId?: string }) {
    return this.db
      .select({
        accountCode: journalLines.accountCode,
        debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`,
        credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(
        and(
          sql`${journalEntries.entryDate} < ${before}`,
          ...(filter.accountCode ? [eq(journalLines.accountCode, filter.accountCode)] : []),
          ...(filter.memberId ? [eq(journalLines.memberId, filter.memberId)] : []),
        ),
      )
      .groupBy(journalLines.accountCode);
  }
}
