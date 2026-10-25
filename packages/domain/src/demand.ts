// BR-009 / BR-010 demand composition, BR-020 defaulters, FD slab rates (docs/09).
import type { Cycle, DemandComponent, LoanProductCode, Paise, SocietySettings } from '@tgs/types';
import { calculateInsuranceDue } from './collections';
import { fail, pass, type RuleCheck } from './rules';

export interface DemandLineInput {
  cycle: Cycle;
  settings: Pick<SocietySettings, 'rrfMonthly' | 'crdMonthly' | 'srdsMonthly' | 'insurance'>;
  hasCrd: boolean;
  srdsActive: boolean;
  /** Instalments falling due this cycle (BR-006 schedule rows). */
  loanRows: Array<{ loanId: string; product: LoanProductCode; interest: Paise; principal: Paise }>;
  /** New member who chose "shares on first demand" (D-029). */
  shareCapitalDue?: Paise;
}

/**
 * BR-009 [P composition]: one member's demand for a cycle. Heads follow the recovery priority
 * (BR-011) so the printed sheet reads in the same order money is applied.
 */
export function buildDemandComponents(input: DemandLineInput): { components: DemandComponent[]; totalDemand: Paise } {
  const s = input.settings;
  const isCollectionCycle = Number(input.cycle.slice(5, 7)) === s.insurance.collectionMonth;
  const components: DemandComponent[] = [{ head: 'RRF', amount: s.rrfMonthly, allocated: 0 }];
  const insurance = calculateInsuranceDue({ isLoanee: input.loanRows.length > 0, isCollectionCycle, loaneeAmount: s.insurance.loaneeAmount, nonLoaneeAmount: s.insurance.nonLoaneeAmount });
  if (insurance) components.push({ head: 'INSURANCE', amount: insurance, allocated: 0 });
  if (input.hasCrd) components.push({ head: 'CRD', amount: s.crdMonthly, allocated: 0 });
  if (input.srdsActive) components.push({ head: 'SRDS', amount: s.srdsMonthly, allocated: 0 });
  if (input.shareCapitalDue) components.push({ head: 'SHARE_CAPITAL', amount: input.shareCapitalDue, allocated: 0 });
  for (const r of input.loanRows) {
    components.push({ head: 'INTEREST', loanId: r.loanId, loanProduct: r.product, amount: r.interest, allocated: 0 });
    components.push({ head: 'PRINCIPAL', loanId: r.loanId, loanProduct: r.product, amount: r.principal, allocated: 0 });
  }
  return { components, totalDemand: components.reduce((sum, c) => sum + c.amount, 0) };
}

/** BR-010 [A]: a transfer takes effect from the next cycle, so the old department bills this one. */
export function departmentForCycle(currentDepartmentId: string, transfer: { fromDepartmentId: string; toDepartmentId: string; effectiveCycle: Cycle } | undefined, cycle: Cycle): string {
  if (!transfer) return currentDepartmentId;
  return cycle >= transfer.effectiveCycle ? transfer.toDepartmentId : transfer.fromDepartmentId;
}

/**
 * BR-020 [P, Q-308]: a defaulter has been short in the last `defaulterCycles` posted cycles in a row.
 * `history` is oldest → newest.
 */
export function checkDefaulter(history: Array<{ cycle: Cycle; demand: Paise; recovered: Paise }>, defaulterCycles: number): RuleCheck & { consecutiveShort: number; arrears: Paise } {
  let consecutiveShort = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (!h || h.recovered >= h.demand) break;
    consecutiveShort++;
  }
  const arrears = history.reduce((sum, h) => sum + Math.max(0, h.demand - h.recovered), 0);
  return consecutiveShort >= defaulterCycles
    ? { ...fail('BR-020', `Short in the last ${consecutiveShort} cycles (defaulter after ${defaulterCycles}).`), consecutiveShort, arrears }
    : { ...pass('BR-020', consecutiveShort ? `Short in ${consecutiveShort} recent cycle(s); defaulter after ${defaulterCycles}.` : 'Recovered in full in the latest cycle.'), consecutiveShort, arrears };
}

/** BR-017 [F]: FD rate for a tenure from the slab table. Undefined = tenure not offered. */
export function fdRateFor(tenureMonths: number, slabs: SocietySettings['fdSlabs']): number | undefined {
  return slabs.find((s) => tenureMonths >= s.fromMonths && tenureMonths <= s.toMonths)?.ratePercent;
}
