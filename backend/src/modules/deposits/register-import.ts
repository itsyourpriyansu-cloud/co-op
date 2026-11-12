import { calculateFdMaturity, type JournalLineInput } from '@tgs/domain';
import type { DepositAccount, PayoutFrequency } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { parseCsv } from '../../common/utils/csv';
import { withTransaction } from '../../db/transaction';
import { ACCOUNT, DEPOSIT_ACCOUNT } from '../ledger/ledger.accounts';
import { isDate, RESERVED_NUMBER, rupees, type ImportResult } from '../members/register-import';

// G6 (D-116, F-11): the society's deposits at go-live. One CSV row per account (template:
// backend/import/deposits-register-template.csv, amounts in rupees), after the member register.
// FD: principal, tenure, rate and payout as on the FDR; maturity is worked out with the F4 rules.
// CRD / SRDS: the member's one compulsory account with its balance; the monthly amount defaults to
// the setting. Each account gets one OPENING entry: Dr 3900, Cr the scheme's deposit head.
// The share deposit comes with the member register (shareDepositBalance).

export const DEPOSIT_REGISTER_COLUMNS = ['generalNo', 'scheme', 'accountNo', 'fdrNo', 'openedOn', 'principal', 'tenureMonths', 'ratePercent', 'payoutFrequency', 'monthlyAmount', 'balance'] as const;

