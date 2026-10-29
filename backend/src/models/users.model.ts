import type { AppRole, ConsoleRole, Permission, Role } from '@tgs/types';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// P1 identity tables (docs/22 §5.1). Primary keys keep the readable IDs the apps already use
// (stf-admin, mem-1101, apl-ravi), so the mock API and the backend agree on who is who.

const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Console users (docs/03 R1–R5). */
export const staffUsers = pgTable(
  'staff_users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    name: text('name').notNull(),
    role: text('role').$type<ConsoleRole>().notNull(),
    /** DDO only: the department they may see (docs/03 R5). */
    departmentId: text('department_id'),
    email: text('email'),
    mobile: text('mobile'),
    passwordHash: text('password_hash').notNull(),
    /** Must change the password at next sign-in (new user or reset by the Super Admin). */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    /** AES-GCM encrypted base32 secret (common/utils/crypto). */
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    status: text('status').$type<'ACTIVE' | 'INACTIVE'>().notNull().default('ACTIVE'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: ts('locked_until'),
    lastLoginAt: ts('last_login_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_users_username_uq').on(sql`lower(${t.username})`)],
);

/** Who may sign in to the Member App (members and applicants). The member master itself arrives in P4. */
export const appAccounts = pgTable(
  'app_accounts',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<AppRole>().notNull(),
    memberId: text('member_id'),
    applicantId: text('applicant_id'),
    generalNo: text('general_no'),
    employeeId: text('employee_id'),
    name: text('name').notNull(),
    mobile: text('mobile').notNull(),
    status: text('status').$type<'ACTIVE' | 'INACTIVE'>().notNull().default('ACTIVE'),
    lastLoginAt: ts('last_login_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_accounts_mobile_uq').on(t.mobile)],
);

/** One-time codes for member sign-in / sign-up (D-067). Only a hash of the code is stored. */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mobile: text('mobile').notNull(),
    purpose: text('purpose').$type<'LOGIN' | 'SIGNUP'>().notNull(),
    codeHash: text('code_hash').notNull(),
    channel: text('channel').$type<'WHATSAPP' | 'PUSH' | 'SIMULATED'>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('otp_challenges_mobile_created_idx').on(t.mobile, t.createdAt)],
);

/** Long-lived refresh tokens, stored hashed and rotated on every use. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Token family: every rotation of one sign-in shares it, so a reused old token can revoke them all. */
    familyId: uuid('family_id').notNull(),
    subjectType: text('subject_type').$type<'STAFF' | 'APP'>().notNull(),
    subjectId: text('subject_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    device: text('device'),
    ip: text('ip'),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    replacedBy: uuid('replaced_by'),
  },
  (t) => [uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash), index('refresh_tokens_subject_idx').on(t.subjectType, t.subjectId)],
);

/** Role → permission matrix (docs/03 §2). Seeded from @tgs/domain ROLE_PERMISSIONS; edited on ST-62. */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    role: text('role').$type<Role>().notNull(),
    permission: text('permission').$type<Permission>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.role, t.permission] })],
);
