// Edge cases that complete branch coverage of @tgs/domain (M1 exit: 100% branches).
import { describe, expect, it } from 'vitest';
import type { MembershipForm } from '@tgs/types';
import {
  addMonths,
  ageOn,
  allocateRecovery,
  amountInWords,
  calculateEmi,
  checkMembershipEligibility,
  formatCycle,
  formatDisplayDateTime,
  formatDuration,
  formatINR,
  formatINRCompact,
  fullMonthsBetween,
  generateSchedule,
  groupIndian,
  numberToIndianWords,
  parseISODate,
  toCycle,
  toRupees,
  validateMembershipForm,
} from './index';

describe('money edges', () => {
  it('formats and words', () => {
    expect(toRupees(12345)).toBe(123.45);
    expect(groupIndian('999')).toBe('999');
    expect(formatINR(12350)).toBe('₹124');
    expect(formatINR(12349)).toBe('₹123');
    expect(formatINR(-500, { decimals: 2 })).toBe('-₹5.00');
    expect(formatINRCompact(-1_50_00_000_00)).toBe('-₹1.5 Cr');
    expect(formatINRCompact(18_60_000_00)).toBe('₹18.6 L');
    expect(formatINRCompact(5_00_00_000)).toBe('₹5 L');
    expect(formatINRCompact(99_900)).toBe('₹999');
    expect(numberToIndianWords(0)).toBe('Zero');
    expect(numberToIndianWords(2_05_00_00_017)).toBe('Two Hundred Five Crore Seventeen');
    expect(numberToIndianWords(40)).toBe('Forty');
    expect(numberToIndianWords(300)).toBe('Three Hundred');
    expect(() => numberToIndianWords(-1)).toThrow(RangeError);
    expect(() => numberToIndianWords(1.5)).toThrow(RangeError);
    expect(amountInWords(10050)).toBe('Rupees One Hundred and Fifty Paise Only');
    expect(() => amountInWords(-1)).toThrow(RangeError);
  });
});

describe('date edges', () => {
  it('validates, formats and counts', () => {
    expect(() => parseISODate('2026-13-01')).toThrow(RangeError);
    expect(() => parseISODate('2026-02-30')).toThrow(RangeError);
    expect(() => parseISODate('2026-00-10')).toThrow(RangeError);
    expect(() => parseISODate('2026-01-00')).toThrow(RangeError);
    expect(() => parseISODate('24-10-2026')).toThrow(RangeError);
    expect(() => formatCycle('2026/10')).toThrow(RangeError);
    expect(formatDisplayDateTime('2026-10-24T05:10:00Z')).toBe('24 Oct 2026, 10:40');
    expect(formatDisplayDateTime('not a date')).toBe('not a date');
    expect(fullMonthsBetween('2026-10-24', '2026-08-30')).toBe(-1);
    expect(fullMonthsBetween('2026-10-24', '2026-08-10')).toBe(-2);
    expect(formatDuration(12)).toBe('1 yr');
    expect(formatDuration(13)).toBe('1 yr 1 mth');
    expect(formatDuration(0)).toBe('0 mths');
    expect(formatDuration(-25)).toBe('-2 yrs 1 mth');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(ageOn('2000-10-25', '2026-10-24')).toBe(25);
    expect(toCycle('2026-10-24')).toBe('2026-10');
  });
});

describe('loan edges', () => {
  it('empty and zero-rate schedules', () => {
    expect(generateSchedule(0, 11, 12, 'AMORTIZED', '2026-11')).toEqual([]);
    expect(generateSchedule(100000, 11, 0, 'AMORTIZED', '2026-11')).toEqual([]);
    const zero = generateSchedule(1200000, 0, 12, 'AMORTIZED', '2026-11');
    expect(zero.every((r) => r.interest === 0)).toBe(true);
    expect(zero.at(-1)?.closing).toBe(0);
    expect(calculateEmi(0, 11, 12, 'AMORTIZED')).toMatchObject({ emi: 0, firstInstalment: 0, lastInstalment: 0, totalPayable: 0 });
  });
});

describe('allocation edges', () => {
  it('equal priority keeps the original order', () => {
    const r = allocateRecovery(
      [
        { head: 'RRF', amount: 100, allocated: 0 },
        { head: 'RRF', amount: 100, allocated: 0 },
      ],
      150,
    );
    expect(r.components.map((c) => c.allocated)).toEqual([100, 50]);
  });
});

describe('membership edges (BR-026, F1 validation)', () => {
  it('each eligibility answer can fail; under 18 fails', () => {
    const r = checkMembershipEligibility({ worksInSecretariatDept: false, regularOrApprovedProbationer: false, memberOfOtherCreditSocietyWithDues: true, dob: '2010-01-01', today: '2026-10-24' });
    expect(r.eligible).toBe(false);
    expect(r.checks.filter((c) => !c.pass)).toHaveLength(4);
    expect(checkMembershipEligibility({ worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: false, dob: '1990-01-01', today: '2026-10-24' }).eligible).toBe(true);
  });
  const docs = [{ type: 'PHOTO', label: 'Photo' }];
  it('empty form lists every missing field', () => {
    const e = validateMembershipForm(undefined, docs);
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['personal.fullName', 'address.permanent.line1', 'documents.PHOTO', 'declarations.recoveryMandateAccepted']));
  });
  it('complete form passes; bad email, PIN and missing probation months are caught', () => {
    const ok: MembershipForm = {
      personal: { fullName: 'A B', fatherName: 'C B', dob: '1995-01-01', gender: 'F', email: 'a@b.org' },
      address: { present: { line1: 'x', city: 'Hyd', pincode: '500001' }, sameAsPresent: true },
      employment: { departmentId: 'd', designation: 'JA', employmentType: 'REGULAR', regularAppointmentDate: '2020-01-01' },
      shares: { sharesProposed: 10 },
      nominee: { name: 'N', relation: 'Father' },
      documents: [{ type: 'PHOTO', fileName: 'p.jpg', uploadedAt: '2026-10-24T00:00:00Z' }],
      declarations: { byelawsAccepted: true, noOtherSociety: true, recoveryMandateAccepted: true },
    };
    expect(validateMembershipForm(ok, docs)).toEqual({});
    const bad = validateMembershipForm(
      { ...ok, personal: { ...ok.personal, email: 'nope' }, address: { present: { line1: 'x', city: 'Hyd', pincode: '5001' } }, employment: { ...ok.employment, employmentType: 'APPROVED_PROBATIONER' }, shares: { sharesProposed: Number.NaN } },
      docs,
    );
    expect(Object.keys(bad)).toEqual(expect.arrayContaining(['personal.email', 'address.present.pincode', 'address.permanent.line1', 'employment.probationServiceMonths', 'shares.sharesProposed']));
  });
});
