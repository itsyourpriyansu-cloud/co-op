import { describe, expect, it } from 'vitest';
import { calculateFdMaturity, fdPrematureSettlement } from './deposits';
import { validateSocietySettings } from './settings';
import { nextDepositStatus } from './workflows';
import { SETTINGS } from '../../mock-data/src/catalog';

// P6b premature withdrawal (D-086, F-06 [P]): the penalty comes only out of interest.
const base = { principal: 10_000_000, ratePercent: 7.5, openedOn: '2025-10-24', today: '2026-10-30' } as const;
const interest12 = (rate: number) => calculateFdMaturity({ principal: base.principal, ratePercent: rate, tenureMonths: 12, payout: 'ON_MATURITY', openedOn: base.openedOn }).totalInterest;

describe('fdPrematureSettlement', () => {
  it('counts completed months only, and at 0% pays principal plus all interest earned', () => {
    const s = fdPrematureSettlement({ ...base, payout: 'ON_MATURITY', method: 'RATE_CUT', penaltyPercent: 0 });
    expect(s.monthsHeld).toBe(12);
    expect(s.interestEarned).toBe(interest12(7.5));
    expect(s).toMatchObject({ penalty: 0, alreadyPaid: 0, interestPayable: s.interestEarned, payable: base.principal + s.interestEarned });
  });

  it('RATE_CUT pays interest at the reduced rate; the penalty is the difference, taken once', () => {
    const s = fdPrematureSettlement({ ...base, payout: 'ON_MATURITY', method: 'RATE_CUT', penaltyPercent: 1 });
    expect(s.interestPayable).toBe(interest12(6.5));
    expect(s.penalty).toBe(interest12(7.5) - interest12(6.5));
    expect(s.payable).toBe(base.principal + interest12(6.5));
    expect(s.interestEarned - s.penalty).toBe(s.interestPayable);
  });

  it('SHARE_OF_INTEREST takes that percent of the interest earned', () => {
    const s = fdPrematureSettlement({ ...base, payout: 'ON_MATURITY', method: 'SHARE_OF_INTEREST', penaltyPercent: 10 });
    expect(s.penalty).toBe(Math.round(interest12(7.5) / 10 / 100) * 100);
    expect(s.payable).toBe(base.principal + s.interestEarned - s.penalty);
  });

  it('periodic payouts already due are not paid twice, and the principal is never cut', () => {
    // Simple interest, ₹62,500 a month; four quarterly payouts are already due after 12 months.
    const s = fdPrematureSettlement({ ...base, payout: 'QUARTERLY', method: 'RATE_CUT', penaltyPercent: 1 });
    expect(s.interestEarned).toBe(750_000);
    expect(s.alreadyPaid).toBe(750_000);
    expect(s).toMatchObject({ penalty: 0, interestPayable: 0, payable: base.principal });
    const big = fdPrematureSettlement({ ...base, payout: 'ON_MATURITY', method: 'SHARE_OF_INTEREST', penaltyPercent: 100 });
    expect(big).toMatchObject({ penalty: big.interestEarned, interestPayable: 0, payable: base.principal });
  });

  it('withdrawn in the first month earns nothing and costs nothing', () => {
    const s = fdPrematureSettlement({ ...base, today: '2025-11-10', payout: 'ON_MATURITY', method: 'RATE_CUT', penaltyPercent: 2 });
    expect(s).toMatchObject({ monthsHeld: 0, interestEarned: 0, penalty: 0, payable: base.principal });
  });
});

describe('P6b transitions and settings', () => {
  it('the job matures an active FD; withdrawal closes it', () => {
    expect(nextDepositStatus('ACTIVE', 'mature')).toBe('MATURED');
    expect(nextDepositStatus('MATURED', 'mature')).toBeUndefined();
    expect(nextDepositStatus('ACTIVE', 'withdraw')).toBe('CLOSED');
    expect(nextDepositStatus('MATURED', 'withdraw')).toBeUndefined();
  });

  it('validates the FD maturity and withdrawal settings', () => {
    expect(validateSocietySettings(SETTINGS)).toEqual({});
    expect(SETTINGS.fdPrematurePenaltyPercent).toBe(0);
    const bad = validateSocietySettings({ ...SETTINGS, fdMaturityRunHour: 24, fdPrematurePenaltyPercent: -1, fdPrematurePenaltyMethod: 'X' as never, fdMaturityJobEnabled: 'yes' as never, fdPrematureWithdrawalEnabled: 1 as never });
    expect(Object.keys(bad).sort()).toEqual(['fdMaturityJobEnabled', 'fdMaturityRunHour', 'fdPrematurePenaltyMethod', 'fdPrematurePenaltyPercent', 'fdPrematureWithdrawalEnabled']);
    expect(validateSocietySettings({ ...SETTINGS, fdPrematurePenaltyMethod: 'SHARE_OF_INTEREST', fdPrematurePenaltyPercent: 100 })).toEqual({});
    expect(validateSocietySettings({ ...SETTINGS, fdPrematurePenaltyMethod: 'SHARE_OF_INTEREST', fdPrematurePenaltyPercent: 101 })).toHaveProperty('fdPrematurePenaltyPercent');
  });
});
