// Roles and permissions (docs/03-roles-permissions.md).
// Console roles never log into the Member App and vice versa (D-033).

export const CONSOLE_ROLES = [
  'SUPER_ADMIN',
  'ACCOUNTANT',
  'SECRETARY',
  'PRESIDENT',
  'CASHIER',
  'DDO',
] as const;

export const APP_ROLES = ['MEMBER', 'APPLICANT'] as const;

export type ConsoleRole = (typeof CONSOLE_ROLES)[number];
export type AppRole = (typeof APP_ROLES)[number];
export type Role = ConsoleRole | AppRole;

/** Which client a role is allowed to use. */
export type Channel = 'console' | 'app';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ACCOUNTANT: 'Accountant',
  SECRETARY: 'Secretary',
  PRESIDENT: 'President',
  CASHIER: 'Cashier / Disbursement',
  DDO: 'DDO',
  MEMBER: 'Member',
  APPLICANT: 'Applicant',
};

export function channelForRole(role: Role): Channel {
  return (CONSOLE_ROLES as readonly string[]).includes(role) ? 'console' : 'app';
}

/**
 * Permission keys, `module.action`. M0 only defines what navigation needs;
 * each milestone adds the action-level keys from docs/03 §2.
 */
export type Permission =
  | 'dashboard.view'
  | 'queue.view'
  | 'membership.view'
  | 'members.view'
  | 'members.edit'
  | 'members.decideChanges'
  | 'loans.view'
  | 'loans.create'
  | 'deposits.view'
  | 'deposits.open'
  | 'collections.view'
  | 'reports.view'
  /** ST-03 simulated message composer (D-063). */
  | 'messages.send'
  /** ST-03 reply to member questions from MB-13 (D-063). */
  | 'support.reply'
  | 'settings.view'
  | 'settings.edit'
  | 'users.manage'
  | 'demo.control'
  | 'app.member'
  | 'app.applicant';
