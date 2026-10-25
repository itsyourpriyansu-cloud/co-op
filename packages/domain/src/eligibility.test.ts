// BR-014, BR-015, BR-016, BR-018 and the full loan assessment (docs/15 §2).
import { describe, expect, it } from 'vitest';
import type { LoanProduct } from '@tgs/types';
import { assessLoanApplication, checkConcurrentLoans, checkDepositLoanLimit, checkProductLimits, checkSuretyEligibility, toPaise } from './index';

const R = toPaise;
const ORDINARY: LoanProduct = { code: 'ORDINARY', name: 'Ordinary Loan', ratePercent: 11, minAmount: R(10000), maxAmount: R(500000), maxInstalments: 100, maxConcurrent: 1, depositMarginPercent: 0, penalRatePercent: 0, suretiesRequired: 2, ddoCertificationRequired: true, shareDepositPercent: 10, topupAllowed: true, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true };
const SALARY: LoanProduct = { ...ORDINARY, code: 'SALARY', name: 'Salary Loan', ratePercent: 12, minAmount: R(5000), maxAmount: R(100000), maxInstalments: 24, suretiesRequired: 0, ddoCertificationRequired: false, shareDepositPercent: 0, topupAllowed: false };
const DEPOSIT: LoanProduct = { ...SALARY, code: 'DEPOSIT', name: 'Loan against Deposit', maxAmount: R(450000), maxInstalments: 36, maxConcurrent: 2, depositMarginPercent: 90 };

const base = { leftoverMonths: 200, activeProducts: [], grossSalary: R(80000), govtLoanDeductions: R(5000), otherLoanDeductions: R(3000), existingShareDeposit: 0, emiToNetSalaryMaxPercent: 50 };

describe('BR-016 product limits', () => {
  it('below minimum, above maximum and inside', () => {
    expect(checkProductLimits(R(5000), 12, ORDINARY)[0]?.pass).toBe(false);
    expect(checkProductLimits(R(600000), 12, ORDINARY)[0]?.message).toContain('limited to');
    expect(checkProductLimits(R(100000), 12, ORDINARY).every((c) => c.pass)).toBe(true);
  });
  it('tenure bounds', () => {
    expect(checkProductLimits(R(50000), 0, SALARY)[1]?.pass).toBe(false);
    expect(checkProductLimits(R(50000), 30, SALARY)[1]?.message).toContain('at most 24');
  });
});

describe('BR-018 concurrent loans', () => {
  it('none held passes; one held asks for a top-up when allowed', () => {
    expect(checkConcurrentLoans(ORDINARY, []).pass).toBe(true);
    const r = checkConcurrentLoans(ORDINARY, ['ORDINARY']);
    expect(r.pass).toBe(false);
    expect(r.message).toContain('top-up');
  });
  it('products without top-up say the limit; a second deposit loan is allowed', () => {
    expect(checkConcurrentLoans(SALARY, ['SALARY']).message).toContain('the most allowed');
    expect(checkConcurrentLoans(DEPOSIT, ['DEPOSIT']).pass).toBe(true);
    expect(checkConcurrentLoans(DEPOSIT, ['DEPOSIT', 'DEPOSIT']).message).toContain('2 running');
  });
});

describe('BR-015 deposit loan margin', () => {
  it('90% of a ₹1,00,000 FD is ₹90,000', () => {
    expect(checkDepositLoanLimit(R(90000), R(100000), 90)).toMatchObject({ pass: true, maxAmount: R(90000) });
    expect(checkDepositLoanLimit(R(90001), R(100000), 90).pass).toBe(false);
  });
});

describe('BR-014 surety eligibility', () => {
  const ok = { suretyMemberId: 'm2', borrowerMemberId: 'm1', suretyActive: true, activeGuarantees: 1, maxGuarantees: 2, suretyDor: '2040-01-31', lastInstalmentCycle: '2030-01' };
  it('self, inactive, over the limit, retiring', () => {
    expect(checkSuretyEligibility({ ...ok, suretyMemberId: 'm1' })[0]?.message).toContain('own surety');
    expect(checkSuretyEligibility(ok).every((c) => c.pass)).toBe(true);
    const bad = checkSuretyEligibility({ ...ok, suretyActive: false, activeGuarantees: 2, suretyDor: '2028-01-31' });
    expect(bad.map((c) => c.pass)).toEqual([false, false, false]);
    expect(bad[2]?.severity).toBe('warn');
  });
});

describe('assessLoanApplication', () => {
  it('Lakshmi-style Ordinary loan: eligible, 10% share deposit netted', () => {
    const a = assessLoanApplication({ ...base, product: ORDINARY, amount: R(200000), instalments: 60, existingShareDeposit: R(5000) });
    expect(a.eligible).toBe(true);
    expect(a.shareDeduction).toBe(R(15000));
    expect(a.netDisbursable).toBe(R(185000));
    expect(a.maxInstalments).toBe(100);
  });
  it('Ramaiah: 14 months left blocks 24 instalments (BR-002), max 13', () => {
    const a = assessLoanApplication({ ...base, product: ORDINARY, amount: R(100000), instalments: 24, leftoverMonths: 14 });
    expect(a.eligible).toBe(false);
    expect(a.maxInstalments).toBe(13);
  });
  it('capacity warning does not block', () => {
    const a = assessLoanApplication({ ...base, product: SALARY, amount: R(100000), instalments: 2, grossSalary: R(30000), govtLoanDeductions: 0, otherLoanDeductions: 0 });
    const cap = a.checks.find((c) => c.ruleId === 'CAP-1');
    expect(cap?.pass).toBe(false);
    expect(a.eligible).toBe(true);
  });
  it('top-up skips BR-018; deposit loan needs and respects the pledged FD', () => {
    expect(assessLoanApplication({ ...base, product: ORDINARY, amount: R(100000), instalments: 36, activeProducts: ['ORDINARY'], isTopup: true }).eligible).toBe(true);
    expect(assessLoanApplication({ ...base, product: DEPOSIT, amount: R(50000), instalments: 12 }).checks.some((c) => c.ruleId === 'BR-015' && !c.pass)).toBe(true);
    const d = assessLoanApplication({ ...base, product: DEPOSIT, amount: R(50000), instalments: 12, pledgedDepositPrincipal: R(100000) });
    expect(d.eligible).toBe(true);
    expect(d.maxAmount).toBe(R(90000));
  });
});
