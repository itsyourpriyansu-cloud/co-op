// Loan eligibility: BR-014, BR-015, BR-016, BR-018 + the full application assessment used by the
// phone (preview), the console (review) and the API (authoritative). Placeholders come in as inputs.
import type { Cycle, ISODate, LoanProduct, LoanProductCode, Paise } from '@tgs/types';
import { formatINR } from './money';
import { calculateEmi, calculateNetSalary, calculateShareDeduction, checkSuretyRetirement, checkTenureEligibility } from './loans';
import { fail, pass, roundToRupee, type RuleCheck } from './rules';

/** BR-016 [P]: amount within the product's min–max, tenure within its max. */
export function checkProductLimits(amount: Paise, instalments: number, product: Pick<LoanProduct, 'name' | 'minAmount' | 'maxAmount' | 'maxInstalments'>): RuleCheck[] {
  return [
    amount < product.minAmount
      ? fail('BR-016', `${product.name} starts at ${formatINR(product.minAmount)}.`)
      : amount > product.maxAmount
        ? fail('BR-016', `${product.name} is limited to ${formatINR(product.maxAmount)}.`)
        : pass('BR-016', `Amount is within the ${product.name} limit of ${formatINR(product.maxAmount)}.`),
    instalments < 1
      ? fail('BR-016', 'Choose at least 1 instalment.')
      : instalments > product.maxInstalments
        ? fail('BR-016', `${product.name} allows at most ${product.maxInstalments} instalments.`)
        : pass('BR-016', `${instalments} instalments is within the product maximum of ${product.maxInstalments}.`),
  ];
}

/** BR-018 [P]: how many active loans of this product the member already has. More → use a top-up. */
export function checkConcurrentLoans(product: Pick<LoanProduct, 'code' | 'name' | 'maxConcurrent' | 'topupAllowed'>, activeProducts: LoanProductCode[]): RuleCheck {
  const held = activeProducts.filter((p) => p === product.code).length;
  if (held < product.maxConcurrent) return pass('BR-018', held ? `You hold ${held} ${product.name}; ${product.maxConcurrent} allowed.` : `No running ${product.name}.`);
  return fail('BR-018', product.topupAllowed ? `You already have a running ${product.name}. Ask for a top-up instead.` : `You already have ${held} running ${product.name}${held === 1 ? '' : 's'}, the most allowed.`);
}

/** BR-015 [P]: a loan against a deposit may be at most `marginPercent` of the deposit principal. */
export function checkDepositLoanLimit(amount: Paise, depositPrincipal: Paise, marginPercent: number): RuleCheck & { maxAmount: Paise } {
  const maxAmount = roundToRupee((depositPrincipal * marginPercent) / 100);
  return amount <= maxAmount
    ? { ...pass('BR-015', `Within ${marginPercent}% of the deposit (${formatINR(maxAmount)}).`), maxAmount }
    : { ...fail('BR-015', `A loan against this deposit can be at most ${formatINR(maxAmount)} (${marginPercent}% of the deposit).`), maxAmount };
}

/** BR-014 [P]: who can stand surety. Retirement during the loan only warns (BR-024). */
export function checkSuretyEligibility(input: {
  suretyMemberId: string;
  borrowerMemberId: string;
  suretyActive: boolean;
  activeGuarantees: number;
  maxGuarantees: number;
  suretyDor: ISODate;
  lastInstalmentCycle: Cycle;
}): RuleCheck[] {
  if (input.suretyMemberId === input.borrowerMemberId) return [fail('BR-014', 'You cannot be your own surety.')];
  return [
    input.suretyActive ? pass('BR-014', 'Surety is an active member.') : fail('BR-014', 'Surety must be an active member of the society.'),
    input.activeGuarantees < input.maxGuarantees
      ? pass('BR-014', `Stands surety on ${input.activeGuarantees} of ${input.maxGuarantees} allowed loans.`)
      : fail('BR-014', `Already a surety on ${input.activeGuarantees} loans (limit ${input.maxGuarantees}).`),
    checkSuretyRetirement(input.suretyDor, input.lastInstalmentCycle),
  ];
}

export interface LoanApplicationInput {
  product: LoanProduct;
  amount: Paise;
  instalments: number;
  leftoverMonths: number;
  activeProducts: LoanProductCode[];
  /** Pay profile (form F2 item 5). */
  grossSalary: Paise;
  govtLoanDeductions: Paise;
  otherLoanDeductions: Paise;
  existingShareDeposit: Paise;
  emiToNetSalaryMaxPercent: number;
  /** Deposit loans only. */
  pledgedDepositPrincipal?: Paise;
  /** Top-up: the loan being settled is not counted against BR-018. */
  isTopup?: boolean;
}

/**
 * The full eligibility + money preview for a loan application. Blocks fail the application;
 * warnings inform. Same result on the phone, the console and the API.
 */
export function assessLoanApplication(input: LoanApplicationInput) {
  const { product } = input;
  const tenure = checkTenureEligibility(input.leftoverMonths, input.instalments, product.maxInstalments);
  const checks: RuleCheck[] = [...checkProductLimits(input.amount, input.instalments, product), tenure];
  if (!input.isTopup) checks.push(checkConcurrentLoans(product, input.activeProducts));
  let maxAmount = product.maxAmount;
  if (product.code === 'DEPOSIT') {
    if (input.pledgedDepositPrincipal === undefined) checks.push(fail('BR-015', 'Choose the fixed deposit to pledge.'));
    else {
      const d = checkDepositLoanLimit(input.amount, input.pledgedDepositPrincipal, product.depositMarginPercent);
      checks.push(d);
      maxAmount = Math.min(maxAmount, d.maxAmount);
    }
  }
  const emi = calculateEmi(input.amount, product.ratePercent, Math.max(1, input.instalments), product.emiMethod);
  const salary = calculateNetSalary(input.grossSalary, input.govtLoanDeductions, input.otherLoanDeductions);
  const capacity = roundToRupee((salary.net * input.emiToNetSalaryMaxPercent) / 100);
  checks.push(
    emi.firstInstalment <= capacity
      ? pass('CAP-1', `First instalment ${formatINR(emi.firstInstalment)} is within ${input.emiToNetSalaryMaxPercent}% of net salary.`, 'warn')
      : fail('CAP-1', `First instalment ${formatINR(emi.firstInstalment)} is more than ${input.emiToNetSalaryMaxPercent}% of net salary (${formatINR(capacity)}).`, 'warn'),
  );
  const share = calculateShareDeduction(input.amount, product.shareDepositPercent, input.existingShareDeposit);
  return {
    eligible: checks.every((c) => c.pass || c.severity === 'warn'),
    checks,
    maxInstalments: tenure.maxAllowed,
    maxAmount,
    emi,
    netSalary: salary.net,
    shareDeduction: share.deduction,
    netDisbursable: input.amount - share.deduction,
  };
}
