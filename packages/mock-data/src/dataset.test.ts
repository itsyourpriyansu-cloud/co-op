// Seed integrity (docs/13 §4) + scenario coverage (docs/20).
import { beforeAll, describe, expect, it } from 'vitest';
import { calculateFdMaturity, calculateLeftoverService, fullMonthsBetween } from '@tgs/domain';
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

describe('referential integrity and M1 rules (docs/13 §4)', () => {
  it('every record points at a real member / department / loan', () => {
    const members = new Set(d.members.map((m) => m.id));
    const depts = new Set(d.departments.map((x) => x.id));
    const loans = new Set(d.loans.map((l) => l.id));
    for (const m of d.members) expect(depts.has(m.departmentId), m.id).toBe(true);
    for (const l of d.loans) {
      expect(members.has(l.memberId), l.id).toBe(true);
      for (const s of l.sureties) expect(members.has(s.memberId), l.id).toBe(true);
      if (l.parentLoanId) expect(loans.has(l.parentLoanId), l.id).toBe(true);
    }
    for (const x of [...d.deposits, ...d.receipts, ...d.paymentReports, ...d.profileChangeRequests, ...d.supportTickets]) expect(members.has(x.memberId), x.id).toBe(true);
    for (const sh of d.demandSheets) {
      expect(depts.has(sh.departmentId), sh.id).toBe(true);
      for (const line of sh.lines) expect(members.has(line.memberId), sh.id).toBe(true);
    }
  });
  it('demand sheet totals equal the sum of their lines', () => {
    for (const sh of d.demandSheets) {
      expect(sh.totalDemand, sh.id).toBe(sh.lines.reduce((a, l) => a + l.totalDemand, 0));
      expect(sh.totalRecovered, sh.id).toBe(sh.lines.reduce((a, l) => a + (l.recovered ?? 0), 0));
    }
  });
  it('active and closed loans carry a loan number, schedule and EMI', () => {
    for (const l of d.loans.filter((x) => ['ACTIVE', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(x.status))) {
      expect(l.loanNo, l.id).toBeTruthy();
      expect(l.schedule.length, l.id).toBeGreaterThan(0);
      expect(l.emi, l.id).toBeGreaterThan(0);
    }
  });
  it('FD maturity values come from calculateFdMaturity (BR-017)', () => {
    for (const fd of d.deposits.filter((x) => x.scheme === 'FD' && x.fdrNo)) {
      const m = calculateFdMaturity({ principal: fd.principal ?? 0, ratePercent: fd.ratePercent, tenureMonths: fd.tenureMonths ?? 0, payout: fd.payoutFrequency ?? 'ON_MATURITY', openedOn: fd.openedOn });
      expect(fd.maturityValue, fd.id).toBe(m.maturityValue);
      expect(fd.maturityDate, fd.id).toBe(m.maturityDate);
    }
  });
  it('no surety guarantees more open loans than allowed (BR-014)', () => {
    const open = d.loans.filter((l) => ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED', 'ACTIVE'].includes(l.status));
    const count = new Map<string, number>();
    for (const l of open) for (const s of l.sureties) if (s.status !== 'DECLINED') count.set(s.memberId, (count.get(s.memberId) ?? 0) + 1);
    const over = [...count.entries()].filter(([, n]) => n > d.settings.maxGuaranteesPerSurety);
    expect(over).toEqual([]);
  });
  it('every placeholder setting key exists', () => {
    for (const k of d.settings.placeholders) expect(k.split('.')[0]! in d.settings || k === 'loanProducts', k).toBe(true);
  });
});

describe('members module seed (ST-12, ST-18, BR-010, BR-028)', () => {
  it('every member has a JOINED event and exactly one current mandate for their department', () => {
    for (const m of d.members) {
      expect(d.serviceEvents.some((e) => e.memberId === m.id && e.type === 'JOINED'), m.id).toBe(true);
      const current = d.mandates.filter((x) => x.memberId === m.id && x.status !== 'SUPERSEDED');
      expect(current, m.id).toHaveLength(1);
      expect(current[0]?.departmentId, m.id).toBe(m.departmentId);
    }
  });
  it('transfers have ids and a TRANSFERRED event; next-cycle ones wait for the new DDO', () => {
    for (const t of d.transfers) {
      expect(t.id).toMatch(/^trf-/);
      expect(d.serviceEvents.some((e) => e.memberId === t.memberId && e.type === 'TRANSFERRED' && e.effectiveCycle === t.effectiveCycle)).toBe(true);
    }
    expect(d.mandates.filter((x) => x.status === 'PENDING_NEW_DDO')).toHaveLength(d.transfers.filter((t) => t.effectiveCycle > d.currentCycle).length);
  });
  it('change requests: pending old values match the member, DDO route uses employment / pay fields', () => {
    const byId = new Map(d.members.map((m) => [m.id, m]));
    expect(d.profileChangeRequests.filter((r) => r.status === 'PENDING').length).toBeGreaterThanOrEqual(3);
    expect(d.profileChangeRequests.some((r) => r.status === 'PENDING' && r.route === 'DDO_THEN_OFFICE' && !r.ddoCertified && byId.get(r.memberId)?.departmentId === 'dept-fin')).toBe(true);
    for (const r of d.profileChangeRequests.filter((x) => x.status === 'PENDING')) {
      const m = byId.get(r.memberId)!;
      for (const f of r.fields) if (f.field === 'designation') expect(f.oldValue, r.id).toBe(m.designation);
    }
  });
});
