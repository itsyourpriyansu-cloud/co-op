import type { DemandComponent } from '@tgs/types';
import { describe, expect, it } from 'vitest';
import { loanDefaulter, loanUnpaid } from './collections';

// P7b-3 (D-088, BR-020, Q-310): a defaulter has an unpaid loan instalment in the latest N posted cycles.
describe('loanDefaulter', () => {
  it('one unpaid month is enough by default (society answer)', () => {
    expect(loanDefaulter([{ cycle: '2026-09', loanUnpaid: 0 }, { cycle: '2026-10', loanUnpaid: 500 }], 1)).toEqual({ isDefaulter: true, consecutiveCycles: 1 });
    expect(loanDefaulter([{ cycle: '2026-10', loanUnpaid: 0 }, { cycle: '2026-09', loanUnpaid: 500 }], 1)).toEqual({ isDefaulter: false, consecutiveCycles: 0 });
  });

  it('counts unpaid months in a row from the latest, against the threshold', () => {
    const h = [{ cycle: '2026-08', loanUnpaid: 100 }, { cycle: '2026-09', loanUnpaid: 100 }, { cycle: '2026-10', loanUnpaid: 100 }];
    expect(loanDefaulter(h, 3)).toEqual({ isDefaulter: true, consecutiveCycles: 3 });
    expect(loanDefaulter(h.slice(1), 3)).toEqual({ isDefaulter: false, consecutiveCycles: 2 });
    expect(loanDefaulter([], 0)).toEqual({ isDefaulter: false, consecutiveCycles: 0 });
  });
});

describe('loanUnpaid', () => {
  const line: DemandComponent[] = [
    { head: 'CRD', amount: 50_000, allocated: 0 },
    { head: 'INTEREST', loanId: 'a', loanProduct: 'ORDINARY', amount: 10_000, allocated: 4_000 },
    { head: 'PRINCIPAL', loanId: 'a', loanProduct: 'ORDINARY', amount: 90_000, allocated: 0 },
    { head: 'PRINCIPAL', loanId: 'b', loanProduct: 'SALARY', amount: 30_000, allocated: 30_000 },
  ];
  it('counts only loan principal and interest, per loan or in total', () => {
    expect(loanUnpaid(line)).toBe(96_000);
    expect(loanUnpaid(line, 'a')).toBe(96_000);
    expect(loanUnpaid(line, 'b')).toBe(0);
  });
});
