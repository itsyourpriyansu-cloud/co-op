import type { Loan, LoanProductCode, LoanStatus } from '@tgs/types';
import { bigint, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { members } from './members.model';

const day = (name: string) => date(name, { mode: 'string' });
const money = (name: string) => bigint(name, { mode: 'number' });

/**
 * P5 loans (docs/22 §5.5). What lists filter, sort and total on are columns; the loan itself
 * (sureties, schedule, events, form, sign-offs, sanction sheet) is one jsonb document, read and
 * written whole. Columns are always written from the document, so they never disagree.
 */
export const loans = pgTable(
  'loans',
  {
    id: text('id').primaryKey(),
    applicationNo: text('application_no').notNull(),
    loanNo: text('loan_no'),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    product: text('product').$type<LoanProductCode>().notNull(),
    status: text('status').$type<LoanStatus>().notNull(),
    parentLoanId: text('parent_loan_id'),
    channel: text('channel'),
    appliedOn: day('applied_on').notNull(),
    appliedAmount: money('applied_amount').notNull(),
    appliedInstalments: integer('applied_instalments').notNull(),
    sanctionedAmount: money('sanctioned_amount'),
    emi: money('emi'),
    outstandingPrincipal: money('outstanding_principal').notNull(),
    sanctionLetterNo: text('sanction_letter_no'),
    data: jsonb('data').$type<Loan>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('loans_application_no_idx').on(t.applicationNo),
    uniqueIndex('loans_loan_no_idx').on(t.loanNo),
    index('loans_member_idx').on(t.memberId),
    index('loans_status_idx').on(t.status),
  ],
);
