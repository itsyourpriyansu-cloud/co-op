import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { departments, staffUsers } from '../../models';

export type DepartmentRecord = typeof departments.$inferSelect;

export class DepartmentsRepository {
  constructor(private readonly db: Database) {}

  list(): Promise<DepartmentRecord[]> {
    return this.db.select().from(departments).orderBy(asc(departments.name));
  }

  async byId(id: string): Promise<DepartmentRecord | undefined> {
    const [row] = await this.db.select().from(departments).where(eq(departments.id, id));
    return row;
  }

  async codeTaken(code: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db.select({ id: departments.id }).from(departments).where(eq(departments.code, code));
    return Boolean(row && row.id !== exceptId);
  }

  async insert(tx: Tx, values: typeof departments.$inferInsert): Promise<void> {
    await tx.insert(departments).values(values);
  }

  async update(tx: Tx, id: string, values: Partial<typeof departments.$inferInsert>): Promise<void> {
    await tx.update(departments).set({ ...values, updatedAt: sql`now()` }).where(eq(departments.id, id));
  }

  /** DDO staff logins by department (docs/03 R5). */
  async ddoLogins(): Promise<Map<string, string>> {
    const rows = await this.db.select({ id: staffUsers.id, departmentId: staffUsers.departmentId }).from(staffUsers).where(eq(staffUsers.role, 'DDO'));
    return new Map(rows.filter((r) => r.departmentId).map((r) => [r.departmentId!, r.id]));
  }
}
