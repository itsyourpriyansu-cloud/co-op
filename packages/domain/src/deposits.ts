// BR-017 / BR-027: fixed deposit maturity. Compounding is a placeholder (quarterly, Q-313).
import type { ISODate, Paise, PayoutFrequency } from '@tgs/types';
import { addMonths } from './dates';
import { roundToRupee } from './rules';

const MONTHS_PER_PAYOUT: Record<Exclude<PayoutFrequency, 'ON_MATURITY'>, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
};

export function calculateFdMaturity(input: {
  principal: Paise;
  ratePercent: number;
  tenureMonths: number;
  payout: PayoutFrequency;
  openedOn: ISODate;
}) {
  const maturityDate = addMonths(input.openedOn, input.tenureMonths);
  if (input.payout === 'ON_MATURITY') {
    const quarters = input.tenureMonths / 3;
    const maturityValue = roundToRupee(input.principal * (1 + input.ratePercent / 400) ** quarters);
    return { maturityDate, maturityValue, periodicInterest: 0, totalInterest: maturityValue - input.principal };
  }
  const periodMonths = MONTHS_PER_PAYOUT[input.payout];
  const periodicInterest = roundToRupee((input.principal * input.ratePercent * periodMonths) / 1200);
  const payouts = Math.floor(input.tenureMonths / periodMonths);
  return { maturityDate, maturityValue: input.principal, periodicInterest, totalInterest: periodicInterest * payouts };
}
