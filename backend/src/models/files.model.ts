import { customType, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * F-01 (D-096): stored files, encrypted (AES-256-GCM, a fresh IV per file) behind
 * integrations/file-store. Rows are never changed: a new upload is a new row, so a signed record
 * keeps pointing at the image that was current when it was signed.
 */
export const files = pgTable(
  'files',
  {
    id: text('id').primaryKey(),
    /** Member, applicant or staff user id. */
    ownerId: text('owner_id').notNull(),
    purpose: text('purpose').$type<'SIGNATURE'>().notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** SHA-256 of the plain file, recorded on what it signs. */
    sha256: text('sha256').notNull(),
    sealed: bytea('sealed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (t) => [index('files_owner_idx').on(t.ownerId, t.purpose, t.createdAt)],
);