const PAYOUTS: PayoutFrequency[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ON_MATURITY'];
const SCHEMES = ['FD', 'CRD', 'SRDS'] as const;

export async function importDepositRegister(app: FastifyInstance, csv: string, opts: { commit: boolean; asOn: string; actor: { id: string; name: string } }): Promise<ImportResult> {
  if (!isDate(opts.asOn)) throw new Error('The as-on date must be YYYY-MM-DD.');
  const rows = parseCsv(csv);
  const result: ImportResult = { rows: rows.length, committed: false, errors: [], totals: { FD: 0, CRD: 0, SRDS: 0 } };
  const missing = DEPOSIT_REGISTER_COLUMNS.filter((c) => rows[0] && !(c in rows[0]));
  if (!rows.length || missing.length) {
    result.errors.push({ row: 1, generalNo: '', fieldErrors: { header: rows.length ? `Missing columns: ${missing.join(', ')}` : 'The file has no deposit rows.' } });
    return result;
  }

  const [settings, members, existing] = await Promise.all([app.masters.settings(), app.members.repo.others(), app.deposits.repo.list()]);
  const byGeneralNo = new Map(members.map((m) => [m.generalNo, m]));
  const numbers = new Set(existing.flatMap((d) => [d.accountNo, ...(d.fdrNo ? [d.fdrNo] : [])]));
  const compulsory = new Set(existing.filter((d) => d.scheme === 'CRD' || d.scheme === 'SRDS').map((d) => `${d.memberId}:${d.scheme}`));
  const parsed: DepositAccount[] = [];

  for (const [i, r] of rows.entries()) {
    const e: Record<string, string> = {};
    const m = byGeneralNo.get(r.generalNo ?? '');
    const scheme = (r.scheme ?? '').toUpperCase() as (typeof SCHEMES)[number];
    if (!m) e.generalNo = 'No member with this General No. (import the member register first)';
    if (!SCHEMES.includes(scheme)) e.scheme = 'One of FD, CRD, SRDS';
    if (!isDate(r.openedOn) || r.openedOn! > opts.asOn) e.openedOn = 'Date as YYYY-MM-DD, not after the as-on date';
    const accountNo = (r.accountNo ?? '').trim() || (scheme !== 'FD' && m ? `${scheme}-${m.generalNo}` : '');
    const fdrNo = (r.fdrNo ?? '').trim();
    for (const [k, v] of [['accountNo', accountNo], ['fdrNo', fdrNo]] as const) {
      if (v && RESERVED_NUMBER.test(v) && !(k === 'accountNo' && scheme !== 'FD' && v === `${scheme}-${m?.generalNo}`)) e[k] = 'This pattern is kept for numbers the system gives; use the register number';
      else if (v && numbers.has(v)) e[k] = 'Number already used';
    }
    if (!accountNo && (m || scheme === 'FD')) e.accountNo = 'Enter the account number from the register';

    const base = { id: '', accountNo, memberId: m?.id ?? '', status: 'ACTIVE' as const, openedOn: r.openedOn!, operationMode: 'SINGLE' as const, jointHolders: [], channel: 'COUNTER' as const };
    let account: DepositAccount | undefined;
    if (scheme === 'FD') {
      const principal = rupees(r.principal);
      const tenure = Number(r.tenureMonths);
      const rate = Number(r.ratePercent);
      const payout = ((r.payoutFrequency ?? '').toUpperCase() || 'ON_MATURITY') as PayoutFrequency;
      if (!fdrNo) e.fdrNo = 'Enter the FDR number';
      if (!(principal > 0)) e.principal = 'Enter the amount deposited in rupees';
      if (!Number.isInteger(tenure) || tenure < 1) e.tenureMonths = 'Whole number of months';
      if (!(rate >= 0 && rate <= 20)) e.ratePercent = 'Annual rate between 0 and 20';
      if (!PAYOUTS.includes(payout)) e.payoutFrequency = `One of ${PAYOUTS.join(', ')}`;
      if (r.balance?.trim() && rupees(r.balance) !== principal) e.balance = 'An FD balance is its principal; leave it blank';
      if (!Object.keys(e).length) {
        const mat = calculateFdMaturity({ principal, ratePercent: rate, tenureMonths: tenure, payout, openedOn: r.openedOn! });
        // A matured FD is paid out from the old books before go-live, so the new system starts with running ones only.
        if (mat.maturityDate <= opts.asOn) e.tenureMonths = `Matured on ${mat.maturityDate}; settle it before go-live`;
        else account = { ...base, id: `dep-imp-${fdrNo.replace(/[^A-Za-z0-9]+/g, '-')}`, fdrNo, scheme, principal, tenureMonths: tenure, ratePercent: rate, payoutFrequency: payout, maturityDate: mat.maturityDate, maturityValue: mat.maturityValue, balance: principal };
      }
    } else if (SCHEMES.includes(scheme)) {
      const balance = rupees(r.balance);
      const monthly = r.monthlyAmount?.trim() ? rupees(r.monthlyAmount) : scheme === 'CRD' ? settings.crdMonthly : settings.srdsMonthly;
      if (!(balance >= 0)) e.balance = 'Enter the balance in rupees';
      if (!(monthly > 0)) e.monthlyAmount = 'Enter the monthly amount in rupees, or leave it blank for the setting';
      if (m && compulsory.has(`${m.id}:${scheme}`)) e.scheme = `The member already has a ${scheme} account`;
      if (!Object.keys(e).length) account = { ...base, id: `dep-${scheme.toLowerCase()}-${m!.generalNo}`, scheme, monthlyAmount: monthly, ratePercent: scheme === 'CRD' ? settings.crdRatePercent : settings.srdsRatePercent, balance };
    }

    if (Object.keys(e).length || !account) {
      result.errors.push({ row: i + 2, generalNo: r.generalNo ?? '', fieldErrors: e });
      continue;
    }
    numbers.add(accountNo);
    if (fdrNo) numbers.add(fdrNo);
    if (scheme !== 'FD') compulsory.add(`${account.memberId}:${scheme}`);
    parsed.push(account);
    result.totals[scheme]! += account.balance;
  }
  if (result.errors.length || !opts.commit) return result;

  await withTransaction(app.db, async (tx) => {
    for (const d of parsed) {
      await app.deposits.repo.insert(tx, d);
      if (!d.balance) continue;
      const lines: JournalLineInput[] = [
        { accountCode: DEPOSIT_ACCOUNT[d.scheme], debit: 0, credit: d.balance, memberId: d.memberId, refType: 'DEPOSIT', refId: d.id },
        { accountCode: ACCOUNT.OPENING_DIFFERENCE, debit: d.balance, credit: 0 },
      ];
      await app.ledger.post({ entryDate: opts.asOn, narration: `Opening balance brought forward: ${d.scheme} ${d.fdrNo ?? d.accountNo}`, source: 'OPENING', sourceRef: d.id, lines, postedBy: opts.actor }, tx);
    }
    await app.audit.record(undefined, { action: 'deposits.import', entity: 'deposit', summary: `Imported ${parsed.length} deposit accounts from the register (as on ${opts.asOn})`, after: { rows: parsed.length, ...result.totals }, actor: opts.actor }, tx);
  });
  result.committed = true;
  return result;
}
