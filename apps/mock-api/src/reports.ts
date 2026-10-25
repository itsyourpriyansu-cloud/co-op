// ST-50 / ST-51 report registry and the 8 MVP builders (docs/13 §5, REQ-060…074, D-063). Read models
// over the ledgers: every money figure comes from the same records the screens post to, so the totals
// reconcile (J-13). "Unpaid" = demand − allocated, i.e. after counter / reported payments (D-061).
import { calculateLeftoverService, checkDefaulter, formatCycle, formatDisplayDate, fullMonthsBetween } from '@tgs/domain';
import type { Cycle, DemandHead, ReportCell, ReportColumn, ReportDef, ReportFilterKey, ReportId, ReportOptions, ReportResult } from '@tgs/types';
import { fail } from './errors';
import { nowIso } from './common';
import type { Db } from './store';

export const REPORTS: ReportDef[] = [
  { id: 'dues', group: 'Collections', title: 'Dues list', reqId: 'REQ-060', kind: 'table', available: true, filters: ['cycle', 'departmentId'], description: 'What each member still owes after salary recovery and counter payments, head by head.' },
  { id: 'defaulters', group: 'Collections', title: 'Defaulters list', reqId: 'REQ-061', kind: 'table', available: true, filters: ['cycle', 'departmentId', 'minCycles'], description: 'Members short in the last N posted cycles in a row (BR-020).', note: 'Definition is a placeholder (Q-310).' },
  { id: 'dept-unpaid', group: 'Collections', title: 'Department-wise unpaid collections', reqId: 'REQ-062', kind: 'table', available: true, filters: ['cycle'], description: 'Demand, recovered and unpaid per department for one month.' },
  { id: 'dept-less', group: 'Collections', title: 'Department-wise less collections', reqId: 'REQ-063', kind: 'table', available: true, filters: ['cycle', 'departmentId'], description: 'Every member whose salary deduction came short, grouped by department.' },
  { id: 'defaulter-notice', group: 'Collections', title: 'Defaulter notice', reqId: 'REQ-066', kind: 'print', available: true, filters: ['memberId'], printLink: '/reports/print/defaulter-notice', description: 'Printable letter on the letterhead asking a member to clear the overdue amount.' },
  { id: 'loans-ledger', group: 'Loans', title: 'Loans ledger', reqId: 'REQ-067', kind: 'table', available: true, filters: ['product', 'departmentId', 'from', 'to'], description: 'Each loan with sanctioned amount, recoveries and outstanding, by loan type.' },
  { id: 'maturity', group: 'Deposits & Shares', title: 'Maturity report', reqId: 'REQ-064', kind: 'table', available: true, filters: ['from', 'to', 'scheme'], description: 'Fixed deposits maturing in a date range, by month.' },
  { id: 'deposits-ledger', group: 'Deposits & Shares', title: 'Deposits ledger', reqId: 'REQ-068', kind: 'table', available: false, filters: [], description: 'Every deposit transaction by account.', note: 'P2, after the MVP.' },
  { id: 'shares-ledger', group: 'Deposits & Shares', title: 'Shares ledger', reqId: 'REQ-069', kind: 'table', available: false, filters: [], description: 'Share capital and share deposit movements per member.', note: 'P2, after the MVP.' },
  { id: 'member-ledger', group: 'Members', title: 'Member-wise ledger', reqId: 'REQ-065', kind: 'table', available: true, filters: ['memberId', 'from', 'to'], description: 'One member, month by month and head by head, with the running unpaid balance.' },
  { id: 'retirement', group: 'Members', title: 'Retirement report', reqId: 'REQ-073', kind: 'table', available: true, filters: ['withinMonths', 'departmentId'], description: 'Members retiring soon, what they still owe and the loans they stand surety for.' },
  { id: 'dob-anniversary', group: 'Members', title: 'Birthdays & anniversaries', reqId: 'REQ-074', kind: 'table', available: false, filters: [], description: 'Member birthdays and wedding anniversaries this month.', note: 'P2, after the MVP.' },
  ...([
    ['receipts-payments', 'Receipts & payments', 'REQ-070'],
    ['monthly-receipts', 'Month-wise receipts', 'REQ-071'],
    ['monthly-payments', 'Month-wise payments', 'REQ-072'],
    ['general-ledger', 'General ledger', 'REQ-075'],
    ['trial-balance', 'Trial balance', 'REQ-076'],
    ['profit-loss', 'Profit & loss', 'REQ-077'],
    ['balance-sheet', 'Balance sheet', 'REQ-078'],
    ['books', 'Day, cash & bank book', 'REQ-079…081'],
  ] as const).map(([id, title, reqId]) => ({ id, title, reqId, group: 'Cash & Accounts' as const, kind: 'table' as const, available: false, filters: [] as ReportFilterKey[], description: 'Accounting statement.', note: 'Needs the accounting module (Q-401).' })),
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
];
const HEAD_LABEL = Object.fromEntries(HEADS.map((h) => [h.head, h.label])) as Record<DemandHead, string>;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
type Row = Record<string, ReportCell>;
type Params = Partial<Record<ReportFilterKey, string>>;

