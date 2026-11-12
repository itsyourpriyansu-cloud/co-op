import { financialYearOf, financialYearRange, formatDisplayDate, signedBalance, type LedgerAccountType } from '@tgs/domain';
import type { Member, ReportCell, ReportColumn, ReportFilterKey, ReportResult } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { ACCOUNT, DEPOSIT_ACCOUNT } from '../ledger/ledger.accounts';
import { entryNo } from '../ledger/ledger.service';

type Row = Record<string, ReportCell>;
type Params = Partial<Record<ReportFilterKey, string>>;
export interface Built {
  columns: ReportColumn[];
  groups: ReportResult['groups'];
  filters: Params;
  labels: string[];
  links: Record<string, string>;
  /** Report-specific grand totals (when summing every row would mix sides, e.g. P&L). */
  totals?: Record<string, number>;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const CASH_BANK = new Set<string>([ACCOUNT.CASH, ACCOUNT.BANK]);
const SCHEME_ACCOUNT: Record<string, string> = { FD: DEPOSIT_ACCOUNT.FD, CRD: DEPOSIT_ACCOUNT.CRD, SRDS: DEPOSIT_ACCOUNT.SRDS };
const isDate = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
const subtotal = (rows: Row[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, sum(rows.map((r) => Number(r[k] ?? 0)))]));
const monthLabel = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * G2 (D-112): the accounting statements and registers (REQ-068…081), straight from the journal.
 * Ranges default to the current financial year up to today.
 */
