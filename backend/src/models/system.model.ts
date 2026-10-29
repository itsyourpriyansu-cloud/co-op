import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Key/value facts about this database itself: which seed was loaded, when, and from which
 * data version. Business tables arrive phase by phase (docs/22 §5).
 */
export const systemInfo = pgTable('system_info', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
