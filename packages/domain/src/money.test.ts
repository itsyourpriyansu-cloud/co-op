import { describe, expect, it } from 'vitest';
import {
  amountInWords,
  formatINR,
  formatINRCompact,
  groupIndian,
  numberToIndianWords,
  toPaise,
} from './money';

describe('groupIndian', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['100000', '1,00,000'],
    ['12345678', '1,23,45,678'],
  ])('%s → %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });
});

describe('formatINR', () => {
  it('formats summaries without decimals', () => {
    expect(formatINR(toPaise(125000))).toBe('₹1,25,000');
  });
  it('formats ledgers with 2 decimals', () => {
    expect(formatINR(12_500_050, { decimals: 2 })).toBe('₹1,25,000.50');
  });
  it('rounds half up when hiding paise', () => {
    expect(formatINR(150)).toBe('₹2');
    expect(formatINR(149)).toBe('₹1');
  });
  it('handles negatives', () => {
    expect(formatINR(-toPaise(1000))).toBe('-₹1,000');
  });
});

describe('formatINRCompact', () => {
  it('uses crore and lakh abbreviations', () => {
    expect(formatINRCompact(toPaise(45_200_000))).toBe('₹4.52 Cr');
    expect(formatINRCompact(toPaise(1_860_000))).toBe('₹18.6 L');
    expect(formatINRCompact(toPaise(1_00_000))).toBe('₹1 L');
    expect(formatINRCompact(toPaise(48_200))).toBe('₹48,200');
  });
});

describe('amountInWords', () => {
  it('uses the Indian numbering system', () => {
    expect(numberToIndianWords(125000)).toBe('One Lakh Twenty Five Thousand');
    expect(numberToIndianWords(10_00_00_000)).toBe('Ten Crore');
    expect(numberToIndianWords(20000)).toBe('Twenty Thousand');
    expect(numberToIndianWords(101)).toBe('One Hundred One');
  });
  it('writes rupees and paise like the paper forms', () => {
    expect(amountInWords(toPaise(20000))).toBe('Rupees Twenty Thousand Only');
    expect(amountInWords(12_500_050)).toBe(
      'Rupees One Lakh Twenty Five Thousand and Fifty Paise Only',
    );
  });
});
