// Console routes with a persona allowed to see each one, and seeded ids for detail pages.
import type { APIRequestContext } from '@playwright/test';
import { apiCall, apiToken } from './support';

export interface Ids {
  member: string;
  joining: string;
  loan: string;
  deposit: string;
  sheet: string;
  receipt: string;
  report: string;
}

export async function seededIds(request: APIRequestContext): Promise<Ids> {
  const { token } = await apiToken(request, 'stf-admin', 'console');
  const loans = await apiCall<{ items: Array<{ id: string }> }>(request, 'GET', '/loans?group=ACTIVE&pageSize=5', token);
  const deposits = await apiCall<{ items: Array<{ id: string }> }>(request, 'GET', '/deposits?tab=FD&pageSize=5', token);
  const joining = await apiCall<{ rows: Array<{ id: string }> }>(request, 'GET', '/membership/applications', token);
  const sheets = await apiCall<{ rows: Array<{ id: string }> }>(request, 'GET', '/demand?cycle=2026-10', token);
  const receipts = await apiCall<{ items: Array<{ id: string }> }>(request, 'GET', '/receipts?pageSize=5', token);
  const reports = await apiCall<{ reports: Array<{ id: string }> }>(request, 'GET', '/reports', token);
  return { member: 'mem-1101', joining: joining.rows[0]!.id, loan: loans.items[0]!.id, deposit: deposits.items[0]!.id, sheet: sheets.rows[0]!.id, receipt: receipts.items[0]!.id, report: reports.reports[0]!.id };
}

/** [path template, persona]. `:member`, `:loan` … are replaced with seeded ids. */
export const CONSOLE_ROUTES: Array<[string, string]> = [
  ['/dashboard', 'stf-admin'],
  ['/queue', 'stf-accountant'],
  ['/joining', 'stf-accountant'],
  ['/joining/:joining', 'stf-accountant'],
  ['/members', 'stf-accountant'],
  ['/members/change-requests', 'stf-accountant'],
  ['/members/new', 'stf-accountant'],
  ['/members/:member', 'stf-accountant'],
  ['/members/:member/edit', 'stf-accountant'],
  ['/loans', 'stf-accountant'],
  ['/loans/new', 'stf-accountant'],
  ['/loans/:loan', 'stf-accountant'],
  ['/deposits', 'stf-cashier'],
  ['/deposits/new', 'stf-cashier'],
  ['/deposits/:deposit', 'stf-cashier'],
  ['/deposits/:deposit/fdr', 'stf-cashier'],
  ['/demand-sheets', 'stf-accountant'],
  ['/demand-sheets/generate', 'stf-accountant'],
  ['/demand-sheets/:sheet', 'stf-accountant'],
  ['/payments', 'stf-cashier'],
  ['/payments/new', 'stf-cashier'],
  ['/payments/:receipt', 'stf-cashier'],
  ['/reports', 'stf-accountant'],
  ['/reports/:report', 'stf-accountant'],
  ['/notifications', 'stf-accountant'],
  ['/settings/general', 'stf-admin'],
  ['/settings/loan-products', 'stf-admin'],
  ['/settings/deposits', 'stf-admin'],
  ['/settings/insurance-demand', 'stf-admin'],
  ['/settings/departments', 'stf-admin'],
  ['/settings/users', 'stf-admin'],
  ['/settings/permissions', 'stf-admin'],
  ['/settings/templates', 'stf-admin'],
  ['/settings/history', 'stf-admin'],
  ['/design', 'stf-admin'],
];

export const fillIds = (template: string, i: Ids) =>
  template.replace(':member', i.member).replace(':joining', i.joining).replace(':loan', i.loan).replace(':deposit', i.deposit).replace(':sheet', i.sheet).replace(':receipt', i.receipt).replace(':report', i.report);

