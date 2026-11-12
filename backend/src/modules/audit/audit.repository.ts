import type { AuditLogEntry, AuditLogParams } from '@tgs/types';
import { and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { auditLog } from '../../models';

export type AuditRow = typeof auditLog.$inferInsert;

const listColumns = { id: auditLog.id, at: auditLog.at, actorId: auditLog.actorId, actorName: auditLog.actorName, actorRole: auditLog.actorRole, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, summary: auditLog.summary, ip: auditLog.ip };
const toEntry = <T extends { at: Date }>(r: T) => ({ ...r, at: r.at.toISOString() });

export class AuditRepository {
  constructor(private readonly db: Database) {}

  async insert(row: AuditRow, tx?: Tx): Promise<void> {
    await (tx ?? this.db).insert(auditLog).values(row);
  }

  recent(limit = 50, entity?: string) {
    const q = this.db.select().from(auditLog);
    return (entity ? q.where(eq(auditLog.entity, entity)) : q).orderBy(desc(auditLog.at)).limit(limit);
  }

  /** G1 (D-111): newest first, filtered by text, entity, person and IST date range. */
  async list(p: Required<Pick<AuditLogParams, 'page' | 'pageSize'>> & AuditLogParams): Promise<{ items: AuditLogEntry[]; total: number }> {
    const where: SQL[] = [];
    if (p.q) {
      const like = `%${p.q.replace(/[%_\\]/g, '\\$&')}%`;
      where.push(or(ilike(auditLog.summary, like), ilike(auditLog.actorName, like), ilike(auditLog.entityId, like), ilike(auditLog.action, like))!);
    }
    if (p.entity) where.push(eq(auditLog.entity, p.entity));
    if (p.actorId) where.push(eq(auditLog.actorId, p.actorId));
    // Dates are the society's calendar days (IST).
    if (p.from) where.push(gte(auditLog.at, sql`(${p.from}::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`));
    if (p.to) where.push(lt(auditLog.at, sql`((${p.to}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata'`));
    const cond = where.length ? and(...where) : undefined;
    const [rows, [total]] = await Promise.all([
      this.db.select(listColumns).from(auditLog).where(cond).orderBy(desc(auditLog.at)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
      this.db.select({ n: count() }).from(auditLog).where(cond),
    ]);
    return { items: rows.map(toEntry), total: total?.n ?? 0 };
  }

  async get(id: string): Promise<AuditLogEntry | undefined> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
    const [row] = await this.db.select().from(auditLog).where(eq(auditLog.id, id));
    return row ? toEntry(row) : undefined;
  }

  async entities(): Promise<string[]> {
    return (await this.db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(auditLog.entity)).map((r) => r.entity);
  }
}
