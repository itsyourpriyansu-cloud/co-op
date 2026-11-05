import type { ISODate, SocietySettings } from '@tgs/types';

export type ServiceTargetSettings = Pick<SocietySettings, 'membershipTargetHours' | 'loanTargetDays' | 'holidays'>;

const IST_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** A date without a time counts from the start of that day in India. */
const instant = (at: string) => Date.parse(at.length === 10 ? `${at}T00:00:00+05:30` : at);

/** F-14 [S] (D-093): Sundays, second Saturdays and the Admin's holiday list are not working days. */
export function isWorkingDay(date: ISODate, holidays: readonly ISODate[]): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay();
  if (day === 0) return false;
  if (day === 6 && d.getUTCDate() >= 8 && d.getUTCDate() <= 14) return false;
  return !holidays.includes(date);
}

/** Hours between two instants that fall on working days (IST). */
export function workingHoursBetween(from: string, to: string, holidays: readonly ISODate[]): number {
  let t = instant(from);
  const end = instant(to);
  let ms = 0;
  while (t < end) {
    const dayStart = Math.floor((t + IST_MS) / DAY_MS) * DAY_MS - IST_MS;
    const next = Math.min(dayStart + DAY_MS, end);
    if (isWorkingDay(new Date(dayStart + IST_MS).toISOString().slice(0, 10), holidays)) ms += next - t;
    t = next;
  }
  return Math.floor(ms / 3_600_000);
}

/**
 * REQ-135 [S] (D-090, D-093): a membership should be decided within `membershipTargetHours` working
 * hours of submission and a loan within `loanTargetDays` working days of its last surety signing
 * (of its submission when it needs none). Only working days count; the clock never pauses.
 */
export function serviceTarget(kind: 'membership' | 'loan', startedAt: string, now: string, s: ServiceTargetSettings): { label: string; over: boolean; elapsedHours: number } {
  const elapsedHours = workingHoursBetween(startedAt, now, s.holidays);
  const targetHours = kind === 'membership' ? s.membershipTargetHours : s.loanTargetDays * 24;
  return { label: kind === 'membership' ? `${s.membershipTargetHours} working-hour target` : `${s.loanTargetDays}-working-day target`, over: targetHours > 0 && elapsedHours > targetHours, elapsedHours };
}
