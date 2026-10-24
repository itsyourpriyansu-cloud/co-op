// Scenario catalog (docs/20): derived from the generated data, so every entry points at a real record.
import type { LoanStatus, MembershipStatus, Scenario, ScenarioArea } from '@tgs/types';
import type { GeneratedData } from './generate';

const LOAN_SCREENS = ['ST-20', 'ST-23', 'MB-03', 'MB-04'];

/** Who acts (or watches) at each loan status, and which drawer they use. */
const LOAN_STATUS_PERSONA: Record<LoanStatus, { personaId: string; role: Scenario['role']; screens: string[]; milestone: string }> = {
  DRAFT: { personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-20', 'ST-21'], milestone: 'M4' },
  SURETY_PENDING: { personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-20', 'ST-23', 'MB-07'], milestone: 'M5' },
  ACCOUNTANT_REVIEW: { personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-02', 'ST-23', 'ST-24'], milestone: 'M5' },
  RETURNED: { personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-23', 'MB-04'], milestone: 'M5' },
  DDO_CERTIFICATION: { personaId: 'stf-ddo-fin', role: 'DDO', screens: ['ST-02', 'ST-25'], milestone: 'M5' },
  ASSESSMENT: { personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-02', 'ST-26'], milestone: 'M5' },
  SANCTION_SECRETARY: { personaId: 'stf-secretary', role: 'SECRETARY', screens: ['ST-02', 'ST-27'], milestone: 'M5' },
  SANCTION_PRESIDENT: { personaId: 'stf-president', role: 'PRESIDENT', screens: ['ST-02', 'ST-27'], milestone: 'M5' },
  SANCTIONED: { personaId: 'stf-cashier', role: 'CASHIER', screens: ['ST-02', 'ST-28'], milestone: 'M5' },
  ACTIVE: { personaId: 'stf-admin', role: 'SUPER_ADMIN', screens: LOAN_SCREENS, milestone: 'M4' },
  CLOSED: { personaId: 'stf-admin', role: 'SUPER_ADMIN', screens: ['ST-20', 'ST-23'], milestone: 'M4' },
  CLOSED_BY_TOPUP: { personaId: 'stf-admin', role: 'SUPER_ADMIN', screens: ['ST-20', 'ST-23'], milestone: 'M5' },
  REJECTED: { personaId: 'stf-admin', role: 'SUPER_ADMIN', screens: ['ST-20', 'ST-23'], milestone: 'M5' },
  WITHDRAWN: { personaId: 'stf-admin', role: 'SUPER_ADMIN', screens: ['ST-20', 'ST-23'], milestone: 'M5' },
};

const MEMBERSHIP_PERSONA: Partial<Record<MembershipStatus, { personaId: string; role: Scenario['role'] }>> = {
  SUBMITTED: { personaId: 'stf-accountant', role: 'ACCOUNTANT' },
  DDO_CERTIFICATION: { personaId: 'stf-ddo-fin', role: 'DDO' },
  OFFICE_REVIEW: { personaId: 'stf-accountant', role: 'ACCOUNTANT' },
  INFO_REQUESTED: { personaId: 'stf-accountant', role: 'ACCOUNTANT' },
  APPROVAL_SECRETARY: { personaId: 'stf-secretary', role: 'SECRETARY' },
  APPROVAL_PRESIDENT: { personaId: 'stf-president', role: 'PRESIDENT' },
  SHARE_PAYMENT_PENDING: { personaId: 'stf-cashier', role: 'CASHIER' },
  ACTIVE: { personaId: 'stf-admin', role: 'SUPER_ADMIN' },
  REJECTED: { personaId: 'stf-admin', role: 'SUPER_ADMIN' },
};

const label = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function buildScenarios(d: GeneratedData): Scenario[] {
  const out: Scenario[] = [];
  const add = (s: Scenario) => out.push(s);

  // Personas' headline stories
  add({ id: 'SC-PERSONA-TOPUP', area: 'loans', title: 'Top-up with share-deposit netting', description: 'Lakshmi has a ₹10,000 Ordinary loan and ₹1,000 share deposit. A ₹20,000 top-up deducts only ₹1,000 more (agreement example, BR-004).', personaId: 'mem-1101', role: 'MEMBER', screens: ['MB-06', 'ST-22', 'ST-26'], entityType: 'member', entityId: 'mem-1101', state: 'BR-004 netting', milestone: 'M5' });
  add({ id: 'SC-PERSONA-RETIRING', area: 'loans', title: 'Tenure blocked by retirement', description: 'Ramaiah retires in 14 months. A 24-month request is blocked; max 13 months is suggested (BR-002).', personaId: 'mem-1102', role: 'MEMBER', screens: ['MB-05', 'MB-11'], entityType: 'member', entityId: 'mem-1102', state: 'BR-002 fail', milestone: 'M4' });
  const sravaniLoan = d.loans.find((l) => l.sureties.some((s) => s.memberId === 'mem-1103' && s.status === 'PENDING'));
  add({ id: 'SC-PERSONA-SURETY', area: 'sureties', title: 'Surety request waiting', description: 'Sravani is asked to stand surety. She confirms auto-filled particulars and signs with OTP.', personaId: 'mem-1103', role: 'MEMBER', screens: ['MB-07'], entityType: 'loan', ...(sravaniLoan ? { entityId: sravaniLoan.id } : {}), state: 'SURETY PENDING', milestone: 'M5' });
  add({ id: 'SC-PERSONA-SHORT', area: 'collections', title: 'Short recovery waterfall', description: 'Mahesh paid 40% of the September demand. The allocation stops part-way through interest (BR-011).', personaId: 'mem-1104', role: 'MEMBER', screens: ['MB-10', 'ST-43', 'ST-12'], entityType: 'member', entityId: 'mem-1104', state: 'PARTIAL', milestone: 'M7' });

  // One scenario per loan status
  for (const [status, meta] of Object.entries(LOAN_STATUS_PERSONA) as Array<[LoanStatus, (typeof LOAN_STATUS_PERSONA)[LoanStatus]]>) {
    const loan = d.loans.find((l) => l.status === status && l.memberId !== 'mem-1101');
    if (!loan) continue;
    add({ id: `SC-LOAN-${status}`, area: 'loans', title: `Loan: ${label(status)}`, description: `${loan.applicationNo} (${loan.product.toLowerCase()} loan) is ${label(status).toLowerCase()}.`, ...meta, entityType: 'loan', entityId: loan.id, state: status });
  }
  const declined = d.loans.find((l) => l.sureties.some((s) => s.status === 'DECLINED'));
  if (declined) add({ id: 'SC-SURETY-DECLINED', area: 'sureties', title: 'Surety declined', description: 'A surety declined; the applicant must replace them.', personaId: declined.memberId, role: 'MEMBER', screens: ['MB-04', 'ST-23'], entityType: 'loan', entityId: declined.id, state: 'DECLINED', milestone: 'M5' });
  const retiring = d.loans.find((l) => l.sureties.some((s) => s.retiresDuringLoan) && l.status === 'ASSESSMENT');
  if (retiring) add({ id: 'SC-SURETY-RETIRING', area: 'sureties', title: 'Surety retires during the loan', description: 'BR-024 warning shown to accountant and approvers (warns, never blocks).', personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-23', 'ST-26'], entityType: 'loan', entityId: retiring.id, state: 'BR-024 warn', milestone: 'M5' });

  // Membership pipeline
  for (const [status, meta] of Object.entries(MEMBERSHIP_PERSONA) as Array<[MembershipStatus, { personaId: string; role: Scenario['role'] }]>) {
    const app = d.membershipApplications.find((a) => a.status === status);
    if (!app) continue;
    add({ id: `SC-JOIN-${status}`, area: 'membership', title: `Joining: ${label(status)}`, description: `${app.applicationNo} for ${app.name}.`, ...meta, screens: ['ST-14', 'ST-15', 'MJ-05'], entityType: 'membershipApplication', entityId: app.id, state: status, milestone: 'M3' });
  }
  add({ id: 'SC-JOIN-APPLICANT-TRACKER', area: 'membership', title: 'Applicant tracks the application', description: 'Ravi sees stage 2 of 6: department verification.', personaId: 'apl-ravi', role: 'APPLICANT', screens: ['MJ-05'], entityType: 'membershipApplication', entityId: d.membershipApplications.find((a) => a.applicantId === 'apl-ravi')?.id ?? '', state: 'DDO_CERTIFICATION', milestone: 'M3' });
  add({ id: 'SC-JOIN-NEW', area: 'membership', title: 'New applicant joins', description: 'Divya starts with no application: eligibility → form → sign with OTP.', personaId: 'apl-divya', role: 'APPLICANT', screens: ['MJ-02', 'MJ-03', 'MJ-04'], state: 'NONE', milestone: 'M3' });

  // Deposits
  for (const status of ['REQUESTED', 'PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT', 'ACTIVE', 'MATURED', 'CANCELLED'] as const) {
    const fd = d.deposits.find((x) => x.scheme === 'FD' && x.status === status);
    if (!fd) continue;
    const persona = status === 'PAYMENT_RECEIVED' || status === 'REQUESTED' ? { personaId: 'stf-cashier', role: 'CASHIER' as const } : status === 'ACCEPTANCE_SECRETARY' ? { personaId: 'stf-secretary', role: 'SECRETARY' as const } : status === 'ACCEPTANCE_PRESIDENT' ? { personaId: 'stf-president', role: 'PRESIDENT' as const } : { personaId: 'stf-admin', role: 'SUPER_ADMIN' as const };
    add({ id: `SC-FD-${status}`, area: 'deposits', title: `FD: ${label(status)}`, description: `${fd.accountNo}, ${fd.tenureMonths} months.`, ...persona, screens: ['ST-30', 'ST-32', 'ST-33', 'MB-09'], entityType: 'deposit', entityId: fd.id, state: status, milestone: 'M6' });
  }
  const pledged = d.deposits.find((x) => x.pledgedToLoanId);
  if (pledged) add({ id: 'SC-FD-PLEDGED', area: 'deposits', title: 'FD pledged to a loan', description: 'Loan against FD (D-045). Premature closure is blocked while pledged.', personaId: 'stf-admin', role: 'SUPER_ADMIN', screens: ['ST-32', 'MB-09'], entityType: 'deposit', entityId: pledged.id, state: 'PLEDGED', milestone: 'M6' });

  // Collections
  for (const status of ['GENERATED', 'CERTIFIED', 'SENT_TO_DDO', 'RECOVERY_POSTED'] as const) {
    const sheet = d.demandSheets.find((s) => s.status === status);
    if (!sheet) continue;
    add({ id: `SC-DEMAND-${status}`, area: 'collections', title: `Demand sheet: ${label(status)}`, description: `${sheet.cycle} · ${sheet.lines.length} members.`, personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-40', 'ST-42', 'ST-43'], entityType: 'demandSheet', entityId: sheet.id, state: status, milestone: 'M7' });
  }
  add({ id: 'SC-DEMAND-NOT_GENERATED', area: 'collections', title: 'Demand sheet: not generated', description: 'Three departments have no sheet for the current cycle yet.', personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-40', 'ST-41'], state: 'NOT_GENERATED', milestone: 'M7' });
  const transfer = d.transfers.find((t) => t.effectiveCycle > '2026-10');
  if (transfer) add({ id: 'SC-TRANSFER-NEXT-CYCLE', area: 'members', title: 'Transfer effective next cycle', description: 'Member stays on the old department’s current sheet and moves next cycle (BR-010).', personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-12', 'ST-13', 'ST-42'], entityType: 'member', entityId: transfer.memberId, state: 'BR-010', milestone: 'M3' });

  // Payment reports & profile change requests
  for (const status of ['REPORTED', 'VERIFIED', 'REJECTED'] as const) {
    const pr = d.paymentReports.find((p) => p.status === status);
    if (pr) add({ id: `SC-PAYREPORT-${status}`, area: 'payments', title: `Reported payment: ${label(status)}`, description: `${pr.reference} reported by a member.`, personaId: 'stf-cashier', role: 'CASHIER', screens: ['ST-44', 'ST-47', 'MB-10', 'MB-18'], entityType: 'paymentReport', entityId: pr.id, state: status, milestone: 'M7' });
  }
  for (const status of ['PENDING', 'APPROVED', 'REJECTED'] as const) {
    const pcr = d.profileChangeRequests.find((p) => p.status === status);
    if (pcr) add({ id: `SC-PROFILE-${status}`, area: 'profile', title: `Profile change: ${label(status)}`, description: `Change to ${pcr.field}.`, personaId: 'stf-accountant', role: 'ACCOUNTANT', screens: ['ST-18', 'MB-02', 'MB-19'], entityType: 'profileChangeRequest', entityId: pcr.id, state: status, milestone: 'M3' });
  }

  // Members
  const retired = d.members.find((m) => m.status === 'RETIRED');
  if (retired) add({ id: 'SC-MEMBER-RETIRED', area: 'members', title: 'Retired member', description: 'Read-only profile; no new loans.', personaId: 'stf-admin', role: 'SUPER_ADMIN', screens: ['ST-10', 'ST-12'], entityType: 'member', entityId: retired.id, state: 'RETIRED', milestone: 'M3' });

  // System-level UI states (rendered in the State Explorer)
  const area: ScenarioArea = 'system';
  add({ id: 'SC-SYS-OFFLINE', area, title: 'Server unreachable', description: 'Stop the mock API or use Demo → simulate errors.', personaId: 'mem-1101', role: 'MEMBER', screens: ['MA-04', 'SYS-03'], state: 'offline', milestone: 'M0' });
  add({ id: 'SC-SYS-NOACCESS', area, title: 'No access', description: 'A DDO opening Deposits sees SYS-01.', personaId: 'stf-ddo-fin', role: 'DDO', screens: ['SYS-01'], state: 'noAccess', milestone: 'M0' });
  return out;
}
