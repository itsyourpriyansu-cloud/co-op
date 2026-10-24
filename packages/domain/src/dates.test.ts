import { describe, expect, it } from 'vitest';
import {
  addMonths,
  formatCycle,
  formatDisplayDate,
  formatDuration,
  fullMonthsBetween,
  parseISODate,
} from './dates';

describe('formatting', () => {
  it('formats display dates as DD MMM YYYY', () => {
    expect(formatDisplayDate('2026-07-05')).toBe('05 Jul 2026');
  });
  it('formats cycles as MMM YYYY', () => {
    expect(formatCycle('2026-10')).toBe('Oct 2026');
  });
  it('formats durations in years and months', () => {
    expect(formatDuration(40)).toBe('3 yrs 4 mths');
    expect(formatDuration(12)).toBe('1 yr');
    expect(formatDuration(1)).toBe('1 mth');
    expect(formatDuration(0)).toBe('0 mths');
  });
});

describe('parseISODate', () => {
  it('rejects impossible dates', () => {
    expect(() => parseISODate('2026-02-30')).toThrow(RangeError);
    expect(() => parseISODate('05-07-2026')).toThrow(RangeError);
  });
});

describe('addMonths', () => {
  it('clamps to month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });
  it('crosses years in both directions', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-02-15', -3)).toBe('2025-11-15');
  });
});

describe('fullMonthsBetween', () => {
  it('counts only completed months', () => {
    expect(fullMonthsBetween('2026-10-24', '2027-10-24')).toBe(12);
    expect(fullMonthsBetween('2026-10-24', '2027-10-23')).toBe(11);
    expect(fullMonthsBetween('2026-10-24', '2026-10-30')).toBe(0);
  });
  it('is negative when the end is earlier', () => {
    expect(fullMonthsBetween('2027-10-24', '2026-10-24')).toBe(-12);
  });
});