export function reportOptions(db: Db): ReportOptions {
  return {
    cycles: [...new Set(db.demandSheets.filter((s) => s.status === 'RECOVERY_POSTED').map((s) => s.cycle))].sort().reverse(),
    departments: db.departments.map((d) => ({ id: d.id, name: d.name })),
    products: db.loanProducts.map((p) => ({ code: p.code, name: p.name })),
    defaulterCycles: db.settings.defaulterCycles,
  };
}

function lastPosted(db: Db): Cycle {
  return reportOptions(db).cycles[0] ?? db.currentCycle;
}

function grouped(rows: Row[], by: (r: Row) => string, columns: ReportColumn[]): ReportResult['groups'] {
  const order: string[] = [];
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = by(r);
    if (!map.has(k)) (order.push(k), map.set(k, []));
    map.get(k)!.push(r);
  }
  return order.map((label) => ({ label, rows: map.get(label)!, subtotal: totalsOf(map.get(label)!, columns) }));
}

function totalsOf(rows: Row[], columns: ReportColumn[]): Record<string, number> {
  return Object.fromEntries(columns.filter((c) => c.total).map((c) => [c.key, sum(rows.map((r) => Number(r[c.key] ?? 0)))]));
}

/** Runs one MVP report. Unknown / unavailable ids → 404; missing required filters → 400. */
export function runReport(db: Db, id: string, params: Params, scopeDepartmentId?: string): ReportResult {
  const def = REPORTS.find((r) => r.id === id);
  if (!def || !def.available || def.kind !== 'table') fail('NOT_FOUND', 'This report is not available in the prototype.');
  const dept = (deptId: string) => db.departments.find((d) => d.id === deptId)?.name ?? deptId;
  const memberById = new Map(db.members.map((m) => [m.id, m]));
  const departmentId = scopeDepartmentId ?? params.departmentId;
  const inDept = (memberId: string) => !departmentId || memberById.get(memberId)?.departmentId === departmentId;
  const today = db.demo.today;
  const filters: Params = {};
  const labels: string[] = [];
  if (departmentId) (filters.departmentId = departmentId, labels.push(`Department: ${dept(departmentId)}`));
  const links: Record<string, string> = {};
  let columns: ReportColumn[] = [];
  let groups: ReportResult['groups'] = [];

  const postedSheets = (upTo: Cycle) => db.demandSheets.filter((s) => s.status === 'RECOVERY_POSTED' && s.cycle <= upTo);

  switch (id as ReportId) {
    case 'dues': {
      const cycle = params.cycle ?? lastPosted(db);
      filters.cycle = cycle;
      labels.unshift(`As on ${formatCycle(cycle)}`);
      const perMember = new Map<string, Record<DemandHead, number>>();
      for (const sh of postedSheets(cycle))
        for (const line of sh.lines) {
          if (!inDept(line.memberId)) continue;
          for (const c of line.components) {
            const unpaid = c.amount - c.allocated;
            if (unpaid <= 0) continue;
            const acc = perMember.get(line.memberId) ?? (Object.fromEntries(HEADS.map((h) => [h.head, 0])) as Record<DemandHead, number>);
            acc[c.head] += unpaid;
            perMember.set(line.memberId, acc);
          }
        }
      const used = HEADS.filter((h) => [...perMember.values()].some((v) => v[h.head] > 0));
      columns = [{ key: 'generalNo', label: 'General No.', type: 'text' }, { key: 'name', label: 'Name', type: 'text' }, ...used.map((h) => ({ key: h.head, label: h.label, type: 'money' as const, total: true })), { key: 'total', label: 'Total due', type: 'money', total: true }];
      const rows = [...perMember.entries()].map(([memberId, heads]) => {
        const m = memberById.get(memberId)!;
        links[m.generalNo] = `/members/${m.id}`;
        return { generalNo: m.generalNo, name: m.name, department: dept(m.departmentId), ...Object.fromEntries(used.map((h) => [h.head, heads[h.head]])), total: sum(Object.values(heads)) } as Row;
      });
      rows.sort((a, b) => String(a.department).localeCompare(String(b.department)) || String(a.generalNo).localeCompare(String(b.generalNo)));
      groups = grouped(rows, (r) => String(r.department), columns);
      break;
    }

    case 'defaulters': {
      const cycle = params.cycle ?? lastPosted(db);
      const min = Math.max(1, Number(params.minCycles) || db.settings.defaulterCycles);
      filters.cycle = cycle;
      filters.minCycles = String(min);
      labels.unshift(`As on ${formatCycle(cycle)}`, `Short in the last ${min}+ cycles in a row`);
      const history = new Map<string, Array<{ cycle: Cycle; demand: number; recovered: number }>>();
      for (const sh of [...postedSheets(cycle)].sort((a, b) => a.cycle.localeCompare(b.cycle)))
        for (const line of sh.lines) {
          if (!inDept(line.memberId)) continue;
          const h = history.get(line.memberId) ?? [];
          h.push({ cycle: sh.cycle, demand: line.totalDemand, recovered: sum(line.components.map((c) => c.allocated)) });
          history.set(line.memberId, h);
        }
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
        const r = checkDefaulter(h, min);
        if (r.pass) continue;
        const m = memberById.get(memberId)!;
        links[m.generalNo] = `/members/${m.id}`;
        rows.push({ generalNo: m.generalNo, name: m.name, department: dept(m.departmentId), mobile: m.mobileMasked, cycles: r.consecutiveShort, since: h[h.length - r.consecutiveShort]!.cycle, overdue: r.arrears, loans: db.loans.filter((l) => l.memberId === memberId && l.status === 'ACTIVE').length });
      }
      rows.sort((a, b) => Number(b.overdue) - Number(a.overdue));
      groups = grouped(rows, (r) => String(r.department), columns);
      break;
    }

    case 'dept-unpaid': {
      const cycle = params.cycle ?? lastPosted(db);
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
      const rows = db.demandSheets
        .filter((s) => s.cycle === cycle && (!departmentId || s.departmentId === departmentId))
        .map((s) => ({ department: dept(s.departmentId), members: s.lines.length, demand: s.totalDemand, recovered: s.totalRecovered, unpaid: s.totalDemand - s.totalRecovered, rate: s.totalDemand ? s.totalRecovered / s.totalDemand : 0 }) as Row)
        .sort((a, b) => Number(b.unpaid) - Number(a.unpaid));
      groups = [{ label: '', rows, subtotal: totalsOf(rows, columns) }];
      break;
    }

    case 'dept-less': {
      const cycle = params.cycle ?? lastPosted(db);
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
      for (const s of db.demandSheets.filter((x) => x.cycle === cycle && x.status === 'RECOVERY_POSTED' && (!departmentId || x.departmentId === departmentId)))
        for (const l of s.lines) {
          const rec = l.recovered ?? 0;
          if (rec >= l.totalDemand) continue;
          const m = memberById.get(l.memberId)!;
          links[m.generalNo] = `/members/${m.id}`;
          rows.push({ department: dept(s.departmentId), generalNo: m.generalNo, name: m.name, designation: m.designation, demand: l.totalDemand, recovered: rec, short: l.totalDemand - rec });
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
      const rows = db.deposits
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
      const m = memberById.get(params.memberId!) ?? db.members.find((x) => x.generalNo === params.memberId) ?? fail('NOT_FOUND', 'Member not found.');
      if (scopeDepartmentId && m.departmentId !== scopeDepartmentId) fail('FORBIDDEN', 'This member is not in your department.');
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
      for (const sh of [...db.demandSheets].filter((s) => s.cycle >= from && s.cycle <= to).sort((a, b) => a.cycle.localeCompare(b.cycle))) {
        const line = sh.lines.find((l) => l.memberId === m.id);
        if (!line) continue;
        const posted = sh.status === 'RECOVERY_POSTED';
        for (const c of [...line.components].sort((a, b) => HEADS.findIndex((h) => h.head === a.head) - HEADS.findIndex((h) => h.head === b.head))) {
          const paid = posted ? c.allocated : 0;
          const unpaid = posted ? c.amount - c.allocated : 0;
          balance += unpaid;
          const loanNo = c.loanId ? db.loans.find((l) => l.id === c.loanId)?.loanNo : undefined;
          rows.push({ cycle: `${formatCycle(sh.cycle)}${posted ? '' : ' (not posted yet)'}`, head: `${HEAD_LABEL[c.head]}${loanNo ? ` · ${loanNo}` : ''}`, demand: c.amount, allocated: paid, unpaid, balance });
        }
      }
      groups = grouped(rows, (r) => String(r.cycle), columns);
      break;
    }

    case 'loans-ledger': {
      const product = params.product;
      if (product) (filters.product = product, labels.unshift(db.loanProducts.find((p) => p.code === product)?.name ?? product));
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
      const productName = (code: string) => db.loanProducts.find((p) => p.code === code)?.name ?? code;
      const rows = db.loans
        .filter((l) => (l.status === 'ACTIVE' || l.status === 'CLOSED') && l.disbursedOn && (!product || l.product === product) && inDept(l.memberId) && (!params.from || l.disbursedOn >= params.from) && (!params.to || l.disbursedOn <= params.to))
        .sort((a, b) => a.product.localeCompare(b.product) || a.disbursedOn!.localeCompare(b.disbursedOn!))
        .map((l) => {
          const m = memberById.get(l.memberId)!;
          const sanctioned = l.sanctionedAmount ?? l.appliedAmount;
          const outstanding = l.status === 'CLOSED' ? 0 : l.outstandingPrincipal;
          links[l.loanNo ?? l.applicationNo] = `/loans/${l.id}`;
          return { product: productName(l.product), loanNo: l.loanNo ?? l.applicationNo, member: `${m.name} (${m.generalNo})`, sanctioned, disbursedOn: l.disbursedOn!, principalRecovered: sanctioned - outstanding, interestRecovered: sum(l.schedule.filter((r) => r.paidStatus === 'PAID').map((r) => r.interest)), outstanding } as Row;
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
      const rows = db.members
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
            outstanding: sum(db.loans.filter((l) => l.memberId === m.id && l.status === 'ACTIVE').map((l) => l.outstandingPrincipal)),
            sureties: db.loans.filter((l) => l.status === 'ACTIVE' && l.sureties.some((s) => s.memberId === m.id && s.status === 'ACCEPTED')).length,
          } as Row;
        });
      groups = [{ label: '', rows, subtotal: totalsOf(rows, columns) }];
      break;
    }
  }

  const all = groups.flatMap((g) => g.rows);
  return { def: def!, asOf: today, generatedAt: nowIso(), filters, filterLabels: labels, columns, groups, totals: totalsOf(all, columns), rowCount: all.length, links };
}
