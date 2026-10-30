import type { LoanProductCode } from '@tgs/types';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { auditLog, loanProductVersions, notificationTemplates, settingsVersions, societyProfile } from '../../models';

export type ProductRow = typeof loanProductVersions.$inferSelect;
export type SettingsRow = typeof settingsVersions.$inferSelect;
export type TemplateRow = typeof notificationTemplates.$inferSelect;

export class MastersRepository {
  constructor(private readonly db: Database) {}

  // ---- settings (versioned document) ----
  async activeSettings(tx?: Tx): Promise<SettingsRow | undefined> {
    const [row] = await (tx ?? this.db).select().from(settingsVersions).where(eq(settingsVersions.status, 'ACTIVE'));
    return row;
  }

  settingsHistory(): Promise<SettingsRow[]> {
    return this.db.select().from(settingsVersions).orderBy(desc(settingsVersions.version));
  }

  /** Retire the active version and add the next one, in the caller's transaction. */
  async addSettingsVersion(tx: Tx, values: Pick<SettingsRow, 'data' | 'summary' | 'createdBy'>): Promise<SettingsRow> {
    // Row lock: two editors at once get consecutive versions, never two ACTIVE rows.
    await tx.execute(sql`select id from ${settingsVersions} where status = 'ACTIVE' for update`);
    const [{ last } = { last: 0 }] = await tx.select({ last: max(settingsVersions.version) }).from(settingsVersions);
    await tx.update(settingsVersions).set({ status: 'INACTIVE' }).where(eq(settingsVersions.status, 'ACTIVE'));
    const [row] = await tx.insert(settingsVersions).values({ ...values, version: (last ?? 0) + 1, status: 'ACTIVE' }).returning();
    return row!;
  }

  // ---- loan products (versioned rows) ----
  activeProducts(): Promise<ProductRow[]> {
    return this.db.select().from(loanProductVersions).where(eq(loanProductVersions.status, 'ACTIVE'));
  }

  async activeProduct(code: LoanProductCode, tx?: Tx): Promise<ProductRow | undefined> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(loanProductVersions)
      .where(and(eq(loanProductVersions.code, code), eq(loanProductVersions.status, 'ACTIVE')));
    return row;
  }

  productHistory(code: LoanProductCode): Promise<ProductRow[]> {
    return this.db.select().from(loanProductVersions).where(eq(loanProductVersions.code, code)).orderBy(desc(loanProductVersions.version));
  }

  async addProductVersion(tx: Tx, values: Omit<typeof loanProductVersions.$inferInsert, 'id' | 'version' | 'status' | 'createdAt'>): Promise<ProductRow> {
    await tx.execute(sql`select id from ${loanProductVersions} where code = ${values.code} and status = 'ACTIVE' for update`);
    const [{ last } = { last: 0 }] = await tx.select({ last: max(loanProductVersions.version) }).from(loanProductVersions).where(eq(loanProductVersions.code, values.code));
    await tx.update(loanProductVersions).set({ status: 'INACTIVE' }).where(and(eq(loanProductVersions.code, values.code), eq(loanProductVersions.status, 'ACTIVE')));
    const [row] = await tx.insert(loanProductVersions).values({ ...values, version: (last ?? 0) + 1, status: 'ACTIVE' }).returning();
    return row!;
  }

  // ---- society profile ----
  async society() {
    const [row] = await this.db.select().from(societyProfile).where(eq(societyProfile.id, 'profile'));
    return row;
  }

  async updateSociety(tx: Tx, values: { name: string; shortName: string; registrationNo: string; address: string; updatedBy: string }): Promise<void> {
    await tx
      .insert(societyProfile)
      .values({ id: 'profile', ...values })
      .onConflictDoUpdate({ target: societyProfile.id, set: { ...values, updatedAt: sql`now()` } });
  }

  // ---- notification templates ----
  templates(): Promise<TemplateRow[]> {
    return this.db.select().from(notificationTemplates).orderBy(notificationTemplates.key);
  }

  async template(key: string): Promise<TemplateRow | undefined> {
    const [row] = await this.db.select().from(notificationTemplates).where(eq(notificationTemplates.key, key));
    return row;
  }

  async updateTemplate(tx: Tx, key: string, values: Pick<TemplateRow, 'title' | 'body' | 'channels'>): Promise<void> {
    await tx.update(notificationTemplates).set({ ...values, updatedAt: sql`now()` }).where(eq(notificationTemplates.key, key));
  }

  // ---- change history shown on ST-60 ----
  recentChanges(entities: string[], limit: number) {
    return this.db.select().from(auditLog).where(inArray(auditLog.entity, entities)).orderBy(desc(auditLog.at)).limit(limit);
  }
}
