// Read models computed from the store: dashboard KPIs and dataset counts.
import { calculateLeftoverService } from '@tgs/domain';
import type { DashboardSummary, DatasetSample, DatasetSummary, LoanStatus, SessionUser } from '@tgs/types';
import type { Db } from './store';

const QUEUE_BY_ROLE: Partial<Record<SessionUser['role'], LoanStatus[]>> = {
  ACCOUNTANT: ['ACCOUNTANT_REVIEW', 'ASSESSMENT'],
  DDO: ['DDO_CERTIFICATION'],
  SECRETARY: ['SANCTION_SECRETARY'],
  PRESIDENT: ['SANCTION_PRESIDENT'],
  CASHIER: ['SANCTIONED'],
};

const PIPELINE: LoanStatus[] = ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED'];

export function dashboardSummary(db: Db, user: SessionUser): DashboardSummary {
  const memberDept = new Map(db.members.map((m) => [m.id, m.departmentId]));
  const inScope = (memberId: string) => !user.departmentId || memberDept.get(memberId) === user.departmentId;
  const loans = db.loans.filter((l) => inScope(l.memberId));
  const active = loans.filter((l) => l.status === 'ACTIVE');
  const posted = db.demandCycles.filter((c) => c < db.currentCycle);
  const lastPosted = posted.at(-1) ?? db.currentCycle;
  const prevPosted = posted.at(-2) ?? lastPosted;
  const sheetsFor = (c: string) => db.demandSheets.filter((s) => s.cycle === c && (!user.departmentId || s.departmentId === user.departmentId));
  const rate = (c: string) => {
    const s = sheetsFor(c);
    const demand = s.reduce((a, x) => a + x.totalDemand, 0);
    return demand ? s.reduce((a, x) => a + x.totalRecovered, 0) / demand : 0;
  };
  const queueStatuses = QUEUE_BY_ROLE[user.role] ?? [];
  const membershipItems = db.membershipApplications.filter((a) =>
    user.role === 'DDO' ? a.status === 'DDO_CERTIFICATION' && a.departmentId === user.departmentId
    : user.role === 'ACCOUNTANT' ? a.status === 'OFFICE_REVIEW' || a.status === 'SUBMITTED'
    : user.role === 'SECRETARY' ? a.status === 'APPROVAL_SECRETARY'
    : user.role === 'PRESIDENT' ? a.status === 'APPROVAL_PRESIDENT'
    : user.role === 'CASHIER' ? a.status === 'SHARE_PAYMENT_PENDING'
    : user.role === 'SUPER_ADMIN' ? !['ACTIVE', 'REJECTED', 'WITHDRAWN', 'DRAFT'].includes(a.status) : false,
  );
  const membershipQueue = user.role === 'SUPER_ADMIN' ? 0 : membershipItems.length;

  // "Needs your attention": oldest first. Super Admin sees everything in flight.
  const memberById = new Map(db.members.map((m) => [m.id, m]));
  const deptName = new Map(db.departments.map((d) => [d.id, d.name]));
  const PRODUCT: Record<string, string> = { ORDINARY: 'Ordinary loan', EDUCATION: 'Education loan', SALARY: 'Salary loan', DEPOSIT: 'Loan against FD' };
  const lastEventDate = (events: Array<{ at: string }>, fallback: string) => (events.at(-1)?.at ?? fallback).slice(0, 10);
  const actionLoans = loans.filter((l) => (user.role === 'SUPER_ADMIN' ? PIPELINE.includes(l.status) : queueStatuses.includes(l.status)));
  const needsAction: DashboardSummary['needsAction'] = [
    ...actionLoans.map((l) => {
      const m = memberById.get(l.memberId);
      return {
        id: l.id,
        kind: 'loan' as const,
        ref: l.applicationNo,
        title: `${PRODUCT[l.product] ?? l.product} · ${m?.name ?? ''}`,
        subtitle: `General No. ${m?.generalNo ?? '—'} · ${deptName.get(m?.departmentId ?? '') ?? ''}`,
        status: l.status,
        since: lastEventDate(l.events, l.appliedOn),
        amount: l.sanctionedAmount ?? l.appliedAmount,
      };
    }),
    ...membershipItems.map((a) => ({
      id: a.id,
      kind: 'membership' as const,
      ref: a.applicationNo,
      title: `Membership · ${a.name}`,
      subtitle: `${a.designation} · ${deptName.get(a.departmentId) ?? ''}`,
      status: a.status,
      since: lastEventDate(a.events, a.submittedOn ?? db.demo.today),
    })),
  ]
    .sort((a, b) => a.since.localeCompare(b.since))
    .slice(0, 6);

  // Departments with the largest short recovery in the last posted cycle.
  const shortByDepartment = sheetsFor(lastPosted)
    .map((s) => ({
      departmentId: s.departmentId,
      department: deptName.get(s.departmentId) ?? s.departmentId,
      demand: s.totalDemand,
      recovered: s.totalRecovered,
      short: s.totalDemand - s.totalRecovered,
      shortMembers: s.lines.filter((l) => (l.recovered ?? 0) < l.totalDemand).length,
    }))
    .filter((d) => d.short > 0)
    .sort((a, b) => b.short - a.short)
    .slice(0, 6);

  // Members retiring within 6 months, and what they still owe (gratuity recovery risk, Q-513).
  const retiring = db.members
    .filter((m) => m.status === 'ACTIVE' && inScope(m.id))
    .map((m) => ({ m, left: calculateLeftoverService(m.dor, db.demo.today).months }))
    .filter((x) => x.left <= 6)
    .map(({ m }) => ({
      id: m.id,
      name: m.name,
      generalNo: m.generalNo,
      department: deptName.get(m.departmentId) ?? '',
      dor: m.dor,
      outstanding: loans.filter((l) => l.memberId === m.id && l.status === 'ACTIVE').reduce((s, l) => s + l.outstandingPrincipal, 0),
    }))
    .sort((a, b) => a.dor.localeCompare(b.dor));

  return {
    needsAction,
    shortByDepartment,
    retiringSoon: {
      count: retiring.length,
      outstanding: retiring.reduce((s, r) => s + r.outstanding, 0),
      members: [...retiring].sort((a, b) => b.outstanding - a.outstanding || a.dor.localeCompare(b.dor)).slice(0, 5),
    },
    asOf: db.demo.today,
    currentCycle: db.currentCycle,
    lastPostedCycle: lastPosted,
    activeMembers: db.members.filter((m) => m.status === 'ACTIVE' && (!user.departmentId || m.departmentId === user.departmentId)).length,
    activeLoans: active.length,
    loanOutstanding: active.reduce((s, l) => s + l.outstandingPrincipal, 0),
    depositsHeld: db.deposits.filter((d) => d.status === 'ACTIVE' && inScope(d.memberId)).reduce((s, d) => s + d.balance, 0),
    collectionRate: rate(lastPosted),
    collectionRatePrev: rate(prevPosted),
    pipeline: PIPELINE.map((status) => ({ status, count: loans.filter((l) => l.status === status).length, amount: loans.filter((l) => l.status === status).reduce((s, l) => s + l.appliedAmount, 0) })),
    myQueue: user.role === 'SUPER_ADMIN' ? 0 : loans.filter((l) => queueStatuses.includes(l.status)).length + membershipQueue,
    collectionsTrend: posted.slice(-6).map((c) => {
      const s = sheetsFor(c);
      return { cycle: c, demand: s.reduce((a, x) => a + x.totalDemand, 0), recovered: s.reduce((a, x) => a + x.totalRecovered, 0) };
    }),
  };
}