/** Staff screens in the same app (D-106), as a persona allowed to see each one. */
export const STAFF_SCREENS: Array<[string, string]> = [
  ['/staff/home', 'stf-admin'],
  ['/staff/home', 'stf-accountant'],
  ['/staff/home', 'stf-secretary'],
  ['/staff/home', 'stf-president'],
  ['/staff/home', 'stf-cashier'],
  ['/staff/home', 'stf-ddo-fin'],
  ['/staff/queue', 'stf-accountant'],
  ['/staff/more', 'stf-accountant'],
  ['/staff/search', 'stf-accountant'],
  ['/staff/account', 'stf-accountant'],
  ['/staff/account/password', 'stf-accountant'],
  ['/staff/account/notifications', 'stf-accountant'],
  ['/staff/account/compose', 'stf-accountant'],
  ['/staff/joining', 'stf-accountant'],
  ['/staff/joining/:joining', 'stf-accountant'],
  ['/staff/members', 'stf-accountant'],
  ['/staff/change-requests', 'stf-accountant'],
  ['/staff/member/new', 'stf-accountant'],
  ['/staff/member/:member', 'stf-accountant'],
  ['/staff/member/:member/edit', 'stf-accountant'],
  ['/staff/member/:member/transfer', 'stf-accountant'],
  ['/staff/member/:member/settlement', 'stf-accountant'],
  ['/staff/member/:member/waive', 'stf-accountant'],
  ['/staff/loans', 'stf-accountant'],
  ['/staff/loan/new', 'stf-accountant'],
  ['/staff/loan/:loan', 'stf-accountant'],
  ['/staff/deposits', 'stf-cashier'],
  ['/staff/deposit/new', 'stf-cashier'],
  ['/staff/deposit/:deposit', 'stf-cashier'],
  ['/staff/demand', 'stf-accountant'],
  ['/staff/demand/generate', 'stf-accountant'],
  ['/staff/demand/:sheet', 'stf-accountant'],
  ['/staff/demand/:sheet/recovery', 'stf-accountant'],
  ['/staff/payments', 'stf-cashier'],
  ['/staff/payment/new', 'stf-cashier'],
  ['/staff/payment/:receipt', 'stf-cashier'],
  ['/staff/reports', 'stf-accountant'],
  ['/staff/report/:report', 'stf-accountant'],
  ['/staff/settings', 'stf-admin'],
  ['/staff/settings/general', 'stf-admin'],
  ['/staff/settings/loan-products', 'stf-admin'],
  ['/staff/settings/deposits', 'stf-admin'],
  ['/staff/settings/insurance-demand', 'stf-admin'],
  ['/staff/settings/departments', 'stf-admin'],
  ['/staff/settings/users', 'stf-admin'],
  ['/staff/settings/permissions', 'stf-admin'],
  ['/staff/settings/templates', 'stf-admin'],
  ['/staff/settings/history', 'stf-admin'],
];

/** Phone screens per persona (member and applicant). */
export const PHONE_SCREENS: Array<[string, string]> = [
  ['/welcome', ''],
  ['/login', ''],
  ['/home', 'mem-1101'],
  ['/loans', 'mem-1101'],
  ['/deposits', 'mem-1101'],
  ['/payments', 'mem-1104'],
  ['/more', 'mem-1101'],
  ['/loan/apply', 'mem-1103'],
  ['/deposit/open', 'mem-1101'],
  ['/payment/report', 'mem-1104'],
  ['/surety', 'mem-1103'],
  ['/profile', 'mem-1101'],
  ['/profile/edit', 'mem-1101'],
  ['/profile/request', 'mem-1101'],
  ['/rates', 'mem-1101'],
  ['/account/calculators', 'mem-1102'],
  ['/account/notifications', 'mem-1101'],
  ['/account/help', 'mem-1101'],
  ['/account/settings', 'mem-1101'],
  ['/tracker', 'apl-ravi'],
  ['/eligibility', 'apl-divya'],
];
