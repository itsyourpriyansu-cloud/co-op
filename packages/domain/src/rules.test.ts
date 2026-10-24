// Mandatory domain test cases from docs/15 §2 and §6.
import { describe, expect, it } from 'vitest';
import type { DemandComponent } from '@tgs/types';
import {
  allocateRecovery,
  calculateAccruedInterest,
  calculateEmi,
  calculateFdMaturity,
  calculateInsuranceDue,
  calculateLeftoverService,
  calculateNetSalary,
  calculateSalaryLoanNetPay,
  calculateShareDeduction,
  calculateTopupSettlement,
  checkMembershipEligibility,
  checkSuretyRetirement,
  checkTenureEligibility,
  generateSchedule,
  toPaise,
  validateDenominations,
} from './index';

const R = toPaise;

describe('BR-001 left-over service', () => {
  it('counts whole months to retirement', () => {
    expect(calculateLeftoverService('2027-12-31', '2026-10-24')).toEqual({ months: 14, label: '1 yr 2 mths' });
    expect(calculateLeftoverService('2020-01-31', '2026-10-24').months).toBe(0);
  });
});

describe('BR-002 / BR-022 tenure', () => {
  it('T-BR002-1: equal tenure fails (must exceed)', () => {
    expect(checkTenureEligibility(24, 24).pass).toBe(false);
  });
  it('T-BR002-2: one month more passes', () => {
    expect(checkTenureEligibility(25, 24).pass).toBe(true);
  });
  it('Ramaiah: 14 months left → max 13', () => {
    const r = checkTenureEligibility(14, 24);
    expect(r.pass).toBe(false);
    expect(r.maxAllowed).toBe(13);
    expect(r.binding).toBe('retirement');
  });
  it('T-BR022-1: more than 100 instalments fails', () => {
    const r = checkTenureEligibility(150, 101);
    expect(r).toMatchObject({ pass: false, ruleId: 'BR-022', maxAllowed: 100, binding: 'product' });
  });
});

describe('BR-004 share deposit', () => {
  it('T-BR004-1: agreement example ₹20,000 with ₹1,000 existing → deduct ₹1,000', () => {
    expect(calculateShareDeduction(R(20000), 10, R(1000))).toEqual({ required: R(2000), existing: R(1000), deduction: R(1000) });
  });
  it('T-BR004-2: enough existing → nothing', () => {
    expect(calculateShareDeduction(R(20000), 10, R(3000)).deduction).toBe(0);
  });
  it('T-BR004-3: new member ₹50,000 → ₹5,000', () => {
    expect(calculateShareDeduction(R(50000), 10, 0).deduction).toBe(R(5000));
  });
});

describe('BR-006 EMI', () => {
  it('T-BR006-1: amortized ₹1,00,000 @12% × 12 → ₹8,885, principal sums exactly', () => {
    expect(calculateEmi(R(100000), 12, 12, 'AMORTIZED').emi).toBe(R(8885));
    const rows = generateSchedule(R(100000), 12, 12, 'AMORTIZED', '2026-11');
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(R(100000));
    expect(rows.at(-1)?.closing).toBe(0);
    expect(rows[0]?.dueCycle).toBe('2026-11');
    expect(rows.at(-1)?.dueCycle).toBe('2027-10');
  });
  it('T-BR006-2: equal principal ₹1,20,000 @12% × 12', () => {
    const rows = generateSchedule(R(120000), 12, 12, 'EQUAL_PRINCIPAL', '2026-11');
    expect(rows.every((r) => r.principal === R(10000))).toBe(true);
    expect(rows[0]?.interest).toBe(R(1200));
    expect(rows.at(-1)?.interest).toBe(R(100));
  });
});

describe('BR-007 top-up settlement', () => {
  it('T-BR007-1: ₹50,000 @11% for 30 days → ₹452', () => {
    expect(calculateAccruedInterest(R(50000), 11, '2026-09-24', '2026-10-24')).toBe(R(452));
  });
  it('T-BR007-2: blocks when the new amount does not cover settlement', () => {
    const r = calculateTopupSettlement({
      outstandingPrincipal: R(40000), ratePercent: 11, lastInterestChargedOn: '2026-09-30', today: '2026-10-24',
      newAmount: R(30000), shareDepositPercent: 10, existingShareDeposit: 0,
    });
    expect(r.check.pass).toBe(false);
  });
  it('Lakshmi: ₹10,000 loan, ₹1,000 share deposit, top-up to ₹20,000', () => {
    const r = calculateTopupSettlement({
      outstandingPrincipal: R(6000), ratePercent: 11, lastInterestChargedOn: '2026-09-30', today: '2026-10-24',
      newAmount: R(20000), shareDepositPercent: 10, existingShareDeposit: R(1000),
    });
    expect(r.share.deduction).toBe(R(1000));
    expect(r.netDisbursable).toBe(R(20000) - r.settlement - R(1000));
    expect(r.check.pass).toBe(true);
  });
});

