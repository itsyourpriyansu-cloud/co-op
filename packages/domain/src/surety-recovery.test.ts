import { describe, expect, it } from 'vitest';
import { allocateRecovery, splitEqually, suretyRecoveryDue } from './collections';
import { buildDemandComponents } from './demand';

// F-13 (D-097): recovering an overdue loan from its sureties.
describe('surety recovery (F-13)', () => {
  it('splits equally, the leftover paise to the first shares', () => {
    expect(splitEqually(1000, 2)).toEqual([500, 500]);
    expect(splitEqually(1001, 3)).toEqual([334, 334, 333]);
    expect(splitEqually(500, 0)).toEqual([]);
  });

  it('a surety never owes more than their share, nor more than the borrower still owes', () => {
    expect(suretyRecoveryDue({ share: 5000, paid: 1000, loanOverdue: 9000 })).toBe(4000);
    expect(suretyRecoveryDue({ share: 5000, paid: 0, loanOverdue: 1200 })).toBe(1200);
    expect(suretyRecoveryDue({ share: 5000, paid: 5000, loanOverdue: 9000 })).toBe(0);
  });

  it("goes on the surety's demand after their own heads, and is paid last", () => {
    const { components, totalDemand } = buildDemandComponents({ cycle: '2026-11', settings: { rrfMonthly: 100, crdMonthly: 0, srdsMonthly: 0, insurance: { loaneeAmount: 0, nonLoaneeAmount: 0, collectionMonth: 4 } }, hasCrd: false, srdsActive: false, loanRows: [{ loanId: 'own', product: 'ORDINARY', interest: 50, principal: 200 }], suretyRows: [{ loanId: 'other', amount: 300 }, { loanId: 'none', amount: 0 }] });
    expect(components.at(-1)).toEqual({ head: 'SURETY', loanId: 'other', amount: 300, allocated: 0 });
    expect(totalDemand).toBe(650);
    const r = allocateRecovery(components, 400);
    expect(r.components.find((c) => c.head === 'SURETY')!.allocated).toBe(50);
  });
});
