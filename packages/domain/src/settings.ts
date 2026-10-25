// ST-60 … ST-66: validation for settings edits. The API rejects anything that fails; the console
// shows the same messages inline. Returns field errors keyed like the form ({} = valid).
import type { LoanProduct, SocietySettings } from '@tgs/types';

const MAX_RATE = 30;

/** ST-64: a loan product's limits and switches. */
export function validateLoanProduct(p: Pick<LoanProduct, 'ratePercent' | 'minAmount' | 'maxAmount' | 'maxInstalments' | 'suretiesRequired' | 'shareDepositPercent' | 'maxConcurrent' | 'depositMarginPercent' | 'code'>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(p.ratePercent > 0 && p.ratePercent <= MAX_RATE)) e.ratePercent = `Rate must be above 0% and at most ${MAX_RATE}%.`;
  if (!(p.minAmount > 0)) e.minAmount = 'Minimum amount must be more than ₹0.';
  if (!(p.maxAmount >= p.minAmount)) e.maxAmount = 'Maximum amount must be at least the minimum.';
  if (!(Number.isInteger(p.maxInstalments) && p.maxInstalments >= 1 && p.maxInstalments <= 240)) e.maxInstalments = 'Instalments must be a whole number from 1 to 240.';
  if (!(Number.isInteger(p.suretiesRequired) && p.suretiesRequired >= 0 && p.suretiesRequired <= 4)) e.suretiesRequired = 'Sureties must be 0 to 4.';
  if (!(p.shareDepositPercent >= 0 && p.shareDepositPercent <= 50)) e.shareDepositPercent = 'Share deposit must be 0% to 50%.';
  if (!(Number.isInteger(p.maxConcurrent) && p.maxConcurrent >= 1 && p.maxConcurrent <= 5)) e.maxConcurrent = 'Running loans allowed must be 1 to 5.';
  if (p.code === 'DEPOSIT' && !(p.depositMarginPercent > 0 && p.depositMarginPercent <= 100)) e.depositMarginPercent = 'Margin must be above 0% and at most 100%.';
  return e;
}

/** ST-65: FD slabs must be ascending, non-overlapping, with sensible rates. */
export function validateFdSlabs(slabs: SocietySettings['fdSlabs']): Record<string, string> {
  const e: Record<string, string> = {};
  if (!slabs.length) return { fdSlabs: 'Add at least one slab.' };
  slabs.forEach((s, i) => {
    if (!(Number.isInteger(s.fromMonths) && s.fromMonths >= 1)) e[`fdSlabs.${i}.fromMonths`] = 'Start must be at least 1 month.';
    else if (!(Number.isInteger(s.toMonths) && s.toMonths >= s.fromMonths)) e[`fdSlabs.${i}.toMonths`] = 'End must be on or after the start.';
    if (!(s.ratePercent > 0 && s.ratePercent <= MAX_RATE)) e[`fdSlabs.${i}.ratePercent`] = `Rate must be above 0% and at most ${MAX_RATE}%.`;
    const prev = slabs[i - 1];
    if (prev && s.fromMonths <= prev.toMonths) e[`fdSlabs.${i}.fromMonths`] = `Overlaps the previous slab (ends at ${prev.toMonths} months).`;
  });
  return e;
}

/** ST-60 / ST-66: society-wide numbers. */
export function validateSocietySettings(s: Pick<SocietySettings, 'shareValue' | 'minShares' | 'maxShares' | 'retirementAge' | 'defaulterCycles' | 'rrfMonthly' | 'crdMonthly' | 'srdsMonthly' | 'insurance' | 'savingsRatePercent' | 'fdMinAmount' | 'admissionFee' | 'maxGuaranteesPerSurety' | 'emiToNetSalaryMaxPercent' | 'financialYearStartMonth'>): Record<string, string> {
  const e: Record<string, string> = {};
  const money = (k: string, v: number, allowZero = true) => {
    if (!(Number.isInteger(v) && (allowZero ? v >= 0 : v > 0))) e[k] = allowZero ? 'Enter ₹0 or more.' : 'Enter more than ₹0.';
  };
  money('shareValue', s.shareValue, false);
  money('admissionFee', s.admissionFee);
  money('rrfMonthly', s.rrfMonthly);
  money('crdMonthly', s.crdMonthly);
  money('srdsMonthly', s.srdsMonthly);
  money('fdMinAmount', s.fdMinAmount, false);
  money('insurance.loaneeAmount', s.insurance.loaneeAmount);
  money('insurance.nonLoaneeAmount', s.insurance.nonLoaneeAmount);
  if (!(Number.isInteger(s.minShares) && s.minShares >= 1)) e.minShares = 'At least 1 share.';
  if (!(Number.isInteger(s.maxShares) && s.maxShares >= s.minShares)) e.maxShares = 'Must be at least the minimum.';
  if (!(Number.isInteger(s.retirementAge) && s.retirementAge >= 50 && s.retirementAge <= 70)) e.retirementAge = 'Retirement age must be 50 to 70.';
  if (!(Number.isInteger(s.defaulterCycles) && s.defaulterCycles >= 1 && s.defaulterCycles <= 12)) e.defaulterCycles = 'Use 1 to 12 cycles.';
  if (!(Number.isInteger(s.insurance.collectionMonth) && s.insurance.collectionMonth >= 1 && s.insurance.collectionMonth <= 12)) e['insurance.collectionMonth'] = 'Choose a month.';
  if (!(Number.isInteger(s.financialYearStartMonth) && s.financialYearStartMonth >= 1 && s.financialYearStartMonth <= 12)) e.financialYearStartMonth = 'Choose a month.';
  if (!(s.savingsRatePercent >= 0 && s.savingsRatePercent <= MAX_RATE)) e.savingsRatePercent = `Use 0% to ${MAX_RATE}%.`;
  if (!(Number.isInteger(s.maxGuaranteesPerSurety) && s.maxGuaranteesPerSurety >= 1 && s.maxGuaranteesPerSurety <= 10)) e.maxGuaranteesPerSurety = 'Use 1 to 10 loans.';
  if (!(s.emiToNetSalaryMaxPercent > 0 && s.emiToNetSalaryMaxPercent <= 100)) e.emiToNetSalaryMaxPercent = 'Use 1% to 100%.';
  return e;
}