export async function accountingReport(app: FastifyInstance, id: string, params: Params, today: string, members: Member[]): Promise<Built> {
  const ledger = app.ledger.repo;
  const start = (await app.masters.settings()).financialYearStartMonth;
  const fy = financialYearRange(financialYearOf(today, start), start);
  const accounts = await ledger.accounts();
  const acct = new Map(accounts.map((a) => [a.code, a]));
  const name = (code: string) => acct.get(code)?.name ?? code;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const who = (id?: string | null) => (id ? (memberById.get(id) ? `${memberById.get(id)!.name} (${memberById.get(id)!.generalNo})` : id) : '');
  const filters: Params = {};
  const labels: string[] = [];
  const links: Record<string, string> = {};
  const range = () => {
    const from = isDate(params.from) ? params.from! : fy.from;
    const to = isDate(params.to) ? params.to! : today;
    if (to < from) fail('VALIDATION_ERROR', 'The end date is before the start date.', { fieldErrors: { to: 'Must be on or after the start date' } });
    filters.from = from;
    filters.to = to;
    labels.unshift(`${formatDisplayDate(from)} – ${formatDisplayDate(to)}`);
    return { from, to };
  };
  const asOf = () => {
    const d = isDate(params.asOf) ? params.asOf! : today;
    filters.asOf = d;
    labels.unshift(`As on ${formatDisplayDate(d)}`);
    return d;
  };
  /** Balance of each account (in its own direction) from totals rows. */
  const balances = (rows: Array<{ accountCode: string; debit: string; credit: string }>) =>
    rows.map((t) => ({ code: t.accountCode, type: acct.get(t.accountCode)?.type as LedgerAccountType, debit: Number(t.debit), credit: Number(t.credit) })).filter((r) => r.type).map((r) => ({ ...r, balance: signedBalance(r.type, r.debit, r.credit) }));
  const linesOf = (f: { from?: string; to?: string; accountCode?: string }) => ledger.lines(f, 20_000);
  const opening = async (before: string, code: string) => {
    const t = (await ledger.openingTotals(before, { accountCode: code }))[0];
    return t ? signedBalance(acct.get(code)!.type, Number(t.debit), Number(t.credit)) : 0;
  };

  switch (id) {
    case 'books': {
      const book = params.book === 'CASH' || params.book === 'BANK' ? params.book : 'DAY';
      filters.book = book;
      const { from, to } = range();
      if (book === 'DAY') {
        labels.unshift('Day book');
        const columns: ReportColumn[] = [
          { key: 'entryNo', label: 'Entry', type: 'text' },
          { key: 'account', label: 'Account', type: 'text' },
          { key: 'narration', label: 'Particulars', type: 'text' },
          { key: 'debit', label: 'Debit', type: 'money', total: true },
          { key: 'credit', label: 'Credit', type: 'money', total: true },
        ];
        const rows = (await linesOf({ from, to })).map(({ line, entry }) => ({ date: formatDisplayDate(entry.entryDate), entryNo: entryNo(entry.entryNo), account: `${name(line.accountCode)}${line.memberId ? ` · ${who(line.memberId)}` : ''}`, narration: entry.narration, debit: line.debit, credit: line.credit }) as Row);
        const map = new Map<string, Row[]>();
        for (const r of rows) map.set(String(r.date), [...(map.get(String(r.date)) ?? []), r]);
        return { columns, groups: [...map].map(([label, rs]) => ({ label, rows: rs, subtotal: subtotal(rs, ['debit', 'credit']) })), filters, labels, links };
      }
      const code = book === 'CASH' ? ACCOUNT.CASH : ACCOUNT.BANK;
      labels.unshift(book === 'CASH' ? 'Cash book' : 'Bank book');
      const columns: ReportColumn[] = [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'entryNo', label: 'Entry', type: 'text' },
        { key: 'narration', label: 'Particulars', type: 'text' },
        { key: 'receipts', label: 'Receipts', type: 'money', total: true },
        { key: 'payments', label: 'Payments', type: 'money', total: true },
        { key: 'balance', label: 'Balance', type: 'money' },
      ];
      let bal = await opening(from, code);
      const rows: Row[] = [{ date: from, entryNo: '', narration: 'Opening balance', receipts: 0, payments: 0, balance: bal }];
      for (const { line, entry } of await linesOf({ from, to, accountCode: code })) {
        bal += line.debit - line.credit;
        rows.push({ date: entry.entryDate, entryNo: entryNo(entry.entryNo), narration: entry.narration, receipts: line.debit, payments: line.credit, balance: bal });
      }
      return { columns, groups: [{ label: '', rows, subtotal: subtotal(rows, ['receipts', 'payments']) }], filters, labels: [...labels, `Closing balance ₹${(bal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`], links };
    }

    case 'general-ledger': {
      const code = params.account && acct.has(params.account) ? params.account : ACCOUNT.BANK;
      filters.account = code;
      const { from, to } = range();
      const a = acct.get(code)!;
      labels.unshift(`${code} ${a.name}`);
      const columns: ReportColumn[] = [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'entryNo', label: 'Entry', type: 'text' },
        { key: 'narration', label: 'Particulars', type: 'text' },
        { key: 'debit', label: 'Debit', type: 'money', total: true },
        { key: 'credit', label: 'Credit', type: 'money', total: true },
        { key: 'balance', label: 'Balance', type: 'money' },
      ];
      let bal = await opening(from, code);
      const rows: Row[] = [{ date: from, entryNo: '', narration: 'Opening balance', debit: 0, credit: 0, balance: bal }];
      for (const { line, entry } of await linesOf({ from, to, accountCode: code })) {
        bal += signedBalance(a.type, line.debit, line.credit);
        rows.push({ date: entry.entryDate, entryNo: entryNo(entry.entryNo), narration: `${entry.narration}${line.memberId ? ` · ${who(line.memberId)}` : ''}`, debit: line.debit, credit: line.credit, balance: bal });
      }
      return { columns, groups: [{ label: '', rows, subtotal: subtotal(rows, ['debit', 'credit']) }], filters, labels, links };
    }

    case 'trial-balance': {
      const d = asOf();
      const columns: ReportColumn[] = [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'name', label: 'Account', type: 'text' },
        { key: 'debit', label: 'Debit', type: 'money', total: true },
        { key: 'credit', label: 'Credit', type: 'money', total: true },
      ];
      const tb = await app.ledger.trialBalance(d);
      const order: LedgerAccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
      const label: Record<LedgerAccountType, string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Capital and reserves', INCOME: 'Income', EXPENSE: 'Expenses' };
      const groups = order
        .map((t) => {
          const rows = tb.rows.filter((r) => r.type === t && (r.debitBalance || r.creditBalance)).map((r) => ({ code: r.code, name: r.name, debit: r.debitBalance, credit: r.creditBalance }) as Row);
          return { label: label[t], rows, subtotal: subtotal(rows, ['debit', 'credit']) };
        })
        .filter((g) => g.rows.length);
      if (!tb.balanced) labels.push('Not balanced: check the journal');
      return { columns, groups, filters, labels, links };
    }

    case 'profit-loss': {
      const { from, to } = range();
      const columns: ReportColumn[] = [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'name', label: 'Head', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ];
      const b = balances(await ledger.totalsBetween({ from, to }, ['YEAR_CLOSE']));
      const part = (t: LedgerAccountType) => b.filter((r) => r.type === t && r.balance).map((r) => ({ code: r.code, name: name(r.code), amount: r.balance }) as Row);
      const income = part('INCOME');
      const expense = part('EXPENSE');
      const ti = sum(income.map((r) => Number(r.amount)));
      const te = sum(expense.map((r) => Number(r.amount)));
      const result = ti - te;
      return {
        columns,
        groups: [
          { label: 'Income', rows: income, subtotal: { amount: ti } },
          { label: 'Expenditure', rows: expense, subtotal: { amount: te } },
          { label: result >= 0 ? 'Surplus' : 'Deficit', rows: [{ code: '', name: result >= 0 ? 'Income less expenditure' : 'Expenditure more than income', amount: Math.abs(result) }], subtotal: { amount: Math.abs(result) } },
        ],
        filters,
        labels,
        links,
        totals: { amount: result },
      };
    }

    case 'balance-sheet': {
      const d = asOf();
      const columns: ReportColumn[] = [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'name', label: 'Head', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ];
      const b = balances(await ledger.totalsByAccount(d));
      const part = (t: LedgerAccountType) => b.filter((r) => r.type === t && r.balance).map((r) => ({ code: r.code, name: name(r.code), amount: r.balance }) as Row);
      const assets = part('ASSET');
      const liabilities = part('LIABILITY');
      const equity = part('EQUITY');
      // Income less expenses not yet closed into the surplus account.
      const open = sum(b.filter((r) => r.type === 'INCOME').map((r) => r.balance)) - sum(b.filter((r) => r.type === 'EXPENSE').map((r) => r.balance));
      if (open) equity.push({ code: '', name: 'Surplus for the year (not yet closed)', amount: open });
      const ta = sum(assets.map((r) => Number(r.amount)));
      const tl = sum(liabilities.map((r) => Number(r.amount)));
      const tq = sum(equity.map((r) => Number(r.amount)));
      if (ta !== tl + tq) labels.push('Not balanced: check the journal');
      return {
        columns,
        groups: [
          { label: 'Capital and liabilities', rows: [...equity, ...liabilities], subtotal: { amount: tl + tq } },
          { label: 'Assets', rows: assets, subtotal: { amount: ta } },
        ],
        filters,
        labels,
        links,
        totals: {},
      };
    }

    case 'receipts-payments':
    case 'monthly-receipts':
    case 'monthly-payments': {
      const { from, to } = range();
      // Every line on the other side of a cash or bank line: credits are receipts, debits are payments.
      const lines = await linesOf({ from, to });
      const byEntry = new Map<string, typeof lines>();
      for (const l of lines) byEntry.set(l.entry.id, [...(byEntry.get(l.entry.id) ?? []), l]);
      const moves: Array<{ date: string; code: string; receipt: number; payment: number }> = [];
      for (const ls of byEntry.values()) {
        if (!ls.some((l) => CASH_BANK.has(l.line.accountCode))) continue;
        for (const { line, entry } of ls) if (!CASH_BANK.has(line.accountCode)) moves.push({ date: entry.entryDate, code: line.accountCode, receipt: line.credit, payment: line.debit });
      }
      const head = (code: string) => (acct.get(code)?.parentCode ? `${name(acct.get(code)!.parentCode!)} · ${name(code)}` : name(code));
      if (id === 'receipts-payments') {
        const columns: ReportColumn[] = [
          { key: 'name', label: 'Head', type: 'text' },
          { key: 'amount', label: 'Amount', type: 'money' },
        ];
        const roll = (pick: 'receipt' | 'payment') => {
          const m = new Map<string, number>();
          for (const x of moves) if (x[pick]) m.set(x.code, (m.get(x.code) ?? 0) + x[pick]);
          return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([code, amount]) => ({ name: head(code), amount }) as Row);
        };
        const openCash = (await opening(from, ACCOUNT.CASH)) + (await opening(from, ACCOUNT.BANK));
        const r = roll('receipt');
        const p = roll('payment');
        const tr = sum(r.map((x) => Number(x.amount)));
        const tp = sum(p.map((x) => Number(x.amount)));
        return {
          columns,
          groups: [
            { label: 'Receipts', rows: [{ name: 'Opening cash and bank', amount: openCash }, ...r], subtotal: { amount: openCash + tr } },
            { label: 'Payments', rows: [...p, { name: 'Closing cash and bank', amount: openCash + tr - tp }], subtotal: { amount: openCash + tr } },
          ],
          filters,
          labels,
          links,
          totals: {},
        };
      }
      const pick = id === 'monthly-receipts' ? 'receipt' : 'payment';
      const columns: ReportColumn[] = [
        { key: 'name', label: 'Head', type: 'text' },
        { key: 'amount', label: id === 'monthly-receipts' ? 'Received' : 'Paid', type: 'money', total: true },
      ];
      const byMonth = new Map<string, Map<string, number>>();
      for (const x of moves) {
        if (!x[pick]) continue;
        const k = x.date.slice(0, 7);
        const m = byMonth.get(k) ?? new Map<string, number>();
        m.set(x.code, (m.get(x.code) ?? 0) + x[pick]);
        byMonth.set(k, m);
      }
      const groups = [...byMonth]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, m]) => {
          const rows = [...m].sort(([a], [b]) => a.localeCompare(b)).map(([code, amount]) => ({ name: head(code), amount }) as Row);
          return { label: monthLabel(`${k}-01`), rows, subtotal: subtotal(rows, ['amount']) };
        });
      return { columns, groups, filters, labels, links };
    }

    case 'deposits-ledger':
    case 'shares-ledger': {
      const { from, to } = range();
      const schemes = id === 'shares-ledger' ? { SHARE_CAPITAL: ACCOUNT.SHARE_CAPITAL, SHARE_DEPOSIT: ACCOUNT.SHARE_DEPOSIT } : params.scheme && SCHEME_ACCOUNT[params.scheme] ? { [params.scheme]: SCHEME_ACCOUNT[params.scheme]! } : SCHEME_ACCOUNT;
      if (id === 'deposits-ledger' && params.scheme && SCHEME_ACCOUNT[params.scheme]) filters.scheme = params.scheme;
      const columns: ReportColumn[] = [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'entryNo', label: 'Entry', type: 'text' },
        { key: 'member', label: 'Member', type: 'text' },
        { key: 'narration', label: 'Particulars', type: 'text' },
        { key: 'debit', label: 'Paid out', type: 'money', total: true },
        { key: 'credit', label: 'Received', type: 'money', total: true },
      ];
      const groups: ReportResult['groups'] = [];
      for (const code of Object.values(schemes)) {
        const rows: Row[] = [];
        for (const { line, entry } of await linesOf({ from, to, accountCode: code })) {
          const m = line.memberId ? memberById.get(line.memberId) : undefined;
          if (m) links[`${m.name} (${m.generalNo})`] = `/members/${m.id}`;
          rows.push({ date: entry.entryDate, entryNo: entryNo(entry.entryNo), member: who(line.memberId), narration: entry.narration, debit: line.debit, credit: line.credit });
        }
        if (rows.length) groups.push({ label: name(code), rows, subtotal: subtotal(rows, ['debit', 'credit']) });
      }
      return { columns, groups, filters, labels, links };
    }

    case 'dob-anniversary': {
      const month = Math.min(12, Math.max(1, Number(params.month) || Number(today.slice(5, 7))));
      filters.month = String(month);
      const mm = String(month).padStart(2, '0');
      labels.unshift(new Date(`2000-${mm}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' }));
      const columns: ReportColumn[] = [
        { key: 'day', label: 'Day', type: 'number' },
        { key: 'generalNo', label: 'General No.', type: 'text' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'mobile', label: 'Mobile', type: 'text' },
        { key: 'years', label: 'Years', type: 'number' },
      ];
      const year = Number(today.slice(0, 4));
      const active = members.filter((m) => m.status === 'ACTIVE');
      const pick = (field: 'dob' | 'joinedSocietyOn') =>
        active
          .filter((m) => m[field]?.slice(5, 7) === mm)
          .map((m) => {
            links[m.generalNo] = `/members/${m.id}`;
            return { day: Number(m[field].slice(8, 10)), generalNo: m.generalNo, name: m.name, mobile: m.mobileMasked, years: year - Number(m[field].slice(0, 4)) } as Row;
          })
          .sort((a, b) => Number(a.day) - Number(b.day));
      return { columns, groups: [{ label: 'Birthdays', rows: pick('dob'), subtotal: {} }, { label: 'Years with the society', rows: pick('joinedSocietyOn'), subtotal: {} }].filter((g) => g.rows.length), filters, labels, links };
    }
  }
  return fail('NOT_FOUND', 'This report is not available.');
}
