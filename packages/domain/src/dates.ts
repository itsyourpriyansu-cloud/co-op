// Calendar helpers on ISO strings (no time zones: every value is a calendar date).
// Formatting is hand-rolled so web and Hermes render the same text.
import type { Cycle, ISODate } from '@tgs/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseISODate(iso: ISODate): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Invalid ISO date: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m))
    throw new RangeError(`Invalid ISO date: ${iso}`);
  return { y, m, d };
}

export function toISODate({ y, m, d }: Ymd): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-07-05" → "05 Jul 2026" (docs/12 §3). */
export function formatDisplayDate(iso: ISODate): string {
  const { y, m, d } = parseISODate(iso);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10" → "Oct 2026". */
export function formatCycle(cycle: Cycle): string {
  const match = /^(\d{4})-(\d{2})$/.exec(cycle);
  if (!match) throw new RangeError(`Invalid cycle: ${cycle}`);
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

export function toCycle(iso: ISODate): Cycle {
  return iso.slice(0, 7);
}

/** Adds calendar months, clamping to month end (31 Jan + 1 → 28/29 Feb). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const { y, m, d } = parseISODate(iso);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return toISODate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

/** Whole months from `from` to `to` (floor). Negative when `to` is earlier. */
export function fullMonthsBetween(from: ISODate, to: ISODate): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (months > 0 && b.d < a.d) months -= 1;
  if (months < 0 && b.d > a.d) months += 1;
  return months;
}

/** 40 → "3 yrs 4 mths" (docs/12 §3). */
export function formatDuration(totalMonths: number): string {
  const sign = totalMonths < 0 ? '-' : '';
  const abs = Math.abs(totalMonths);
  const years = Math.floor(abs / 12);
  const months = abs % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (months || !years) parts.push(`${months} ${months === 1 ? 'mth' : 'mths'}`);
  return sign + parts.join(' ');
}
