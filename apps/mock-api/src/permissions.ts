// Role → permission map (docs/03 §2). Enforced here, server-side; the apps only read it via /me.
// M0 covers navigation-level keys. Action-level keys are added per milestone.
import type { Permission, Role } from '@tgs/types';

const STAFF_COMMON: Permission[] = [
  'dashboard.view',
  'queue.view',
  'membership.view',
  'members.view',
  'loans.view',
  'settings.view',
  'demo.control',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    ...STAFF_COMMON,
    'deposits.view',
    'collections.view',
    'reports.view',
    'settings.edit',
    'users.manage',
  ],
  ACCOUNTANT: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view'],
  SECRETARY: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view'],
  PRESIDENT: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view'],
  CASHIER: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view'],
  // DDO: own department only (scoping applied per endpoint); no deposits or reports (docs/03).
  DDO: [...STAFF_COMMON, 'collections.view'],
  MEMBER: ['app.member', 'demo.control'],
  APPLICANT: ['app.applicant', 'demo.control'],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}
