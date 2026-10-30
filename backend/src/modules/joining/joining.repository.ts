import type { ConsoleRole, MembershipApplication } from '@tgs/types';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { membershipApplications, staffUsers } from '../../models';

const columns = (a: MembershipApplication) => ({
  applicationNo: a.applicationNo,
  applicantId: a.applicantId,
  status: a.status,
  departmentId: a.departmentId || null,
  allottedGeneralNo: a.allottedGeneralNo ?? null,
  data: a,
});

export class JoiningRepository {
  constructor(private readonly db: Database) {}

  async all(): Promise<MembershipApplication[]> {
    return (await this.db.select({ data: membershipApplications.data }).from(membershipApplications)).map((r) => r.data);
  }

  async find(id: string, tx?: Tx): Promise<MembershipApplication | undefined> {
    const [row] = await (tx ?? this.db).select({ data: membershipApplications.data }).from(membershipApplications).where(eq(membershipApplications.id, id));
    return row?.data;
  }

  /** Locks the row: two people acting on one application never both win. */
  async lock(tx: Tx, id: string): Promise<MembershipApplication | undefined> {
    const [row] = await tx.select({ data: membershipApplications.data }).from(membershipApplications).where(eq(membershipApplications.id, id)).for('update');
    return row?.data;
  }

  async byApplicant(applicantId: string): Promise<MembershipApplication | undefined> {
    const [row] = await this.db.select({ data: membershipApplications.data }).from(membershipApplications).where(eq(membershipApplications.applicantId, applicantId));
    return row?.data;
  }

  async byGeneralNo(generalNo: string): Promise<MembershipApplication | undefined> {
    const [row] = await this.db.select({ data: membershipApplications.data }).from(membershipApplications).where(eq(membershipApplications.allottedGeneralNo, generalNo));
    return row?.data;
  }

  /** Next MEM-2026-0001 style number, under a table lock so two sign-ups never share one. */
  async nextApplicationNo(tx: Tx, year: string): Promise<string> {
    await tx.execute(sql`lock table ${membershipApplications} in share row exclusive mode`);
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(membershipApplications);
    return `MEM-${year}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
  }

  /** Next SH-2026-0001 share receipt number (caller holds the row lock; receipts are rare). */
  async nextReceiptNo(tx: Tx, year: string): Promise<string> {
    await tx.execute(sql`lock table ${membershipApplications} in share row exclusive mode`);
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(membershipApplications).where(sql`${membershipApplications.data} ? 'shareReceipt'`);
    return `SH-${year}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
  }

  async insert(tx: Tx, a: MembershipApplication): Promise<void> {
    await tx.insert(membershipApplications).values({ id: a.id, ...columns(a) });
  }

  async save(tx: Tx, a: MembershipApplication): Promise<void> {
    await tx.update(membershipApplications).set({ ...columns(a), updatedAt: sql`now()` }).where(eq(membershipApplications.id, a.id));
  }

  /** The active staff member holding a role (stage owners and demo controls act as them). */
  async staffByRole(role: ConsoleRole): Promise<{ id: string; name: string } | undefined> {
    const [row] = await this.db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers).where(and(eq(staffUsers.role, role), eq(staffUsers.status, 'ACTIVE')));
    return row;
  }
}
