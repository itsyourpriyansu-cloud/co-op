// M5: sanction sheet, top-up settlement (BR-007 + BR-004), surety progress, assessment limits.
import { describe, expect, it } from 'vitest';
import { buildSanctionSheet, checkTopupEligibility, lastInterestChargedOn, suretyProgress, validateSanctionAdjustment } from './index';

const ordinary = { code: 'ORDINARY' as const, name: 'Ordinary Loan', topupAllowed: true, ratePercent: 11, emiMethod: 'EQUAL_PRINCIPAL' as const, shareDepositPercent: 10 };

describe('lastInterestChargedOn', () => {
  it('uses the end of the last paid month, else the disbursement date, else today', () => {
    expect(lastInterestChargedOn({ disbursedOn: '2025-06-12', schedule: [{ dueCycle: '2026-02', paidStatus: 'PAID' }, { dueCycle: '2026-03', paidStatus: 'PARTIAL' }] }, '2026-10-24')).toBe('2026-02-28');
    expect(lastInterestChargedOn({ disbursedOn: '2025-06-12', schedule: [{ dueCycle: '2025-07', paidStatus: 'UNPAID' }] }, '2026-10-24')).toBe('2025-06-12');
    expect(lastInterestChargedOn({ schedule: [] }, '2026-10-24')).toBe('2026-10-24');
  });
});

describe('checkTopupEligibility (Q-110, D-059)', () => {
  const parent = { memberId: 'm1', status: 'ACTIVE' as const, product: 'ORDINARY' };
  it('passes for own running Ordinary loan, fails otherwise', () => {
    expect(checkTopupEligibility(parent, ordinary, 'm1').pass).toBe(true);
    expect(checkTopupEligibility(parent, ordinary, 'm2').message).toMatch(/own/);
    expect(checkTopupEligibility({ ...parent, status: 'CLOSED' }, ordinary, 'm1').message).toMatch(/running/);
    expect(checkTopupEligibility({ ...parent, product: 'SALARY' }, ordinary, 'm1').message).toMatch(/must be/);
    expect(checkTopupEligibility(parent, { ...ordinary, topupAllowed: false }, 'm1').message).toMatch(/cannot/);
  });
});

describe('buildSanctionSheet (ST-26)', () => {
  const base = { amount: 20_000_000, instalments: 60, product: ordinary, firstDueCycle: '2026-11', existingShareDeposit: 500_000, today: '2026-10-24', balances: { ordinary: 0, salary: 0 } };
  it('fresh loan: share netting then net disbursable', () => {
    const s = buildSanctionSheet(base);
    expect(s.shareDeduction).toBe(1_500_000); // 10% of 2,00,000 = 20,000 − 5,000 already held
    expect(s.netDisbursable).toBe(18_500_000);
    expect(s.emi).toBeGreaterThan(s.lastEmi);
    expect(s.topup).toBeUndefined();
  });
  it('top-up: settles the old loan with interest to date', () => {
    const s = buildSanctionSheet({ ...base, topup: { loanId: 'l1', loanNo: 'LN-1', outstandingPrincipal: 5_000_000, ratePercent: 11, lastInterestChargedOn: '2026-09-30' } });
    expect(s.topup?.accruedInterest).toBeGreaterThan(0);
    expect(s.topup?.settlement).toBe(5_000_000 + (s.topup?.accruedInterest ?? 0));
    expect(s.netDisbursable).toBe(20_000_000 - (s.topup?.settlement ?? 0) - s.shareDeduction);
  });
});

describe('validateSanctionAdjustment and suretyProgress', () => {
  it('only reduces, within the tenure limit', () => {
    const applied = { amount: 10_000_000, instalments: 48 };
    expect(validateSanctionAdjustment(8_000_000, 36, applied, 40)).toEqual({});
    expect(validateSanctionAdjustment(0, 0, applied, 40)).toEqual({ amount: expect.any(String), instalments: expect.any(String) });
    expect(validateSanctionAdjustment(12_000_000, 60, applied, 40)).toEqual({ amount: expect.stringMatching(/more than/), instalments: expect.stringMatching(/more than/) });
    expect(validateSanctionAdjustment(1, 45, applied, 40).instalments).toMatch(/At most 40/);
  });
  it('counts current sureties only', () => {
    expect(suretyProgress([{ status: 'ACCEPTED' }, { status: 'ACCEPTED' }], 2).allAccepted).toBe(true);
    expect(suretyProgress([{ status: 'ACCEPTED' }, { status: 'PENDING' }], 2)).toMatchObject({ accepted: 1, pending: 1, allAccepted: false });
    expect(suretyProgress([{ status: 'REPLACED' }, { status: 'ACCEPTED' }, { status: 'ACCEPTED' }], 2).allAccepted).toBe(true);
    expect(suretyProgress([{ status: 'DECLINED' }, { status: 'ACCEPTED' }], 2)).toMatchObject({ declined: 1, allAccepted: false });
  });
});
