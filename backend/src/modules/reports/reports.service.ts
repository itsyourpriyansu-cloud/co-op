import { calculateLeftoverService, formatCycle, formatDisplayDate, formatINR, fullMonthsBetween, loanDefaulter, loanUnpaid } from '@tgs/domain';
import type { Cycle, DefaulterNotice, DemandHead, ReportCell, ReportColumn, ReportDef, ReportFilterKey, ReportId, ReportOptions, ReportResult, SessionUser } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessCycle, businessNow, businessToday } from '../../common/utils/business-date';
import { accountingReport } from './accounting-reports';

// ST-50 catalogue (docs/13 §5, REQ-060…081). shortcut: copied from the mock's; the mock copy goes in P9.
export const REPORTS: ReportDef[] = [
  { id: 'dues', group: 'Collections', title: 'Dues list', reqId: 'REQ-060', kind: 'table', available: true, filters: ['cycle', 'departmentId'], description: 'What each member still owes after salary recovery and counter payments, head by head.' },
  { id: 'defaulters', group: 'Collections', title: 'Defaulters list', reqId: 'REQ-061', kind: 'table', available: true, filters: ['cycle', 'departmentId', 'minCycles'], description: 'Members with unpaid loan instalments in the last N posted cycles in a row (BR-020).' },
  { id: 'dept-unpaid', group: 'Collections', title: 'Department-wise unpaid collections', reqId: 'REQ-062', kind: 'table', available: true, filters: ['cycle'], description: 'Demand, recovered and unpaid per department for one month.' },
  { id: 'dept-less', group: 'Collections', title: 'Department-wise less collections', reqId: 'REQ-063', kind: 'table', available: true, filters: ['cycle', 'departmentId'], description: 'Every member whose salary deduction came short, grouped by department.' },
  { id: 'defaulter-notice', group: 'Collections', title: 'Defaulter notice', reqId: 'REQ-066', kind: 'print', available: true, filters: ['memberId'], printLink: '/reports/print/defaulter-notice', description: 'Printable letter on the letterhead asking a member to clear the overdue amount.' },
  { id: 'loans-ledger', group: 'Loans', title: 'Loans ledger', reqId: 'REQ-067', kind: 'table', available: true, filters: ['product', 'departmentId', 'from', 'to'], description: 'Each loan with sanctioned amount, recoveries and outstanding, by loan type.' },
  { id: 'maturity', group: 'Deposits & Shares', title: 'Maturity report', reqId: 'REQ-064', kind: 'table', available: true, filters: ['from', 'to', 'scheme'], description: 'Fixed deposits maturing in a date range, by month.' },
  { id: 'deposits-ledger', group: 'Deposits & Shares', title: 'Deposits ledger', reqId: 'REQ-068', kind: 'table', available: true, filters: ['scheme', 'from', 'to'], description: 'Every FD, CRD and SRDS transaction in the books, by scheme.' },
  { id: 'shares-ledger', group: 'Deposits & Shares', title: 'Shares ledger', reqId: 'REQ-069', kind: 'table', available: true, filters: ['from', 'to'], description: 'Share capital and share deposit movements per member.' },
  { id: 'member-ledger', group: 'Members', title: 'Member-wise ledger', reqId: 'REQ-065', kind: 'table', available: true, filters: ['memberId', 'from', 'to'], description: 'One member, month by month and head by head, with the running unpaid balance.' },
  { id: 'retirement', group: 'Members', title: 'Retirement report', reqId: 'REQ-073', kind: 'table', available: true, filters: ['withinMonths', 'departmentId'], description: 'Members retiring soon, what they still owe and the loans they stand surety for.' },
  { id: 'dob-anniversary', group: 'Members', title: 'Birthdays & anniversaries', reqId: 'REQ-074', kind: 'table', available: true, filters: ['month', 'departmentId'], description: 'Member birthdays and years with the society, for one month.' },
  // G2 (D-112): the accounting statements, from the journal.
  { id: 'books', group: 'Cash & Accounts', title: 'Day, cash & bank book', reqId: 'REQ-079…081', kind: 'table', available: true, filters: ['book', 'from', 'to'], description: 'Every entry of each day, or the cash or bank account with its running balance.' },
  { id: 'general-ledger', group: 'Cash & Accounts', title: 'General ledger', reqId: 'REQ-075', kind: 'table', available: true, filters: ['account', 'from', 'to'], description: 'One account: opening balance, every entry and the running balance.' },
  { id: 'trial-balance', group: 'Cash & Accounts', title: 'Trial balance', reqId: 'REQ-076', kind: 'table', available: true, filters: ['asOf'], description: 'Every account with its debit or credit balance; the two columns agree.' },
  { id: 'profit-loss', group: 'Cash & Accounts', title: 'Profit & loss', reqId: 'REQ-077', kind: 'table', available: true, filters: ['from', 'to'], description: 'Income and expenditure for a period and the surplus or deficit.' },
  { id: 'balance-sheet', group: 'Cash & Accounts', title: 'Balance sheet', reqId: 'REQ-078', kind: 'table', available: true, filters: ['asOf'], description: 'Capital, liabilities and assets on a date.' },
  { id: 'receipts-payments', group: 'Cash & Accounts', title: 'Receipts & payments', reqId: 'REQ-070', kind: 'table', available: true, filters: ['from', 'to'], description: 'Money in and out of cash and bank by head, with opening and closing balances.' },
  { id: 'monthly-receipts', group: 'Cash & Accounts', title: 'Month-wise receipts', reqId: 'REQ-071', kind: 'table', available: true, filters: ['from', 'to'], description: 'Cash and bank receipts by head, month by month.' },
  { id: 'monthly-payments', group: 'Cash & Accounts', title: 'Month-wise payments', reqId: 'REQ-072', kind: 'table', available: true, filters: ['from', 'to'], description: 'Cash and bank payments by head, month by month.' },
];

