// BR-017 / BR-027: fixed deposit maturity. Compounding is a placeholder (quarterly, Q-313).
import type { FdPenaltyMethod, FdSettlement, ISODate, Paise, PayoutFrequency } from '@tgs/types';
import { addMonths, fullMonthsBetween } from './dates';
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

/** F4 periodic interest: one payout at the end of each period up to maturity (none for ON_MATURITY). */
export function fdPayoutSchedule(input: { principal: Paise; ratePercent: number; tenureMonths: number; payout: PayoutFrequency; openedOn: ISODate }): Array<{ date: ISODate; amount: Paise }> {
  if (input.payout === 'ON_MATURITY') return [];
  const period = MONTHS_PER_PAYOUT[input.payout];
  const amount = roundToRupee((input.principal * input.ratePercent * period) / 1200);
  return Array.from({ length: Math.floor(input.tenureMonths / period) }, (_, i) => ({ date: addMonths(input.openedOn, (i + 1) * period), amount }));
}

/** F4 minor declaration: the 18th birthday. */
export function minorMajorityDate(dob: ISODate): ISODate {
  return addMonths(dob, 18 * 12);
}

export interface FdRequestShape {
  principal: Paise;
  tenureMonths: number;
  payoutFrequency: PayoutFrequency;
  holding: 'SINGLE' | 'JOINT' | 'MINOR';
  holders?: Array<{ name: string; fatherOrHusbandName: string; occupation: string; address: string; phone: string }>;
  minor?: { name: string; dob: ISODate; guardianRelation: string };
  nominee: { name: string; relation: string };
}

/**
 * MB-15 / ST-31 (form F4): amount ≥ minimum (Q-313), a period inside a rate slab (BR-017), payout one
 * of the four [PF] options, 1–2 joint holders with items 2–4 [P max 3 holders], a minor under 18 with a
 * guardian relation, and a nominee. Returns field → message.
 */
export function validateFdRequest(input: FdRequestShape, ctx: { slabs: Array<{ fromMonths: number; toMonths: number }>; minAmount: Paise; today: ISODate }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(input.principal >= ctx.minAmount)) e.principal = `The smallest deposit is ₹${(ctx.minAmount / 100).toLocaleString('en-IN')}`;
  if (!Number.isInteger(input.tenureMonths) || !ctx.slabs.some((s) => input.tenureMonths >= s.fromMonths && input.tenureMonths <= s.toMonths)) e.tenureMonths = 'Choose a period the society offers';
  if (!['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ON_MATURITY'].includes(input.payoutFrequency)) e.payoutFrequency = 'Choose when interest is paid';
  if (input.holding === 'JOINT') {
    const h = input.holders ?? [];
    if (h.length < 1 || h.length > 2) e.holders = 'Add one or two joint holders';
    h.forEach((x, i) => {
      if (!x.name.trim()) e[`holders.${i}.name`] = 'Required';
      if (!x.fatherOrHusbandName.trim()) e[`holders.${i}.fatherOrHusbandName`] = 'Required';
      if (!x.address.trim()) e[`holders.${i}.address`] = 'Required';
      if (!/^[6-9]\d{9}$/.test(x.phone)) e[`holders.${i}.phone`] = 'Enter a 10-digit mobile number';
    });
  }
  if (input.holding === 'MINOR') {
    const m = input.minor;
    if (!m?.name.trim()) e['minor.name'] = "Enter the minor's name";
    if (!m?.dob || m.dob >= ctx.today) e['minor.dob'] = 'Enter a valid date of birth';
    else if (minorMajorityDate(m.dob) <= ctx.today) e['minor.dob'] = 'Already 18: open the deposit in their own name';
    if (!m?.guardianRelation.trim()) e['minor.guardianRelation'] = 'Required';
  }
  if (!input.nominee.name.trim()) e['nominee.name'] = 'Enter a nominee';
  if (!input.nominee.relation.trim()) e['nominee.relation'] = 'Required';
  return e;
}

/**
 * P6b premature withdrawal (D-086, F-06 [P]). Interest counts for completed months held, the same
 * way maturity is worked out (quarterly compounding for ON_MATURITY, simple for periodic payouts).
 * RATE_CUT: interest at (rate − penalty points); SHARE_OF_INTEREST: penalty is that % of the interest.
 * The penalty only ever comes out of interest: the principal is always returned in full.
 */
export function fdPrematureSettlement(input: { principal: Paise; ratePercent: number; payout: PayoutFrequency; openedOn: ISODate; today: ISODate; method: FdPenaltyMethod; penaltyPercent: number }): FdSettlement {
  const monthsHeld = Math.max(0, fullMonthsBetween(input.openedOn, input.today));
  const interestAt = (rate: number) => (monthsHeld === 0 ? 0 : calculateFdMaturity({ principal: input.principal, ratePercent: rate, tenureMonths: monthsHeld, payout: input.payout === 'ON_MATURITY' ? 'ON_MATURITY' : 'MONTHLY', openedOn: input.openedOn }).totalInterest);
  const interestEarned = interestAt(input.ratePercent);
  const rawPenalty = input.method === 'RATE_CUT' ? interestEarned - interestAt(Math.max(0, input.ratePercent - input.penaltyPercent)) : roundToRupee((interestEarned * input.penaltyPercent) / 100);
  const alreadyPaid = fdPayoutSchedule({ principal: input.principal, ratePercent: input.ratePercent, tenureMonths: monthsHeld, payout: input.payout, openedOn: input.openedOn }).reduce((s, p) => s + p.amount, 0);
  const owed = Math.max(0, interestEarned - alreadyPaid);
  const penalty = Math.min(Math.max(0, rawPenalty), owed);
  const interestPayable = owed - penalty;
  return { principal: input.principal, monthsHeld, ratePercent: input.ratePercent, method: input.method, penaltyPercent: input.penaltyPercent, interestEarned, alreadyPaid, penalty, interestPayable, payable: input.principal + interestPayable };
}
