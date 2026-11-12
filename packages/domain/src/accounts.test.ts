import { describe, expect, it } from 'vitest';
import { annualDepositInterest, dividendOn, financialYearOf, financialYearRange, monthEnds, yearCloseLines } from './accounts';
import { checkJournal } from './ledger';

describe('year-end accounting (G2)', () => {
  it('names and bounds financial years', () => {
    expect(financialYearOf('2026-10-24')).toBe('2026-27');
    expect(financialYearOf('2027-03-31')).toBe('2026-27');
    expect(financialYearOf('2027-04-01')).toBe('2027-28');
    expect(financialYearOf('2026-06-01', 1)).toBe('2026');
    expect(financialYearRange('2026-27')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(financialYearRange('2026', 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(monthEnds('2026-27')).toEqual(['2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('works out annual interest on either basis, and the dividend', () => {
    const bal = [0, 0, 0, 0, 0, 0, 12_000_00, 12_000_00, 12_000_00, 12_000_00, 12_000_00, 12_000_00];
    expect(annualDepositInterest(bal, 6, 'YEAR_END')).toBe(720_00);
    expect(annualDepositInterest(bal, 6, 'AVERAGE_MONTH_END')).toBe(360_00);
    expect(annualDepositInterest(bal, 0, 'YEAR_END')).toBe(0);
    expect(annualDepositInterest([-5], 6, 'YEAR_END')).toBe(0);
    expect(dividendOn(5_000_00, 8.5)).toBe(425_00);
    expect(dividendOn(0, 8)).toBe(0);
  });

  it('closes income and expense into the surplus with a balanced entry', () => {
    const r = yearCloseLines(
      [
        { code: '1200', type: 'ASSET', debit: 100, credit: 0 },
        { code: '4100', type: 'INCOME', debit: 0, credit: 1_000 },
        { code: '4200', type: 'INCOME', debit: 50, credit: 50 },
        { code: '5100', type: 'EXPENSE', debit: 300, credit: 0 },
      ],
      '3300',
    );
    expect(r).toMatchObject({ income: 1_000, expense: 300, surplus: 700 });
    expect(r.lines).toEqual([
      { accountCode: '4100', debit: 1_000, credit: 0 },
      { accountCode: '5100', debit: 0, credit: 300 },
      { accountCode: '3300', debit: 0, credit: 700 },
    ]);
    expect(checkJournal(r.lines).ok).toBe(true);
    const loss = yearCloseLines([{ code: '5100', type: 'EXPENSE', debit: 400, credit: 0 }, { code: '4100', type: 'INCOME', debit: 0, credit: 100 }], '3300');
    expect(loss.surplus).toBe(-300);
    expect(checkJournal(loss.lines).ok).toBe(true);
  });
});
