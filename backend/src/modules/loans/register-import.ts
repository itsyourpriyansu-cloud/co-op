import { addMonths, generateSchedule, toCycle, type JournalLineInput } from '@tgs/domain';
import type { DepositAccount, Loan, LoanProductCode } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { parseCsv } from '../../common/utils/csv';
import { withTransaction } from '../../db/transaction';
import { ACCOUNT, LOAN_ACCOUNT } from '../ledger/ledger.accounts';
import { isDate, RESERVED_NUMBER, rupees, type ImportResult } from '../members/register-import';

// G6 (D-116, F-11): the society's running loans at go-live. One CSV row per loan (template:
// backend/import/loans-register-template.csv, amounts in rupees). Members (and any pledged FD) are
// imported first. Each loan comes in ACTIVE with its sureties, a fresh schedule for what is left
// (outstanding over the instalments left, first due the month after the as-on date) and one OPENING
// entry: Dr the product's loan head, Cr 3900. Interest is taken as paid up to the as-on date.

export const LOAN_REGISTER_COLUMNS = ['generalNo', 'loanNo', 'product', 'purpose', 'sanctionedAmount', 'sanctionedInstalments', 'ratePercent', 'disbursedOn', 'outstandingPrincipal', 'instalmentsLeft', 'emi', 'suretyGeneralNos', 'pledgedFdrNo'] as const;

const PRODUCTS: LoanProductCode[] = ['ORDINARY', 'EDUCATION', 'SALARY', 'DEPOSIT'];