const HEADS: Array<{ head: DemandHead; label: string }> = [
  { head: 'RRF', label: 'RRF' },
  { head: 'INSURANCE', label: 'Insurance' },
  { head: 'CRD', label: 'CRD' },
  { head: 'SRDS', label: 'SRDS' },
  { head: 'SHARE_CAPITAL', label: 'Shares' },
  { head: 'PENAL', label: 'Penal' },
  { head: 'INTEREST', label: 'Interest' },
  { head: 'PRINCIPAL', label: 'Principal' },
  { head: 'SURETY', label: 'Surety' },
];
const HEAD_LABEL = Object.fromEntries(HEADS.map((h) => [h.head, h.label])) as Record<DemandHead, string>;
const PAY_TO = { accountName: 'TGSECCSL Dues Collection', accountNo: 'XXXXXXXX3307', ifsc: 'DEMO0000929', upi: 'tgseccsl.dues@demo', counter: 'Society cash counter, 2nd Floor, West Ancillary Building' };
const DEFAULT_NOTICE = 'Our records show that {overdue} due to the society from your salary deductions has not been recovered in full for {cycles} month(s), as detailed below. Please pay this amount at the society counter or by bank transfer within 15 days of this notice, and report the payment in the member app. If the amount is not paid, the society will recover it from your salary and, where applicable, from your sureties as per the bye-laws and your agreement with the society.';
const FILTER_KEYS: ReportFilterKey[] = ['cycle', 'departmentId', 'minCycles', 'from', 'to', 'scheme', 'memberId', 'product', 'withinMonths', 'account', 'book', 'asOf', 'month'];
/** G2: read from the journal, so they need `ledger.view` as well (not for DDOs). */
const LEDGER_REPORTS = new Set(['books', 'general-ledger', 'trial-balance', 'profit-loss', 'balance-sheet', 'receipts-payments', 'monthly-receipts', 'monthly-payments', 'deposits-ledger', 'shares-ledger']);
const ACCOUNTING_REPORTS = new Set([...LEDGER_REPORTS, 'dob-anniversary']);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const allocated = (cs: Array<{ allocated: number }>) => sum(cs.map((c) => c.allocated));
type Row = Record<string, ReportCell>;
type Params = Partial<Record<ReportFilterKey, string>>;

function totalsOf(rows: Row[], columns: ReportColumn[]): Record<string, number> {
  return Object.fromEntries(columns.filter((c) => c.total).map((c) => [c.key, sum(rows.map((r) => Number(r[c.key] ?? 0)))]));
}

