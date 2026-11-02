import type { DemandComponent, DemandSheet, DemandSheetStatus, PaymentReport, PaymentReportStatus, Receipt, ReceiptSource } from '@tgs/types';
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
