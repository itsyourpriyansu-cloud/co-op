import type { DemandComponent, DemandLine, DemandSheet, MemberNotice, SuretyRecovery, DemandSheetStatus, PaymentReport, PaymentReportStatus, Receipt, ReceiptSource } from '@tgs/types';
import { bigint, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { departments } from './masters.model';
import { members } from './members.model';

const day = (name: string) => date(name, { mode: 'string' });
const money = (name: string) => bigint(name, { mode: 'number' });

// P7 demand & collections (docs/22 §5.6). Totals, statuses and keys lists filter on are columns;
// sign-offs, components and allocations are jsonb, always read and written whole.

/** One per member (BR-004 share deposit, BR-032 share capital). */
export const shareAccounts = pgTable('share_accounts', {
  memberId: text('member_id')
    .primaryKey()
    .references(() => members.id),
  numberOfShares: integer('number_of_shares').notNull(),
  shareCapital: money('share_capital').notNull(),
  shareDepositBalance: money('share_deposit_balance').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** ST-40…43: one sheet per department per cycle; its member lines live in demand_lines. */
export const demandSheets = pgTable(
  'demand_sheets',
  {
    id: text('id').primaryKey(),
    cycle: text('cycle').notNull(),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    status: text('status').$type<DemandSheetStatus>().notNull(),
    totalDemand: money('total_demand').notNull(),
    totalRecovered: money('total_recovered').notNull(),
    data: jsonb('data').$type<Omit<DemandSheet, 'lines'>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('demand_sheets_cycle_dept_idx').on(t.cycle, t.departmentId), index('demand_sheets_status_idx').on(t.status)],
);

export const demandLines = pgTable(
  'demand_lines',
  {
    sheetId: text('sheet_id')
      .notNull()
      .references(() => demandSheets.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    cycle: text('cycle').notNull(),
    components: jsonb('components').$type<DemandComponent[]>().notNull(),
    totalDemand: money('total_demand').notNull(),
    recovered: money('recovered'),
    /** P7b (D-088): the deduction entered before posting (amount, source, who, note). */
    entry: jsonb('entry').$type<Pick<DemandLine, 'deducted' | 'entrySource' | 'enteredByName' | 'enteredAt' | 'note' | 'penal'>>(),
  },
  (t) => [primaryKey({ columns: [t.sheetId, t.memberId] }), index('demand_lines_member_idx').on(t.memberId)],
);

/** ST-44…46: every receipt (salary recovery, counter, FD payment, verified member payment). */
export const receipts = pgTable(
  'receipts',
  {
    id: text('id').primaryKey(),
    receiptNo: text('receipt_no').notNull(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    date: day('date').notNull(),
    source: text('source').$type<ReceiptSource>().notNull(),
    amount: money('amount').notNull(),
    cycle: text('cycle'),
    sheetId: text('sheet_id'),
    sortAt: text('sort_at').notNull(),
    data: jsonb('data').$type<Receipt>().notNull(),
  },
  (t) => [uniqueIndex('receipts_no_idx').on(t.receiptNo), index('receipts_member_idx').on(t.memberId), index('receipts_date_idx').on(t.date), index('receipts_sort_idx').on(t.sortAt)],
);

/** MB-18 / ST-47: a payment the member reports (QR / transfer), verified by the Cashier. */
export const paymentReports = pgTable(
  'payment_reports',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    status: text('status').$type<PaymentReportStatus>().notNull(),
    reference: text('reference').notNull(),
    data: jsonb('data').$type<PaymentReport>().notNull(),
  },
  (t) => [index('payment_reports_member_idx').on(t.memberId), index('payment_reports_status_idx').on(t.status)],
);

/**
 * P7b-3 (D-088, Q-310): notices to a defaulting borrower and to every surety of the loan. One per
 * recipient, loan and cycle, so posting again (or a retry) never sends a second one.
 */
export const memberNotices = pgTable(
  'member_notices',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<MemberNotice['kind']>().notNull(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    borrowerId: text('borrower_id').notNull(),
    loanId: text('loan_id').notNull(),
    cycle: text('cycle').notNull(),
    data: jsonb('data').$type<MemberNotice>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('member_notices_once_idx').on(t.kind, t.memberId, t.loanId, t.cycle), index('member_notices_member_idx').on(t.memberId)],
);

/** F-13 (D-097): a surety's share of a borrower's overdue loan; status and keys are columns, the rest is read and written whole. */
export const suretyRecoveries = pgTable(
  'surety_recoveries',
  {
    id: text('id').primaryKey(),
    loanId: text('loan_id').notNull(),
    suretyId: text('surety_id')
      .notNull()
      .references(() => members.id),
    status: text('status').$type<SuretyRecovery['status']>().notNull(),
    data: jsonb('data').$type<SuretyRecovery>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('surety_recoveries_loan_idx').on(t.loanId), index('surety_recoveries_surety_idx').on(t.suretyId, t.status)],
);
