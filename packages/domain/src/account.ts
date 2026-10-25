// MA-02 / MA-03 / MB-17 password rule [P, D-062]. Same check on the phone (meter) and the API.
import type { PasswordCheck } from '@tgs/types';
import { fail, pass } from './rules';

/**
 * At least 8 characters with a letter and a number, and not built from the member's own General No.,
 * Employee ID or mobile. Score 0–4 drives the strength meter: length, mix, case, symbol / 12+.
 */
export function checkPassword(password: string, own: { generalNo?: string; employeeId?: string; mobile?: string } = {}): PasswordCheck {
  const lower = password.toLowerCase();
  const ownValues = [own.generalNo, own.employeeId, own.mobile].filter((v): v is string => Boolean(v && v.length >= 4));
  const checks = [
    password.length >= 8 ? pass('PW-1', 'At least 8 characters.') : fail('PW-1', 'Use at least 8 characters.'),
    /[a-z]/i.test(password) && /\d/.test(password) ? pass('PW-2', 'Has letters and numbers.') : fail('PW-2', 'Mix letters and numbers.'),
    ownValues.some((v) => lower.includes(v.toLowerCase())) ? fail('PW-3', 'Do not use your General No., Employee ID or mobile number.') : pass('PW-3', 'Not your General No., Employee ID or mobile.'),
  ];
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/i.test(password) && /\d/.test(password)) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[^a-z0-9]/i.test(password) || password.length >= 12) score++;
  const ok = checks.every((c) => c.pass);
  return { ok, score: (ok ? score : Math.min(score, 1)) as PasswordCheck['score'], checks };
}
