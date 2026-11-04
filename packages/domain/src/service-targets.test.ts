import { describe, expect, it } from 'vitest';
import { validateSocietySettings } from './settings';
import { serviceTarget } from './service-targets';

const s = { membershipTargetHours: 48, loanTargetDays: 5 };

describe('serviceTarget (REQ-135, D-089)', () => {
  it('membership: over once 48 hours have passed since submission', () => {
    expect(serviceTarget('membership', '2026-11-01T10:00:00.000Z', '2026-11-03T10:00:00.000Z', s)).toEqual({ label: '48 h target', over: false, elapsedHours: 48 });
    expect(serviceTarget('membership', '2026-11-01T10:00:00.000Z', '2026-11-03T11:00:00.000Z', s).over).toBe(true);
  });

  it('loan: a date counts from the start of that day in India', () => {
    expect(serviceTarget('loan', '2026-10-29', '2026-11-03T00:00:00.000+05:30', s)).toMatchObject({ label: '5-day target', over: false, elapsedHours: 120 });
    expect(serviceTarget('loan', '2026-10-28', '2026-11-03T00:30:00.000+05:30', s).over).toBe(true);
  });

  it('a target of 0 means no target; time never runs backwards', () => {
    expect(serviceTarget('loan', '2026-01-01', '2026-11-03', { ...s, loanTargetDays: 0 }).over).toBe(false);
    expect(serviceTarget('membership', '2026-11-05', '2026-11-03', s).elapsedHours).toBe(0);
  });

  it('settings validation', () => {
    const base = { shareValue: 1, minShares: 1, maxShares: 2, retirementAge: 60, defaulterCycles: 1, rrfMonthly: 0, crdMonthly: 0, srdsMonthly: 0, insurance: { loaneeAmount: 0, nonLoaneeAmount: 0, collectionMonth: 4 }, savingsRatePercent: 0, fdMinAmount: 1, admissionFee: 0, maxGuaranteesPerSurety: 2, emiToNetSalaryMaxPercent: 50, financialYearStartMonth: 4 };
    expect(validateSocietySettings({ ...base, ...s })).toEqual({});
    expect(validateSocietySettings({ ...base, membershipTargetHours: -1, loanTargetDays: 1.5 })).toMatchObject({ membershipTargetHours: expect.any(String), loanTargetDays: expect.any(String) });
  });
});
