import { and, count, desc, eq, gte, like, lte, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { financialYears, journalEntries, ledgerAccounts, officeVouchers } from '../../models';

export type VoucherRow = typeof officeVouchers.$inferSelect;
export type YearRow = typeof financialYears.$inferSelect;

/** G2 (D-112): office vouchers, sub-heads and closed years. Journal entries go through the ledger service. */
export class AccountsRepository {
  constructor(private readonly db: Database) {}

  /** Next PV-2026-0001 / RV-2026-0001 (the table lock keeps two at once apart). */
  async nextVoucherNo(tx: Tx, prefix: 'PV' | 'RV', year: string): Promise<string> {
    await tx.execute(sql`lock table ${officeVouchers} in share row exclusive mode`);
    const [row] = await tx.select({ n: count() }).from(officeVouchers).where(like(officeVouchers.voucherNo, `${prefix}-${year}-%`));
    return `${prefix}-${year}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
  }

  async insertVoucher(tx: Tx, v: typeof officeVouchers.$inferInsert): Promise<VoucherRow> {
    const [row] = await tx.insert(officeVouchers).values(v).returning();
    return row!;
  }

  async vouchers(f: { from?: string; to?: string; kind?: string }, page: number, pageSize: number): Promise<{ rows: Array<VoucherRow & { entryNo: number }>; total: number }> {
    const where: SQL[] = [];
    if (f.from) where.push(gte(officeVouchers.voucherDate, f.from));
    if (f.to) where.push(lte(officeVouchers.voucherDate, f.to));
    if (f.kind === 'PAYMENT' || f.kind === 'RECEIPT') where.push(eq(officeVouchers.kind, f.kind));
    const cond = where.length ? and(...where) : undefined;
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ v: officeVouchers, entryNo: journalEntries.entryNo })
        .from(officeVouchers)
        .innerJoin(journalEntries, eq(journalEntries.id, officeVouchers.entryId))
        .where(cond)
        .orderBy(desc(officeVouchers.voucherDate), desc(officeVouchers.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ n: count() }).from(officeVouchers).where(cond),
    ]);
    return { rows: rows.map((r) => ({ ...r.v, entryNo: r.entryNo })), total: total?.n ?? 0 };
  }

  async voucher(id: string): Promise<(VoucherRow & { entryNo: number }) | undefined> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
    const [row] = await this.db.select({ v: officeVouchers, entryNo: journalEntries.entryNo }).from(officeVouchers).innerJoin(journalEntries, eq(journalEntries.id, officeVouchers.entryId)).where(eq(officeVouchers.id, id));
    return row ? { ...row.v, entryNo: row.entryNo } : undefined;
  }

  async insertHead(tx: Tx, h: typeof ledgerAccounts.$inferInsert): Promise<void> {
    await tx.insert(ledgerAccounts).values(h);
  }

  async updateHead(code: string, patch: { name?: string; active?: boolean }): Promise<void> {
    await this.db.update(ledgerAccounts).set(patch).where(eq(ledgerAccounts.code, code));
  }

  /** Sub-heads already under `parentCode`, for the next number. */
  async childCount(tx: Tx, parentCode: string): Promise<number> {
    await tx.execute(sql`lock table ${ledgerAccounts} in share row exclusive mode`);
    const [row] = await tx.select({ n: count() }).from(ledgerAccounts).where(eq(ledgerAccounts.parentCode, parentCode));
    return row?.n ?? 0;
  }

  async year(fy: string, tx?: Tx): Promise<YearRow | undefined> {
    const [row] = await (tx ?? this.db).select().from(financialYears).where(eq(financialYears.fy, fy));
    return row;
  }

  async insertYear(tx: Tx, y: typeof financialYears.$inferInsert): Promise<void> {
    await tx.insert(financialYears).values(y);
  }

  /** The first and last entry dates, to list the years that have postings. */
  async entrySpan(): Promise<{ first: string | null; last: string | null }> {
    const [row] = await this.db.select({ first: sql<string | null>`min(${journalEntries.entryDate})`, last: sql<string | null>`max(${journalEntries.entryDate})` }).from(journalEntries);
    return { first: row?.first ?? null, last: row?.last ?? null };
  }
}
