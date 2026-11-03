import { describe, expect, it } from 'vitest';
import { availableSalary, checkDeduction, deductionEntryActionsFor, demandSendByDate, nextDeductionEntryStatus } from './collections';
import { addDays } from './dates';
import { validateSocietySettings } from './settings';
import { SETTINGS } from '../../mock-data/src/catalog';

// P7b-1 (D-088, REQ-132): the DDO / paper-sheet deduction entry and the salary limit (R1).
describe('deduction entry workflow', () => {
  it('the DDO enters and submits until the entry is with the Accountant', () => {
    expect(deductionEntryActionsFor('SENT_TO_DDO', undefined, { role: 'DDO' })).toEqual(['saveEntry', 'submitEntry']);
    expect(deductionEntryActionsFor('SENT_TO_DDO', 'REJECTED', { role: 'DDO' })).toEqual(['saveEntry', 'submitEntry']);
    expect(deductionEntryActionsFor('SENT_TO_DDO', 'SUBMITTED', { role: 'DDO' })).toEqual([]);
    expect(deductionEntryActionsFor('CERTIFIED', undefined, { role: 'DDO' })).toEqual([]);
  });

  it('the Accountant enters from paper, reviews a submitted entry and can send it back', () => {
    expect(deductionEntryActionsFor('SENT_TO_DDO', undefined, { role: 'ACCOUNTANT' })).toEqual(['saveEntry']);
    expect(deductionEntryActionsFor('SENT_TO_DDO', 'SUBMITTED', { role: 'ACCOUNTANT' })).toEqual(['saveEntry', 'rejectEntry']);
    expect(deductionEntryActionsFor('SENT_TO_DDO', 'POSTED', { role: 'ACCOUNTANT' })).toEqual([]);
    expect(deductionEntryActionsFor('SENT_TO_DDO', 'APPROVED', { role: 'ACCOUNTANT' })).toEqual([]);
    expect(deductionEntryActionsFor('SENT_TO_DDO', undefined, { role: 'CASHIER' })).toEqual([]);
  });

  it('moves through draft → submitted → under review → rejected', () => {
    expect(nextDeductionEntryStatus(undefined, 'saveEntry', 'DDO')).toBe('DRAFT');
    expect(nextDeductionEntryStatus('DRAFT', 'submitEntry', 'DDO')).toBe('SUBMITTED');
    expect(nextDeductionEntryStatus('SUBMITTED', 'saveEntry', 'ACCOUNTANT')).toBe('UNDER_REVIEW');
    expect(nextDeductionEntryStatus(undefined, 'saveEntry', 'ACCOUNTANT')).toBe('DRAFT');
    expect(nextDeductionEntryStatus('UNDER_REVIEW', 'rejectEntry', 'ACCOUNTANT')).toBe('REJECTED');
    expect(nextDeductionEntryStatus('REJECTED', 'submitEntry', 'DDO')).toBe('SUBMITTED');
    expect(nextDeductionEntryStatus('SUBMITTED', 'submitEntry', 'DDO')).toBeUndefined();
    expect(nextDeductionEntryStatus('DRAFT', 'rejectEntry', 'ACCOUNTANT')).toBeUndefined();
  });
});

describe('salary limit (R1) and send-by date', () => {
  const pay = { grossSalary: 1_000_000, govtLoanDeductions: 100_000, otherLoanDeductions: 50_000 };

  it('available salary is gross less other deductions less the minimum take-home', () => {
    expect(availableSalary(pay, 0)).toBe(850_000);
    expect(availableSalary(pay, 200_000)).toBe(650_000);
    expect(availableSalary(pay, 2_000_000)).toBe(0);
    expect(availableSalary({ ...pay, grossSalary: 0 }, 0)).toBeUndefined();
  });

  it('a deduction is at most the demand and the available salary', () => {
    // The ₹10,000 salary / ₹13,000 due example: ₹9,000 can be taken, ₹13,000 cannot.
    expect(checkDeduction(900_000, 1_300_000, 1_000_000)).toBeUndefined();
    expect(checkDeduction(1_100_000, 1_300_000, 1_000_000)).toMatch(/salary available/);
    expect(checkDeduction(1_400_000, 1_300_000, undefined)).toMatch(/More than the demand/);
    expect(checkDeduction(-1, 1_300_000, undefined)).toMatch(/0 or more/);
    expect(checkDeduction(1.5, 1_300_000, undefined)).toMatch(/0 or more/);
    expect(checkDeduction(0, 1_300_000, 0)).toBeUndefined();
  });

  it('a sheet must reach the DDO the set number of days before the 1st', () => {
    expect(demandSendByDate('2026-11', 4)).toBe('2026-10-28');
    expect(demandSendByDate('2027-03', 3)).toBe('2027-02-26');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('validates the new settings', () => {
    expect(validateSocietySettings(SETTINGS)).toEqual({});
    expect(Object.keys(validateSocietySettings({ ...SETTINGS, demandSendByDays: 20, minTakeHomePay: -1 })).sort()).toEqual(['demandSendByDays', 'minTakeHomePay']);
  });
});
