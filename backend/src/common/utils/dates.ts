import type { ISODate } from '@tgs/types';
import { TIME_ZONE } from '../../config/constants';

/** Today's date in India (YYYY-MM-DD), whatever the server's own time zone is. */
export function todayIST(now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now) as ISODate;
}
