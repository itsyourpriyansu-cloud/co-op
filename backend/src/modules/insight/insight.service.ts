import { calculateLeftoverService, daysBetweenDates as daysBetween, depositActionsFor, formatCycle, formatDisplayDate, formatINR, loanActionsFor, membershipActionsFor, PRIMARY_DEPOSIT_ACTION, PRIMARY_LOAN_ACTION, PROFILE_FIELDS, serviceTarget } from '@tgs/domain';
import type { DashboardSummary, DepositAccount, Loan, LoanStatus, MembershipApplication, Permission, RoleDashboard, SearchHit, SessionUser, WorkflowEvent, WorkItem, WorkQueue } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { businessCycle, businessNow, businessToday } from '../../common/utils/business-date';

const STAGE_LABEL: Record<string, string> = {
  ACCOUNTANT_REVIEW: 'Review',
  DDO_CERTIFICATION: 'DDO certificate',
  ASSESSMENT: 'Assessment',
  SANCTION_SECRETARY: 'Sanction',
  SANCTION_PRESIDENT: 'Sanction',
  SANCTIONED: 'Disbursement',
  membership: 'Joining',
  profile: 'Profile changes',
  mandate: 'Mandates',
  deposit: 'Deposits',
  demand: 'Demand sheets',
  payments: 'Reported payments',
};
const ACTION_TEXT: Record<string, string> = {
  forward: 'Review',
  ddoCertify: 'Certify',
  ddoRecordManual: 'Record DDO certificate',
  sendForSanction: 'Assess',
  secretarySign: 'Sign sanction',
  presidentSign: 'Sign sanction',
  disburse: 'Disburse',
  certify: 'Certify',
  sendToDdo: 'Send to DDO',
  postRecovery: 'Enter recovery',
};
const PIPELINE: LoanStatus[] = ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'DDO_CERTIFICATION', 'ASSESSMENT', 'SANCTION_SECRETARY', 'SANCTION_PRESIDENT', 'SANCTIONED'];
const QUEUE_BY_ROLE: Partial<Record<SessionUser['role'], LoanStatus[]>> = { ACCOUNTANT: ['ACCOUNTANT_REVIEW', 'ASSESSMENT'], DDO: ['DDO_CERTIFICATION'], SECRETARY: ['SANCTION_SECRETARY'], PRESIDENT: ['SANCTION_PRESIDENT'], CASHIER: ['SANCTIONED'] };
const PRODUCT: Record<string, string> = { ORDINARY: 'Ordinary loan', EDUCATION: 'Education loan', SALARY: 'Salary loan', DEPOSIT: 'Loan against FD' };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

type World = Awaited<ReturnType<InsightService['world']>>;

/**
 * P8b (docs/22 §5.7): ST-02 Work Queue, ST-01 dashboards and the topbar search, read from the
 * backend's own tables (ported from the mock's read models), plus the REQ-135 service targets.
 */
export class InsightService {
  constructor(private readonly app: FastifyInstance) {}

  private staff(user: SessionUser): SessionUser {
    if (user.role === 'MEMBER' || user.role === 'APPLICANT') fail('FORBIDDEN', 'Staff only.');
    return user;
  }

