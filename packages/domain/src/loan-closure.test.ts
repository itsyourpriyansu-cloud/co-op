import { describe, expect, it } from 'vitest';
import { calculateLoanClosure } from './loans';

const R = (rupees: number) => rupees * 100;

describe('calculateLoanClosure (BR-040, D-111)', () => {
  it('adds interest from the last charged date to today', () => {
    expect(calculateLoanClosure({ outstandingPrincipal: R(50000), ratePercent: 11, lastInterestChargedOn: '2026-09-24', today: '2026-10-24' })).toEqual({ principal: R(50000), interest: R(452), total: R(50452) });
  });

  it('charges no interest when the last paid month ends after today', () => {
    expect(calculateLoanClosure({ outstandingPrincipal: R(1000), ratePercent: 12, lastInterestChargedOn: '2026-10-31', today: '2026-10-24' })).toEqual({ principal: R(1000), interest: 0, total: R(1000) });
  });
});
