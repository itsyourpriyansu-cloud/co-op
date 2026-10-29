import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { appAccounts, otpChallenges, refreshTokens, staffUsers } from '../../models';

export type StaffRow = typeof staffUsers.$inferSelect;
export type AppAccountRow = typeof appAccounts.$inferSelect;
export type OtpRow = typeof otpChallenges.$inferSelect;
export type RefreshRow = typeof refreshTokens.$inferSelect;

export class AuthRepository {
  constructor(private readonly db: Database) {}

  // ---- staff ----
  async staffByUsername(username: string): Promise<StaffRow | undefined> {
    const [row] = await this.db.select().from(staffUsers).where(sql`lower(${staffUsers.username}) = ${username.trim().toLowerCase()}`);
    return row;
  }

  async staffById(id: string): Promise<StaffRow | undefined> {
    const [row] = await this.db.select().from(staffUsers).where(eq(staffUsers.id, id));
    return row;
  }

  async updateStaff(id: string, values: Partial<typeof staffUsers.$inferInsert>, tx?: Tx): Promise<void> {
    await (tx ?? this.db).update(staffUsers).set({ ...values, updatedAt: sql`now()` }).where(eq(staffUsers.id, id));
  }

  // ---- member app accounts ----
  async appByMobile(mobile: string): Promise<AppAccountRow | undefined> {
    const [row] = await this.db.select().from(appAccounts).where(eq(appAccounts.mobile, mobile));
    return row;
  }

  async appById(id: string): Promise<AppAccountRow | undefined> {
    const [row] = await this.db.select().from(appAccounts).where(eq(appAccounts.id, id));
    return row;
  }

  async insertApp(values: typeof appAccounts.$inferInsert, tx?: Tx): Promise<AppAccountRow> {
    const [row] = await (tx ?? this.db).insert(appAccounts).values(values).returning();
    return row!;
  }

  async touchAppLogin(id: string, tx?: Tx): Promise<void> {
    await (tx ?? this.db).update(appAccounts).set({ lastLoginAt: sql`now()` }).where(eq(appAccounts.id, id));
  }

  // ---- OTP ----
  async insertOtp(values: typeof otpChallenges.$inferInsert): Promise<OtpRow> {
    const [row] = await this.db.insert(otpChallenges).values(values).returning();
    return row!;
  }

  async otpById(id: string): Promise<OtpRow | undefined> {
    const [row] = await this.db.select().from(otpChallenges).where(eq(otpChallenges.id, id));
    return row;
  }

  async bumpOtpAttempts(id: string): Promise<void> {
    await this.db.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` }).where(eq(otpChallenges.id, id));
  }

  /** Marks the code used; false if it was already used (two taps at once). */
  async consumeOtp(id: string, tx: Tx): Promise<boolean> {
    const rows = await tx
      .update(otpChallenges)
      .set({ consumedAt: sql`now()` })
      .where(and(eq(otpChallenges.id, id), isNull(otpChallenges.consumedAt)))
      .returning({ id: otpChallenges.id });
    return rows.length === 1;
  }

  async otpsSince(mobile: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.mobile, mobile), gt(otpChallenges.createdAt, since)));
    return row?.n ?? 0;
  }

  // ---- refresh tokens ----
  async insertRefresh(values: typeof refreshTokens.$inferInsert, tx?: Tx): Promise<RefreshRow> {
    const [row] = await (tx ?? this.db).insert(refreshTokens).values(values).returning();
    return row!;
  }

  async refreshByHash(tokenHash: string): Promise<RefreshRow | undefined> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    return row;
  }

  async markRefreshReplaced(id: string, replacedBy: string, tx: Tx): Promise<boolean> {
    const rows = await tx
      .update(refreshTokens)
      .set({ revokedAt: sql`now()`, replacedBy })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    return rows.length === 1;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.update(refreshTokens).set({ revokedAt: sql`now()` }).where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeSubject(subjectType: 'STAFF' | 'APP', subjectId: string, tx?: Tx): Promise<void> {
    await (tx ?? this.db)
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.subjectType, subjectType), eq(refreshTokens.subjectId, subjectId), isNull(refreshTokens.revokedAt)));
  }
}
