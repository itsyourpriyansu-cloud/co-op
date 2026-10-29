import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { refreshTokens, staffUsers } from '../../models';

export type StaffUserRow = typeof staffUsers.$inferSelect;

export class UsersRepository {
  constructor(private readonly db: Database) {}

  list(): Promise<StaffUserRow[]> {
    return this.db.select().from(staffUsers).orderBy(asc(staffUsers.name));
  }

  async byId(id: string): Promise<StaffUserRow | undefined> {
    const [row] = await this.db.select().from(staffUsers).where(eq(staffUsers.id, id));
    return row;
  }

  async usernameTaken(username: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(sql`lower(${staffUsers.username}) = ${username.toLowerCase()}`);
    return Boolean(row && row.id !== exceptId);
  }

  async insert(values: typeof staffUsers.$inferInsert, tx: Tx): Promise<void> {
    await tx.insert(staffUsers).values(values);
  }

  async update(id: string, values: Partial<typeof staffUsers.$inferInsert>, tx: Tx): Promise<void> {
    await tx.update(staffUsers).set({ ...values, updatedAt: sql`now()` }).where(eq(staffUsers.id, id));
  }

  /** Ends every sign-in of a staff user (deactivated, role changed, password or authenticator reset). */
  async revokeSessions(staffId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.subjectType, 'STAFF'), eq(refreshTokens.subjectId, staffId), isNull(refreshTokens.revokedAt)));
  }
}
