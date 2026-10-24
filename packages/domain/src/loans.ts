// Loan rules: BR-002, BR-004, BR-006, BR-007, BR-022, BR-023, BR-024, BR-025 (docs/09).
import type { Cycle, EmiMethod, ISODate, Paise, ScheduleRow } from '@tgs/types';
import { addMonths, parseISODate } from './dates';
import { fail, pass, roundToRupee, type RuleCheck } from './rules';

/** BR-002 + BR-022: remaining service must EXCEED the tenure, and tenure ≤ product max (100 for F2 loans). */
export function checkTenureEligibility(
  leftoverMonths: number,
  instalments: number,
  maxInstalments = 100,
): RuleCheck & { maxAllowed: number; binding: 'retirement' | 'product' } {
  const byRetirement = Math.max(0, leftoverMonths - 1);
  const maxAllowed = Math.min(byRetirement, maxInstalments);
  const binding = byRetirement < maxInstalments ? 'retirement' : 'product';
  if (instalments > maxInstalments) {
    return { ...fail('BR-022', `Repayment can be at most ${maxInstalments} monthly instalments.`), maxAllowed, binding };
  }
  if (instalments >= leftoverMonths) {
    return {
      ...fail('BR-002', `Remaining service (${leftoverMonths} months) must exceed the tenure (${instalments} months). Max available: ${maxAllowed} months.`),
      maxAllowed,
      binding,
    };
  }
  return { ...pass('BR-002', `Remaining service ${leftoverMonths} months exceeds the tenure of ${instalments} months.`), maxAllowed, binding };
}

const cycleOf = (iso: ISODate): Cycle => iso.slice(0, 7);

/** BR-006: repayment schedule. Components are rounded to rupees; the last row absorbs rounding. */
export function generateSchedule(principal: Paise, annualRatePercent: number, instalments: number, method: EmiMethod, firstDueCycle: Cycle): ScheduleRow[] {
  if (principal <= 0 || instalments <= 0) return [];
  const r = annualRatePercent / 1200;
  const amortizedEmi = r === 0 ? principal / instalments : (principal * r * (1 + r) ** instalments) / ((1 + r) ** instalments - 1);
  const emiRounded = roundToRupee(amortizedEmi);
  const fixedPrincipal = roundToRupee(principal / instalments);
  const rows: ScheduleRow[] = [];
  let opening = principal;
  const start = `${firstDueCycle}-01`;
  for (let i = 1; i <= instalments; i++) {
    const interest = roundToRupee(opening * r);
    const isLast = i === instalments;
    let principalPart = method === 'AMORTIZED' ? emiRounded - interest : fixedPrincipal;
    if (isLast || principalPart > opening) principalPart = opening;
    const closing = opening - principalPart;
    rows.push({
      installmentNo: i,
      dueCycle: cycleOf(addMonths(start, i - 1)),
      opening,
      interest,
      principal: principalPart,
      emi: interest + principalPart,
      closing,
      paidStatus: 'UNPAID',
    });
    opening = closing;
  }
  return rows;
}

/** BR-006 summary used by calculators and previews. */
export function calculateEmi(principal: Paise, annualRatePercent: number, instalments: number, method: EmiMethod) {
  const rows = generateSchedule(principal, annualRatePercent, instalments, method, '2000-01');
  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    emi: first?.emi ?? 0,
    firstInstalment: first?.emi ?? 0,
    lastInstalment: last?.emi ?? 0,
    constant: method === 'AMORTIZED',
    totalInterest: rows.reduce((s, x) => s + x.interest, 0),
    totalPayable: rows.reduce((s, x) => s + x.emi, 0),
  };
}

/** BR-004: share-deposit requirement with netting of the existing balance (agreement worked example). */
export function calculateShareDeduction(sanctioned: Paise, percent: number, existingBalance: Paise) {
  const required = roundToRupee((sanctioned * percent) / 100);
  return { required, existing: existingBalance, deduction: Math.max(0, required - existingBalance) };
}

/** BR-007: simple interest accrued from the last charged date to `to` (actual/365 placeholder, Q-303). */
export function calculateAccruedInterest(outstanding: Paise, annualRatePercent: number, from: ISODate, to: ISODate): Paise {
  const a = parseISODate(from);
  const b = parseISODate(to);
  const days = Math.max(0, Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000));
  return roundToRupee((outstanding * annualRatePercent * days) / (100 * 365));
}

/** BR-007 + BR-004: what a top-up settles and what the member receives. */
export function calculateTopupSettlement(input: {
  outstandingPrincipal: Paise;
  ratePercent: number;
  lastInterestChargedOn: ISODate;
  today: ISODate;
  newAmount: Paise;
  shareDepositPercent: number;
  existingShareDeposit: Paise;
}) {
  const accruedInterest = calculateAccruedInterest(input.outstandingPrincipal, input.ratePercent, input.lastInterestChargedOn, input.today);
  const settlement = input.outstandingPrincipal + accruedInterest;
  const share = calculateShareDeduction(input.newAmount, input.shareDepositPercent, input.existingShareDeposit);
  const netDisbursable = input.newAmount - settlement - share.deduction;
  const check: RuleCheck =
    netDisbursable > 0
      ? pass('BR-007', 'The new amount covers the settlement of the existing loan.')
      : fail('BR-007', 'New amount does not cover the settlement of the existing loan.');
  return { accruedInterest, settlement, share, netDisbursable, check };
}

/** BR-025 (form F2 item 5): society loans are excluded from deductions. */
export function calculateNetSalary(gross: Paise, govtLoanDeductions: Paise, otherLoanDeductions: Paise) {
  const totalDeductions = govtLoanDeductions + otherLoanDeductions;
  return { totalDeductions, net: gross - totalDeductions };
}

/** BR-023 (form F3 item 8): Col 5 − Col 6 − Col 7. */
export function calculateSalaryLoanNetPay(substantivePay: Paise, compulsoryDeductions: Paise[], ordinaryLoanDues: Paise): Paise {
  return substantivePay - compulsoryDeductions.reduce((s, x) => s + x, 0) - ordinaryLoanDues;
}

/** BR-024 (form F2 item 9(l)): warn when a surety retires before the last instalment. Never blocks. */
export function checkSuretyRetirement(suretyDor: ISODate, lastInstalmentCycle: Cycle): RuleCheck {
  const retires = suretyDor.slice(0, 7) < lastInstalmentCycle;
  return retires
    ? fail('BR-024', `Surety retires on ${suretyDor}, before the loan ends (${lastInstalmentCycle}).`, 'warn')
    : pass('BR-024', 'Surety remains in service for the full loan term.', 'warn');
}
