import type { ISODate } from '@tgs/types';
import { formatDuration, fullMonthsBetween } from './dates';

/** BR-001: whole months from today until the date of retirement (never stored, always derived). */
export function calculateLeftoverService(dor: ISODate, today: ISODate): { months: number; label: string } {
  const months = Math.max(0, fullMonthsBetween(today, dor));
  return { months, label: formatDuration(months) };
}

/** Age in completed years. */
export function ageOn(dob: ISODate, today: ISODate): number {
  return Math.floor(fullMonthsBetween(dob, today) / 12);
}
