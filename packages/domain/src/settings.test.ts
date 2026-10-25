// ST-60 … ST-66 settings validation.
import { describe, expect, it } from 'vitest';
import type { LoanProduct, SocietySettings } from '@tgs/types';
import { toPaise, validateFdSlabs, validateLoanProduct, validateSocietySettings } from './index';

const R = toPaise;
const product: Pick<LoanProduct, 'ratePercent' | 'minAmount' | 'maxAmount' | 'maxInstalments' | 'suretiesRequired' | 'shareDepositPercent' | 'maxConcurrent' | 'depositMarginPercent' | 'code'> = {
  code: 'ORDINARY', ratePercent: 11, minAmount: R(10000), maxAmount: R(500000), maxInstalments: 100, suretiesRequired: 2, shareDepositPercent: 10, maxConcurrent: 1, depositMarginPercent: 0,
};

describe('validateLoanProduct', () => {
  it('accepts the seeded Ordinary product', () => expect(validateLoanProduct(product)).toEqual({}));
  it('flags every bad field', () => {
    const e = validateLoanProduct({ ...product, code: 'DEPOSIT', ratePercent: 0, minAmount: 0, maxAmount: -1, maxInstalments: 1.5, suretiesRequired: 9, shareDepositPercent: 60, maxConcurrent: 0, depositMarginPercent: 120 });
    expect(Object.keys(e).sort()).toEqual(['depositMarginPercent', 'maxAmount', 'maxConcurrent', 'maxInstalments', 'minAmount', 'ratePercent', 'shareDepositPercent', 'suretiesRequired']);
  });
});

describe('validateFdSlabs', () => {
  it('accepts ascending slabs and rejects empty, reversed, overlapping and bad rates', () => {
    expect(validateFdSlabs([{ fromMonths: 12, toMonths: 23, ratePercent: 7 }, { fromMonths: 24, toMonths: 60, ratePercent: 7.5 }])).toEqual({});
    expect(validateFdSlabs([])).toEqual({ fdSlabs: 'Add at least one slab.' });
    const e = validateFdSlabs([{ fromMonths: 0, toMonths: 5, ratePercent: 0 }, { fromMonths: 12, toMonths: 6, ratePercent: 7 }, { fromMonths: 5, toMonths: 20, ratePercent: 31 }]);
    expect(Object.keys(e).sort()).toEqual(['fdSlabs.0.fromMonths', 'fdSlabs.0.ratePercent', 'fdSlabs.1.toMonths', 'fdSlabs.2.fromMonths', 'fdSlabs.2.ratePercent']);
  });
});

describe('validateSocietySettings', () => {
  const ok: Parameters<typeof validateSocietySettings>[0] = {
    shareValue: R(100), admissionFee: 0, rrfMonthly: R(100), crdMonthly: R(500), srdsMonthly: R(300), insurance: { loaneeAmount: R(1000), nonLoaneeAmount: R(200), collectionMonth: 4 },
    minShares: 10, maxShares: 100, retirementAge: 61, defaulterCycles: 3, savingsRatePercent: 4, fdMinAmount: R(10000), maxGuaranteesPerSurety: 2, emiToNetSalaryMaxPercent: 50, financialYearStartMonth: 4,
  } satisfies Partial<SocietySettings>;
  it('accepts the seed values', () => expect(validateSocietySettings(ok)).toEqual({}));
  it('flags every bad field', () => {
    const e = validateSocietySettings({ ...ok, shareValue: 0, admissionFee: -1, rrfMonthly: 1.5, insurance: { loaneeAmount: -1, nonLoaneeAmount: 0, collectionMonth: 13 }, minShares: 0, maxShares: -1, retirementAge: 40, defaulterCycles: 0, savingsRatePercent: 40, fdMinAmount: 0, maxGuaranteesPerSurety: 0, emiToNetSalaryMaxPercent: 0, financialYearStartMonth: 0 });
    expect(Object.keys(e).sort()).toEqual(['admissionFee', 'defaulterCycles', 'emiToNetSalaryMaxPercent', 'fdMinAmount', 'financialYearStartMonth', 'insurance.collectionMonth', 'insurance.loaneeAmount', 'maxGuaranteesPerSurety', 'maxShares', 'minShares', 'retirementAge', 'rrfMonthly', 'savingsRatePercent', 'shareValue']);
  });
});
