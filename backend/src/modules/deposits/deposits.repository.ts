import type { DepositAccount, DepositScheme } from '@tgs/types';
import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { deposits } from '../../models';

/** Columns are always derived from the document. */
export const depositColumns = (d: DepositAccount) => ({
  accountNo: d.accountNo,
  fdrNo: d.fdrNo ?? null,
  memberId: d.memberId,
  scheme: d.scheme,
  status: d.status,
  openedOn: d.openedOn,
  maturityDate: d.maturityDate ?? null,
  principal: d.principal ?? null,
  balance: d.balance,
  pledgedToLoanId: d.pledgedToLoanId ?? null,
  data: d,
});

export class DepositsRepository {
  constructor(private readonly db: Database) {}

  async list(scheme?: DepositScheme): Promise<DepositAccount[]> {
    return (await this.db.select({ data: deposits.data }).from(deposits).where(scheme ? eq(deposits.scheme, scheme) : undefined)).map((r) => r.data);
  }

  /** By id, FDR No. or account No. */
  async find(ref: string, tx?: Tx): Promise<DepositAccount | undefined> {
    const [row] = await (tx ?? this.db).select({ data: deposits.data }).from(deposits).where(or(eq(deposits.id, ref), eq(deposits.fdrNo, ref), eq(deposits.accountNo, ref)));
    return row?.data;
  }

  async lock(tx: Tx, id: string): Promise<DepositAccount | undefined> {
    const [row] = await tx.select({ data: deposits.data }).from(deposits).where(eq(deposits.id, id)).for('update');
    return row?.data;
  }

  /** A member's CRD or SRDS account, locked for a recovery. */
  async lockCompulsory(tx: Tx, memberId: string, scheme: DepositScheme): Promise<DepositAccount | undefined> {
    const [row] = await tx.select({ data: deposits.data }).from(deposits).where(and(eq(deposits.memberId, memberId), eq(deposits.scheme, scheme))).limit(1).for('update');
    return row?.data;
  }

  async forMember(memberId: string): Promise<DepositAccount[]> {
    return (await this.db.select({ data: deposits.data }).from(deposits).where(eq(deposits.memberId, memberId))).map((r) => r.data);
  }

  async byIds(ids: string[], tx?: Tx): Promise<DepositAccount[]> {
    if (!ids.length) return [];
    return (await (tx ?? this.db).select({ data: deposits.data }).from(deposits).where(inArray(deposits.id, ids))).map((r) => r.data);
  }

  /** Next REQ-0001 request number, or FD-00001 account number, under a table lock. */
  async nextNumber(tx: Tx, prefix: 'REQ' | 'FD' | 'VR'): Promise<number> {
    await tx.execute(sql`lock table ${deposits} in share row exclusive mode`);
    if (prefix === 'VR') {
      const [row] = await tx.select({ n: sql<number>`coalesce(sum(jsonb_array_length(coalesce(${deposits.data}->'vouchers', '[]'::jsonb))), 0)::int` }).from(deposits);
      return (row?.n ?? 0) + 1;
    }
    if (prefix === 'REQ') {
      const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(deposits).where(like(deposits.accountNo, 'REQ-%'));
      return (row?.n ?? 0) + 1;
    }
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(deposits).where(and(eq(deposits.scheme, 'FD'), sql`${deposits.fdrNo} is not null`));
    return (row?.n ?? 0) + 1;
  }

  async insert(tx: Tx, d: DepositAccount): Promise<void> {
    await tx.insert(deposits).values({ id: d.id, ...depositColumns(d) });
  }

  async save(tx: Tx, d: DepositAccount): Promise<void> {
    await tx.update(deposits).set({ ...depositColumns(d), updatedAt: sql`now()` }).where(eq(deposits.id, d.id));
  }
}
