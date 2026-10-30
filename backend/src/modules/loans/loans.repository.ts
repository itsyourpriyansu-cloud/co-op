import type { ConsoleRole, Loan, LoanStatus, LoanSurety } from '@tgs/types';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { loans, staffUsers } from '../../models';

/** Columns are always derived from the document. */
export const loanColumns = (l: Loan) => ({
  applicationNo: l.applicationNo,
  loanNo: l.loanNo ?? null,
  memberId: l.memberId,
  product: l.product,
  status: l.status,
  parentLoanId: l.parentLoanId ?? null,
  channel: l.channel ?? null,
  appliedOn: l.appliedOn,
  appliedAmount: l.appliedAmount,
  appliedInstalments: l.appliedInstalments,
  sanctionedAmount: l.sanctionedAmount ?? null,
  emi: l.emi ?? null,
  outstandingPrincipal: l.outstandingPrincipal,
  sanctionLetterNo: l.sanctionLetterNo ?? null,
  data: l,
});

/** A list row read from columns only (the document is ~5 KB, mostly the schedule). */
export interface LoanLite {
  id: string;
  applicationNo: string;
  loanNo: string | null;
  memberId: string;
  product: Loan['product'];
  status: LoanStatus;
  parentLoanId: string | null;
  channel: string | null;
  appliedOn: string;
  appliedAmount: number;
  appliedInstalments: number;
  sanctionedAmount: number | null;
  emi: number | null;
  outstandingPrincipal: number;
  sureties: LoanSurety[];
  nextDue: { cycle: string; amount: number } | null;
}

export class LoansRepository {
  constructor(private readonly db: Database) {}

  /** Every loan as a light row; the next unpaid instalment from `cycle` is worked out in SQL. */
  async lite(cycle: string, where?: { memberId?: string; statuses?: LoanStatus[] }): Promise<LoanLite[]> {
    const c = loans;
    const conds = [where?.memberId ? eq(c.memberId, where.memberId) : undefined, where?.statuses ? inArray(c.status, where.statuses) : undefined].filter((x) => x !== undefined);
    return this.db
      .select({
        id: c.id,
        applicationNo: c.applicationNo,
        loanNo: c.loanNo,
        memberId: c.memberId,
        product: c.product,
        status: c.status,
        parentLoanId: c.parentLoanId,
        channel: c.channel,
        appliedOn: c.appliedOn,
        appliedAmount: c.appliedAmount,
        appliedInstalments: c.appliedInstalments,
        sanctionedAmount: c.sanctionedAmount,
        emi: c.emi,
        outstandingPrincipal: c.outstandingPrincipal,
        sureties: sql<LoanSurety[]>`coalesce(${c.data}->'sureties', '[]'::jsonb)`,
        nextDue: sql<{ cycle: string; amount: number } | null>`case when ${c.status} = 'ACTIVE' then (
          select jsonb_build_object('cycle', r->>'dueCycle', 'amount', (r->>'emi')::bigint)
          from jsonb_array_elements(${c.data}->'schedule') r
          where r->>'dueCycle' >= ${cycle} and r->>'paidStatus' <> 'PAID'
          order by r->>'dueCycle' limit 1) end`,
      })
      .from(c)
      .where(conds.length ? and(...conds) : undefined);
  }

  /** By id or application number. */
  async find(idOrNo: string, tx?: Tx): Promise<Loan | undefined> {
    const [row] = await (tx ?? this.db).select({ data: loans.data }).from(loans).where(or(eq(loans.id, idOrNo), eq(loans.applicationNo, idOrNo)));
    return row?.data;
  }

  async lock(tx: Tx, id: string): Promise<Loan | undefined> {
    const [row] = await tx.select({ data: loans.data }).from(loans).where(eq(loans.id, id)).for('update');
    return row?.data;
  }

  async forMember(memberId: string): Promise<Loan[]> {
    return (await this.db.select({ data: loans.data }).from(loans).where(eq(loans.memberId, memberId))).map((r) => r.data);
  }

  /** Loans (other than the borrower's) where this member is or was a surety. */
  async asSurety(memberId: string): Promise<Loan[]> {
    const rows = await this.db
      .select({ data: loans.data })
      .from(loans)
      .where(and(ne(loans.memberId, memberId), sql`${loans.data}->'sureties' @> ${JSON.stringify([{ memberId }])}::jsonb`));
    return rows.map((r) => r.data);
  }

  async byIds(ids: string[], tx?: Tx): Promise<Loan[]> {
    if (!ids.length) return [];
    return (await (tx ?? this.db).select({ data: loans.data }).from(loans).where(inArray(loans.id, ids))).map((r) => r.data);
  }

  /** Next APP-2026-00001 / LN-2026-00001 / SL-2026-0001 number, under a table lock. */
  async nextNumber(tx: Tx, kind: 'application' | 'loan' | 'sanction', year: string): Promise<string> {
    await tx.execute(sql`lock table ${loans} in share row exclusive mode`);
    const spec = { application: { col: loans.applicationNo, prefix: 'APP', pad: 5 }, loan: { col: loans.loanNo, prefix: 'LN', pad: 5 }, sanction: { col: loans.sanctionLetterNo, prefix: 'SL', pad: 4 } }[kind];
    const like = `${spec.prefix}-${year}-%`;
    const [row] = await tx.select({ top: sql<number>`coalesce(max(substring(${spec.col} from ${sql.raw(String(spec.prefix.length + 7))})::int), 0)` }).from(loans).where(sql`${spec.col} like ${like}`);
    return `${spec.prefix}-${year}-${String(Number(row?.top ?? 0) + 1).padStart(spec.pad, '0')}`;
  }

  async insert(tx: Tx, l: Loan): Promise<void> {
    await tx.insert(loans).values({ id: l.id, ...loanColumns(l) });
  }

  async save(tx: Tx, l: Loan): Promise<void> {
    await tx.update(loans).set({ ...loanColumns(l), updatedAt: sql`now()` }).where(eq(loans.id, l.id));
  }

  async remove(tx: Tx, id: string): Promise<void> {
    await tx.delete(loans).where(eq(loans.id, id));
  }

  /** The active staff member holding a role (demo controls act as them). */
  async staffByRole(role: ConsoleRole): Promise<{ id: string; name: string } | undefined> {
    const [row] = await this.db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers).where(and(eq(staffUsers.role, role), eq(staffUsers.status, 'ACTIVE')));
    return row;
  }

  /** The active holder of each staff role (who a loan is waiting on). */
  async staffNames(): Promise<Map<string, string>> {
    const rows = await this.db.select({ role: staffUsers.role, name: staffUsers.name }).from(staffUsers).where(and(ne(staffUsers.role, 'DDO'), eq(staffUsers.status, 'ACTIVE')));
    return new Map(rows.map((r) => [r.role, r.name]));
  }
}
