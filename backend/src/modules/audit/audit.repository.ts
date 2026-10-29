import { desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { auditLog } from '../../models';

export type AuditRow = typeof auditLog.$inferInsert;

export class AuditRepository {
  constructor(private readonly db: Database) {}

  async insert(row: AuditRow, tx?: Tx): Promise<void> {
    await (tx ?? this.db).insert(auditLog).values(row);
  }

  recent(limit = 50, entity?: string) {
    const q = this.db.select().from(auditLog);
    return (entity ? q.where(eq(auditLog.entity, entity)) : q).orderBy(desc(auditLog.at)).limit(limit);
  }
}
