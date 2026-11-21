import { and, asc, eq, sql } from 'drizzle-orm';
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

  /** Active DDO logins of one department, longest-standing first (docs/03 R5). */
  async ddoUsers(departmentId: string): Promise<Array<{ id: string; name: string }>> {
    return this.db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers).where(and(eq(staffUsers.role, 'DDO'), eq(staffUsers.status, 'ACTIVE'), eq(staffUsers.departmentId, departmentId))).orderBy(asc(staffUsers.createdAt), asc(staffUsers.id));
  }

  /**
   * D-142: the DDO login in charge of each department. A department may have many active DDO logins;
   * the one the Admin chose (departments.ddo_user_id) gets every DDO task, else the longest-standing one.
   */
  async ddoInCharge(): Promise<Map<string, { id: string; name: string }>> {
    const [depts, users] = await Promise.all([
      this.db.select({ id: departments.id, chosen: departments.ddoUserId }).from(departments),
      this.db.select({ id: staffUsers.id, name: staffUsers.name, departmentId: staffUsers.departmentId }).from(staffUsers).where(and(eq(staffUsers.role, 'DDO'), eq(staffUsers.status, 'ACTIVE'))).orderBy(asc(staffUsers.createdAt), asc(staffUsers.id)),
    ]);
    const out = new Map<string, { id: string; name: string }>();
    for (const d of depts) {
      const mine = users.filter((u) => u.departmentId === d.id);
      const pick = mine.find((u) => u.id === d.chosen) ?? mine[0];
      if (pick) out.set(d.id, { id: pick.id, name: pick.name });
    }
    return out;
  }

  async ddoLoginNames(): Promise<Map<string, string>> {
    return new Map([...(await this.ddoInCharge())].map(([dept, u]) => [dept, u.name]));
  }

  /** The DDO login in charge, by department (docs/03 R5, D-142). */
  async ddoLogins(): Promise<Map<string, string>> {
    return new Map([...(await this.ddoInCharge())].map(([dept, u]) => [dept, u.id]));
  }
}