export function datasetSummary(db: Db): DatasetSummary {
  const tally = <T>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((acc, x) => ((acc[key(x)] = (acc[key(x)] ?? 0) + 1), acc), {});
  return {
    version: db.version,
    today: db.demo.today,
    currentCycle: db.currentCycle,
    counts: {
      members: db.members.length,
      loans: db.loans.length,
      deposits: db.deposits.length,
      demandSheets: db.demandSheets.length,
      receipts: db.receipts.length,
      membershipApplications: db.membershipApplications.length,
      scenarios: db.scenarios.length,
    },
    byStatus: {
      member: tally(db.members, (m) => m.status),
      loan: tally(db.loans, (l) => l.status),
      deposit: tally(db.deposits.filter((d) => d.scheme === 'FD'), (d) => d.status),
      membership: tally(db.membershipApplications, (a) => a.status),
      demandSheet: tally(db.demandSheets, (s) => s.status),
    },
  };
}

/** Representative rows: every loan status once, then a spread of members (gallery + pattern previews). */
export function datasetSample(db: Db): DatasetSample {
  const dept = new Map(db.departments.map((d) => [d.id, d.name]));
  const memberById = new Map(db.members.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const loans = db.loans.filter((l) => (seen.has(l.status) ? false : (seen.add(l.status), true)));
  const members = [...db.members.slice(100, 112), ...db.members.filter((m) => m.status !== 'ACTIVE').slice(0, 3)];
  return {
    members: members.map((m) => {
      const own = db.loans.filter((l) => l.memberId === m.id && l.status === 'ACTIVE');
      return {
        id: m.id,
        generalNo: m.generalNo,
        name: m.name,
        department: dept.get(m.departmentId) ?? m.departmentId,
        designation: m.designation,
        status: m.status,
        leftoverMonths: calculateLeftoverService(m.dor, db.demo.today).months,
        activeLoans: own.length,
        outstanding: own.reduce((s, l) => s + l.outstandingPrincipal, 0),
      };
    }),
    loans: loans.map((l) => ({
      id: l.id,
      applicationNo: l.applicationNo,
      member: memberById.get(l.memberId)?.name ?? l.memberId,
      generalNo: memberById.get(l.memberId)?.generalNo ?? '',
      product: l.product,
      status: l.status,
      amount: l.sanctionedAmount ?? l.appliedAmount,
      appliedOn: l.appliedOn,
      emi: l.emi ?? 0,
    })),
  };
}
