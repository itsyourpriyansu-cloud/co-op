// Collections: BR-008 insurance, BR-011 recovery allocation, BR-029 denominations (docs/09).
import type { DemandComponent, DemandHead, LoanProductCode, Paise } from '@tgs/types';
import { fail, pass, type RuleCheck } from './rules';

/**
 * BR-011 priority [A §3.6]: RRF → Insurance → CRD → Penal → Interest → Principal (Education, Salary, Ordinary).
 * PLACEHOLDERS (Q-309): SRDS and new-member SHARE_CAPITAL sit right after CRD; Deposit loans come last.
 */
export const HEAD_PRIORITY: Record<DemandHead, number> = {
  RRF: 1,
  INSURANCE: 2,
  CRD: 3,
  SRDS: 3.1,
  SHARE_CAPITAL: 3.2,
  PENAL: 4,
  INTEREST: 5,
  PRINCIPAL: 6,
};

export const LOAN_PRIORITY: Record<LoanProductCode, number> = { EDUCATION: 1, SALARY: 2, ORDINARY: 3, DEPOSIT: 4 };

function rank(c: DemandComponent): number {
  return HEAD_PRIORITY[c.head] * 10 + (c.loanProduct ? LOAN_PRIORITY[c.loanProduct] : 0);
}

/** Splits a recovered amount across demand components in priority order. Input is not mutated. */
export function allocateRecovery(components: DemandComponent[], recovered: Paise) {
  let remaining = recovered;
  const ordered = components.map((c, index) => ({ c, index })).sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index);
  const allocated = components.map((c) => ({ ...c }));
  for (const { c, index } of ordered) {
    const unpaid = c.amount - c.allocated;
    const take = Math.min(unpaid, remaining);
    const target = allocated[index];
    if (target) target.allocated += take;
    remaining -= take;
  }
  const totalDemand = components.reduce((s, c) => s + c.amount - c.allocated, 0);
  return {
    components: allocated,
    /** Excess over demand: held as unallocated credit (placeholder, Q-309). */
    unallocated: remaining,
    short: Math.max(0, totalDemand - recovered),
  };
}

/** BR-008: ₹1,000 for loanees, ₹200 otherwise, only in the collection cycle (frequency placeholder, Q-306). */
export function calculateInsuranceDue(input: { isLoanee: boolean; isCollectionCycle: boolean; loaneeAmount: Paise; nonLoaneeAmount: Paise }): Paise {
  if (!input.isCollectionCycle) return 0;
  return input.isLoanee ? input.loaneeAmount : input.nonLoaneeAmount;
}

export const DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

/** BR-029: counted notes must equal the receipt amount. */
export function validateDenominations(counts: Partial<Record<Denomination, number>>, amount: Paise): RuleCheck & { total: Paise } {
  const total = DENOMINATIONS.reduce((s, d) => s + d * 100 * (counts[d] ?? 0), 0);
  return total === amount
    ? { ...pass('BR-029', 'Notes counted match the amount.'), total }
    : { ...fail('BR-029', `Notes counted (₹${total / 100}) do not match the amount (₹${amount / 100}).`), total };
}
