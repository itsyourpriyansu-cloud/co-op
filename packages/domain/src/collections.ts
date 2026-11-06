// Collections: BR-008 insurance, BR-011 recovery allocation, BR-029 denominations (docs/09).
import type { Cycle, DeductionEntryStatus, DemandComponent, DemandHead, DemandSheetStatus, ISODate, LinePenal, LoanProductCode, Paise, Role } from '@tgs/types';
import { addDays, daysBetweenDates } from './dates';
import { formatINR } from './money';
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
    allocated[index]!.allocated += take; // same length as components
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

/**
 * BR-011 across cycles (D-061): a counter or reported payment against dues settles the oldest short
 * cycle first, and inside each cycle follows the recovery priority. Inputs are not mutated.
 */
export function allocateArrears(arrears: Array<{ key: string; components: DemandComponent[] }>, amount: Paise) {
  let remaining = amount;
  const cycles = arrears.map((a) => {
    const before = a.components.reduce((s, c) => s + c.allocated, 0);
    const r = allocateRecovery(a.components, remaining);
    const applied = r.components.reduce((s, c) => s + c.allocated, 0) - before;
    remaining -= applied;
    return { key: a.key, components: r.components, applied };
  });
  return { cycles, unallocated: remaining };
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

/** A fewest-notes split of `amount` (prefill for the cashier's counter). Any remainder below ₹10 is left out. */
export function denominationsFor(amount: Paise): Partial<Record<Denomination, number>> {
  let rest = Math.floor(amount / 100);
  const out: Partial<Record<Denomination, number>> = {};
  for (const d of DENOMINATIONS) {
    const n = Math.floor(rest / d);
    if (n) out[d] = n;
    rest -= n * d;
  }
  return out;
}

// ---- P7b deduction entry (D-088, REQ-132) -------------------------------------------------------

export type DeductionEntryAction = 'saveEntry' | 'submitEntry' | 'rejectEntry';

/**
 * Who may do what with a sheet's deduction entry once it is sent to the DDO. The DDO enters and
 * submits; the Accountant may also enter (from a paper sheet), sends a submitted entry back, and
 * alone posts (`postRecovery`, demandSheetActionsFor).
 */
export function deductionEntryActionsFor(sheetStatus: DemandSheetStatus, entry: DeductionEntryStatus | undefined, user: { role: Role }): DeductionEntryAction[] {
  if (sheetStatus !== 'SENT_TO_DDO' || entry === 'POSTED' || entry === 'APPROVED') return [];
  if (user.role === 'DDO') return !entry || entry === 'DRAFT' || entry === 'REJECTED' ? ['saveEntry', 'submitEntry'] : [];
  if (user.role === 'ACCOUNTANT') return entry === 'SUBMITTED' || entry === 'UNDER_REVIEW' ? ['saveEntry', 'rejectEntry'] : ['saveEntry'];
  return [];
}

/** The entry's next status. An Accountant editing a submitted entry puts it under review. */
export function nextDeductionEntryStatus(entry: DeductionEntryStatus | undefined, action: DeductionEntryAction, role: Role): DeductionEntryStatus | undefined {
  if (action === 'saveEntry') return role === 'ACCOUNTANT' && (entry === 'SUBMITTED' || entry === 'UNDER_REVIEW') ? 'UNDER_REVIEW' : 'DRAFT';
  if (action === 'submitEntry') return !entry || entry === 'DRAFT' || entry === 'REJECTED' ? 'SUBMITTED' : undefined;
  return entry === 'SUBMITTED' || entry === 'UNDER_REVIEW' ? 'REJECTED' : undefined;
}

/**
 * R1 [P]: what can be deducted from salary = gross − other recorded deductions − minimum take-home.
 * Undefined when the pay profile is not certified (gross 0): only the demand limits the deduction then.
 */
export function availableSalary(pay: { grossSalary: Paise; govtLoanDeductions: Paise; otherLoanDeductions: Paise }, minTakeHome: Paise): Paise | undefined {
  if (!(pay.grossSalary > 0)) return undefined;
  return Math.max(0, pay.grossSalary - pay.govtLoanDeductions - pay.otherLoanDeductions - minTakeHome);
}

/** A deduction is a whole amount from 0 up to the demand and up to the available salary (never a negative payout). */
export function checkDeduction(amount: Paise, demand: Paise, available: Paise | undefined): string | undefined {
  if (!Number.isInteger(amount) || amount < 0) return 'Enter ₹0 or more';
  if (amount > demand) return `More than the demand of ${formatINR(demand)}. The DDO refunds any excess (D-061).`;
  if (available !== undefined && amount > available) return `More than the salary available for deduction (${formatINR(available)}).`;
  return undefined;
}

/** The date a cycle's sheet must reach the DDO: `daysBefore` days before the 1st (society answer, item 15). */
export function demandSendByDate(cycle: Cycle, daysBefore: number): ISODate {
  return addDays(`${cycle}-01`, -daysBefore);
}

// ---- P7b-2 penal interest (D-088, BR-012, F-06 [P]) ---------------------------------------------

/** Penal starts after the cycle's last day plus the grace days. */
export function penalStartDate(cycle: Cycle, graceDays: number): ISODate {
  const [y, m] = cycle.split('-').map(Number) as [number, number];
  return addDays(`${cycle}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`, graceDays);
}

/**
 * Penal owed on a line as of `asOf`: what was carried at the last settlement plus simple interest
 * since then on the unpaid loan instalment (principal + interest only), at each loan product's
 * yearly penal rate. RRF, CRD, SRDS, insurance and share capital never attract penal (R3).
 */
export function penalDue(input: { cycle: Cycle; components: DemandComponent[]; rates: Partial<Record<LoanProductCode, number>>; graceDays: number; penal?: Pick<LinePenal, 'settledTo' | 'carried'>; asOf: ISODate }): Paise {
  const from = input.penal?.settledTo ?? penalStartDate(input.cycle, input.graceDays);
  const days = Math.max(0, daysBetweenDates(from, input.asOf));
  let accrued = 0;
  for (const c of input.components) {
    if ((c.head !== 'PRINCIPAL' && c.head !== 'INTEREST') || !c.loanProduct) continue;
    accrued += ((c.amount - c.allocated) * (input.rates[c.loanProduct] ?? 0) * days) / 36500;
  }
  return (input.penal?.carried ?? 0) + Math.round(accrued);
}

/**
 * A dues payment (R4): penal first, oldest cycle first; the rest pays the unpaid instalments in the
 * agreement's order (allocateArrears, D-061).
 */
export function allocateDuesPayment(arrears: Array<{ key: string; penal: Paise; components: DemandComponent[] }>, amount: Paise) {
  let remaining = amount;
  const penalPaid = arrears.map((a) => {
    const paid = Math.min(a.penal, remaining);
    remaining -= paid;
    return paid;
  });
  const rest = allocateArrears(arrears.map(({ key, components }) => ({ key, components })), remaining);
  return { cycles: rest.cycles.map((c, i) => ({ ...c, penalPaid: penalPaid[i]! })), penalPaid: penalPaid.reduce((s, x) => s + x, 0), unallocated: rest.unallocated };
}

// ---- P7b-3 defaulters (D-088, BR-020, Q-310) ------------------------------------------------------

/**
 * A borrower is a defaulter when their loan instalment went unpaid in the latest `threshold`
 * posted cycles in a row (society: every unpaid month, so 1 by default). Only loan principal and
 * interest count; RRF, CRD, SRDS, insurance and share capital do not.
 */
export function loanDefaulter(history: Array<{ cycle: Cycle; loanUnpaid: Paise }>, threshold: number): { isDefaulter: boolean; consecutiveCycles: number } {
  let consecutiveCycles = 0;
  for (const h of [...history].sort((a, b) => b.cycle.localeCompare(a.cycle))) {
    if (h.loanUnpaid <= 0) break;
    consecutiveCycles++;
  }
  return { isDefaulter: consecutiveCycles >= Math.max(1, threshold), consecutiveCycles };
}

/** Unpaid loan principal + interest on a line, optionally for one loan. */
export function loanUnpaid(components: DemandComponent[], loanId?: string): Paise {
  return components.filter((c) => (c.head === 'PRINCIPAL' || c.head === 'INTEREST') && (!loanId || c.loanId === loanId)).reduce((s, c) => s + c.amount - c.allocated, 0);
}
