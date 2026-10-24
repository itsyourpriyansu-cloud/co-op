// Sidebar structure (docs/12 §2.1, docs/19 §1) and which milestone delivers each module (docs/14).
import {
  ChartColumn,
  FileSpreadsheet,
  HandCoins,
  Inbox,
  LayoutDashboard,
  Palette,
  PiggyBank,
  ReceiptIndianRupee,
  Settings,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@tgs/types';

export interface NavItem {
  /** Stable id: Blend Directory path segment + active-item key. */
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  milestone: string;
  screens: string;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', milestone: 'M9', screens: 'ST-01', description: 'Your numbers and what needs attention today.' },
      { id: 'queue', path: '/queue', label: 'Work Queue', icon: Inbox, permission: 'queue.view', milestone: 'M5', screens: 'ST-02', description: 'Everything waiting for your certification, review, signature or payout.' },
    ],
  },
  {
    label: 'Records',
    items: [
      { id: 'joining', path: '/joining', label: 'Joining', icon: UserPlus, permission: 'membership.view', milestone: 'M3', screens: 'ST-14 – ST-17', description: 'Membership applications from the app: certify, review, approve, allot General No.' },
      { id: 'members', path: '/members', label: 'Members', icon: Users, permission: 'members.view', milestone: 'M3', screens: 'ST-10 – ST-13', description: 'Member master, profiles, service history, documents, transfers and agreements.' },
      { id: 'loans', path: '/loans', label: 'Loans', icon: HandCoins, permission: 'loans.view', milestone: 'M4 – M5', screens: 'ST-20 – ST-28', description: 'Ordinary, Education, Salary and Deposit loans from application to disbursement.' },
      { id: 'deposits', path: '/deposits', label: 'Deposits', icon: PiggyBank, permission: 'deposits.view', milestone: 'M6', screens: 'ST-30 – ST-33', description: 'Fixed deposits, CRD, SRDS and Savings, including FD requests and acceptance.' },
    ],
  },
  {
    label: 'Money',
    items: [
      { id: 'demand-sheets', path: '/demand-sheets', label: 'Demand Sheets', icon: FileSpreadsheet, permission: 'collections.view', milestone: 'M7', screens: 'ST-40 – ST-43', description: 'Department-wise monthly demand, certification and salary recovery.' },
      { id: 'payments', path: '/payments', label: 'Payments', icon: ReceiptIndianRupee, permission: 'collections.view', milestone: 'M7', screens: 'ST-44 – ST-47', description: 'Receipts with denominations, bank transfers, member-reported payments.' },
    ],
  },
  {
    label: 'Insight',
    items: [
      { id: 'reports', path: '/reports', label: 'Reports', icon: ChartColumn, permission: 'reports.view', milestone: 'M9', screens: 'ST-50 – ST-52', description: 'MIS reports, ledgers and printable society forms.' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'settings', path: '/settings', label: 'Settings', icon: Settings, permission: 'settings.view', milestone: 'M2', screens: 'ST-60 – ST-67', description: 'Products, rates, workflows, departments, users and permissions.' },
      { id: 'design', path: '/design', label: 'Design System', icon: Palette, permission: 'demo.control', milestone: 'Live', screens: 'docs/18 · docs/19', description: 'Tokens, Blend components, patterns, every UI state and the scenario catalog.' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Nav item that owns a pathname (longest matching prefix). */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((i) => pathname === i.path || pathname.startsWith(`${i.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
}
