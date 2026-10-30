import { describe, expect, it } from 'vitest';
import { checkJournal, normalSide, reverseLines, signedBalance } from './ledger';

describe('ledger rules (REQ-131)', () => {
  it('knows each account type’s normal side', () => {
    expect(normalSide('ASSET')).toBe('DEBIT');
    expect(normalSide('EXPENSE')).toBe('DEBIT');
    expect(normalSide('LIABILITY')).toBe('CREDIT');
    expect(normalSide('EQUITY')).toBe('CREDIT');
    expect(normalSide('INCOME')).toBe('CREDIT');
    expect(signedBalance('ASSET', 500, 200)).toBe(300);
    expect(signedBalance('LIABILITY', 500, 200)).toBe(-300);
  });

  it('accepts a balanced entry', () => {
    const r = checkJournal([
      { accountCode: '1300', debit: 2000000, credit: 0, memberId: 'mem-1' },
      { accountCode: '1200', debit: 0, credit: 1800000 },
      { accountCode: '2100', debit: 0, credit: 200000, memberId: 'mem-1' },
    ]);
    expect(r).toEqual({ ok: true, totalDebit: 2000000, totalCredit: 2000000, errors: {} });
  });

  it('refuses unbalanced, one-line, two-sided, negative and fractional entries', () => {
    expect(checkJournal([{ accountCode: '1100', debit: 100, credit: 0 }]).errors.lines).toMatch(/two lines/);
    expect(checkJournal([{ accountCode: '1100', debit: 100, credit: 0 }, { accountCode: '4100', debit: 0, credit: 90 }]).errors.lines).toMatch(/must be equal/);
    const bad = checkJournal([
      { accountCode: '1100', debit: 100, credit: 100 },
      { accountCode: '4100', debit: -5, credit: 0 },
      { accountCode: '4100', debit: 0.5, credit: 0 },
      { accountCode: '', debit: 0, credit: 10 },
      { accountCode: '4100', debit: 0, credit: 0 },
    ]);
    expect(bad.ok).toBe(false);
    expect(Object.keys(bad.errors)).toEqual(expect.arrayContaining(['lines.0', 'lines.1', 'lines.2', 'lines.3', 'lines.4']));
  });

  it('reverses an entry by swapping sides', () => {
    const lines = [
      { accountCode: '1100', debit: 100, credit: 0, memberId: 'm' },
      { accountCode: '4100', debit: 0, credit: 100 },
    ];
    const rev = reverseLines(lines);
    expect(rev).toEqual([
      { accountCode: '1100', debit: 0, credit: 100, memberId: 'm' },
      { accountCode: '4100', debit: 100, credit: 0 },
    ]);
    expect(checkJournal(rev).ok).toBe(true);
  });
});

describe('ledger rules: odd input', () => {
  it('treats a missing amount as nothing when totalling', () => {
    const r = checkJournal([
      { accountCode: '1100', debit: Number.NaN, credit: 0 },
      { accountCode: '4100', debit: 0, credit: Number.NaN },
    ]);
    expect(r.totalDebit).toBe(0);
    expect(r.totalCredit).toBe(0);
    expect(r.ok).toBe(false);
  });
});
