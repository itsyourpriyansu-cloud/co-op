import type { SocietySettings } from '@tgs/types';

export type ServiceTargetSettings = Pick<SocietySettings, 'membershipTargetHours' | 'loanTargetDays'>;

/** A date without a time counts from the start of that day in India. */
const instant = (at: string) => Date.parse(at.length === 10 ? `${at}T00:00:00+05:30` : at);

/**
 * REQ-135 [S] (D-089): a membership should be decided within `membershipTargetHours` of being
 * submitted and a loan within `loanTargetDays` of its application. Calendar time [ASSUMPTION].
 */
export function serviceTarget(kind: 'membership' | 'loan', startedAt: string, now: string, s: ServiceTargetSettings): { label: string; over: boolean; elapsedHours: number } {
  const elapsedHours = Math.max(0, Math.floor((instant(now) - instant(startedAt)) / 3_600_000));
  const targetHours = kind === 'membership' ? s.membershipTargetHours : s.loanTargetDays * 24;
  return { label: kind === 'membership' ? `${s.membershipTargetHours} h target` : `${s.loanTargetDays}-day target`, over: targetHours > 0 && elapsedHours > targetHours, elapsedHours };
}
