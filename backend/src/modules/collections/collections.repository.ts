import type { DemandLine, DemandSheet, PaymentReport, PaymentReportStatus, Receipt, ShareAccount } from '@tgs/types';
import { and, asc, desc, eq, ilike, inArray, like, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { demandLines, demandSheets, members, paymentReports, receipts, shareAccounts } from '../../models';

type SheetRow = typeof demandSheets.$inferSelect;
type LineRow = typeof demandLines.$inferSelect;
export type SheetHead = Omit<DemandSheet, 'lines'>;

const toSheet = (r: SheetRow): SheetHead => ({ ...r.data, status: r.status, totalDemand: r.totalDemand, totalRecovered: r.totalRecovered });
const toLine = (l: LineRow): DemandLine => ({ memberId: l.memberId, components: l.components, totalDemand: l.totalDemand, ...(l.recovered !== null ? { recovered: l.recovered } : {}) });
const toShare = (r: typeof shareAccounts.$inferSelect): ShareAccount => ({ memberId: r.memberId, numberOfShares: r.numberOfShares, shareCapital: r.shareCapital, shareDepositBalance: r.shareDepositBalance });
const receiptColumns = (r: Receipt) => ({ receiptNo: r.receiptNo, memberId: r.memberId, date: r.date, source: r.source, amount: r.amount, cycle: r.cycle ?? null, sheetId: r.sheetId ?? null, sortAt: r.at ?? r.date, data: r });

export interface ReceiptFilter {
  tab?: string;
  cycle?: string;
  departmentId?: string;
  q?: string;
  /** DDO scope. */
  scopeDepartmentId?: string;
}

export class CollectionsRepository {
  constructor(private readonly db: Database) {}

  // ---- share accounts ----
  async share(memberId: string, tx?: Tx): Promise<ShareAccount | null> {
    const [r] = await (tx ?? this.db).select().from(shareAccounts).where(eq(shareAccounts.memberId, memberId));
    return r ? toShare(r) : null;
  }

  async shares(memberIds?: string[]): Promise<ShareAccount[]> {
    return (await this.db.select().from(shareAccounts).where(memberIds ? inArray(shareAccounts.memberId, memberIds) : undefined)).map(toShare);
  }

  async saveShare(tx: Tx, s: ShareAccount): Promise<void> {
    const values = { numberOfShares: s.numberOfShares, shareCapital: s.shareCapital, shareDepositBalance: s.shareDepositBalance };
    await tx.insert(shareAccounts).values({ memberId: s.memberId, ...values }).onConflictDoUpdate({ target: shareAccounts.memberId, set: { ...values, updatedAt: sql`now()` } });
  }

  async lockShare(tx: Tx, memberId: string): Promise<ShareAccount | null> {
    const [r] = await tx.select().from(shareAccounts).where(eq(shareAccounts.memberId, memberId)).for('update');
    return r ? toShare(r) : null;
  }

  // ---- demand sheets ----
  async sheetsForCycle(cycle: string): Promise<SheetHead[]> {
    return (await this.db.select().from(demandSheets).where(eq(demandSheets.cycle, cycle))).map(toSheet);
  }

  async allSheetHeads(): Promise<SheetHead[]> {
    return (await this.db.select().from(demandSheets)).map(toSheet);
  }

  async cycles(): Promise<string[]> {
    return (await this.db.selectDistinct({ cycle: demandSheets.cycle }).from(demandSheets)).map((r) => r.cycle);
  }

  async sheet(id: string, tx?: Tx, lock = false): Promise<DemandSheet | undefined> {
    const q = (tx ?? this.db).select().from(demandSheets).where(eq(demandSheets.id, id));
    const [head] = lock && tx ? await q.for('update') : await q;
    if (!head) return undefined;
    const lines = await (tx ?? this.db).select().from(demandLines).where(eq(demandLines.sheetId, id));
    return { ...toSheet(head), lines: lines.map(toLine) };
  }

  async insertSheet(tx: Tx, s: DemandSheet): Promise<void> {
    const { lines, ...head } = s;
    await tx.insert(demandSheets).values({ id: s.id, cycle: s.cycle, departmentId: s.departmentId, status: s.status, totalDemand: s.totalDemand, totalRecovered: s.totalRecovered, data: head });
    for (let i = 0; i < lines.length; i += 500) await tx.insert(demandLines).values(lines.slice(i, i + 500).map((l) => ({ sheetId: s.id, memberId: l.memberId, cycle: s.cycle, components: l.components, totalDemand: l.totalDemand, recovered: l.recovered ?? null })));
  }

  async saveSheetHead(tx: Tx, s: SheetHead): Promise<void> {
    await tx.update(demandSheets).set({ status: s.status, totalDemand: s.totalDemand, totalRecovered: s.totalRecovered, data: s, updatedAt: sql`now()` }).where(eq(demandSheets.id, s.id));
  }

  async saveLine(tx: Tx, sheetId: string, l: DemandLine): Promise<void> {
    await tx.update(demandLines).set({ components: l.components, recovered: l.recovered ?? null }).where(and(eq(demandLines.sheetId, sheetId), eq(demandLines.memberId, l.memberId)));
  }

  /** A member's lines with their sheet, oldest cycle first (dues, statements, member page). */
  async linesOfMember(memberId: string, tx?: Tx): Promise<Array<{ sheet: SheetHead; line: DemandLine }>> {
    const rows = await (tx ?? this.db)
      .select({ s: demandSheets, l: demandLines })
      .from(demandLines)
      .innerJoin(demandSheets, eq(demandSheets.id, demandLines.sheetId))
      .where(eq(demandLines.memberId, memberId))
      .orderBy(asc(demandLines.cycle));
    return rows.map((r) => ({ sheet: toSheet(r.s), line: toLine(r.l) }));
  }

  // ---- receipts ----
  private receiptWhere(f: ReceiptFilter) {
    const needle = (f.q ?? '').trim();
    return and(
      f.tab === 'SALARY_RECOVERY' ? eq(receipts.source, 'SALARY_RECOVERY') : f.tab === 'COUNTER' ? ne(receipts.source, 'SALARY_RECOVERY') : undefined,
      f.cycle ? or(eq(receipts.cycle, f.cycle), sql`${receipts.date}::text like ${`${f.cycle}%`}`) : undefined,
      f.departmentId ? eq(members.departmentId, f.departmentId) : undefined,
      f.scopeDepartmentId ? eq(members.departmentId, f.scopeDepartmentId) : undefined,
      needle ? or(ilike(receipts.receiptNo, `%${needle}%`), ilike(members.name, `%${needle}%`), eq(members.generalNo, needle), sql`${receipts.data}->>'reference' ilike ${`%${needle}%`}`) : undefined,
    );
  }

  async receiptPage(f: ReceiptFilter, offset: number, limit: number): Promise<{ items: Receipt[]; total: number }> {
    const where = this.receiptWhere(f);
    const [items, [count]] = await Promise.all([
      this.db.select({ data: receipts.data }).from(receipts).innerJoin(members, eq(members.id, receipts.memberId)).where(where).orderBy(desc(receipts.sortAt), desc(receipts.receiptNo)).offset(offset).limit(limit),
      this.db.select({ n: sql<number>`count(*)::int` }).from(receipts).innerJoin(members, eq(members.id, receipts.memberId)).where(where),
    ]);
    return { items: items.map((r) => r.data), total: count?.n ?? 0 };
  }

  /** Counts per tab and money totals for today and this month, in the user's scope. */
  async receiptStats(scopeDepartmentId: string | undefined, today: string): Promise<{ all: number; salary: number; todayAmount: number; monthAmount: number }> {
    const [r] = await this.db
      .select({
        all: sql<number>`count(*)::int`,
        salary: sql<number>`count(*) filter (where ${receipts.source} = 'SALARY_RECOVERY')::int`,
        todayAmount: sql<number>`coalesce(sum(${receipts.amount}) filter (where ${receipts.date} = ${today}), 0)::bigint`,
        monthAmount: sql<number>`coalesce(sum(${receipts.amount}) filter (where ${receipts.date}::text like ${`${today.slice(0, 7)}%`}), 0)::bigint`,
      })
      .from(receipts)
      .innerJoin(members, eq(members.id, receipts.memberId))
      .where(scopeDepartmentId ? eq(members.departmentId, scopeDepartmentId) : undefined);
    return { all: r?.all ?? 0, salary: r?.salary ?? 0, todayAmount: Number(r?.todayAmount ?? 0), monthAmount: Number(r?.monthAmount ?? 0) };
  }

  async receipt(idOrNo: string): Promise<Receipt | undefined> {
    const [r] = await this.db.select({ data: receipts.data }).from(receipts).where(or(eq(receipts.id, idOrNo), eq(receipts.receiptNo, idOrNo)));
    return r?.data;
  }

  async receiptsOfMember(memberId: string): Promise<Receipt[]> {
    return (await this.db.select({ data: receipts.data }).from(receipts).where(eq(receipts.memberId, memberId)).orderBy(desc(receipts.sortAt))).map((r) => r.data);
  }

  /** Next receipt number in the prototype's formats, under a table lock. */
  async nextReceiptSeq(tx: Tx): Promise<number> {
    await tx.execute(sql`lock table ${receipts} in share row exclusive mode`);
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(receipts);
    return (r?.n ?? 0) + 1;
  }

  async insertReceipt(tx: Tx, r: Receipt): Promise<void> {
    await tx.insert(receipts).values({ id: r.id, ...receiptColumns(r) });
  }

  // ---- payment reports ----
  async reports(status?: PaymentReportStatus, memberId?: string): Promise<PaymentReport[]> {
    return (await this.db.select({ data: paymentReports.data }).from(paymentReports).where(and(status ? eq(paymentReports.status, status) : undefined, memberId ? eq(paymentReports.memberId, memberId) : undefined))).map((r) => r.data);
  }

  async lockReport(tx: Tx, id: string): Promise<PaymentReport | undefined> {
    const [r] = await tx.select({ data: paymentReports.data }).from(paymentReports).where(eq(paymentReports.id, id)).for('update');
    return r?.data;
  }

  async referenceUsed(reference: string): Promise<boolean> {
    const [r] = await this.db.select({ id: paymentReports.id }).from(paymentReports).where(and(sql`upper(${paymentReports.reference}) = ${reference.toUpperCase()}`, ne(paymentReports.status, 'REJECTED')));
    return Boolean(r);
  }

  async countReports(): Promise<number> {
    const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(paymentReports);
    return r?.n ?? 0;
  }

  async saveReport(tx: Tx, p: PaymentReport, insert = false): Promise<void> {
    const values = { memberId: p.memberId, status: p.status, reference: p.reference, data: p };
    if (insert) await tx.insert(paymentReports).values({ id: p.id, ...values });
    else await tx.update(paymentReports).set(values).where(eq(paymentReports.id, p.id));
  }
}
