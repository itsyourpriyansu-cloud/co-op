// Role → permission map (docs/03 §2), shared by the backend (seeds role_permissions, D-076) and the mock API.
// Servers enforce it; the apps only read it via /me. Action-level keys are added per milestone.
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
    'ledger.view',
    'messages.send',
    'support.reply',
    'settings.edit',
    'users.manage',
    'members.edit',
    'loans.create',
    'deposits.open',
  ],
  // R2 keeps the member master and decides profile change requests (docs/03, D-057).
  // P3 (D-080) [P]: the Accountant keeps the books; signers and the Cashier read them, the Super Admin only reads.
  ACCOUNTANT: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view', 'ledger.view', 'ledger.post', 'messages.send', 'support.reply', 'members.edit', 'members.decideChanges', 'loans.create', 'deposits.open'],
  SECRETARY: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view', 'ledger.view'],
  PRESIDENT: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view', 'ledger.view'],
  CASHIER: [...STAFF_COMMON, 'deposits.view', 'collections.view', 'reports.view', 'ledger.view', 'deposits.open'],
  // DDO: own department only (scoping applied per endpoint); no deposits or reports (docs/03).
  DDO: [...STAFF_COMMON, 'collections.view'],
  MEMBER: ['app.member', 'demo.control'],
  APPLICANT: ['app.applicant', 'demo.control'],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Labels and groups for the permission matrix screen (ST-62). */
export const PERMISSION_LABELS: Array<{ key: Permission; label: string; group: string }> = [
  { key: 'dashboard.view', label: 'Dashboard', group: 'Work' },
  { key: 'queue.view', label: 'Work queue', group: 'Work' },
  { key: 'membership.view', label: 'Joining applications', group: 'Records' },
  { key: 'members.view', label: 'Members', group: 'Records' },
  { key: 'members.edit', label: 'Add, edit and transfer members', group: 'Records' },
  { key: 'members.decideChanges', label: 'Decide profile change requests', group: 'Records' },
  { key: 'loans.view', label: 'Loans', group: 'Records' },
  { key: 'loans.create', label: 'Enter loan applications on behalf', group: 'Records' },
  { key: 'deposits.view', label: 'Deposits', group: 'Records' },
  { key: 'deposits.open', label: 'Open deposits at the counter', group: 'Records' },
  { key: 'collections.view', label: 'Demand sheets & payments', group: 'Money' },
  { key: 'reports.view', label: 'Reports', group: 'Insight' },
  { key: 'ledger.view', label: 'Books of account (read)', group: 'Money' },
  { key: 'ledger.post', label: 'Manual journals and reversals', group: 'Money' },
  { key: 'messages.send', label: 'Send messages to members (simulated)', group: 'Insight' },
  { key: 'support.reply', label: 'Answer member questions', group: 'Insight' },
  { key: 'settings.view', label: 'View settings', group: 'Admin' },
  { key: 'settings.edit', label: 'Change settings', group: 'Admin' },
  { key: 'users.manage', label: 'Manage users', group: 'Admin' },
  { key: 'demo.control', label: 'Demo controls', group: 'Demo' },
];
