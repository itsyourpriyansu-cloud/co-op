import type { DemandComponent } from '@tgs/types';
import { describe, expect, it } from 'vitest';
import { allocateDuesPayment, penalDue, penalStartDate } from './collections';

// P7b-2 (D-088, BR-012, F-06 [P]): simple penal interest on unpaid loan instalments, worked out on read.
const line: DemandComponent[] = [
  { head: 'RRF', amount: 10_000, allocated: 0 },
  { head: 'CRD', amount: 50_000, allocated: 0 },
  { head: 'INTEREST', loanId: 'l1', loanProduct: 'ORDINARY', amount: 100_000, allocated: 0 },
  { head: 'PRINCIPAL', loanId: 'l1', loanProduct: 'ORDINARY', amount: 900_000, allocated: 0 },
];
const base = { cycle: '2026-09', components: line, rates: { ORDINARY: 12 }, graceDays: 0 } as const;

describe('penalDue', () => {
  it('starts after the cycle ends plus the grace days', () => {
    expect(penalStartDate('2026-09', 0)).toBe('2026-09-30');
    expect(penalStartDate('2026-02', 5)).toBe('2026-03-05');
  });

  it('is simple interest on unpaid loan principal + interest only, per day, at the product rate', () => {
    // ₹10,000 unpaid loan instalment × 12% × 30 days / 365 = ₹98.63; RRF and CRD never attract penal.
    expect(penalDue({ ...base, asOf: '2026-10-30' })).toBe(9_863);
    expect(penalDue({ ...base, asOf: '2026-09-30' })).toBe(0);
    expect(penalDue({ ...base, asOf: '2026-09-15' })).toBe(0);
    expect(penalDue({ ...base, graceDays: 10, asOf: '2026-10-30' })).toBe(6_575);
    expect(penalDue({ ...base, rates: {}, asOf: '2026-10-30' })).toBe(0);
  });

  it('continues from the last settlement on what is still unpaid', () => {
    const paidPart = line.map((c) => (c.head === 'PRINCIPAL' ? { ...c, allocated: 400_000 } : c));
    // ₹50 carried at 15 Oct, then ₹6,000 unpaid for 15 days at 12%.
    expect(penalDue({ ...base, components: paidPart, penal: { settledTo: '2026-10-15', carried: 5_000 }, asOf: '2026-10-30' })).toBe(5_000 + 2_959);
    const allPaid = line.map((c) => ({ ...c, allocated: c.amount }));
    expect(penalDue({ ...base, components: allPaid, penal: { settledTo: '2026-10-15', carried: 5_000 }, asOf: '2026-12-31' })).toBe(5_000);
  });
});

describe('allocateDuesPayment', () => {
  const arrears = [
    { key: 'sep', penal: 2_000, components: line },
    { key: 'oct', penal: 1_000, components: line },
  ];

  it('takes all penal first (oldest first), then instalments in the agreement order', () => {
    const r = allocateDuesPayment(arrears, 13_000);
    expect(r.penalPaid).toBe(3_000);
    expect(r.cycles.map((c) => c.penalPaid)).toEqual([2_000, 1_000]);
    expect(r.cycles[0]!.applied).toBe(10_000);
    expect(r.cycles[1]!.applied).toBe(0);
  });

  it('a payment smaller than the penal pays penal only', () => {
    const r = allocateDuesPayment(arrears, 2_500);
    expect(r.cycles.map((c) => c.penalPaid)).toEqual([2_000, 500]);
    expect(r.cycles.every((c) => c.applied === 0)).toBe(true);
    expect(r.unallocated).toBe(0);
  });
});
