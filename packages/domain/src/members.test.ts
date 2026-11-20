// Members module rules: ST-11 validation, BR-001 retirement date, BR-010 transfer cycle, MB-19 change requests.
import { describe, expect, it } from 'vitest';
import type { Member, MemberInput } from '@tgs/types';
import {
  applyProfileChange,
  changeRequestRoute,
  expectedRetirementDate,
  maskMobile,
  probationCheck,
  retirementChangeNextApprover,
  serviceRemaining,
  validateRetirementChange,
  profileFieldValue,
  transferEffectiveCycle,
  validateChangeRequest,
  validateMemberInput,
} from './index';

const address = { line1: 'H.No 1-2, Street', city: 'Hyderabad', district: 'Hyderabad', pincode: '500004' };
const input: MemberInput = {
  name: 'Test Member',
  fatherName: 'Father Name',
  gender: 'F', caste: 'OC',
  dob: '1990-05-14',
  mobile: '9876543210',
  presentAddress: address,
  permanentAddress: address,
  employeeId: 'TS12345',
  departmentId: 'dept-fin',
  designation: 'Junior Assistant',
  doj: '2015-06-01',
  dor: '2051-05-31',
  employmentType: 'REGULAR',
  numberOfShares: 20,
  nominee: { name: 'Nominee', relation: 'Spouse' },
  payProfile: { scaleOfPay: '24280-72850', grossSalary: 5_000_000, substantivePay: 3_000_000, govtLoanDeductions: 0, otherLoanDeductions: 0 },
};
const ctx = { today: '2026-10-24', minShares: 10, maxShares: 100, others: [{ id: 'mem-1', employeeId: 'TS99999', mobile: '9000100001', name: 'Other', generalNo: '1001' }] };

describe('validateMemberInput (ST-11, AC-J09)', () => {
  it('accepts a complete member', () => expect(validateMemberInput(input, ctx)).toEqual({}));

  it('requires every [A] field', () => {
    const e = validateMemberInput({}, ctx);
    for (const k of ['name', 'fatherName', 'gender', 'dob', 'mobile', 'presentAddress.line1', 'presentAddress.city', 'presentAddress.pincode', 'permanentAddress.line1', 'employeeId', 'departmentId', 'designation', 'doj', 'dor', 'employmentType', 'numberOfShares', 'nominee.name', 'nominee.relation']) expect(e[k], k).toBeTruthy();
  });

  it('checks date order, age at joining, future joining, shares, email and pay', () => {
    expect(validateMemberInput({ ...input, doj: '1989-01-01' }, ctx).doj).toMatch(/after the date of birth/);
    expect(validateMemberInput({ ...input, doj: '2005-01-01' }, ctx).doj).toMatch(/18 or older/);
    expect(validateMemberInput({ ...input, dor: '2010-01-01' }, ctx).dor).toMatch(/after the date of joining/);
    expect(validateMemberInput({ ...input, doj: '2027-01-01' }, ctx).doj).toMatch(/future/);
    expect(validateMemberInput({ ...input, numberOfShares: 5 }, ctx).numberOfShares).toBe('Between 10 and 100 shares');
    expect(validateMemberInput({ ...input, numberOfShares: 10.5 }, ctx).numberOfShares).toBeTruthy();
    expect(validateMemberInput({ ...input, email: 'nope' }, ctx).email).toBeTruthy();
    expect(validateMemberInput({ ...input, email: 'a@b.in' }, ctx).email).toBeUndefined();
    expect(validateMemberInput({ ...input, mobile: '5876543210' }, ctx).mobile).toBeTruthy();
    expect(validateMemberInput({ ...input, dob: '1990-02-30' }, ctx).dob).toBeTruthy();
    expect(validateMemberInput({ ...input, payProfile: { ...input.payProfile, grossSalary: -1 } }, ctx)['payProfile.grossSalary']).toBeTruthy();
  });

  it('refuses a duplicate Employee ID or mobile, but not the member itself', () => {
    const dup = { ...input, employeeId: 'ts99999', mobile: '9000100001' };
    const e = validateMemberInput(dup, ctx);
    expect(e.employeeId).toMatch(/General No. 1001/);
    expect(e.mobile).toMatch(/General No. 1001/);
    expect(validateMemberInput(dup, { ...ctx, selfId: 'mem-1' })).toEqual({});
  });
});

