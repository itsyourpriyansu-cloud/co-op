// Demo clock (D-065). Every business timestamp the API writes uses the demo date (db.demo.today,
// settable via POST /__demo/clock) with the real time of day, so a demo on any calendar day reads
// consistently: events, receipts, sign-offs and notifications all fall on the demo date.
// OTP / token expiry and id suffixes keep using the real clock (they are not business dates).

/** Latest UTC time that is still the same calendar day in India (UTC+05:30): 23:59:59 IST. */
const LAST_IST_MOMENT = '18:29:59.999Z';

/**
 * `${today}T<real UTC time>Z`, capped so the India-time date (what the apps display) and the UTC date
 * (what `at.slice(0, 10)` reads) are both `today`.
 */
export function demoTimestamp(today: string, now: Date = new Date()): string {
  const time = now.toISOString().slice(11);
  return `${today}T${time > LAST_IST_MOMENT ? LAST_IST_MOMENT : time}`;
}

let currentToday: () => string = () => new Date().toISOString().slice(0, 10);

/** createApp binds the clock to its store; tests that build their own app get their own binding. */
export function bindDemoClock(today: () => string): void {
  currentToday = today;
}

/** The demo date (YYYY-MM-DD). */
export const demoToday = (): string => currentToday();

/** Now, on the demo date. Use for every business timestamp. */
export const nowIso = (): string => demoTimestamp(currentToday());
