// M4 loan application rules: F2/F3 completeness, Salary-loan limit (BR-023), stage tracker (MB-04).
import { describe, expect, it } from 'vitest';
import type { LoanStatus, WorkflowEvent } from '@tgs/types';
import { checkSalaryLoan, firstDueCycle, lastInstalmentCycle, loanStages, loanStatusGroup, validateLoanRequest } from './index';

const pay = { scaleOfPay: '45960-124340', grossSalary: 9_500_000, govtLoanDeductions: 0, otherLoanDeductions: 0 };
const base = { product: 'ORDINARY', amount: 20_000_000, instalments: 60, purpose: 'House repair', sureties: ['mem-2', 'mem-3'], form: { pay } };

describe('cycles', () => {
  it('first EMI is next month; last instalment counts from it', () => {
    expect(firstDueCycle('2026-10-24')).toBe('2026-11');
    expect(firstDueCycle('2026-12-31')).toBe('2027-01');
    expect(lastInstalmentCycle('2026-11', 12)).toBe('2027-10');
    expect(lastInstalmentCycle('2026-11', 0)).toBe('2026-11');
  });
});

describe('checkSalaryLoan (BR-023, D-058)', () => {
  const salary = { substantivePay: 6_000_000, compulsoryDeductions: [{ label: 'GPF', amount: 600_000 }, { label: 'Income tax', amount: 400_000 }], netPayEarnedToDate: 3_000_000 };
  it('computes net substantive pay and caps at net pay earned', () => {
    const ok = checkSalaryLoan(2_000_000, salary, 1_000_000);
    expect(ok.netSubstantivePay).toBe(4_000_000);
    expect(ok.checks.every((c) => c.pass)).toBe(true);
    expect(checkSalaryLoan(3_500_000, salary, 0).checks[1]?.pass).toBe(false);
    expect(checkSalaryLoan(1_000, { ...salary, substantivePay: 900_000 }, 200_000).checks[0]?.pass).toBe(false);
  });
});

describe('validateLoanRequest', () => {
  const ord = { code: 'ORDINARY' as const, suretiesRequired: 2 };
  it('accepts a complete Ordinary application', () => expect(validateLoanRequest(base, ord, 'mem-1')).toEqual({}));
  it('flags missing basics and pay', () => {
    const e = validateLoanRequest({ ...base, amount: 0, instalments: 0, purpose: '', form: {} }, ord, 'mem-1');
    expect(Object.keys(e).sort()).toEqual(['amount', 'instalments', 'pay.grossSalary', 'purpose']);
    expect(validateLoanRequest({ ...base, form: { pay: { ...pay, govtLoanDeductions: -1 } } }, ord, 'mem-1')['pay.deductions']).toBeTruthy();
  });
  it('checks sureties: self, duplicates, too few, too many', () => {
    expect(validateLoanRequest({ ...base, sureties: ['mem-1', 'mem-2'] }, ord, 'mem-1').sureties).toMatch(/own surety/);
    expect(validateLoanRequest({ ...base, sureties: ['mem-2', 'mem-2'] }, ord, 'mem-1').sureties).toMatch(/different/);
    expect(validateLoanRequest({ ...base, sureties: ['mem-2'] }, ord, 'mem-1').sureties).toMatch(/1 chosen/);
    expect(validateLoanRequest({ ...base, sureties: ['mem-2', 'mem-3', 'mem-4'] }, ord, 'mem-1').sureties).toMatch(/exactly 2/);
  });
  it('Education needs student details; Deposit needs a pledge; Salary needs F3 pay', () => {
    const edu = validateLoanRequest({ ...base, form: { pay, education: { studentName: '', relation: 'Son', institution: '', course: '' } } }, { code: 'EDUCATION', suretiesRequired: 2 }, 'mem-1');
    expect(Object.keys(edu).sort()).toEqual(['education.course', 'education.institution', 'education.studentName']);
    expect(validateLoanRequest({ ...base, form: { pay } }, { code: 'EDUCATION', suretiesRequired: 2 }, 'mem-1')['education.studentName']).toBeTruthy();
    expect(validateLoanRequest({ ...base, form: { pay, education: { studentName: 'Ravi', relation: 'Son', institution: 'JNTU', course: 'B.Tech' } } }, { code: 'EDUCATION', suretiesRequired: 2 }, 'mem-1')).toEqual({});
    expect(validateLoanRequest({ ...base, sureties: [] }, { code: 'DEPOSIT', suretiesRequired: 0 }, 'mem-1')).toEqual({ pledgedDepositId: expect.any(String) });
    expect(validateLoanRequest({ ...base, sureties: [], pledgedDepositId: 'd1' }, { code: 'DEPOSIT', suretiesRequired: 0 }, 'mem-1')).toEqual({});
    const sal = { code: 'SALARY' as const, suretiesRequired: 0 };
    expect(validateLoanRequest({ ...base, sureties: [], form: {} }, sal, 'mem-1')).toEqual({ 'salary.substantivePay': expect.any(String) });
    expect(Object.keys(validateLoanRequest({ ...base, sureties: [], form: { salary: { substantivePay: 0, netPayEarnedToDate: 0, compulsoryDeductions: [{ label: '', amount: 5 }] } } }, sal, 'mem-1')).sort()).toEqual(['salary.compulsoryDeductions', 'salary.netPayEarnedToDate', 'salary.substantivePay']);
    expect(validateLoanRequest({ ...base, sureties: [], form: { salary: { substantivePay: 1, netPayEarnedToDate: 1, compulsoryDeductions: [{ label: 'GPF', amount: 0 }] } } }, sal, 'mem-1')).toEqual({});
    expect(validateLoanRequest({ ...base, sureties: [], form: { salary: { substantivePay: 1, netPayEarnedToDate: 1, compulsoryDeductions: [{ label: 'GPF', amount: -1 }] } } }, sal, 'mem-1')['salary.compulsoryDeductions']).toBeTruthy();
  });
});

