import type { Address, Member, MemberStatus, Nominee, PayProfile, RecoveryMandate, ServiceEventType } from '@tgs/types';
import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { departments } from './masters.model';

// P4a members (docs/22 §5.4). Scalars the office searches and filters on are columns; value objects
// that are always read whole (addresses, nominee, pay profile) are jsonb. Ids keep the apps' format
// (mem-1101) so the mock, the apps and the ledger (member_id on lines) agree.

const day = (name: string) => date(name, { mode: 'string' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    /** Society membership number on every form (Q-501 [S]). */
    generalNo: text('general_no').notNull(),
    /** Government service number (Q-501 [S]). */
    employeeId: text('employee_id').notNull(),
    name: text('name').notNull(),
    fatherName: text('father_name').notNull(),
    gender: text('gender').$type<Member['gender']>().notNull(),
    dob: day('dob').notNull(),
    mobile: text('mobile').notNull(),
    email: text('email'),
    presentAddress: jsonb('present_address').$type<Address>().notNull(),
    permanentAddress: jsonb('permanent_address').$type<Address>().notNull(),
    designation: text('designation').notNull(),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    doj: day('doj').notNull(),
    dor: day('dor').notNull(),
    employmentType: text('employment_type').$type<Member['employmentType']>().notNull(),
    numberOfShares: integer('number_of_shares').notNull(),
    nominee: jsonb('nominee').$type<Nominee>().notNull(),
    payProfile: jsonb('pay_profile').$type<PayProfile>().notNull(),
    anniversaryDate: day('anniversary_date'),
    status: text('status').$type<MemberStatus>().notNull(),
    portalActivated: boolean('portal_activated').notNull().default(false),
    joinedSocietyOn: day('joined_society_on').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('members_general_no_uq').on(t.generalNo),
    uniqueIndex('members_employee_id_uq').on(t.employeeId),
    index('members_department_idx').on(t.departmentId),
    index('members_status_idx').on(t.status),
    index('members_name_idx').on(t.name),
  ],
);

/** ST-12 service history (joined, transferred, designation, retirement date, profile edits). */
export const serviceEvents = pgTable(
  'service_events',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    type: text('type').$type<ServiceEventType>().notNull(),
    date: day('date').notNull(),
    summary: text('summary').notNull(),
    effectiveCycle: text('effective_cycle'),
    byName: text('by_name'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('service_events_member_idx').on(t.memberId, t.date)],
);

/** BR-028 salary-recovery mandate (forms F5/F6): the member's DDO must agree it. */
export const recoveryMandates = pgTable(
  'recovery_mandates',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    status: text('status').$type<RecoveryMandate['status']>().notNull(),
    signedOn: day('signed_on').notNull(),
    agreedOn: day('agreed_on'),
    agreedByName: text('agreed_by_name'),
  },
  (t) => [index('recovery_mandates_member_idx').on(t.memberId), index('recovery_mandates_department_idx').on(t.departmentId, t.status)],
);

/** BR-010 department transfers (ST-13): effective from the next demand cycle not yet generated. */
export const memberTransfers = pgTable(
  'member_transfers',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    fromDepartmentId: text('from_department_id').notNull(),
    toDepartmentId: text('to_department_id').notNull(),
    effectiveCycle: text('effective_cycle').notNull(),
    effectiveDate: day('effective_date'),
    orderRef: text('order_ref').notNull(),
    remarks: text('remarks'),
    recordedAt: ts('recorded_at'),
    recordedByName: text('recorded_by_name'),
  },
  (t) => [index('member_transfers_member_idx').on(t.memberId)],
);
