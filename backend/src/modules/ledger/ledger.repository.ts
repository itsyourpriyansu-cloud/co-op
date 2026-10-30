import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { journalEntries, journalLines, ledgerAccounts } from '../../models';

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
