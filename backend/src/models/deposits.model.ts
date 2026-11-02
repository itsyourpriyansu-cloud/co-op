import type { DepositAccount, DepositScheme, DepositStatus } from '@tgs/types';
import { bigint, date, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { members } from './members.model';

const day = (name: string) => date(name, { mode: 'string' });
const money = (name: string) => bigint(name, { mode: 'number' });

/**
 * P6 deposits (docs/22): FDs, CRD, SRDS and the closed savings scheme. What lists filter and total
 * on are columns; the account (holders, nominee, payment, sign-offs, events) is one jsonb document.
 * Columns are always written from the document.
 */
export const deposits = pgTable(
  'deposits',
  {
    id: text('id').primaryKey(),
    accountNo: text('account_no').notNull(),
    fdrNo: text('fdr_no'),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    scheme: text('scheme').$type<DepositScheme>().notNull(),
    status: text('status').$type<DepositStatus>().notNull(),
    openedOn: day('opened_on').notNull(),
    maturityDate: day('maturity_date'),
    principal: money('principal'),
    balance: money('balance').notNull(),
    pledgedToLoanId: text('pledged_to_loan_id'),
    data: jsonb('data').$type<DepositAccount>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('deposits_account_no_idx').on(t.accountNo), uniqueIndex('deposits_fdr_no_idx').on(t.fdrNo), index('deposits_member_idx').on(t.memberId), index('deposits_scheme_status_idx').on(t.scheme, t.status)],
);
