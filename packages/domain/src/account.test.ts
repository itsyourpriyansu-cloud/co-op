// D-062 password rule.
import { describe, expect, it } from 'vitest';
import { checkPassword } from './index';

describe('checkPassword (D-062)', () => {
  it('too short, no number, own General No. all fail', () => {
    expect(checkPassword('ab1').checks[0]?.pass).toBe(false);
    expect(checkPassword('abcdefgh').checks[1]?.pass).toBe(false);
    const own = checkPassword('lakshmi1101', { generalNo: '1101', employeeId: 'TS1', mobile: '9000100101' });
    expect(own.ok).toBe(false);
    expect(own.checks[2]?.pass).toBe(false);
    expect(own.score).toBeLessThanOrEqual(1);
  });
  it('scores a good password', () => {
    expect(checkPassword('garden42').score).toBe(2);
    expect(checkPassword('Garden42').score).toBe(3);
    const strong = checkPassword('Garden42!', { generalNo: '1101' });
    expect(strong.ok).toBe(true);
    expect(strong.score).toBe(4);
    expect(checkPassword('gardenparty42').score).toBe(3);
  });
});
