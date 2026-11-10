// Labels for the staff Settings screens, copied from the console's pages/settings (docs/23 §3).
import { Building2, HandCoins, History, Landmark, MessageSquareText, PiggyBank, ShieldCheck, Umbrella, Users, type LucideIcon } from 'lucide-react-native';
import type { ConsoleRole, DemandHead, NotificationTemplate, SettingsBundle } from '@tgs/types';

export const SECTIONS: Array<{ id: string; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'general', label: 'General', icon: Landmark, hint: 'Society, shares, service' },
  { id: 'loan-products', label: 'Loan products', icon: HandCoins, hint: 'Rates, limits, workflow' },
  { id: 'deposits', label: 'Deposit schemes', icon: PiggyBank, hint: 'FD slabs, CRD, SRDS, savings' },
  { id: 'insurance-demand', label: 'Insurance & demand', icon: Umbrella, hint: 'Monthly heads, defaulters' },
  { id: 'departments', label: 'Departments & DDOs', icon: Building2, hint: 'Who certifies and deducts' },
  { id: 'users', label: 'Users', icon: Users, hint: 'Staff logins and roles' },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck, hint: 'What each role can do' },
  { id: 'templates', label: 'Notification templates', icon: MessageSquareText, hint: 'WhatsApp, email, app' },
  { id: 'history', label: 'Change history', icon: History, hint: 'Who changed what' },
];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((label, i) => ({ label, value: String(i + 1) }));
export const isPlaceholder = (b: SettingsBundle, key: string) => b.settings.placeholders.some((p) => p === key || p.startsWith(`${key}.`));

export const ROLE_HINT: Record<ConsoleRole, string> = {
  SUPER_ADMIN: 'Settings, users, everything read-only otherwise',
  ACCOUNTANT: 'Reviews, assessment, demand sheets, recoveries',
  SECRETARY: 'First signature on loans, FDs and memberships',
  PRESIDENT: 'Final signature (must differ from the Secretary)',
  CASHIER: 'Receipts with denominations, disbursements',
  DDO: 'Certifies applications for one department',
};

export const RECOVERY_LABEL: Record<DemandHead, string> = {
  RRF: 'RRF',
  INSURANCE: 'Insurance',
  CRD: 'CRD',
  SRDS: 'SRDS',
  SHARE_CAPITAL: 'Share capital (new members)',
  PENAL: 'Penal interest',
  INTEREST: 'Loan interest (Education → Salary → Ordinary → Deposit)',
  PRINCIPAL: 'Loan principal (same order)',
  SURETY: "Surety recovery for another member's loan (last)",
};

export const ENTITY: Record<string, string> = { settings: 'Settings', loanProduct: 'Loan product', society: 'Society', department: 'Department', user: 'User', template: 'Template' };
export const AUDIENCE = { MEMBER: 'Members', APPLICANT: 'Applicants', STAFF: 'Staff' } as const;
export const CHANNELS = [
  { id: 'IN_APP', label: 'App' },
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'EMAIL', label: 'Email' },
] as const;

const SAMPLE: Record<string, string> = {
  name: 'Lakshmi',
  applicationNo: 'APP-2026-00123',
  stage: 'Department verification',
  generalNo: '1606',
  product: 'Ordinary Loan',
  amount: '₹2,00,000',
  borrower: 'Mahesh Babu P',
  reason: 'Pay slip for the latest month is missing.',
  emi: '₹5,167',
  firstCycle: 'Nov 2026',
  netAmount: '₹1,80,000',
  loanNo: 'LN-2026-00412',
  fdrNo: 'FDR-2026-00151',
  maturityDate: '24 Oct 2028',
  cycle: 'Oct 2026',
  recovered: '₹2,000',
  demand: '₹5,000',
  reference: 'UTR123456789',
  receiptNo: 'RCP-C-000101',
  department: 'Finance',
  members: '48',
};
export const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => SAMPLE[k] ?? `{${k}}`);
export const vars = (t: Pick<NotificationTemplate, 'title' | 'body'>) => [...new Set([...`${t.title} ${t.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))];
