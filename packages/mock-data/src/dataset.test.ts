// Seed integrity (docs/13 §4) + scenario coverage (docs/20).
import { beforeAll, describe, expect, it } from 'vitest';
import { calculateLeftoverService, fullMonthsBetween } from '@tgs/domain';
import { DEPOSIT_STATUSES, LOAN_STATUSES, MEMBERSHIP_STATUSES } from '@tgs/types';
import { createSeed, type Dataset } from './index';

let d: Dataset;
beforeAll(() => {
  d = createSeed();
});

describe('volumes (docs/13 §1)', () => {
  it('has 600 members plus 5 who joined this month', () => {
    expect(d.members).toHaveLength(605);
    expect(new Set(d.members.map((m) => m.generalNo)).size).toBe(605);
  });
  it('has 15 departments, 6 staff, 12 demand cycles', () => {
    expect(d.departments).toHaveLength(15);
    expect(d.staffUsers).toHaveLength(6);
    expect(d.demandCycles).toHaveLength(12);
  });
  it('is deterministic', () => {
    expect(JSON.stringify(createSeed())).toBe(JSON.stringify(d));
  });
});

describe('every state exists (docs/20)', () => {
  it.each(LOAN_STATUSES)('loan status %s', (s) => {
    expect(d.loans.some((l) => l.status === s)).toBe(true);
  });
  it.each(MEMBERSHIP_STATUSES.filter((s) => s !== 'DRAFT' && s !== 'WITHDRAWN'))('membership status %s', (s) => {
    expect(d.membershipApplications.some((a) => a.status === s)).toBe(true);
  });
  it.each(DEPOSIT_STATUSES.filter((s) => s !== 'CLOSED' && s !== 'REFUND_PENDING'))('FD status %s', (s) => {
    expect(d.deposits.some((x) => x.scheme === 'FD' && x.status === s)).toBe(true);
  });
  it('every in-process loan status has at least 2 records', () => {
    for (const s of ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED'] as const)
      expect(d.loans.filter((l) => l.status === s).length).toBeGreaterThanOrEqual(2);
  });
  it('every scenario points at a real record and persona', () => {
    const ids = new Set([...d.loans, ...d.deposits, ...d.members, ...d.demandSheets, ...d.membershipApplications, ...d.paymentReports, ...d.profileChangeRequests].map((x) => x.id));
    const personaIds = new Set([...d.personas.map((p) => p.id), ...d.members.map((m) => m.id)]);
    for (const s of d.scenarios) {
      if (s.entityId) expect(ids.has(s.entityId), s.id).toBe(true);
      expect(personaIds.has(s.personaId), s.id).toBe(true);
    }
    expect(new Set(d.scenarios.map((s) => s.id)).size).toBe(d.scenarios.length);
  });
});

describe('personas tell their stories (docs/13 §2)', () => {
  it('Lakshmi: ₹10,000 ordinary loan and ₹1,000 share deposit (agreement example)', () => {
    const loan = d.loans.find((l) => l.memberId === 'mem-1101' && l.status === 'ACTIVE');
    expect(loan?.sanctionedAmount).toBe(1_000_000);
    expect(d.shareAccounts.find((s) => s.memberId === 'mem-1101')?.shareDepositBalance).toBe(100_000);
  });
  it('Ramaiah: 14 months of service left', () => {
    const m = d.members.find((x) => x.id === 'mem-1102');
    expect(m && calculateLeftoverService(m.dor, d.today).months).toBe(14);
  });
  it('Sravani: pending surety request', () => {
    expect(d.loans.some((l) => l.sureties.some((s) => s.memberId === 'mem-1103' && s.status === 'PENDING'))).toBe(true);
  });
  it('Mahesh: short recovery in September 2026', () => {
    const line = d.demandSheets.filter((s) => s.cycle === '2026-09').flatMap((s) => s.lines).find((l) => l.memberId === 'mem-1104');
    expect(line && (line.recovered ?? 0) < line.totalDemand).toBe(true);
  });
  it('Finance DDO has applications to certify', () => {
    const fin = new Set(d.members.filter((m) => m.departmentId === 'dept-fin').map((m) => m.id));
    expect(d.loans.filter((l) => l.status === 'DDO_CERTIFICATION' && fin.has(l.memberId)).length).toBeGreaterThanOrEqual(2);
    expect(d.membershipApplications.some((a) => a.applicantId === 'apl-ravi' && a.departmentId === 'dept-fin')).toBe(true);
  });
});

describe('money reconciles (docs/13 §4)', () => {
  it('each receipt equals the sum of its allocations', () => {
    for (const r of d.receipts) expect(r.allocations.reduce((s, a) => s + a.amount, 0)).toBe(r.amount);
  });
  it('allocation never exceeds a component, and recovered = Σ allocated', () => {
    for (const sheet of d.demandSheets)
      for (const line of sheet.lines) {
        for (const c of line.components) expect(c.allocated).toBeLessThanOrEqual(c.amount);
        if (line.recovered !== undefined) expect(line.components.reduce((s, c) => s + c.allocated, 0)).toBe(line.recovered);
      }
  });
  it('schedules repay exactly the sanctioned amount', () => {
    for (const l of d.loans.filter((x) => x.schedule.length))
      expect(l.schedule.reduce((s, r) => s + r.principal, 0)).toBe(l.sanctionedAmount);
  });
  it('active loans owe between 0 and the sanctioned amount', () => {
    for (const l of d.loans.filter((x) => x.status === 'ACTIVE')) {
      expect(l.outstandingPrincipal).toBeGreaterThanOrEqual(0);
      expect(l.outstandingPrincipal).toBeLessThanOrEqual(l.sanctionedAmount ?? 0);
    }
  });
  it('no new loan (applied in the last year) runs past the borrower’s retirement (BR-002)', () => {
    for (const l of d.loans.filter((x) => x.schedule.length && x.appliedOn >= '2025-10-24')) {
      const m = d.members.find((x) => x.id === l.memberId);
      const last = l.schedule.at(-1)?.dueCycle ?? '';
      expect(m && fullMonthsBetween(`${last}-01`, m.dor) >= 0, l.id).toBe(true);
    }
  });
  it('no member is a surety on their own loan', () => {
    for (const l of d.loans) expect(l.sureties.some((s) => s.memberId === l.memberId)).toBe(false);
  });
  it('the current cycle is generated but not recovered', () => {
    const current = d.demandSheets.filter((s) => s.cycle === d.currentCycle);
    expect(current.length).toBe(12);
    expect(current.every((s) => s.totalRecovered === 0)).toBe(true);
  });
});
