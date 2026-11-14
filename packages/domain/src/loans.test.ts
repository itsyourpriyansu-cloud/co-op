import { describe, expect, it } from 'vitest';
import { instalmentChoices } from './loans';

describe('instalmentChoices (D-123)', () => {
  it('marks periods the remaining service cannot cover, keeping them visible and sorted', () => {
    const c = instalmentChoices([36, 12, 24], 30);
    expect(c.map((x) => x.months)).toEqual([12, 24, 36]);
    expect(c.map((x) => x.allowed)).toEqual([true, true, false]);
    expect(c[2]?.reason).toContain('30 months');
    // BR-002: the service must EXCEED the tenure, so equal is not allowed either.
    expect(instalmentChoices([30], 30)[0]?.allowed).toBe(false);
  });
});