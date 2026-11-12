import { index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * G1 (D-111): one row per `Idempotency-Key` a signed-in user sent on a POST. A repeat with the same
 * key gets the stored answer back instead of running again (a phone retrying after a time-out).
 * Only successful answers are kept; a failed request frees its key. Rows older than 2 days are purged.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').$type<'IN_PROGRESS' | 'DONE'>().notNull(),
    statusCode: integer('status_code'),
    responseBody: text('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] }), index('idempotency_keys_created_idx').on(t.createdAt)],
);