export async function importLoanRegister(app: FastifyInstance, csv: string, opts: { commit: boolean; asOn: string; actor: { id: string; name: string } }): Promise<ImportResult> {
  if (!isDate(opts.asOn)) throw new Error('The as-on date must be YYYY-MM-DD.');
  const rows = parseCsv(csv);
  const result: ImportResult = { rows: rows.length, committed: false, errors: [], totals: { outstanding: 0 } };
  const missing = LOAN_REGISTER_COLUMNS.filter((c) => rows[0] && !(c in rows[0]));
  if (!rows.length || missing.length) {
    result.errors.push({ row: 1, generalNo: '', fieldErrors: { header: rows.length ? `Missing columns: ${missing.join(', ')}` : 'The file has no loan rows.' } });
    return result;
  }

  const [products, members, loans, deposits] = await Promise.all([app.masters.loanProducts(), app.members.repo.others(), app.loans.repo.all(), app.deposits.repo.list('FD')]);
  const byGeneralNo = new Map(members.map((m) => [m.generalNo, m]));
  const loanNos = new Set(loans.flatMap((l) => (l.loanNo ? [l.loanNo] : [])));
  const pledged = new Set<string>();
  const firstDue = toCycle(addMonths(`${toCycle(opts.asOn)}-01`, 1));
  const parsed: Array<{ loan: Loan; pledge?: DepositAccount }> = [];

  for (const [i, r] of rows.entries()) {
    const e: Record<string, string> = {};
    const m = byGeneralNo.get(r.generalNo ?? '');
    const product = products.find((p) => p.code === (r.product ?? '').toUpperCase());
    const amount = rupees(r.sanctionedAmount);
    const outstanding = rupees(r.outstandingPrincipal);
    const instalments = Number(r.sanctionedInstalments);
    const left = Number(r.instalmentsLeft);
    const rate = Number(r.ratePercent);
    const loanNo = (r.loanNo ?? '').trim();
    if (!m) e.generalNo = 'No member with this General No. (import the member register first)';
    else if (m.status !== 'ACTIVE') e.generalNo = 'The member is not active';
    if (!loanNo) e.loanNo = 'Enter the loan number from the register';
    else if (RESERVED_NUMBER.test(loanNo)) e.loanNo = 'This pattern is kept for numbers the system gives; use the register number';
    else if (loanNos.has(loanNo)) e.loanNo = 'Loan number already used';
    if (!product || !PRODUCTS.includes(product.code)) e.product = `One of ${PRODUCTS.join(', ')}`;
    if (!(amount > 0)) e.sanctionedAmount = 'Enter the sanctioned amount in rupees';
    if (!Number.isInteger(instalments) || instalments < 1) e.sanctionedInstalments = 'Whole number of months';
    if (!(rate >= 0 && rate <= 36)) e.ratePercent = 'Annual rate between 0 and 36';
    if (!isDate(r.disbursedOn) || r.disbursedOn! > opts.asOn) e.disbursedOn = 'Date as YYYY-MM-DD, not after the as-on date';
    if (!(outstanding > 0)) e.outstandingPrincipal = 'Enter what is still owed (closed loans are not imported)';
    else if (outstanding > amount) e.outstandingPrincipal = 'Cannot be more than the sanctioned amount';
    if (!Number.isInteger(left) || left < 1 || left > instalments) e.instalmentsLeft = 'Whole number, at least 1 and not more than the sanctioned instalments';

    const sureties = (r.suretyGeneralNos ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    const suretyMembers = sureties.map((g) => byGeneralNo.get(g));
    if (suretyMembers.some((s) => !s)) e.suretyGeneralNos = `Unknown General No.: ${sureties.filter((_, k) => !suretyMembers[k]).join(', ')}`;
    else if (m && sureties.includes(m.generalNo)) e.suretyGeneralNos = 'A borrower cannot be their own surety';
    if (product && suretyMembers.length < product.suretiesRequired && !e.suretyGeneralNos) e.suretyGeneralNos = `${product.name} needs ${product.suretiesRequired} sureties (separate General Nos. with ;)`;

    let pledge: DepositAccount | undefined;
    if (product?.code === 'DEPOSIT') {
      pledge = deposits.find((d) => d.fdrNo === r.pledgedFdrNo?.trim() && d.memberId === m?.id && d.status === 'ACTIVE');
      if (!pledge) e.pledgedFdrNo = "The borrower's active FD (import the deposit register first)";
      else if (pledge.pledgedToLoanId || pledged.has(pledge.id)) e.pledgedFdrNo = 'This FD already secures a loan';
    }

    const schedule = !Object.keys(e).length ? generateSchedule(outstanding, rate, left, product!.emiMethod, firstDue) : [];
    const emi = schedule[0]?.emi ?? 0;
    // The register's EMI must agree with what the demand will ask for, or members would be charged a different amount.
    if (schedule.length && r.emi?.trim() && Math.abs(rupees(r.emi) - emi) > 100) e.emi = `The schedule gives ₹${(emi / 100).toFixed(2)} a month for this outstanding, rate and instalments left; check them`;

    if (Object.keys(e).length) {
      result.errors.push({ row: i + 2, generalNo: r.generalNo ?? '', fieldErrors: e });
      continue;
    }
    const at = `${opts.asOn}T00:00:00.000Z`;
    const loan: Loan = {
      id: `ln-imp-${loanNo.replace(/[^A-Za-z0-9]+/g, '-')}`,
      applicationNo: `IMP-${loanNo}`,
      loanNo,
      memberId: m!.id,
      product: product!.code,
      status: 'ACTIVE',
      appliedAmount: amount,
      appliedInstalments: instalments,
      purpose: r.purpose?.trim() || 'Brought in from the register',
      sanctionedAmount: amount,
      sanctionedInstalments: instalments,
      ratePercent: rate,
      emi,
      disbursedOn: r.disbursedOn!,
      outstandingPrincipal: outstanding,
      ...(pledge ? { pledgedDepositId: pledge.id } : {}),
      sureties: suretyMembers.map((s) => ({ memberId: s!.id, status: 'ACCEPTED' as const, retiresDuringLoan: s!.dor < addMonths(`${firstDue}-01`, left - 1) })),
      schedule,
      events: [{ at, actorId: opts.actor.id, actorName: opts.actor.name, actorRole: 'SUPER_ADMIN', action: 'import', fromStatus: 'ACTIVE', toStatus: 'ACTIVE', remarks: `Brought in from the register: ₹${(outstanding / 100).toFixed(2)} outstanding on ${opts.asOn}, ${left} instalments left` }],
      appliedOn: r.disbursedOn!,
      channel: 'COUNTER',
      createdByName: opts.actor.name,
    };
    loanNos.add(loanNo);
    if (pledge) pledged.add(pledge.id);
    parsed.push({ loan, ...(pledge ? { pledge } : {}) });
    result.totals.outstanding! += outstanding;
  }
  if (result.errors.length || !opts.commit) return result;

  await withTransaction(app.db, async (tx) => {
    for (const { loan: l, pledge } of parsed) {
      await app.loans.repo.insert(tx, l);
      if (pledge) await app.deposits.repo.save(tx, { ...pledge, pledgedToLoanId: l.id });
      const lines: JournalLineInput[] = [
        { accountCode: LOAN_ACCOUNT[l.product], debit: l.outstandingPrincipal, credit: 0, memberId: l.memberId, refType: 'LOAN', refId: l.id },
        { accountCode: ACCOUNT.OPENING_DIFFERENCE, debit: 0, credit: l.outstandingPrincipal },
      ];
      await app.ledger.post({ entryDate: opts.asOn, narration: `Opening balance brought forward: loan ${l.loanNo}`, source: 'OPENING', sourceRef: l.id, lines, postedBy: opts.actor }, tx);
    }
    await app.audit.record(undefined, { action: 'loans.import', entity: 'loan', summary: `Imported ${parsed.length} loans from the register (as on ${opts.asOn})`, after: { rows: parsed.length, outstanding: result.totals.outstanding }, actor: opts.actor }, tx);
  });
  result.committed = true;
  return result;
}