describe('BR-001 / BR-010 helpers', () => {
  it('masks mobiles', () => {
    expect(maskMobile('9876543210')).toBe('98XXXXXX10');
    expect(maskMobile('123')).toBe('123');
  });
  it('retirement date is the last day of the birth month at retirement age', () => {
    expect(expectedRetirementDate('1966-12-09', 61)).toBe('2027-12-31');
    expect(expectedRetirementDate('1968-02-10', 60)).toBe('2028-02-29');
  });
  it('D-131: a member born on the 1st retires on the last day of the month before (FR 56)', () => {
    expect(expectedRetirementDate('1966-12-01', 61)).toBe('2027-11-30');
    expect(expectedRetirementDate('1968-03-01', 60)).toBe('2028-02-29');
    expect(expectedRetirementDate('1966-01-01', 61)).toBe('2026-12-31');
    expect(expectedRetirementDate('1966-12-02', 61)).toBe('2027-12-31');
  });
  it('D-131: service remaining in months and days', () => {
    expect(serviceRemaining('2027-12-31', '2026-11-18')).toEqual({ months: 13, label: expect.any(String), days: 408, dor: '2027-12-31' });
    expect(serviceRemaining('2026-01-31', '2026-11-18')).toMatchObject({ months: 0, days: 0 });
  });
  it('D-131: probation warns only for probationers short of the months', () => {
    expect(probationCheck('REGULAR', '2026-10-01', '2026-11-18', 6)).toBeUndefined();
    expect(probationCheck('APPROVED_PROBATIONER', '2026-08-01', '2026-11-18', 6)).toMatchObject({ ruleId: 'BR-054', pass: false, severity: 'warn' });
    expect(probationCheck('APPROVED_PROBATIONER', '2026-05-18', '2026-11-18', 6)).toMatchObject({ pass: true, severity: 'warn' });
    expect(probationCheck('APPROVED_PROBATIONER', '2026-08-01', '2026-11-18', 0)).toBeUndefined();
  });
  it('D-131: retirement date changes go Accountant → Secretary → President', () => {
    expect([0, 1, 2, 3].map(retirementChangeNextApprover)).toEqual(['ACCOUNTANT', 'SECRETARY', 'PRESIDENT', undefined]);
    const m = { dor: '2030-05-31', doj: '2000-01-10' };
    expect(validateRetirementChange(m, { newDor: '2030-04-30', reason: 'Service register entry' })).toEqual({});
    expect(validateRetirementChange(m, { newDor: '2030-05-31', reason: 'x' })).toEqual({ newDor: expect.any(String), reason: expect.any(String) });
    expect(validateRetirementChange(m, { newDor: '1999-01-01', reason: 'Service register' }).newDor).toMatch(/after the date of joining/);
  });
  it('transfer moves on the first sheet not yet generated for the old department', () => {
    expect(transferEffectiveCycle('2026-10-15', ['2026-09', '2026-10'])).toBe('2026-11');
    expect(transferEffectiveCycle('2026-12-01', ['2026-10'])).toBe('2026-12');
    expect(transferEffectiveCycle('2026-12-20', ['2026-12', '2027-01'])).toBe('2027-02');
  });
});

describe('profile change requests (MB-19, D-057)', () => {
  const member = {
    id: 'mem-1101', name: 'Lakshmi Devi', fatherName: 'Rao', dob: '1982-03-01', designation: 'Section Officer', doj: '2005-01-01', dor: '2043-03-31',
    nominee: { name: 'Ravi', relation: 'Spouse' }, payProfile: { scaleOfPay: '45960-124340', grossSalary: 9_500_000, substantivePay: 0, govtLoanDeductions: 0, otherLoanDeductions: 0 },
  } as unknown as Member;

  it('routes employment / pay changes through the DDO', () => {
    expect(changeRequestRoute(['nominee.name'])).toBe('OFFICE');
    expect(changeRequestRoute(['nominee.name', 'designation'])).toBe('DDO_THEN_OFFICE');
  });

  it('D-131: the date of retirement cannot be asked for in a request', () => {
    expect(validateChangeRequest(member, { fields: [{ field: 'dor', newValue: '2043-02-28' }], reason: 'Wrong date' }, [], '2026-10-24')['fields.dor']).toMatch(/society office/);
  });

  it('reads and writes every kind of field', () => {
    expect(profileFieldValue(member, 'name')).toBe('Lakshmi Devi');
    expect(profileFieldValue(member, 'nominee.name')).toBe('Ravi');
    expect(profileFieldValue(member, 'nominee.relation')).toBe('Spouse');
    expect(profileFieldValue(member, 'payProfile.scaleOfPay')).toBe('45960-124340');
    expect(profileFieldValue(member, 'payProfile.grossSalary')).toBe('95000');
    expect(applyProfileChange(member, { field: 'designation', newValue: ' Deputy Secretary ' }).designation).toBe('Deputy Secretary');
    expect(applyProfileChange(member, { field: 'nominee.name', newValue: 'Sita' }).nominee.name).toBe('Sita');
    expect(applyProfileChange(member, { field: 'nominee.relation', newValue: 'Son' }).nominee.relation).toBe('Son');
    expect(applyProfileChange(member, { field: 'payProfile.scaleOfPay', newValue: 'X' }).payProfile.scaleOfPay).toBe('X');
    expect(applyProfileChange(member, { field: 'payProfile.grossSalary', newValue: '100000' }).payProfile.grossSalary).toBe(10_000_000);
  });

  it('validates the request', () => {
    const ok = { fields: [{ field: 'designation' as const, newValue: 'Deputy Secretary' }], reason: 'Promoted in Sept 2026' };
    expect(validateChangeRequest(member, ok, [], '2026-10-24')).toEqual({});
    expect(validateChangeRequest(member, { fields: [], reason: '' }, [], '2026-10-24')).toEqual({ fields: expect.any(String), reason: expect.any(String) });
    const e = validateChangeRequest(
      member,
      {
        fields: [
          { field: 'name', newValue: ' ' },
          { field: 'fatherName', newValue: 'Rao' },
          { field: 'dob', newValue: '2030-01-01' },
          { field: 'payProfile.grossSalary', newValue: 'abc' },
          { field: 'nominee.relation', newValue: 'Cousin' },
          { field: 'designation', newValue: 'Deputy Secretary' },
          { field: 'bogus' as never, newValue: 'x' },
        ],
        reason: 'Because',
      },
      ['designation'],
      '2026-10-24',
    );
    expect(Object.keys(e).sort()).toEqual(['fields.bogus', 'fields.designation', 'fields.dob', 'fields.fatherName', 'fields.name', 'fields.nominee.relation', 'fields.payProfile.grossSalary']);
  });
});

describe('isSearchable (member and surety search)', () => {
  it('runs from one digit or two characters', async () => {
    const { isSearchable } = await import('./members');
    expect(['3', ' 7 ', '12', 'ra'].map(isSearchable)).toEqual([true, true, true, true]);
    expect(['', ' ', 'r', '-'].map(isSearchable)).toEqual([false, false, false, false]);
  });
});
