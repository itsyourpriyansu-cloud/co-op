// D-124: which month a new loan's first instalment can start, and the interest for the days before it.
import type { Cycle, DemandSheetStatus, ISODate, Paise } from '@tgs/types';
import { addMonths, toCycle } from './dates';
import { demandSendByDate } from './collections';
import { calculateAccruedInterest } from './loans';

/**
 * A cycle can still carry a new instalment while its department sheet is not made yet and the cut-off
 * (the send-by date, `demandSendByDays` before the 1st) has not passed, or while the sheet is only
 * GENERATED (Regenerate picks the instalment up). A certified, sent or posted sheet is closed.
 */
export function isCycleOpenForNewDues(cycle: Cycle, today: ISODate, sendByDays: number, sheetStatus: DemandSheetStatus | undefined): boolean {
  if (sheetStatus === undefined) return today <= demandSendByDate(cycle, sendByDays);
  return sheetStatus === 'GENERATED';
}

/** The first `count` cycles from today's month that are open: the member's "this month or next month" choice. */
export function firstDeductionOptions(input: { today: ISODate; sendByDays: number; sheetStatus: (cycle: Cycle) => DemandSheetStatus | undefined; count?: number }): Cycle[] {
  const out: Cycle[] = [];
  const count = input.count ?? 2;
  for (let i = 0; i < 24 && out.length < count; i++) {
    const cycle = toCycle(addMonths(`${toCycle(input.today)}-01`, i));
    if (isCycleOpenForNewDues(cycle, input.today, input.sendByDays, input.sheetStatus(cycle))) out.push(cycle);
  }
  return out;
}

/** Interest by actual days (the BR-007 basis, Q-303) from the payment date to the 1st of the first deduction month; 0 when that date has passed. */
export function earlyInterestFor(principal: Paise, ratePercent: number, from: ISODate, firstDueCycle: Cycle): Paise {
  return calculateAccruedInterest(principal, ratePercent, from, `${firstDueCycle}-01`);
}
