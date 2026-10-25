// Loan workflow money and guards (M5): the sanction sheet (ST-26 "For Office Use"), top-up
// eligibility and settlement (BR-007 + BR-004), surety progress (J-02) and assessment limits.
import type { Cycle, ISODate, LoanProduct, LoanStatus, LoanSurety, Paise, SanctionSheet, ScheduleRow } from '@tgs/types';
import { daysInMonth, parseISODate } from './dates';
import { calculateEmi, calculateShareDeduction, calculateTopupSettlement } from './loans';
import { fail, pass, type RuleCheck } from './rules';

/** BR-007: interest is charged up to the end of the last fully paid month, else from disbursement. */
export function lastInterestChargedOn(loan: { disbursedOn?: ISODate; schedule: Pick<ScheduleRow, 'dueCycle' | 'paidStatus'>[] }, today: ISODate): ISODate {
  const paid = loan.schedule.filter((r) => r.paidStatus === 'PAID').at(-1);
  if (paid) {
    const { y, m } = parseISODate(`${paid.dueCycle}-01`);
    return `${paid.dueCycle}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
  }
  return loan.disbursedOn ?? today;
}

/** Q-110 [P, D-059]: a top-up replaces one of the member's own running loans of a product that allows it. */
export function checkTopupEligibility(parent: { memberId: string; status: LoanStatus; product: string }, product: Pick<LoanProduct, 'code' | 'name' | 'topupAllowed'>, memberId: string): RuleCheck {
  if (parent.memberId !== memberId) return fail('BR-007', 'You can top up only your own loan.');
  if (parent.status !== 'ACTIVE') return fail('BR-007', 'Only a running loan can be topped up.');
  if (parent.product !== product.code) return fail('BR-007', `A top-up must be a ${product.name}, like the loan it replaces.`);
  if (!product.topupAllowed) return fail('BR-007', `${product.name} loans cannot be topped up.`);
  return pass('BR-007', 'This running loan can be topped up.');
}

export interface SanctionSheetInput {
  amount: Paise;
  instalments: number;
  product: Pick<LoanProduct, 'ratePercent' | 'emiMethod' | 'shareDepositPercent'>;
  firstDueCycle: Cycle;
  existingShareDeposit: Paise;
  today: ISODate;
  topup?: { loanId: string; loanNo: string; outstandingPrincipal: Paise; ratePercent: number; lastInterestChargedOn: ISODate };
  balances: SanctionSheet['balances'];
}

/** ST-26: everything the Secretary and President sign, computed from the rules (never typed). */
export function buildSanctionSheet(input: SanctionSheetInput): SanctionSheet {
  const emi = calculateEmi(input.amount, input.product.ratePercent, Math.max(1, input.instalments), input.product.emiMethod);
  let shareDeduction = calculateShareDeduction(input.amount, input.product.shareDepositPercent, input.existingShareDeposit).deduction;
  let topup: SanctionSheet['topup'];
  let netDisbursable = input.amount - shareDeduction;
  if (input.topup) {
    const t = calculateTopupSettlement({
      outstandingPrincipal: input.topup.outstandingPrincipal,
      ratePercent: input.topup.ratePercent,
      lastInterestChargedOn: input.topup.lastInterestChargedOn,
      today: input.today,
      newAmount: input.amount,
      shareDepositPercent: input.product.shareDepositPercent,
      existingShareDeposit: input.existingShareDeposit,
    });
    shareDeduction = t.share.deduction;
    topup = { loanId: input.topup.loanId, loanNo: input.topup.loanNo, outstandingPrincipal: input.topup.outstandingPrincipal, accruedInterest: t.accruedInterest, settlement: t.settlement };
    netDisbursable = t.netDisbursable;
  }
  return {
    amount: input.amount,
    instalments: input.instalments,
    ratePercent: input.product.ratePercent,
    emi: emi.firstInstalment,
    lastEmi: emi.lastInstalment,
    totalInterest: emi.totalInterest,
    firstDueCycle: input.firstDueCycle,
    shareDeduction,
    ...(topup ? { topup } : {}),
    netDisbursable,
    balances: input.balances,
  };
}

/** ST-26: the Accountant may reduce the amount or tenure, never raise them (re-validated). */
export function validateSanctionAdjustment(amount: Paise, instalments: number, applied: { amount: Paise; instalments: number }, maxInstalments: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(amount > 0)) e.amount = 'Enter the amount to sanction';
  else if (amount > applied.amount) e.amount = 'Cannot be more than the amount applied for';
  if (!Number.isInteger(instalments) || instalments < 1) e.instalments = 'Enter the number of instalments';
  else if (instalments > applied.instalments) e.instalments = 'Cannot be more than the instalments applied for';
  else if (instalments > maxInstalments) e.instalments = `At most ${maxInstalments} for this member (BR-002 / BR-022)`;
  return e;
}

/** J-02: replaced sureties no longer count; the loan moves on when every current surety has signed. */
export function suretyProgress(sureties: Pick<LoanSurety, 'status'>[], required: number) {
  const current = sureties.filter((s) => s.status !== 'REPLACED');
  const accepted = current.filter((s) => s.status === 'ACCEPTED').length;
  const declined = current.filter((s) => s.status === 'DECLINED').length;
  const pending = current.filter((s) => s.status === 'PENDING').length;
  return { accepted, declined, pending, allAccepted: accepted >= required && declined === 0 && pending === 0 };
}