  /** Everything the read models need, loaded once per request. */
  private async world(user: SessionUser) {
    const a = this.app;
    const [today, cycle, now, settings, members, departments, products, loans, deposits, applications, changes, mandates, sheets, reports, perms] = await Promise.all([
      businessToday(a),
      businessCycle(a),
      businessNow(a),
      a.masters.settings(),
      a.members.all(),
      a.departments.all(),
      a.masters.loanProducts(),
      a.loans.repo.all(),
      a.deposits.repo.list(),
      a.joining.repo.all(),
      a.profileChanges.repo.pending(),
      a.members.repo.currentMandates(user.role === 'DDO' ? user.departmentId : undefined),
      a.collections.repo.allSheetHeads(),
      a.collections.repo.reports(),
      Promise.all((['members.view', 'loans.view', 'deposits.view', 'membership.view', 'collections.view', 'members.decideChanges'] as Permission[]).map(async (p) => [p, await a.permissions.has(user.role, p)] as const)),
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const can = new Map(perms);
    return { today, cycle, now, settings, members, memberById, departments, deptName, products, loans, deposits, applications, changes, mandates, sheets, reports, can: (p: Permission) => can.get(p) ?? false, inScope: (memberId: string) => !user.departmentId || memberById.get(memberId)?.departmentId === user.departmentId };
  }

  private loanVisible(w: World, l: Loan, user: SessionUser): boolean {
    if (l.status === 'DRAFT' && l.channel !== 'COUNTER') return false;
    return user.role !== 'DDO' || w.memberById.get(l.memberId)?.departmentId === user.departmentId;
  }

  private target(w: World, kind: 'loan' | 'membership', startedAt: string | undefined): Pick<WorkItem, 'overTarget' | 'targetLabel'> {
    if (!startedAt) return {};
    const t = serviceTarget(kind, startedAt, w.now, w.settings);
    return t.over ? { overTarget: true, targetLabel: t.label } : {};
  }

  private async items(w: World, user: SessionUser): Promise<WorkItem[]> {
    const { today } = w;
    const dept = (id: string) => w.deptName.get(id) ?? '';
    const items: WorkItem[] = [];
    const actor = { role: user.role, ...(user.departmentId ? { departmentId: user.departmentId } : {}) };
    for (const l of w.loans) {
      if (!this.loanVisible(w, l, user)) continue;
      const m = w.memberById.get(l.memberId);
      if (!m) continue;
      const acts = loanActionsFor({ status: l.status, memberDepartmentId: m.departmentId }, actor);
      if (!acts.length) continue;
      const since = (l.events.at(-1)?.at ?? l.appliedOn).slice(0, 10);
      const primary = PRIMARY_LOAN_ACTION[l.status] && acts.includes(PRIMARY_LOAN_ACTION[l.status]!) ? PRIMARY_LOAN_ACTION[l.status]! : acts[0]!;
      const stage = l.status === 'SANCTION_PRESIDENT' ? 'SANCTION_SECRETARY' : l.status;
      const product = w.products.find((p) => p.code === l.product)?.name ?? l.product;
      items.push({ kind: 'loan', id: l.id, ref: l.applicationNo, title: m.name, subtitle: `${product}${l.parentLoanId ? ' top-up' : ''} · ${l.sanctionedInstalments ?? l.appliedInstalments} months`, stage, stageLabel: STAGE_LABEL[stage] ?? stage, status: l.status, departmentName: dept(m.departmentId), amount: l.sanctionedAmount ?? l.appliedAmount, since, days: daysBetween(since, today), actionLabel: ACTION_TEXT[primary] ?? primary, link: `/loans/${l.id}`, ...this.target(w, 'loan', l.submittedAt ?? l.appliedOn) });
    }
    if (w.can('membership.view')) {
      for (const a of w.applications) {
        if (a.status === 'DRAFT' || (user.role === 'DDO' && a.departmentId !== user.departmentId)) continue;
        if (!membershipActionsFor(a, user).length) continue;
        const since = (a.events.at(-1)?.at ?? a.submittedOn ?? today).slice(0, 10);
        items.push({ kind: 'membership', id: a.id, ref: a.applicationNo, title: a.name, subtitle: `Membership · ${a.designation}`, stage: 'membership', stageLabel: STAGE_LABEL.membership!, status: a.status, departmentName: dept(a.departmentId), since, days: daysBetween(since, today), actionLabel: 'Open', link: `/joining/${a.id}`, ...this.target(w, 'membership', this.submittedAt(a)) });
      }
    }
    for (const r of w.changes) {
      const m = w.memberById.get(r.memberId);
      if (!m) continue;
      const needsDdo = r.route === 'DDO_THEN_OFFICE' && !r.ddoCertified;
      const mine = needsDdo ? user.role === 'DDO' && user.departmentId === m.departmentId : w.can('members.decideChanges');
      if (!mine) continue;
      const since = (r.ddoCertified?.at ?? r.createdAt).slice(0, 10);
      items.push({ kind: 'changeRequest', id: r.id, ref: `General No. ${m.generalNo}`, title: m.name, subtitle: `Change of ${r.fields.map((f) => PROFILE_FIELDS[f.field].label.toLowerCase()).join(', ')}`, stage: 'profile', stageLabel: STAGE_LABEL.profile!, departmentName: dept(m.departmentId), since, days: daysBetween(since, today), actionLabel: needsDdo ? 'Certify' : 'Decide', link: '/members/change-requests' });
    }
    if (user.role === 'DDO') {
      for (const x of w.mandates.values()) {
        if (x.status !== 'PENDING_NEW_DDO' || x.departmentId !== user.departmentId) continue;
        const m = w.memberById.get(x.memberId);
        if (!m) continue;
        items.push({ kind: 'mandate', id: x.id, ref: `General No. ${m.generalNo}`, title: m.name, subtitle: 'Transferred in · agree the salary recovery mandate', stage: 'mandate', stageLabel: STAGE_LABEL.mandate!, departmentName: dept(m.departmentId), since: x.signedOn, days: daysBetween(x.signedOn, today), actionLabel: 'Agree', link: `/members/${m.id}` });
      }
    }
    if (w.can('deposits.view')) items.push(...w.deposits.filter((d) => d.scheme === 'FD' && depositActionsFor(d.status, { role: user.role }).length > 0).map((d) => this.depositItem(w, d)));
    if (w.can('collections.view')) {
      const lines = await this.app.collections.repo.lineCounts();
      for (const sh of w.sheets) {
        if (user.role === 'DDO' && sh.departmentId !== user.departmentId) continue;
        const acts = await this.app.collections.actionsFor(sh, user);
        if (!acts.length) continue;
        const review = sh.entry?.status === 'SUBMITTED' || sh.entry?.status === 'UNDER_REVIEW';
        const since = (sh.entry?.submitted?.at ?? sh.sent?.at ?? sh.certified?.at ?? sh.generated?.at ?? `${sh.cycle}-01`).slice(0, 10);
        const todo = acts.includes('submitEntry') ? 'enter the deductions' : sh.status === 'GENERATED' ? 'certify the sheet' : sh.status === 'CERTIFIED' ? 'send to the DDO' : review ? 'review the DDO\'s deductions' : 'enter the recovery';
        items.push({ kind: 'demandSheet', id: sh.id, ref: `${formatCycle(sh.cycle)} demand`, title: dept(sh.departmentId), subtitle: `${lines.get(sh.id) ?? 0} members · ${todo}`, stage: 'demand', stageLabel: STAGE_LABEL.demand!, status: sh.status, departmentName: dept(sh.departmentId), amount: sh.totalDemand, since, days: daysBetween(since, today), actionLabel: acts.includes('submitEntry') ? 'Enter deductions' : review ? 'Review and post' : ACTION_TEXT[acts[0]!] ?? acts[0]!, link: `/demand-sheets/${sh.id}` });
      }
      if (user.role === 'CASHIER' || user.role === 'ACCOUNTANT') {
        for (const r of w.reports) {
          if (r.status !== 'REPORTED') continue;
          const m = w.memberById.get(r.memberId);
          const since = (r.reportedAt ?? r.paidOn).slice(0, 10);
          items.push({ kind: 'paymentReport', id: r.id, ref: r.reference, title: m?.name ?? '', subtitle: `Reported ${r.mode === 'UPI' ? 'UPI' : r.mode === 'CHEQUE_DEPOSIT' ? 'cheque deposit' : 'bank transfer'} · ${r.towards === 'SHARE_CAPITAL' ? 'share capital' : 'dues'}`, stage: 'payments', stageLabel: STAGE_LABEL.payments!, status: r.status, departmentName: dept(m?.departmentId ?? ''), amount: r.amount, since, days: daysBetween(since, today), actionLabel: 'Verify', link: `/payments?report=${r.id}` });
        }
      }
    }
    return items.sort((a, b) => b.days - a.days);
  }

  private submittedAt(a: MembershipApplication): string | undefined {
    return a.events.find((e) => e.action === 'submit')?.at ?? a.submittedOn;
  }

  private depositItem(w: World, d: DepositAccount): WorkItem {
    const m = w.memberById.get(d.memberId);
    // A matured FD waits from its maturity date, not from when it was opened.
    const since = (d.status === 'MATURED' && d.maturityDate ? d.maturityDate : (d.events?.at(-1)?.at ?? d.openedOn)).slice(0, 10);
    const action = PRIMARY_DEPOSIT_ACTION[d.status];
    return { kind: 'deposit', id: d.id, ref: d.fdrNo ?? d.accountNo, title: m?.name ?? '', subtitle: `Fixed deposit · ${d.tenureMonths ?? ''} months${d.channel === 'APP' ? ' · from the app' : ''}`, stage: 'deposit', stageLabel: STAGE_LABEL.deposit!, status: d.status, departmentName: w.deptName.get(m?.departmentId ?? '') ?? '', amount: d.principal ?? 0, since, days: Math.max(0, daysBetween(since, w.today)), actionLabel: action === 'recordPayment' ? 'Record payment' : action === 'accept' ? 'Accept' : action === 'payout' ? 'Pay out' : action === 'refund' ? 'Refund' : 'Open', link: `/deposits/${d.id}` };
  }

  private queueOf(items: WorkItem[], user: SessionUser, w: World): WorkQueue {
    const tabs = [...new Set(items.map((i) => i.stage))].map((key) => ({ key, label: STAGE_LABEL[key] ?? key, count: items.filter((i) => i.stage === key).length }));
    const d = user.role === 'DDO' && user.departmentId ? w.deptName.get(user.departmentId) : undefined;
    return { items, tabs, scope: d ? { departmentName: d } : {} };
  }

  /** ST-02: everything waiting on the signed-in staff user, oldest first. */
  async workQueue(user: SessionUser): Promise<WorkQueue> {
    const w = await this.world(this.staff(user));
    return this.queueOf(await this.items(w, user), user, w);
  }

  /** ST-01 role block (docs/04 §5), built on the Work Queue so the two always agree. */
  async roleDashboard(user: SessionUser): Promise<RoleDashboard> {
    const w = await this.world(this.staff(user));
    const wq = this.queueOf(await this.items(w, user), user, w);
    const variant: RoleDashboard['variant'] = user.role === 'ACCOUNTANT' ? 'ACCOUNTANT' : user.role === 'SECRETARY' || user.role === 'PRESIDENT' ? 'SIGNER' : user.role === 'CASHIER' ? 'CASHIER' : user.role === 'DDO' ? 'DDO' : 'ADMIN';
    const { today, cycle } = w;
    const month = today.slice(0, 7);
    const dept = (id: string) => w.deptName.get(id) ?? '';
    const queue = wq.tabs.map((t) => {
      const items = wq.items.filter((i) => i.stage === t.key);
      return { key: t.key, label: t.label, count: t.count, amount: sum(items.map((i) => i.amount ?? 0)), oldestDays: Math.max(0, ...items.map((i) => i.days)), link: `/queue?tab=${t.key}` };
    });
    const waiting = wq.items.length;
    const waitingAmount = sum(wq.items.map((i) => i.amount ?? 0));

    type Done = { e: WorkflowEvent; amount: number; id: string };
    const mine = (e: WorkflowEvent) => e.at.slice(0, 7) === month && e.actorRole === user.role;
    const done: Done[] = [
      ...w.loans.filter((l) => w.inScope(l.memberId)).flatMap((l) => l.events.filter(mine).map((e) => ({ e, id: l.id, amount: l.sanctionedAmount ?? l.appliedAmount }))),
      ...w.deposits.filter((d) => w.inScope(d.memberId)).flatMap((d) => (d.events ?? []).filter(mine).map((e) => ({ e, id: d.id, amount: d.principal ?? 0 }))),
      ...w.applications.filter((a) => !user.departmentId || a.departmentId === user.departmentId).flatMap((a) => a.events.filter(mine).map((e) => ({ e, id: a.id, amount: 0 }))),
    ];
    const uniqueDone = [...new Map(done.map((d) => [d.id, d])).values()];

    const disbursedThisMonth = w.loans.filter((l) => l.disbursedOn?.slice(0, 7) === month && w.inScope(l.memberId));
    const reportsOpen = w.reports.filter((r) => r.status === 'REPORTED' && w.inScope(r.memberId));
    const sheetsNow = w.sheets.filter((s) => s.cycle === cycle && (!user.departmentId || s.departmentId === user.departmentId));
    const deptsInScope = user.departmentId ? w.departments.filter((d) => d.id === user.departmentId) : w.departments;
    const lastPosted = [...new Set(w.sheets.filter((s) => s.status === 'RECOVERY_POSTED').map((s) => s.cycle))].sort().at(-1);
    const lastSheets = w.sheets.filter((s) => s.cycle === lastPosted && (!user.departmentId || s.departmentId === user.departmentId));
    const lastRate = sum(lastSheets.map((s) => s.totalDemand)) ? sum(lastSheets.map((s) => s.totalRecovered)) / sum(lastSheets.map((s) => s.totalDemand)) : 0;
    const demand: NonNullable<RoleDashboard['demand']> = {
      cycle,
      byStatus: (['NOT_GENERATED', 'GENERATED', 'CERTIFIED', 'SENT_TO_DDO', 'RECOVERY_POSTED'] as const).map((status) => ({ status, count: status === 'NOT_GENERATED' ? deptsInScope.filter((d) => !sheetsNow.some((s) => s.departmentId === d.id)).length : sheetsNow.filter((s) => s.status === status).length })),
      demand: sum(sheetsNow.map((s) => s.totalDemand)),
      recovered: sum(sheetsNow.map((s) => s.totalRecovered)),
      toPost: sheetsNow.filter((s) => s.status === 'SENT_TO_DDO').length,
    };
    const productName = (code: string) => w.products.find((p) => p.code === code)?.name ?? code;
    const memberName = (id: string) => w.memberById.get(id)?.name ?? '';
    let tiles: RoleDashboard['tiles'] = [];
    let recent: RoleDashboard['recent'] = [];
    let doneBlock: RoleDashboard['done'] = { label: 'Done this month', count: uniqueDone.length, amount: sum(uniqueDone.map((d) => d.amount)) };
    const disbursedAmount = sum(disbursedThisMonth.map((l) => l.netDisbursable ?? l.sanctionedAmount ?? 0));

    switch (variant) {
      case 'ACCOUNTANT': {
        const appliedThisMonth = w.loans.filter((l) => l.appliedOn.slice(0, 7) === month && l.status !== 'DRAFT');
        tiles = [
          { key: 'waiting', label: 'Waiting on you', value: waiting, format: 'count', sub: n(queue.length, 'stage'), link: '/queue', tone: waiting ? 'warning' : 'success' },
          { key: 'sheets', label: `Demand sheets · ${formatCycle(cycle)}`, value: sheetsNow.length, format: 'count', sub: `of ${deptsInScope.length} departments generated`, link: `/demand-sheets?cycle=${cycle}` },
          { key: 'reports', label: 'Reported payments', value: reportsOpen.length, format: 'count', sub: formatINR(sum(reportsOpen.map((r) => r.amount))), link: '/payments?tab=REPORTED', tone: reportsOpen.length ? 'warning' : 'neutral' },
          { key: 'applied', label: 'Applications this month', value: appliedThisMonth.length, format: 'count', sub: formatINR(sum(appliedThisMonth.map((l) => l.appliedAmount))), link: '/loans' },
        ];
        recent = [
          ...w.loans.filter((l) => l.status !== 'DRAFT').map((l) => ({ id: l.id, ref: l.applicationNo, title: memberName(l.memberId), subtitle: productName(l.product), status: l.status, entity: 'loan' as const, amount: l.appliedAmount, at: (l.submittedAt ?? l.appliedOn).slice(0, 10), link: `/loans/${l.id}` })),
          ...w.applications.filter((a) => a.submittedOn).map((a) => ({ id: a.id, ref: a.applicationNo, title: a.name, subtitle: 'Membership', status: a.status, entity: 'membership' as const, at: a.submittedOn!, link: `/joining/${a.id}` })),
        ]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 6);
        doneBlock = { label: 'Processed this month', count: uniqueDone.length, amount: sum(uniqueDone.map((d) => d.amount)) };
        break;
      }
      case 'SIGNER': {
        const oldest = Math.max(0, ...wq.items.map((i) => i.days));
        tiles = [
          { key: 'waiting', label: 'Awaiting your signature', value: waiting, format: 'count', sub: queue.map((q) => `${q.count} ${q.label.toLowerCase()}`).join(' · ') || 'Nothing waiting', link: '/queue', tone: waiting ? 'warning' : 'success' },
          { key: 'amount', label: 'Amount awaiting', value: waitingAmount, format: 'money', sub: 'Loans and deposits', link: '/queue' },
          { key: 'signed', label: 'Signed this month', value: uniqueDone.length, format: 'count', sub: formatINR(sum(uniqueDone.map((d) => d.amount))) },
          { key: 'oldest', label: 'Oldest waiting', value: oldest, format: 'count', sub: oldest === 1 ? 'day' : 'days', tone: oldest > 7 ? 'danger' : oldest > 3 ? 'warning' : 'neutral' },
        ];
        recent = uniqueDone
          .sort((a, b) => b.e.at.localeCompare(a.e.at))
          .slice(0, 6)
          .map((d) => {
            const l = w.loans.find((x) => x.id === d.id);
            const dep = l ? undefined : w.deposits.find((x) => x.id === d.id);
            const app = l || dep ? undefined : w.applications.find((x) => x.id === d.id);
            if (l) return { id: l.id, ref: l.applicationNo, title: memberName(l.memberId), subtitle: `${productName(l.product)} · ${d.e.action}`, status: l.status, entity: 'loan' as const, amount: d.amount, at: d.e.at.slice(0, 10), link: `/loans/${l.id}` };
            if (dep) return { id: dep.id, ref: dep.fdrNo ?? dep.accountNo, title: memberName(dep.memberId), subtitle: `Fixed deposit · ${d.e.action}`, status: dep.status, entity: 'deposit' as const, amount: d.amount, at: d.e.at.slice(0, 10), link: `/deposits/${dep.id}` };
            return { id: app!.id, ref: app!.applicationNo, title: app!.name, subtitle: `Membership · ${d.e.action}`, status: app!.status, entity: 'membership' as const, at: d.e.at.slice(0, 10), link: `/joining/${app!.id}` };
          });
        doneBlock = { label: 'Signed this month', count: uniqueDone.length, amount: sum(uniqueDone.map((d) => d.amount)) };
        break;
      }
      case 'CASHIER': {
        const toPay = wq.items.filter((i) => i.stage === 'SANCTIONED');
        const counter = await this.app.collections.repo.receiptPage({ tab: 'COUNTER', ...(user.departmentId ? { scopeDepartmentId: user.departmentId } : {}) }, 0, 500);
        const receiptsToday = counter.items.filter((r) => r.date === today);
        tiles = [
          { key: 'toPay', label: 'Awaiting disbursement', value: toPay.length, format: 'count', sub: formatINR(sum(toPay.map((i) => i.amount ?? 0))), link: '/queue?tab=SANCTIONED', tone: toPay.length ? 'warning' : 'success' },
          { key: 'paid', label: 'Disbursed this month', value: disbursedAmount, format: 'money', sub: n(disbursedThisMonth.length, 'loan') },
          { key: 'today', label: 'Counter receipts today', value: sum(receiptsToday.map((r) => r.amount)), format: 'money', sub: n(receiptsToday.length, 'receipt'), link: '/payments?tab=COUNTER' },
          { key: 'reports', label: 'Payments to verify', value: reportsOpen.length, format: 'count', sub: formatINR(sum(reportsOpen.map((r) => r.amount))), link: '/payments?tab=REPORTED', tone: reportsOpen.length ? 'warning' : 'neutral' },
        ];
        recent = w.loans
          .filter((l) => l.disbursedOn && w.inScope(l.memberId))
          .sort((a, b) => b.disbursedOn!.localeCompare(a.disbursedOn!))
          .slice(0, 6)
          .map((l) => ({ id: l.id, ref: l.loanNo ?? l.applicationNo, title: memberName(l.memberId), subtitle: productName(l.product), status: l.status, entity: 'loan' as const, amount: l.netDisbursable ?? l.sanctionedAmount ?? l.appliedAmount, at: l.disbursedOn!, link: `/loans/${l.id}` }));
        doneBlock = { label: 'Disbursed this month', count: disbursedThisMonth.length, amount: disbursedAmount };
        break;
      }
      case 'DDO': {
        const members = w.members.filter((m) => m.status === 'ACTIVE' && m.departmentId === user.departmentId).length;
        tiles = [
          { key: 'waiting', label: 'Pending validations', value: waiting, format: 'count', sub: queue.map((q) => `${q.count} ${q.label.toLowerCase()}`).join(' · ') || 'Nothing waiting', link: '/queue', tone: waiting ? 'warning' : 'success' },
          { key: 'members', label: 'Members in your department', value: members, format: 'count', sub: 'Active, contributing', link: '/members' },
          { key: 'demand', label: `Demand · ${formatCycle(cycle)}`, value: demand.demand, format: 'money', sub: sheetsNow[0] ? `Sheet ${sheetsNow[0].status === 'SENT_TO_DDO' ? 'sent to you' : sheetsNow[0].status.toLowerCase().replace(/_/g, ' ')}` : 'Not generated yet', link: sheetsNow[0] ? `/demand-sheets/${sheetsNow[0].id}` : '/demand-sheets' },
          { key: 'rate', label: lastPosted ? `Recovered · ${formatCycle(lastPosted)}` : 'Recovered', value: lastRate, format: 'percent', ...(lastSheets[0] ? { sub: `${formatINR(lastSheets[0].totalRecovered)} of ${formatINR(lastSheets[0].totalDemand)}` } : {}), tone: lastRate >= 0.98 ? 'success' : 'warning' },
        ];
        recent = wq.items.slice(0, 6).map((i) => ({ id: i.id, ref: i.ref, title: i.title, subtitle: i.subtitle, ...(i.status ? { status: i.status } : {}), entity: i.kind === 'membership' ? ('membership' as const) : ('loan' as const), ...(i.amount ? { amount: i.amount } : {}), at: i.since, link: i.link }));
        doneBlock = { label: 'Certified this month', count: uniqueDone.length, amount: sum(uniqueDone.map((d) => d.amount)) };
        break;
      }
      default: {
        tiles = [
          { key: 'waiting', label: 'In flight', value: waiting, format: 'count', link: '/queue' },
          { key: 'paid', label: 'Disbursed this month', value: disbursedAmount, format: 'money', sub: n(disbursedThisMonth.length, 'loan') },
        ];
        doneBlock = { label: 'Disbursed this month', count: disbursedThisMonth.length, amount: disbursedAmount };
      }
    }
    return {
      variant,
      asOf: today,
      currentCycle: cycle,
      scope: user.departmentId ? { departmentName: dept(user.departmentId) } : {},
      tiles,
      queue,
      oldest: wq.items.slice(0, 6),
      overTarget: wq.items.filter((i) => i.overTarget).length,
      done: doneBlock,
      ...(variant === 'ACCOUNTANT' || variant === 'DDO' ? { demand } : {}),
      recent,
    };
  }

  /** ST-01 KPIs, pipeline, collections trend and risks, scoped to the DDO's department. */
  async summary(user: SessionUser): Promise<DashboardSummary> {
    const w = await this.world(this.staff(user));
    const loans = w.loans.filter((l) => w.inScope(l.memberId));
    const active = loans.filter((l) => l.status === 'ACTIVE');
    const posted = (await this.app.collections.repo.cycles()).filter((c) => c < w.cycle).sort();
    const lastPosted = posted.at(-1) ?? w.cycle;
    const prevPosted = posted.at(-2) ?? lastPosted;
    const sheetsFor = (c: string) => w.sheets.filter((s) => s.cycle === c && (!user.departmentId || s.departmentId === user.departmentId));
    const rate = (c: string) => {
      const s = sheetsFor(c);
      const demand = sum(s.map((x) => x.totalDemand));
      return demand ? sum(s.map((x) => x.totalRecovered)) / demand : 0;
    };
    const queueStatuses = QUEUE_BY_ROLE[user.role] ?? [];
    const membershipItems = w.applications.filter((a) =>
      user.role === 'DDO' ? a.status === 'DDO_CERTIFICATION' && a.departmentId === user.departmentId
      : user.role === 'ACCOUNTANT' ? a.status === 'OFFICE_REVIEW' || a.status === 'SUBMITTED'
      : user.role === 'SECRETARY' ? a.status === 'APPROVAL_SECRETARY'
      : user.role === 'PRESIDENT' ? a.status === 'APPROVAL_PRESIDENT'
      : user.role === 'CASHIER' ? a.status === 'SHARE_PAYMENT_PENDING'
      : user.role === 'SUPER_ADMIN' ? !['ACTIVE', 'REJECTED', 'WITHDRAWN', 'DRAFT'].includes(a.status) : false,
    );
    const lastEventDate = (events: Array<{ at: string }>, fallback: string) => (events.at(-1)?.at ?? fallback).slice(0, 10);
    const actionLoans = loans.filter((l) => (user.role === 'SUPER_ADMIN' ? PIPELINE.includes(l.status) : queueStatuses.includes(l.status)));
    const needsAction: DashboardSummary['needsAction'] = [
      ...actionLoans.map((l) => {
        const m = w.memberById.get(l.memberId);
        return { id: l.id, kind: 'loan' as const, ref: l.applicationNo, title: `${PRODUCT[l.product] ?? l.product} · ${m?.name ?? ''}`, subtitle: `General No. ${m?.generalNo ?? '—'} · ${w.deptName.get(m?.departmentId ?? '') ?? ''}`, status: l.status, since: lastEventDate(l.events, l.appliedOn), amount: l.sanctionedAmount ?? l.appliedAmount };
      }),
      ...membershipItems.map((a) => ({ id: a.id, kind: 'membership' as const, ref: a.applicationNo, title: `Membership · ${a.name}`, subtitle: `${a.designation} · ${w.deptName.get(a.departmentId) ?? ''}`, status: a.status, since: lastEventDate(a.events, a.submittedOn ?? w.today) })),
    ]
      .sort((a, b) => a.since.localeCompare(b.since))
      .slice(0, 6);
    const short = await this.app.collections.repo.shortMembers(lastPosted);
    const shortByDepartment = sheetsFor(lastPosted)
      .map((s) => ({ departmentId: s.departmentId, department: w.deptName.get(s.departmentId) ?? s.departmentId, demand: s.totalDemand, recovered: s.totalRecovered, short: s.totalDemand - s.totalRecovered, shortMembers: short.get(s.id) ?? 0 }))
      .filter((d) => d.short > 0)
      .sort((a, b) => b.short - a.short)
      .slice(0, 6);
    const retiring = w.members
      .filter((m) => m.status === 'ACTIVE' && w.inScope(m.id) && calculateLeftoverService(m.dor, w.today).months <= 6)
      .map((m) => ({ id: m.id, name: m.name, generalNo: m.generalNo, department: w.deptName.get(m.departmentId) ?? '', dor: m.dor, outstanding: sum(loans.filter((l) => l.memberId === m.id && l.status === 'ACTIVE').map((l) => l.outstandingPrincipal)) }))
      .sort((a, b) => a.dor.localeCompare(b.dor));
    return {
      needsAction,
      shortByDepartment,
      retiringSoon: { count: retiring.length, outstanding: sum(retiring.map((r) => r.outstanding)), members: [...retiring].sort((a, b) => b.outstanding - a.outstanding || a.dor.localeCompare(b.dor)).slice(0, 5) },
      asOf: w.today,
      currentCycle: w.cycle,
      lastPostedCycle: lastPosted,
      activeMembers: w.members.filter((m) => m.status === 'ACTIVE' && (!user.departmentId || m.departmentId === user.departmentId)).length,
      activeLoans: active.length,
      loanOutstanding: sum(active.map((l) => l.outstandingPrincipal)),
      depositsHeld: sum(w.deposits.filter((d) => d.status === 'ACTIVE' && w.inScope(d.memberId)).map((d) => d.balance)),
      collectionRate: rate(lastPosted),
      collectionRatePrev: rate(prevPosted),
      pipeline: PIPELINE.map((status) => ({ status, count: loans.filter((l) => l.status === status).length, amount: sum(loans.filter((l) => l.status === status).map((l) => l.appliedAmount)) })),
      myQueue: user.role === 'SUPER_ADMIN' ? 0 : loans.filter((l) => queueStatuses.includes(l.status)).length + membershipItems.length,
      collectionsTrend: posted.slice(-6).map((c) => {
        const s = sheetsFor(c);
        return { cycle: c, demand: sum(s.map((x) => x.totalDemand)), recovered: sum(s.map((x) => x.totalRecovered)) };
      }),
    };
  }

  /** M10 topbar search: members (name, General No., Employee ID, mobile), loans, deposits, joining, receipts. */
  async search(user: SessionUser, query: string): Promise<SearchHit[]> {
    this.staff(user);
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const w = await this.world(user);
    const dept = (id: string) => w.deptName.get(id) ?? '';
    const digits = q.replace(/\D/g, '');
    const hits: SearchHit[] = [];
    if (w.can('members.view'))
      hits.push(
        ...w.members
          .filter((m) => w.inScope(m.id) && (m.name.toLowerCase().includes(q) || m.generalNo === q || m.employeeId.toLowerCase() === q || (digits.length >= 4 && digits === q && m.mobile.endsWith(digits))))
          .slice(0, 6)
          .map((m) => ({ kind: 'member' as const, id: m.id, title: m.name, subtitle: `General No. ${m.generalNo} · ${m.employeeId} · ${dept(m.departmentId)}`, status: m.status, link: `/members/${m.id}` })),
      );
    if (w.can('loans.view'))
      hits.push(
        ...w.loans
          .filter((l) => l.status !== 'DRAFT' && w.inScope(l.memberId) && (l.applicationNo.toLowerCase().includes(q) || (l.loanNo ?? '').toLowerCase().includes(q)))
          .slice(0, 5)
          .map((l) => ({ kind: 'loan' as const, id: l.id, title: l.loanNo ?? l.applicationNo, subtitle: `${w.memberById.get(l.memberId)?.name ?? ''} · ${w.products.find((p) => p.code === l.product)?.name ?? l.product} · ${formatINR(l.sanctionedAmount ?? l.appliedAmount)}`, status: l.status, link: `/loans/${l.id}` })),
      );
    if (w.can('deposits.view'))
      hits.push(
        ...w.deposits
          .filter((x) => w.inScope(x.memberId) && (x.accountNo.toLowerCase().includes(q) || (x.fdrNo ?? '').toLowerCase().includes(q)))
          .slice(0, 5)
          .map((x) => ({ kind: 'deposit' as const, id: x.id, title: x.fdrNo ?? x.accountNo, subtitle: `${w.memberById.get(x.memberId)?.name ?? ''} · ${x.scheme} · ${formatINR(x.principal ?? x.balance)}`, status: x.status, link: `/deposits/${x.id}` })),
      );
    if (w.can('membership.view'))
      hits.push(
        ...w.applications
          .filter((a) => a.status !== 'DRAFT' && (!user.departmentId || a.departmentId === user.departmentId) && (a.applicationNo.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)))
          .slice(0, 4)
          .map((a) => ({ kind: 'application' as const, id: a.id, title: a.name, subtitle: `Joining ${a.applicationNo} · ${dept(a.departmentId)}`, status: a.status, link: `/joining/${a.id}` })),
      );
    if (w.can('collections.view') && /\d/.test(q)) {
      const page = await this.app.collections.repo.receiptPage({ q, ...(user.departmentId ? { scopeDepartmentId: user.departmentId } : {}) }, 0, 20);
      hits.push(
        ...page.items
          .filter((r) => r.receiptNo.toLowerCase().includes(q))
          .slice(0, 4)
          .map((r) => ({ kind: 'receipt' as const, id: r.id, title: r.receiptNo, subtitle: `${w.memberById.get(r.memberId)?.name ?? ''} · ${formatINR(r.amount)} · ${formatDisplayDate(r.date)}`, link: `/payments/${r.id}` })),
      );
    }
    return hits;
  }
}
