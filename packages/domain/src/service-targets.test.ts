import { describe, expect, it } from 'vitest';
import { keepsAppAccess } from './members';
import { validateSocietySettings } from './settings';
import { isWorkingDay, serviceTarget, workingHoursBetween } from './service-targets';

const s = { membershipTargetHours: 48, loanTargetDays: 5, holidays: ['2026-11-04'] };

describe('working days (F-14, D-093)', () => {
  it('Sundays, second Saturdays and holidays are not working days', () => {
    expect(isWorkingDay('2026-11-01', [])).toBe(false); // Sunday
    expect(isWorkingDay('2026-11-14', [])).toBe(false); // second Saturday
    expect(isWorkingDay('2026-11-07', [])).toBe(true); // first Saturday
    expect(isWorkingDay('2026-11-04', s.holidays)).toBe(false);
    expect(isWorkingDay('2026-11-03', s.holidays)).toBe(true);
  });

  it('counts only the hours on working days, in India time', () => {
    // Sat 31 Oct 10:00 → Mon 2 Nov 10:00 IST: 14 h on Saturday + 10 h on Monday; Sunday skipped.
    expect(workingHoursBetween('2026-10-31T10:00:00+05:30', '2026-11-02T10:00:00+05:30', [])).toBe(24);
    expect(workingHoursBetween('2026-11-02', '2026-11-02', [])).toBe(0);
  });
});

describe('serviceTarget (REQ-135, D-090, D-093)', () => {
  it('membership: over once 48 working hours have passed since submission', () => {
    expect(serviceTarget('membership', '2026-11-02T10:00:00+05:30', '2026-11-04T10:00:00+05:30', { ...s, holidays: [] })).toEqual({ label: '48 working-hour target', over: false, elapsedHours: 48 });
    expect(serviceTarget('membership', '2026-11-02T10:00:00+05:30', '2026-11-04T11:00:00+05:30', { ...s, holidays: [] }).over).toBe(true);
    // A holiday in between pushes the target out by a day.
    expect(serviceTarget('membership', '2026-11-02T10:00:00+05:30', '2026-11-04T11:00:00+05:30', s).over).toBe(false);
  });

  it('loan: five working days; a date counts from the start of that day', () => {
    // Mon 2 Nov → Mon 9 Nov 00:00: Mon–Sat except the 4th (holiday) = 5 working days = 120 h.
    expect(serviceTarget('loan', '2026-11-02', '2026-11-09T00:00:00+05:30', s)).toMatchObject({ label: '5-working-day target', over: false, elapsedHours: 120 });
    expect(serviceTarget('loan', '2026-11-02', '2026-11-09T10:00:00+05:30', s).over).toBe(true);
  });

  it('a target of 0 means no target; time never runs backwards', () => {
    expect(serviceTarget('loan', '2026-01-01', '2026-11-03', { ...s, loanTargetDays: 0 }).over).toBe(false);
    expect(serviceTarget('membership', '2026-11-05', '2026-11-03', s).elapsedHours).toBe(0);
  });

  it('settings validation', () => {
    const base = { shareValue: 1, minShares: 1, maxShares: 2, retirementAge: 60, defaulterCycles: 1, rrfMonthly: 0, crdMonthly: 0, srdsMonthly: 0, insurance: { loaneeAmount: 0, nonLoaneeAmount: 0, collectionMonth: 4 }, savingsRatePercent: 0, fdMinAmount: 1, admissionFee: 0, maxGuaranteesPerSurety: 2, emiToNetSalaryMaxPercent: 50, financialYearStartMonth: 4 };
    expect(validateSocietySettings({ ...base, ...s })).toEqual({});
    expect(validateSocietySettings({ ...base, membershipTargetHours: -1, loanTargetDays: 1.5, holidays: ['5 Nov'] })).toMatchObject({ membershipTargetHours: expect.any(String), loanTargetDays: expect.any(String), holidays: expect.any(String) });
  });
});

describe('ex-employees (F-12, D-093)', () => {
  it('keep the app unless deceased', () => {
    expect(keepsAppAccess('ACTIVE')).toBe(true);
    expect(keepsAppAccess('RETIRED')).toBe(true);
    expect(keepsAppAccess('RESIGNED')).toBe(true);
    expect(keepsAppAccess('DECEASED')).toBe(false);
  });
});