describe('status groups and stage tracker (MB-04, D-030)', () => {
  it('groups statuses', () => {
    const g = (s: LoanStatus) => loanStatusGroup(s);
    expect([g('DRAFT'), g('ACTIVE'), g('CLOSED'), g('CLOSED_BY_TOPUP'), g('REJECTED'), g('WITHDRAWN'), g('SANCTIONED')]).toEqual(['DRAFT', 'ACTIVE', 'CLOSED', 'CLOSED', 'REJECTED', 'REJECTED', 'IN_PROCESS']);
  });
  const ev = (from: string, to: string, action = 'x'): WorkflowEvent => ({ at: '2026-10-01T10:00:00Z', actorId: 'a', actorName: 'Suresh Goud', actorRole: 'ACCOUNTANT', action, fromStatus: from, toStatus: to });
  const f2 = { suretiesRequired: 2, ddoCertificationRequired: true };
  const f3 = { suretiesRequired: 0, ddoCertificationRequired: false };

  it('Ordinary shows all 7 steps; Salary hides surety and DDO', () => {
    expect(loanStages(f2, { status: 'DRAFT', events: [] }).map((s) => s.status)).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
    expect(loanStages(f2, { status: 'DRAFT', events: [] })[0]?.title).toMatch(/Draft/);
    const sal = loanStages(f3, { status: 'ACCOUNTANT_REVIEW', events: [ev('DRAFT', 'ACCOUNTANT_REVIEW', 'submit')] });
    expect(sal.map((s) => s.key)).toEqual(['submitted', 'accountant', 'assessment', 'sanction', 'disbursement']);
    expect(sal[0]).toMatchObject({ status: 'done', by: 'Suresh Goud', date: '2026-10-01' });
    expect(sal[1]?.status).toBe('current');
  });
  it('active = all done; returned = attention; rejected = failed at the stage', () => {
    expect(loanStages(f2, { status: 'ACTIVE', events: [] }).every((s) => s.status === 'done')).toBe(true);
    const returned = loanStages(f2, { status: 'RETURNED', events: [ev('DRAFT', 'SURETY_PENDING'), ev('SURETY_PENDING', 'ACCOUNTANT_REVIEW'), ev('ACCOUNTANT_REVIEW', 'RETURNED', 'returnToMember')] });
    expect(returned.map((s) => s.status).slice(0, 4)).toEqual(['done', 'done', 'attention', 'todo']);
    const rejected = loanStages(f2, { status: 'REJECTED', events: [ev('SANCTION_SECRETARY', 'REJECTED', 'reject')] });
    expect(rejected[5]?.status).toBe('failed');
    expect(loanStages(f2, { status: 'WITHDRAWN', events: [] })[0]?.status).toBe('failed');
  });
});
