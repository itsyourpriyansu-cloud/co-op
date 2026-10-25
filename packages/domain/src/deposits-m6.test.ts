// M6: FD request validation (F4, Q-313), payout schedule, minor's majority date.
import { describe, expect, it } from 'vitest';
import { fdPayoutSchedule, minorMajorityDate, validateFdRequest } from './index';

const ctx = { slabs: [{ fromMonths: 12, toMonths: 23 }, { fromMonths: 24, toMonths: 60 }], minAmount: 1_000_000, today: '2026-10-24' };
const base = { principal: 10_000_000, tenureMonths: 24, payoutFrequency: 'ON_MATURITY' as const, holding: 'SINGLE' as const, nominee: { name: 'Ravi', relation: 'Spouse' } };
const holder = { name: 'Sita', fatherOrHusbandName: 'Ram', occupation: 'Teacher', address: 'Hyderabad', phone: '9876543210' };

describe('validateFdRequest', () => {
  it('accepts a complete single deposit', () => expect(validateFdRequest(base, ctx)).toEqual({}));
  it('checks amount, period, payout and nominee', () => {
    const e = validateFdRequest({ ...base, principal: 500_000, tenureMonths: 6, payoutFrequency: 'WEEKLY' as never, nominee: { name: '', relation: '' } }, ctx);
    expect(Object.keys(e).sort()).toEqual(['nominee.name', 'nominee.relation', 'payoutFrequency', 'principal', 'tenureMonths']);
    expect(e.principal).toMatch(/10,000/);
  });
  it('joint: one or two holders with particulars', () => {
    expect(validateFdRequest({ ...base, holding: 'JOINT', holders: [holder] }, ctx)).toEqual({});
    expect(validateFdRequest({ ...base, holding: 'JOINT', holders: [] }, ctx).holders).toBeTruthy();
    expect(validateFdRequest({ ...base, holding: 'JOINT' }, ctx).holders).toBeTruthy();
    expect(Object.keys(validateFdRequest({ ...base, holding: 'JOINT', holders: [{ name: '', fatherOrHusbandName: '', occupation: '', address: '', phone: '123' }] }, ctx)).sort()).toEqual(['holders.0.address', 'holders.0.fatherOrHusbandName', 'holders.0.name', 'holders.0.phone']);
  });
  it('minor: under 18 with a guardian relation', () => {
    expect(validateFdRequest({ ...base, holding: 'MINOR', minor: { name: 'Chinnu', dob: '2015-03-01', guardianRelation: 'Father' } }, ctx)).toEqual({});
    expect(validateFdRequest({ ...base, holding: 'MINOR', minor: { name: 'Big', dob: '2000-01-01', guardianRelation: 'Father' } }, ctx)['minor.dob']).toMatch(/Already 18/);
    expect(Object.keys(validateFdRequest({ ...base, holding: 'MINOR', minor: { name: '', dob: '2030-01-01', guardianRelation: '' } }, ctx)).sort()).toEqual(['minor.dob', 'minor.guardianRelation', 'minor.name']);
    expect(Object.keys(validateFdRequest({ ...base, holding: 'MINOR' }, ctx)).sort()).toEqual(['minor.dob', 'minor.guardianRelation', 'minor.name']);
  });
});

describe('payouts and majority', () => {
  it('quarterly interest four times a year; none on maturity', () => {
    const rows = fdPayoutSchedule({ principal: 10_000_000, ratePercent: 7.2, tenureMonths: 12, payout: 'QUARTERLY', openedOn: '2026-01-15' });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ date: '2026-04-15', amount: 180_000 });
    expect(fdPayoutSchedule({ principal: 1, ratePercent: 7, tenureMonths: 12, payout: 'ON_MATURITY', openedOn: '2026-01-15' })).toEqual([]);
  });
  it('a minor comes of age on the 18th birthday', () => expect(minorMajorityDate('2015-03-01')).toBe('2033-03-01'));
});

describe('denominationsFor (BR-029 prefill)', () => {
  it('splits into the fewest notes and matches validateDenominations', async () => {
    const { denominationsFor, validateDenominations } = await import('./index');
    expect(denominationsFor(12_34_000)).toEqual({ 500: 24, 200: 1, 100: 1, 20: 2 });
    expect(validateDenominations(denominationsFor(5_00_000), 5_00_000).pass).toBe(true);
    expect(denominationsFor(500)).toEqual({});
  });
});
