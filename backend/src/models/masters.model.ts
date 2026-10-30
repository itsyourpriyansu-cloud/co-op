import type { Department, EmiMethod, LoanProductCode, NotificationChannel, NotificationTemplate, SocietySettings } from '@tgs/types';
import { sql } from 'drizzle-orm';
import { bigint, boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// P2 master files (docs/22 §5, REQ-130). Versioned masters are never edited in place: a change
// inserts a new version and makes it the one ACTIVE row; older versions stay for history and for
// the loans, deposits and demand lines that used them (P5–P7 store the version id).

const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: 'number' });
const rate = (name: string) => numeric(name, { precision: 7, scale: 3, mode: 'number' });

export type VersionStatus = 'ACTIVE' | 'INACTIVE';

/** ST-64 loan products, one row per version. */
export const loanProductVersions = pgTable(
  'loan_product_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').$type<LoanProductCode>().notNull(),
    version: integer('version').notNull(),
    status: text('status').$type<VersionStatus>().notNull(),
    name: text('name').notNull(),
    ratePercent: rate('rate_percent').notNull(),
    minAmount: money('min_amount').notNull(),
    maxAmount: money('max_amount').notNull(),
    maxInstalments: integer('max_instalments').notNull(),
    maxConcurrent: integer('max_concurrent').notNull(),
    depositMarginPercent: rate('deposit_margin_percent').notNull(),
    penalRatePercent: rate('penal_rate_percent').notNull(),
    suretiesRequired: integer('sureties_required').notNull(),
    ddoCertificationRequired: boolean('ddo_certification_required').notNull(),
    shareDepositPercent: rate('share_deposit_percent').notNull(),
    topupAllowed: boolean('topup_allowed').notNull(),
    emiMethod: text('emi_method').$type<EmiMethod>().notNull(),
    /** Value not yet confirmed by the society (docs/09). */
    placeholder: boolean('placeholder').notNull(),
    summary: text('summary').notNull(),
    createdBy: text('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('loan_product_versions_code_version_uq').on(t.code, t.version),
    uniqueIndex('loan_product_versions_one_active_uq').on(t.code).where(sql`${t.status} = 'ACTIVE'`),
  ],
);

/**
 * ST-60/65/66 society settings (shares, fees, insurance, RRF/CRD/SRDS, FD slabs, limits), one
 * document per version. The whole document is versioned so a deposit or demand line can point at
 * exactly the rules it used.
 */
export const settingsVersions = pgTable(
  'settings_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: integer('version').notNull(),
    status: text('status').$type<VersionStatus>().notNull(),
    data: jsonb('data').$type<SocietySettings>().notNull(),
    summary: text('summary').notNull(),
    createdBy: text('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('settings_versions_version_uq').on(t.version), uniqueIndex('settings_versions_one_active_uq').on(t.status).where(sql`${t.status} = 'ACTIVE'`)],
);

/** ST-60 society profile: one row (changes are audited). */
export const societyProfile = pgTable('society_profile', {
  id: text('id').primaryKey().default('profile'),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  registrationNo: text('registration_no').notNull(),
  address: text('address').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** ST-67 departments and their DDO (docs/03 R5). */
export const departments = pgTable(
  'departments',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<Department['kind']>().notNull(),
    ddoName: text('ddo_name').notNull(),
    ddoDesignation: text('ddo_designation').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('departments_code_uq').on(t.code)],
);

/** ST-63 message templates (wording per event). */
export const notificationTemplates = pgTable('notification_templates', {
  key: text('key').primaryKey(),
  event: text('event').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  channels: jsonb('channels').$type<NotificationChannel[]>().notNull(),
  audience: text('audience').$type<NotificationTemplate['audience']>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