describe('BR-008 insurance', () => {
  const amounts = { loaneeAmount: R(1000), nonLoaneeAmount: R(200) };
  it('T-BR008-1', () => {
    expect(calculateInsuranceDue({ ...amounts, isLoanee: true, isCollectionCycle: true })).toBe(R(1000));
    expect(calculateInsuranceDue({ ...amounts, isLoanee: false, isCollectionCycle: true })).toBe(R(200));
    expect(calculateInsuranceDue({ ...amounts, isLoanee: true, isCollectionCycle: false })).toBe(0);
  });
});

describe('BR-011 allocation', () => {
  const c = (head: DemandComponent['head'], amount: number, loanProduct?: DemandComponent['loanProduct']): DemandComponent => ({
    head, amount: R(amount), allocated: 0, ...(loanProduct ? { loanProduct } : {}),
  });
  it('T-BR011-1: ₹2,000 stops mid-way through interest', () => {
    const demand = [c('PRINCIPAL', 3000, 'ORDINARY'), c('INTEREST', 900, 'ORDINARY'), c('RRF', 100), c('CRD', 500), c('PENAL', 0), c('INSURANCE', 1000), c('PRINCIPAL', 2000, 'EDUCATION')];
    const r = allocateRecovery(demand, R(2000));
    const by = (h: string, p?: string) => r.components.find((x) => x.head === h && x.loanProduct === p)?.allocated;
    expect(by('RRF')).toBe(R(100));
    expect(by('INSURANCE')).toBe(R(1000));
    expect(by('CRD')).toBe(R(500));
    expect(by('INTEREST', 'ORDINARY')).toBe(R(400));
    expect(by('PRINCIPAL', 'EDUCATION')).toBe(0);
    expect(r.short).toBe(R(5500));
    expect(demand[0]?.allocated).toBe(0); // input untouched
  });
  it('T-BR011-2: excess becomes unallocated credit', () => {
    const r = allocateRecovery([c('RRF', 100), c('CRD', 500)], R(1000));
    expect(r.unallocated).toBe(R(400));
    expect(r.short).toBe(0);
  });
  it('T-BR011-3: principal order Education → Salary → Ordinary', () => {
    const r = allocateRecovery([c('PRINCIPAL', 3000, 'ORDINARY'), c('PRINCIPAL', 1000, 'SALARY'), c('PRINCIPAL', 2000, 'EDUCATION')], R(2500));
    expect(r.components.map((x) => x.allocated)).toEqual([0, R(500), R(2000)]);
  });
});

describe('BR-017 / BR-027 fixed deposits', () => {
  it('quarterly compounding on maturity', () => {
    const r = calculateFdMaturity({ principal: R(100000), ratePercent: 7.25, tenureMonths: 24, payout: 'ON_MATURITY', openedOn: '2026-10-24' });
    expect(r.maturityDate).toBe('2028-10-24');
    expect(r.maturityValue).toBe(R(115454));
  });
  it('periodic payout keeps principal and pays interest each period', () => {
    const r = calculateFdMaturity({ principal: R(100000), ratePercent: 7.2, tenureMonths: 12, payout: 'QUARTERLY', openedOn: '2026-10-24' });
    expect(r).toMatchObject({ maturityValue: R(100000), periodicInterest: R(1800), totalInterest: R(7200) });
  });
});

describe('BR-023 / BR-025 / BR-024 / BR-026 / BR-029', () => {
  it('T-BR023-1 salary loan net pay', () => {
    expect(calculateSalaryLoanNetPay(R(60000), [R(8000), R(4000)], R(5000))).toBe(R(43000));
  });
  it('T-BR025-1 net salary', () => {
    expect(calculateNetSalary(R(80000), R(6000), R(4000))).toEqual({ totalDeductions: R(10000), net: R(70000) });
  });
  it('T-BR024-1 surety retiring warns, never blocks', () => {
    const r = checkSuretyRetirement('2027-06-30', '2028-03');
    expect(r).toMatchObject({ pass: false, severity: 'warn' });
  });
  it('T-BR026-1 other credit society with dues → ineligible', () => {
    const r = checkMembershipEligibility({ worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: true });
    expect(r.eligible).toBe(false);
  });
  it('T-BR029-1 denominations', () => {
    expect(validateDenominations({ 500: 18, 200: 5 }, R(10000)).pass).toBe(true);
    expect(validateDenominations({ 500: 18 }, R(10000)).pass).toBe(false);
  });
});
