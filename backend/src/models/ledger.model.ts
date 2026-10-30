import type { LedgerAccountType } from '@tgs/domain';
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

// P3 ledger (REQ-131, docs/22 §3 + §5.3): double entry. Every amount the society receives, pays,
// lends or owes is a journal entry whose debit lines equal its credit lines. Entries and lines are
// append-only (database triggers refuse UPDATE and DELETE); a correction is a reversing entry.
// Member sub-ledgers are a dimension on the line (member_id), not separate accounts.

const money = (name: string) => bigint(name, { mode: 'number' });

/** Chart of accounts [P] (Q-401): seeded, editable later by the Accountant. */
export const ledgerAccounts = pgTable('ledger_accounts', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<LedgerAccountType>().notNull(),
  /** Lines on this account must say which member they belong to (loans, shares, deposits). */
  memberLevel: boolean('member_level').notNull().default(false),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  description: text('description'),
});

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human number, in posting order: JE-000001. */
    entryNo: integer('entry_no').generatedAlwaysAsIdentity().notNull(),
    /** Business date (India), may be earlier than the posting time (e.g. a recovery for last month). */
    entryDate: date('entry_date', { mode: 'string' }).notNull(),
    narration: text('narration').notNull(),
    /** What produced it: OPENING, MANUAL, REVERSAL; later LOAN_DISBURSEMENT, RECEIPT, FD_PAYMENT, … */
    source: text('source').notNull(),
    sourceRef: text('source_ref'),
    /** Set on a reversing entry; one reversal per entry. */
    reversesEntryId: uuid('reverses_entry_id').references((): AnyPgColumn => journalEntries.id),
    total: money('total').notNull(),
    postedBy: text('posted_by').notNull(),
    postedByName: text('posted_by_name').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('journal_entries_entry_no_uq').on(t.entryNo),
    uniqueIndex('journal_entries_reverses_uq').on(t.reversesEntryId),
    index('journal_entries_date_idx').on(t.entryDate),
    index('journal_entries_source_idx').on(t.source, t.sourceRef),
  ],
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id),
    lineNo: integer('line_no').notNull(),
    accountCode: text('account_code')
      .notNull()
      .references(() => ledgerAccounts.code),
    memberId: text('member_id'),
    /** What the line is about: LOAN / DEPOSIT / RECEIPT / SHARE … and its id. */
    refType: text('ref_type'),
    refId: text('ref_id'),
    debit: money('debit').notNull().default(0),
    credit: money('credit').notNull().default(0),
  },
  (t) => [
    check('journal_lines_one_side', sql`${t.debit} >= 0 and ${t.credit} >= 0 and (${t.debit} = 0) <> (${t.credit} = 0)`),
    uniqueIndex('journal_lines_entry_line_uq').on(t.entryId, t.lineNo),
    index('journal_lines_account_idx').on(t.accountCode),
    index('journal_lines_member_idx').on(t.memberId),
    index('journal_lines_ref_idx').on(t.refType, t.refId),
  ],
);
