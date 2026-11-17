import { describe, expect, it } from 'vitest';
import { buildSanctionSheet, earlyInterestFor, firstDeductionOptions, generateSchedule, isCycleOpenForNewDues } from './index';

const none = () => undefined;

describe('first deduction month (D-124)', () => {
  it('a cycle with no sheet is open until its cut-off (send-by date), a GENERATED one stays open, later ones close', () => {
    // 4 days before 1 Dec = 27 Nov.
    expect(isCycleOpenForNewDues('2026-12', '2026-11-27', 4, undefined)).toBe(true);
    expect(isCycleOpenForNewDues('2026-12', '2026-11-28', 4, undefined)).toBe(false);
    expect(isCycleOpenForNewDues('2026-12', '2026-11-28', 4, 'GENERATED')).toBe(true);
    for (const s of ['CERTIFIED', 'SENT_TO_DDO', 'RECOVERY_POSTED'] as const) expect(isCycleOpenForNewDues('2026-12', '2026-11-20', 4, s)).toBe(false);
  });

  it('offers the next two open months: both before the cut-off, only the later two after it', () => {
    expect(firstDeductionOptions({ today: '2026-11-20', sendByDays: 4, sheetStatus: none })).toEqual(['2026-12', '2027-01']);
    // 28 Nov: December's cut-off (27 Nov) has passed, so the loan cannot be missed from December's sheet.
    expect(firstDeductionOptions({ today: '2026-11-28', sendByDays: 4, sheetStatus: none })).toEqual(['2027-01', '2027-02']);
    // 10 Dec with December already sent: January and February (today's behaviour is January).
    expect(firstDeductionOptions({ today: '2026-12-10', sendByDays: 4, sheetStatus: (c) => (c === '2026-12' ? 'SENT_TO_DDO' : undefined) })).toEqual(['2027-01', '2027-02']);
    // a sent sheet closes a month even before its cut-off
    expect(firstDeductionOptions({ today: '2026-11-10', sendByDays: 4, sheetStatus: (c) => (c === '2026-12' ? 'CERTIFIED' : undefined) })).toEqual(['2027-01', '2027-02']);
  });

  it('early interest is by actual days ÷ 365 up to the 1st of the first deduction month', () => {
    // ₹1,00,000 at 11%: 3 days (28 → 1 Dec) = ₹90; 34 days (28 Nov → 1 Jan) = ₹1,025.
    expect(earlyInterestFor(10_000_000, 11, '2026-11-28', '2026-12')).toBe(9_000);
    expect(earlyInterestFor(10_000_000, 11, '2026-11-28', '2027-01')).toBe(102_500);
    expect(earlyInterestFor(10_000_000, 11, '2026-12-05', '2026-12')).toBe(0);
  });

  it('is added to instalment 1 only; the principal and later rows are unchanged', () => {
    const plain = generateSchedule(10_000_000, 11, 24, 'EQUAL_PRINCIPAL', '2026-12');
    const early = generateSchedule(10_000_000, 11, 24, 'EQUAL_PRINCIPAL', '2026-12', 9_000);
    expect(early[0]).toMatchObject({ interest: plain[0]!.interest + 9_000, emi: plain[0]!.emi + 9_000, earlyInterest: 9_000, principal: plain[0]!.principal, closing: plain[0]!.closing });
    expect(early.slice(1)).toEqual(plain.slice(1));
    expect(generateSchedule(10_000_000, 11, 24, 'AMORTIZED', '2026-12', 9_000)[0]!.principal).toBe(generateSchedule(10_000_000, 11, 24, 'AMORTIZED', '2026-12')[0]!.principal);
  });

  it('the sanction sheet carries it only when the setting is on', () => {
    const product = { ratePercent: 11, emiMethod: 'EQUAL_PRINCIPAL' as const, shareDepositPercent: 10 };
    const base = { amount: 10_000_000, instalments: 24, product, firstDueCycle: '2026-12', existingShareDeposit: 0, today: '2026-11-28', balances: { ordinary: 0, salary: 0 } };
    const on = buildSanctionSheet({ ...base, earlyInterestEnabled: true });
    const off = buildSanctionSheet(base);
    expect(on).toMatchObject({ earlyInterest: 9_000, earlyInterestFrom: '2026-11-28' });
    expect(off.earlyInterest).toBeUndefined();
    expect(on.emi).toBe(off.emi);
    expect(on.netDisbursable).toBe(off.netDisbursable);
    expect(on.totalInterest).toBe(off.totalInterest + 9_000);
  });

  it('a top-up: the old loan is settled as before; the early interest is on the new loan only and is not taken from the payout', () => {
    const product = { ratePercent: 11, emiMethod: 'EQUAL_PRINCIPAL' as const, shareDepositPercent: 10 };
    const base = {
      amount: 15_000_000, instalments: 24, product, firstDueCycle: '2026-12', existingShareDeposit: 1_000_000, today: '2026-11-28', balances: { ordinary: 0, salary: 0 },
      topup: { loanId: 'l1', loanNo: 'LN-1', outstandingPrincipal: 6_000_000, ratePercent: 11, lastInterestChargedOn: '2026-10-31' },
    };
    const on = buildSanctionSheet({ ...base, earlyInterestEnabled: true });
    const off = buildSanctionSheet(base);
    expect(on.topup).toEqual(off.topup);
    expect(on.netDisbursable).toBe(off.netDisbursable);
    expect(on.shareDeduction).toBe(off.shareDeduction);
    // ₹1,50,000 × 11% × 3 days ÷ 365 = ₹135.6, rounded to ₹136, on the NEW amount, from the payment date.
    expect(on.earlyInterest).toBe(13_600);
  });
});
