// BR-009 / BR-010 / BR-020 and FD slabs (docs/15 §2).
import { describe, expect, it } from 'vitest';
import { allocateArrears, buildDemandComponents, checkDefaulter, departmentForCycle, fdRateFor, toPaise } from './index';

const R = toPaise;
const settings = { rrfMonthly: R(100), crdMonthly: R(500), srdsMonthly: R(300), insurance: { loaneeAmount: R(1000), nonLoaneeAmount: R(200), collectionMonth: 4 } };

describe('BR-009 demand composition', () => {
  it('loanee in the insurance month: RRF, ₹1,000 insurance, CRD, SRDS, interest + principal per loan', () => {
    const d = buildDemandComponents({ cycle: '2026-04', settings, hasCrd: true, srdsActive: true, loanRows: [{ loanId: 'l1', product: 'ORDINARY', interest: R(900), principal: R(2000) }] });
    expect(d.components.map((c) => c.head)).toEqual(['RRF', 'INSURANCE', 'CRD', 'SRDS', 'INTEREST', 'PRINCIPAL']);
    expect(d.components[1]?.amount).toBe(R(1000));
    expect(d.totalDemand).toBe(R(100 + 1000 + 500 + 300 + 900 + 2000));
  });
  it('non-loanee outside the insurance month: RRF only (+ first-demand share capital)', () => {
    expect(buildDemandComponents({ cycle: '2026-10', settings, hasCrd: false, srdsActive: false, loanRows: [] }).components.map((c) => c.head)).toEqual(['RRF']);
    const n = buildDemandComponents({ cycle: '2026-04', settings, hasCrd: true, srdsActive: false, loanRows: [], shareCapitalDue: R(2000) });
    expect(n.components.map((c) => c.head)).toEqual(['RRF', 'INSURANCE', 'CRD', 'SHARE_CAPITAL']);
    expect(n.components[1]?.amount).toBe(R(200));
  });
});

describe('BR-010 transfer effective next cycle', () => {
  const t = { fromDepartmentId: 'dept-fin', toDepartmentId: 'dept-rev', effectiveCycle: '2026-11' };
  it('old department bills until the effective cycle', () => {
    expect(departmentForCycle('dept-rev', t, '2026-10')).toBe('dept-fin');
    expect(departmentForCycle('dept-rev', t, '2026-11')).toBe('dept-rev');
    expect(departmentForCycle('dept-gad', undefined, '2026-10')).toBe('dept-gad');
  });
});

describe('BR-020 defaulter', () => {
  const full = { cycle: '2026-07', demand: R(5000), recovered: R(5000) };
  const short = (cycle: string) => ({ cycle, demand: R(5000), recovered: R(2000) });
  it('three short cycles in a row → defaulter; arrears add up', () => {
    const r = checkDefaulter([full, short('2026-08'), short('2026-09'), short('2026-10')], 3);
    expect(r.pass).toBe(false);
    expect(r.consecutiveShort).toBe(3);
    expect(r.arrears).toBe(R(9000));
  });
  it('a full recovery resets the streak', () => {
    expect(checkDefaulter([short('2026-08'), short('2026-09'), full], 3)).toMatchObject({ pass: true, consecutiveShort: 0 });
    expect(checkDefaulter([full, short('2026-09')], 3).message).toContain('1 recent');
    expect(checkDefaulter([], 3).pass).toBe(true);
  });
});

describe('BR-017 FD slabs', () => {
  const slabs = [{ fromMonths: 12, toMonths: 23, ratePercent: 7 }, { fromMonths: 24, toMonths: 35, ratePercent: 7.25 }];
  it('finds the slab or nothing', () => {
    expect(fdRateFor(12, slabs)).toBe(7);
    expect(fdRateFor(30, slabs)).toBe(7.25);
    expect(fdRateFor(6, slabs)).toBeUndefined();
  });
});

describe('allocateArrears (BR-011 across cycles, D-061)', () => {
  const sept = { key: '2026-09', components: [{ head: 'RRF' as const, amount: R(100), allocated: R(100) }, { head: 'INTEREST' as const, loanId: 'l1', loanProduct: 'ORDINARY' as const, amount: R(900), allocated: R(400) }, { head: 'PRINCIPAL' as const, loanId: 'l1', loanProduct: 'ORDINARY' as const, amount: R(2000), allocated: 0 }] };
  const oct = { key: '2026-10', components: [{ head: 'RRF' as const, amount: R(100), allocated: 0 }, { head: 'CRD' as const, amount: R(500), allocated: 0 }] };
  it('oldest cycle first, priority inside it, input untouched', () => {
    const r = allocateArrears([sept, oct], R(3000));
    expect(r.cycles[0]).toMatchObject({ key: '2026-09', applied: R(2500) });
    expect(r.cycles[0]!.components.map((c) => c.allocated)).toEqual([R(100), R(900), R(2000)]);
    expect(r.cycles[1]).toMatchObject({ key: '2026-10', applied: R(500) });
    expect(r.cycles[1]!.components.map((c) => c.allocated)).toEqual([R(100), R(400)]);
    expect(r.unallocated).toBe(0);
    expect(sept.components[1]!.allocated).toBe(R(400));
  });
  it('more than owed leaves the rest unallocated', () => {
    expect(allocateArrears([oct], R(1000)).unallocated).toBe(R(400));
    expect(allocateArrears([], R(10)).unallocated).toBe(R(10));
  });
});
