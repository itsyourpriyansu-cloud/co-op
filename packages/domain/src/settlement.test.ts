import { describe, expect, it } from 'vitest';
import { finalSettlement } from './settlement';

// F-08 (D-098): final settlement on retirement, resignation or death.
describe('finalSettlement (F-08)', () => {
  const base = {
    exitDate: '2026-11-30',
    loans: [{ id: 'l1', loanNo: 'OL-1', product: 'ORDINARY' as const, outstandingPrincipal: 100_000_00, ratePercent: 12, lastInterestChargedOn: '2026-10-31' }],
    penal: 500_00,
    otherDues: [{ head: 'RRF', label: 'RRF', amount: 100_00 }, { head: 'CRD', label: 'CRD', amount: 500_00 }],
    suretyDues: [{ recoveryId: 'r1', label: 'As surety for B', amount: 2_000_00 }],
    holds: { shareCapital: 1_000_00, shareDeposit: 10_000_00, crd: 20_000_00, srds: 0, fds: [{ id: 'f1', label: 'FDR-1', principal: 50_000_00, interest: 1_500_00 }] },
  };

  it('owes principal plus interest to the exit date, penal, unpaid items and surety dues', () => {
    const s = finalSettlement(base);
    expect(s.owes.find((x) => x.key === 'loan:l1:interest')!.amount).toBe(98_600); // ₹1,00,000 × 12% × 30 days, to the rupee
    expect(s.totalOwed).toBe(100_000_00 + 98_600 + 500_00 + 100_00 + 500_00 + 2_000_00);
  });

  it('holds shares, deposits and FDs; an unpaid CRD instalment is owed and held, so it nets out', () => {
    const s = finalSettlement(base);
    expect(s.holds.find((x) => x.key === 'crd')!.amount).toBe(20_500_00);
    expect(s.holds.find((x) => x.key === 'srds')).toBeUndefined();
    expect(s.totalHeld).toBe(1_000_00 + 10_000_00 + 20_500_00 + 51_500_00);
    expect(s.net).toBe(s.totalHeld - s.totalOwed);
    expect(s.net).toBeLessThan(0); // recovered from the gratuity
  });

  it('a member with no loans is paid what is held', () => {
    const s = finalSettlement({ ...base, loans: [], penal: 0, otherDues: [], suretyDues: [] });
    expect(s.owes).toEqual([]);
    expect(s.net).toBe(s.totalHeld);
  });
});