function grouped(rows: Row[], by: (r: Row) => string, columns: ReportColumn[]): ReportResult['groups'] {
  const map = new Map<string, Row[]>();
  for (const r of rows) map.set(by(r), [...(map.get(by(r)) ?? []), r]);
  return [...map].map(([label, rs]) => ({ label, rows: rs, subtotal: totalsOf(rs, columns) }));
}

/**
 * P8c (docs/22 §5.7): ST-50 / ST-51 reports and the ST-52 defaulter notice, from the backend's
 * tables. "Unpaid" = demand − allocated, so it follows counter payments (D-061). A defaulter is
 * BR-020 as built (D-088): unpaid loan instalments in the latest posted cycles in a row.
 */
export class ReportsService {
  constructor(private readonly app: FastifyInstance) {}

  private async requireView(user: SessionUser): Promise<void> {
    if (user.role === 'MEMBER' || user.role === 'APPLICANT') fail('FORBIDDEN', 'Staff only.');
    if (!(await this.app.permissions.has(user.role, 'reports.view'))) fail('FORBIDDEN', 'Reports are not available for your role.');
  }

  private async options(): Promise<ReportOptions> {
    const [heads, departments, products, settings] = await Promise.all([this.app.collections.repo.allSheetHeads(), this.app.departments.all(), this.app.masters.loanProducts(), this.app.masters.settings()]);
    return {
      cycles: [...new Set(heads.filter((s) => s.status === 'RECOVERY_POSTED').map((s) => s.cycle))].sort().reverse(),
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
      products: products.map((p) => ({ code: p.code, name: p.name })),
      defaulterCycles: settings.defaulterCycles,
      accounts: (await this.app.ledger.repo.accounts()).map((a) => ({ code: a.code, name: a.name })),
    };
  }

  async catalogue(user: SessionUser): Promise<{ reports: ReportDef[]; options: ReportOptions }> {
    await this.requireView(user);
    const ledger = await this.app.permissions.has(user.role, 'ledger.view');
    return { reports: REPORTS.filter((r) => ledger || !LEDGER_REPORTS.has(r.id)), options: await this.options() };
  }

  async run(request: FastifyRequest, id: string, query: Record<string, string | undefined>): Promise<ReportResult> {
    const user = sessionOf(request);
    await this.requireView(user);
    const def = REPORTS.find((r) => r.id === id);
    if (!def || !def.available || def.kind !== 'table') fail('NOT_FOUND', 'This report is not available.');
    if (LEDGER_REPORTS.has(id) && !(await this.app.permissions.has(user.role, 'ledger.view'))) fail('FORBIDDEN', 'This statement is for the society office.');
    const params: Params = {};
    for (const k of FILTER_KEYS) if (query[k]) params[k] = query[k];
    const [today, cycleNow, now, options, members, departments, lines, loans, deposits, products] = await Promise.all([
      businessToday(this.app),
      businessCycle(this.app),
      businessNow(this.app),
      this.options(),
      this.app.members.all(),
      this.app.departments.all(),
      this.app.collections.repo.allLines(),
      this.app.loans.repo.all(),
      this.app.deposits.repo.list(),
      this.app.masters.loanProducts(),
    ]);
    const lastPosted = options.cycles[0] ?? cycleNow;
    const dept = (deptId: string) => departments.find((d) => d.id === deptId)?.name ?? deptId;
    const memberById = new Map(members.map((m) => [m.id, m]));
    const departmentId = user.departmentId ?? params.departmentId;
    const inDept = (memberId: string) => !departmentId || memberById.get(memberId)?.departmentId === departmentId;
    const filters: Params = {};
    const labels: string[] = [];
    if (departmentId) (filters.departmentId = departmentId, labels.push(`Department: ${dept(departmentId)}`));
    const links: Record<string, string> = {};
    const posted = (upTo: Cycle) => lines.filter((l) => l.status === 'RECOVERY_POSTED' && l.cycle <= upTo && inDept(l.memberId));
    let columns: ReportColumn[] = [];
    let groups: ReportResult['groups'] = [];
    let fixedTotals: Record<string, number> | undefined;
    if (ACCOUNTING_REPORTS.has(id)) {
      const b = await accountingReport(this.app, id, params, today, members.filter((m) => inDept(m.id)));
      ({ columns, groups } = b);
      Object.assign(filters, b.filters);
      labels.unshift(...b.labels);
      Object.assign(links, b.links);
      fixedTotals = b.totals;
    }

    switch (id as ReportId) {
      case 'dues': {
        const cycle = params.cycle ?? lastPosted;
        filters.cycle = cycle;
        labels.unshift(`As on ${formatCycle(cycle)}`);
        const perMember = new Map<string, Record<DemandHead, number>>();
        for (const line of posted(cycle))
          for (const c of line.components) {
            const unpaid = c.amount - c.allocated;
            if (unpaid <= 0) continue;
            const acc = perMember.get(line.memberId) ?? (Object.fromEntries(HEADS.map((h) => [h.head, 0])) as Record<DemandHead, number>);
            acc[c.head] += unpaid;
            perMember.set(line.memberId, acc);
          }
        const used = HEADS.filter((h) => [...perMember.values()].some((v) => v[h.head] > 0));
        columns = [{ key: 'generalNo', label: 'General No.', type: 'text' }, { key: 'name', label: 'Name', type: 'text' }, ...used.map((h) => ({ key: h.head, label: h.label, type: 'money' as const, total: true })), { key: 'total', label: 'Total due', type: 'money', total: true }];
        const rows = [...perMember].map(([memberId, heads]) => {
          const m = memberById.get(memberId)!;
          links[m.generalNo] = `/members/${m.id}`;
          return { generalNo: m.generalNo, name: m.name, department: dept(m.departmentId), ...Object.fromEntries(used.map((h) => [h.head, heads[h.head]])), total: sum(Object.values(heads)) } as Row;
        });
        rows.sort((a, b) => String(a.department).localeCompare(String(b.department)) || String(a.generalNo).localeCompare(String(b.generalNo)));
        groups = grouped(rows, (r) => String(r.department), columns);
        break;
      }

      case 'defaulters': {
        const cycle = params.cycle ?? lastPosted;
        const min = Math.max(1, Number(params.minCycles) || options.defaulterCycles);
        filters.cycle = cycle;
        filters.minCycles = String(min);
        labels.unshift(`As on ${formatCycle(cycle)}`, `Loan instalments unpaid in the last ${min}+ cycles in a row`);
        const history = new Map<string, Array<{ cycle: Cycle; loanUnpaid: number; unpaid: number }>>();
        for (const line of posted(cycle)) history.set(line.memberId, [...(history.get(line.memberId) ?? []), { cycle: line.cycle, loanUnpaid: loanUnpaid(line.components), unpaid: line.totalDemand - allocated(line.components) }]);
        columns = [
          { key: 'generalNo', label: 'General No.', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'cycles', label: 'Cycles unpaid', type: 'number' },
          { key: 'since', label: 'Short since', type: 'cycle' },
          { key: 'overdue', label: 'Amount overdue', type: 'money', total: true },
          { key: 'loans', label: 'Active loans', type: 'number' },
        ];
        const rows: Row[] = [];
        for (const [memberId, h] of history) {
          const r = loanDefaulter(h, min);
          if (!r.isDefaulter) continue;
          const m = memberById.get(memberId)!;
          links[m.generalNo] = `/members/${m.id}`;
          rows.push({ generalNo: m.generalNo, name: m.name, department: dept(m.departmentId), mobile: m.mobileMasked, cycles: r.consecutiveCycles, since: h[h.length - r.consecutiveCycles]!.cycle, overdue: sum(h.map((x) => Math.max(0, x.unpaid))), loans: loans.filter((l) => l.memberId === memberId && l.status === 'ACTIVE').length });
        }
        rows.sort((a, b) => Number(b.overdue) - Number(a.overdue));
        groups = grouped(rows, (r) => String(r.department), columns);
        break;
      }

      case 'dept-unpaid': {
        const cycle = params.cycle ?? lastPosted;
        filters.cycle = cycle;
        labels.unshift(formatCycle(cycle));
        columns = [
          { key: 'department', label: 'Department', type: 'text' },
          { key: 'members', label: 'Members', type: 'number', total: true },
          { key: 'demand', label: 'Demand', type: 'money', total: true },
          { key: 'recovered', label: 'Recovered', type: 'money', total: true },
          { key: 'unpaid', label: 'Unpaid', type: 'money', total: true },
          { key: 'rate', label: 'Collected', type: 'percent' },
        ];
        const heads = (await this.app.collections.repo.allSheetHeads()).filter((s) => s.cycle === cycle && (!departmentId || s.departmentId === departmentId));
        const rows = heads
          .map((s) => ({ department: dept(s.departmentId), members: lines.filter((l) => l.sheetId === s.id).length, demand: s.totalDemand, recovered: s.totalRecovered, unpaid: s.totalDemand - s.totalRecovered, rate: s.totalDemand ? s.totalRecovered / s.totalDemand : 0 }) as Row)
          .sort((a, b) => Number(b.unpaid) - Number(a.unpaid));
        groups = [{ label: '', rows, subtotal: totalsOf(rows, columns) }];
        break;
      }

      case 'dept-less': {
        const cycle = params.cycle ?? lastPosted;
        filters.cycle = cycle;
        labels.unshift(formatCycle(cycle));
        columns = [
          { key: 'generalNo', label: 'General No.', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'designation', label: 'Designation', type: 'text' },
          { key: 'demand', label: 'Demand', type: 'money', total: true },
          { key: 'recovered', label: 'Recovered', type: 'money', total: true },
          { key: 'short', label: 'Short', type: 'money', total: true },
        ];
        const rows: Row[] = [];
        for (const l of lines.filter((x) => x.cycle === cycle && x.status === 'RECOVERY_POSTED' && (!departmentId || x.departmentId === departmentId))) {
          const rec = l.recovered ?? 0;
          if (rec >= l.totalDemand) continue;
          const m = memberById.get(l.memberId)!;
          links[m.generalNo] = `/members/${m.id}`;
          rows.push({ department: dept(l.departmentId), generalNo: m.generalNo, name: m.name, designation: m.designation, demand: l.totalDemand, recovered: rec, short: l.totalDemand - rec });
        }
        rows.sort((a, b) => String(a.department).localeCompare(String(b.department)) || Number(b.short) - Number(a.short));
        groups = grouped(rows, (r) => String(r.department), columns);
        break;
      }

      case 'maturity': {
        const from = params.from ?? today;
        const to = params.to ?? new Date(Date.parse(`${today}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
        if (to < from) fail('VALIDATION_ERROR', 'The end date is before the start date.', { fieldErrors: { to: 'Must be on or after the start date' } });
        filters.from = from;
        filters.to = to;
        filters.scheme = 'FD';
        labels.unshift(`Maturing ${formatDisplayDate(from)} – ${formatDisplayDate(to)}`);
        columns = [
          { key: 'accountNo', label: 'FDR / Account', type: 'text' },
          { key: 'member', label: 'Member', type: 'text' },
          { key: 'principal', label: 'Principal', type: 'money', total: true },
          { key: 'rate', label: 'Rate %', type: 'number' },
          { key: 'maturityDate', label: 'Maturity date', type: 'date' },
          { key: 'maturityValue', label: 'Maturity value', type: 'money', total: true },
        ];
        const rows = deposits
          .filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && d.maturityDate && d.maturityDate >= from && d.maturityDate <= to && inDept(d.memberId))
          .sort((a, b) => a.maturityDate!.localeCompare(b.maturityDate!))
          .map((d) => {
            const m = memberById.get(d.memberId)!;
            const no = d.fdrNo ?? d.accountNo;
            links[no] = `/deposits/${d.id}`;
            return { month: formatCycle(d.maturityDate!.slice(0, 7)), accountNo: no, member: `${m.name} (${m.generalNo})`, principal: d.principal ?? 0, rate: d.ratePercent, maturityDate: d.maturityDate!, maturityValue: d.maturityValue ?? d.principal ?? 0 } as Row;
          });
        groups = grouped(rows, (r) => String(r.month), columns);
        break;
      }

      case 'member-ledger': {
        if (!params.memberId) fail('VALIDATION_ERROR', 'Choose a member.', { fieldErrors: { memberId: 'Choose a member' } });
        const m = memberById.get(params.memberId!) ?? members.find((x) => x.generalNo === params.memberId) ?? fail('NOT_FOUND', 'Member not found.');
        if (user.departmentId && m.departmentId !== user.departmentId) fail('FORBIDDEN', 'This member is not in your department.');
        const from = params.from?.slice(0, 7) ?? '0000-00';
        const to = params.to?.slice(0, 7) ?? '9999-99';
        filters.memberId = m.id;
        labels.unshift(`${m.name} · General No. ${m.generalNo}`, ...(params.from || params.to ? [`${params.from ? formatCycle(from) : 'Start'} – ${params.to ? formatCycle(to) : 'today'}`] : []));
        columns = [
          { key: 'head', label: 'Head', type: 'text' },
          { key: 'demand', label: 'Demand', type: 'money', total: true },
          { key: 'allocated', label: 'Paid', type: 'money', total: true },
          { key: 'unpaid', label: 'Unpaid', type: 'money', total: true },
          { key: 'balance', label: 'Running unpaid', type: 'money' },
        ];
        const rows: Row[] = [];
        let balance = 0;
        for (const line of lines.filter((l) => l.memberId === m.id && l.cycle >= from && l.cycle <= to)) {
          const isPosted = line.status === 'RECOVERY_POSTED';
          for (const c of [...line.components].sort((a, b) => HEADS.findIndex((h) => h.head === a.head) - HEADS.findIndex((h) => h.head === b.head))) {
            const unpaid = isPosted ? c.amount - c.allocated : 0;
            balance += unpaid;
            const loanNo = c.loanId ? loans.find((l) => l.id === c.loanId)?.loanNo : undefined;
            rows.push({ cycle: `${formatCycle(line.cycle)}${isPosted ? '' : ' (not posted yet)'}`, head: `${HEAD_LABEL[c.head]}${loanNo ? ` · ${loanNo}` : ''}`, demand: c.amount, allocated: isPosted ? c.allocated : 0, unpaid, balance });
          }
        }
        groups = grouped(rows, (r) => String(r.cycle), columns);
        break;
      }

      case 'loans-ledger': {
        const product = params.product;
        if (product) (filters.product = product, labels.unshift(products.find((p) => p.code === product)?.name ?? product));
        if (params.from) filters.from = params.from;
        if (params.to) filters.to = params.to;
        if (params.from || params.to) labels.push(`Disbursed ${params.from ? formatDisplayDate(params.from) : 'start'} – ${params.to ? formatDisplayDate(params.to) : 'today'}`);
        columns = [
          { key: 'loanNo', label: 'Loan No.', type: 'text' },
          { key: 'member', label: 'Member', type: 'text' },
          { key: 'sanctioned', label: 'Sanctioned', type: 'money', total: true },
          { key: 'disbursedOn', label: 'Disbursed on', type: 'date' },
          { key: 'principalRecovered', label: 'Principal recovered', type: 'money', total: true },
          { key: 'interestRecovered', label: 'Interest recovered', type: 'money', total: true },
          { key: 'outstanding', label: 'Outstanding', type: 'money', total: true },
        ];
        const rows = loans
          .filter((l) => (l.status === 'ACTIVE' || l.status === 'CLOSED') && l.disbursedOn && (!product || l.product === product) && inDept(l.memberId) && (!params.from || l.disbursedOn >= params.from) && (!params.to || l.disbursedOn <= params.to))
          .sort((a, b) => a.product.localeCompare(b.product) || a.disbursedOn!.localeCompare(b.disbursedOn!))
          .map((l) => {
            const m = memberById.get(l.memberId)!;
            const sanctioned = l.sanctionedAmount ?? l.appliedAmount;
            const outstanding = l.status === 'CLOSED' ? 0 : l.outstandingPrincipal;
            links[l.loanNo ?? l.applicationNo] = `/loans/${l.id}`;
            return { product: products.find((p) => p.code === l.product)?.name ?? l.product, loanNo: l.loanNo ?? l.applicationNo, member: `${m.name} (${m.generalNo})`, sanctioned, disbursedOn: l.disbursedOn!, principalRecovered: sanctioned - outstanding, interestRecovered: sum(l.schedule.filter((r) => r.paidStatus === 'PAID').map((r) => r.interest)), outstanding } as Row;
          });
        groups = grouped(rows, (r) => String(r.product), columns);
        break;
      }

      case 'retirement': {
        const within = Math.max(1, Math.min(60, Number(params.withinMonths) || 12));
        filters.withinMonths = String(within);
        labels.unshift(`Retiring within ${within} months of ${formatDisplayDate(today)}`);
        columns = [
          { key: 'generalNo', label: 'General No.', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'department', label: 'Department', type: 'text' },
          { key: 'dor', label: 'Retires on', type: 'date' },
          { key: 'left', label: 'Service left', type: 'text' },
          { key: 'outstanding', label: 'Loans outstanding', type: 'money', total: true },
          { key: 'sureties', label: 'Sureties given', type: 'number', total: true },
        ];
        const rows = members
          .filter((m) => m.status === 'ACTIVE' && inDept(m.id) && m.dor >= today && fullMonthsBetween(today, m.dor) < within)
          .sort((a, b) => a.dor.localeCompare(b.dor))
          .map((m) => {
            links[m.generalNo] = `/members/${m.id}`;
            return {
              generalNo: m.generalNo,
              name: m.name,
              department: dept(m.departmentId),
              dor: m.dor,
              left: calculateLeftoverService(m.dor, today).label,
              outstanding: sum(loans.filter((l) => l.memberId === m.id && l.status === 'ACTIVE').map((l) => l.outstandingPrincipal)),
              sureties: loans.filter((l) => l.status === 'ACTIVE' && l.sureties.some((s) => s.memberId === m.id && s.status === 'ACCEPTED')).length,
            } as Row;
          });
        groups = [{ label: '', rows, subtotal: totalsOf(rows, columns) }];
        break;
      }
    }

    const all = groups.flatMap((g) => g.rows);
    const result: ReportResult = { def: def!, asOf: today, generatedAt: now, filters, filterLabels: labels, columns, groups, totals: fixedTotals ?? totalsOf(all, columns), rowCount: all.length, links };
    await this.app.audit.record(request, { action: 'run', entity: 'report', entityId: id, summary: `Ran ${def!.title} (${result.rowCount} rows)` });
    return result;
  }

  /** ST-52 (REQ-066): the letter, with each posted month the member is short and BR-020 status. */
  async defaulterNotice(user: SessionUser, idOrGeneralNo: string): Promise<DefaulterNotice> {
    await this.requireView(user);
    const all = await this.app.members.all();
    const m = all.find((x) => x.id === idOrGeneralNo || x.generalNo === idOrGeneralNo) ?? fail('NOT_FOUND', 'Member not found.');
    if (user.departmentId && m.departmentId !== user.departmentId) fail('NOT_FOUND', 'Member not found.');
    const [today, cycle, settings, templates, departments, mine] = await Promise.all([businessToday(this.app), businessCycle(this.app), this.app.masters.settings(), this.app.masters.templates(), this.app.departments.all(), this.app.collections.repo.linesOfMember(m.id)]);
    const history = mine.filter((x) => x.sheet.status === 'RECOVERY_POSTED').map(({ sheet, line }) => ({ cycle: sheet.cycle, demand: line.totalDemand, recovered: allocated(line.components), loanUnpaid: loanUnpaid(line.components) }));
    const status = loanDefaulter(history, settings.defaulterCycles);
    const rows = history.filter((h) => h.recovered < h.demand).map(({ cycle: c, demand, recovered }) => ({ cycle: c, demand, recovered, unpaid: demand - recovered }));
    const total = sum(rows.map((x) => x.unpaid));
    const departmentName = departments.find((d) => d.id === m.departmentId)?.name ?? '';
    const vars: Record<string, string> = { name: m.name, generalNo: m.generalNo, department: departmentName, overdue: formatINR(total), cycle: formatCycle(cycle), dor: formatDisplayDate(m.dor), cycles: String(rows.length) };
    const body = templates.find((x) => x.key === 'defaulter.notice')?.body ?? DEFAULT_NOTICE;
    return {
      member: { id: m.id, name: m.name, generalNo: m.generalNo, designation: m.designation, departmentName, address: m.presentAddress },
      asOf: today,
      refNo: `TGSECCSL/DN/${m.generalNo}/${today.slice(0, 7).replace('-', '')}`,
      rows,
      totalUnpaid: total,
      consecutiveShort: status.consecutiveCycles,
      defaulterCycles: settings.defaulterCycles,
      isDefaulter: status.isDefaulter,
      text: {
        greeting: `Dear ${m.name},`,
        body: body.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`),
        closing: 'If you have already paid, please ignore this notice and share the receipt or payment reference with the society office.',
      },
      payTo: PAY_TO,
    };
  }
}
