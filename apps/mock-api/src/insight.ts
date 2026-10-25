// M9 (D-063): ST-01 role dashboards, ST-03 notifications + simulated message composer + replies to
// member questions (MB-13), ST-50/51 reports, ST-52 defaulter notice. Read models over the store; the
// only writes are notifications, the message log and ticket replies.
import { checkDefaulter, formatCycle, formatDisplayDate, formatINR, fullMonthsBetween } from '@tgs/domain';
import type { AppNotification, ComposeInput, ComposePreview, DefaulterNotice, Member, OutboxMessage, ReportFilterKey, RoleDashboard, SessionUser, StaffNotifications, StaffTicketRow, WorkflowEvent } from '@tgs/types';
import { memberDues } from './collections';
import { audit, can, nowIso, requirePermission, requireStaff, type Api, type Guard } from './common';
import { fail } from './errors';
import { workQueue } from './loan-workflow';
import { REPORTS, reportOptions, runReport } from './reports';
import type { Db, Store } from './store';

const PAY_TO = { accountName: 'TGSECCSL Dues Collection', accountNo: 'XXXXXXXX3307', ifsc: 'DEMO0000929', upi: 'tgseccsl.dues@demo', counter: 'Society cash counter, 2nd Floor, West Ancillary Building' };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function variantOf(user: SessionUser): RoleDashboard['variant'] {
  if (user.role === 'ACCOUNTANT') return 'ACCOUNTANT';
  if (user.role === 'SECRETARY' || user.role === 'PRESIDENT') return 'SIGNER';
  if (user.role === 'CASHIER') return 'CASHIER';
  if (user.role === 'DDO') return 'DDO';
  return 'ADMIN';
}

/** ST-01 role block (docs/04 §5). Built on the Work Queue so the two always agree. */
export function roleDashboard(db: Db, user: SessionUser): RoleDashboard {
  const variant = variantOf(user);
  const wq = workQueue(db, user);
  const today = db.demo.today;
  const month = today.slice(0, 7);
  const memberDept = new Map(db.members.map((m) => [m.id, m.departmentId]));
  const inScope = (memberId: string) => !user.departmentId || memberDept.get(memberId) === user.departmentId;
  const dept = (id: string) => db.departments.find((d) => d.id === id)?.name ?? '';

  const queue = wq.tabs.map((t) => {
    const items = wq.items.filter((i) => i.stage === t.key);
    return { key: t.key, label: t.label, count: t.count, amount: sum(items.map((i) => i.amount ?? 0)), oldestDays: Math.max(0, ...items.map((i) => i.days)), link: `/queue?tab=${t.key}` };
  });
  const waiting = wq.items.length;
  const waitingAmount = sum(wq.items.map((i) => i.amount ?? 0));

  // Events this role did this month, across loans, deposits and memberships.
  type Done = { e: WorkflowEvent; amount: number; id: string };
  const mine = (e: WorkflowEvent) => e.at.slice(0, 7) === month && e.actorRole === user.role;
  const done: Done[] = [
    ...db.loans.filter((l) => inScope(l.memberId)).flatMap((l) => l.events.filter(mine).map((e) => ({ e, id: l.id, amount: l.sanctionedAmount ?? l.appliedAmount }))),
    ...db.deposits.filter((d) => inScope(d.memberId)).flatMap((d) => (d.events ?? []).filter(mine).map((e) => ({ e, id: d.id, amount: d.principal ?? 0 }))),
    ...db.membershipApplications.filter((a) => !user.departmentId || a.departmentId === user.departmentId).flatMap((a) => a.events.filter(mine).map((e) => ({ e, id: a.id, amount: 0 }))),
  ];
  const uniqueDone = [...new Map(done.map((d) => [d.id, d])).values()];

  const disbursedThisMonth = db.loans.filter((l) => l.disbursedOn?.slice(0, 7) === month && inScope(l.memberId));
  const receiptsToday = db.receipts.filter((r) => r.date === today && r.source !== 'SALARY_RECOVERY' && inScope(r.memberId));
  const reportsOpen = db.paymentReports.filter((r) => r.status === 'REPORTED' && inScope(r.memberId));
  const sheetsNow = db.demandSheets.filter((s) => s.cycle === db.currentCycle && (!user.departmentId || s.departmentId === user.departmentId));
  const deptsInScope = user.departmentId ? db.departments.filter((d) => d.id === user.departmentId) : db.departments;
  const posted = [...new Set(db.demandSheets.filter((s) => s.status === 'RECOVERY_POSTED').map((s) => s.cycle))].sort();
  const lastPosted = posted.at(-1);
  const lastSheets = db.demandSheets.filter((s) => s.cycle === lastPosted && (!user.departmentId || s.departmentId === user.departmentId));
  const lastRate = sum(lastSheets.map((s) => s.totalDemand)) ? sum(lastSheets.map((s) => s.totalRecovered)) / sum(lastSheets.map((s) => s.totalDemand)) : 0;

  const demand: RoleDashboard['demand'] = {
    cycle: db.currentCycle,
    byStatus: (['NOT_GENERATED', 'GENERATED', 'CERTIFIED', 'SENT_TO_DDO', 'RECOVERY_POSTED'] as const).map((status) => ({ status, count: status === 'NOT_GENERATED' ? deptsInScope.filter((d) => !sheetsNow.some((s) => s.departmentId === d.id)).length : sheetsNow.filter((s) => s.status === status).length })),
    demand: sum(sheetsNow.map((s) => s.totalDemand)),
    recovered: sum(sheetsNow.map((s) => s.totalRecovered)),
    toPost: sheetsNow.filter((s) => s.status === 'SENT_TO_DDO').length,
  };

  const productName = (code: string) => db.loanProducts.find((p) => p.code === code)?.name ?? code;
  const memberName = (id: string) => db.members.find((m) => m.id === id)?.name ?? '';
  let tiles: RoleDashboard['tiles'] = [];
  let recent: RoleDashboard['recent'] = [];
  let doneBlock: RoleDashboard['done'] = { label: 'Done this month', count: uniqueDone.length, amount: sum(uniqueDone.map((d) => d.amount)) };

  switch (variant) {
    case 'ACCOUNTANT': {
      const appliedThisMonth = db.loans.filter((l) => l.appliedOn.slice(0, 7) === month && l.status !== 'DRAFT');
      tiles = [
        { key: 'waiting', label: 'Waiting on you', value: waiting, format: 'count', sub: n(queue.length, 'stage'), link: '/queue', tone: waiting ? 'warning' : 'success' },
        { key: 'sheets', label: `Demand sheets · ${formatCycle(db.currentCycle)}`, value: sheetsNow.length, format: 'count', sub: `of ${deptsInScope.length} departments generated`, link: `/demand-sheets?cycle=${db.currentCycle}` },
        { key: 'reports', label: 'Reported payments', value: reportsOpen.length, format: 'count', sub: formatINR(sum(reportsOpen.map((r) => r.amount))), link: '/payments?tab=REPORTED', tone: reportsOpen.length ? 'warning' : 'neutral' },
        { key: 'applied', label: 'Applications this month', value: appliedThisMonth.length, format: 'count', sub: formatINR(sum(appliedThisMonth.map((l) => l.appliedAmount))), link: '/loans' },
      ];
      recent = [
        ...db.loans.filter((l) => l.status !== 'DRAFT').map((l) => ({ id: l.id, ref: l.applicationNo, title: memberName(l.memberId), subtitle: productName(l.product), status: l.status, entity: 'loan' as const, amount: l.appliedAmount, at: (l.submittedAt ?? l.appliedOn).slice(0, 10), link: `/loans/${l.id}` })),
        ...db.membershipApplications.filter((a) => a.submittedOn).map((a) => ({ id: a.id, ref: a.applicationNo, title: a.name, subtitle: 'Membership', status: a.status, entity: 'membership' as const, at: a.submittedOn!, link: `/joining/${a.id}` })),
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
          const l = db.loans.find((x) => x.id === d.id);
          const dep = l ? undefined : db.deposits.find((x) => x.id === d.id);
          const app = l || dep ? undefined : db.membershipApplications.find((x) => x.id === d.id);
          if (l) return { id: l.id, ref: l.applicationNo, title: memberName(l.memberId), subtitle: `${productName(l.product)} · ${d.e.action}`, status: l.status, entity: 'loan' as const, amount: d.amount, at: d.e.at.slice(0, 10), link: `/loans/${l.id}` };
          if (dep) return { id: dep.id, ref: dep.fdrNo ?? dep.accountNo, title: memberName(dep.memberId), subtitle: `Fixed deposit · ${d.e.action}`, status: dep.status, entity: 'deposit' as const, amount: d.amount, at: d.e.at.slice(0, 10), link: `/deposits/${dep.id}` };
          return { id: app!.id, ref: app!.applicationNo, title: app!.name, subtitle: `Membership · ${d.e.action}`, status: app!.status, entity: 'membership' as const, at: d.e.at.slice(0, 10), link: `/joining/${app!.id}` };
        });
      doneBlock = { label: 'Signed this month', count: uniqueDone.length, amount: sum(uniqueDone.map((d) => d.amount)) };
      break;
    }
    case 'CASHIER': {
      const toPay = wq.items.filter((i) => i.stage === 'SANCTIONED');
      tiles = [
        { key: 'toPay', label: 'Awaiting disbursement', value: toPay.length, format: 'count', sub: formatINR(sum(toPay.map((i) => i.amount ?? 0))), link: '/queue?tab=SANCTIONED', tone: toPay.length ? 'warning' : 'success' },
        { key: 'paid', label: 'Disbursed this month', value: sum(disbursedThisMonth.map((l) => l.netDisbursable ?? l.sanctionedAmount ?? 0)), format: 'money', sub: n(disbursedThisMonth.length, 'loan') },
        { key: 'today', label: 'Counter receipts today', value: sum(receiptsToday.map((r) => r.amount)), format: 'money', sub: n(receiptsToday.length, 'receipt'), link: '/payments?tab=COUNTER' },
        { key: 'reports', label: 'Payments to verify', value: reportsOpen.length, format: 'count', sub: formatINR(sum(reportsOpen.map((r) => r.amount))), link: '/payments?tab=REPORTED', tone: reportsOpen.length ? 'warning' : 'neutral' },
      ];
      recent = disbursedThisMonth
        .concat(db.loans.filter((l) => l.disbursedOn && l.disbursedOn.slice(0, 7) !== month && inScope(l.memberId)))
        .sort((a, b) => b.disbursedOn!.localeCompare(a.disbursedOn!))
        .slice(0, 6)
        .map((l) => ({ id: l.id, ref: l.loanNo ?? l.applicationNo, title: memberName(l.memberId), subtitle: productName(l.product), status: l.status, entity: 'loan' as const, amount: l.netDisbursable ?? l.sanctionedAmount ?? l.appliedAmount, at: l.disbursedOn!, link: `/loans/${l.id}` }));
      doneBlock = { label: 'Disbursed this month', count: disbursedThisMonth.length, amount: sum(disbursedThisMonth.map((l) => l.netDisbursable ?? l.sanctionedAmount ?? 0)) };
      break;
    }
    case 'DDO': {
      const members = db.members.filter((m) => m.status === 'ACTIVE' && m.departmentId === user.departmentId).length;
      tiles = [
        { key: 'waiting', label: 'Pending validations', value: waiting, format: 'count', sub: queue.map((q) => `${q.count} ${q.label.toLowerCase()}`).join(' · ') || 'Nothing waiting', link: '/queue', tone: waiting ? 'warning' : 'success' },
        { key: 'members', label: 'Members in your department', value: members, format: 'count', sub: 'Active, contributing', link: '/members' },
        { key: 'demand', label: `Demand · ${formatCycle(db.currentCycle)}`, value: demand.demand, format: 'money', sub: sheetsNow[0] ? `Sheet ${sheetsNow[0].status === 'SENT_TO_DDO' ? 'sent to you' : sheetsNow[0].status.toLowerCase().replace(/_/g, ' ')}` : 'Not generated yet', link: sheetsNow[0] ? `/demand-sheets/${sheetsNow[0].id}` : '/demand-sheets' },
        { key: 'rate', label: lastPosted ? `Recovered · ${formatCycle(lastPosted)}` : 'Recovered', value: lastRate, format: 'percent', sub: lastSheets[0] ? `${formatINR(lastSheets[0].totalRecovered)} of ${formatINR(lastSheets[0].totalDemand)}` : undefined, tone: lastRate >= 0.98 ? 'success' : 'warning' },
      ];
      recent = wq.items.slice(0, 6).map((i) => ({ id: i.id, ref: i.ref, title: i.title, subtitle: i.subtitle, ...(i.status ? { status: i.status } : {}), entity: i.kind === 'membership' ? ('membership' as const) : ('loan' as const), ...(i.amount ? { amount: i.amount } : {}), at: i.since, link: i.link }));
      doneBlock = { label: 'Certified this month', count: uniqueDone.length, amount: sum(uniqueDone.map((d) => d.amount)) };
      break;
    }
    default: {
      tiles = [
        { key: 'waiting', label: 'In flight', value: waiting, format: 'count', link: '/queue' },
        { key: 'paid', label: 'Disbursed this month', value: sum(disbursedThisMonth.map((l) => l.netDisbursable ?? l.sanctionedAmount ?? 0)), format: 'money', sub: n(disbursedThisMonth.length, 'loan') },
      ];
      doneBlock = { label: 'Disbursed this month', count: disbursedThisMonth.length, amount: sum(disbursedThisMonth.map((l) => l.netDisbursable ?? l.sanctionedAmount ?? 0)) };
    }
  }

  return {
    variant,
    asOf: today,
    currentCycle: db.currentCycle,
    scope: user.departmentId ? { departmentName: dept(user.departmentId) } : {},
    tiles,
    queue,
    oldest: wq.items.slice(0, 6),
    done: doneBlock,
    ...(variant === 'ACCOUNTANT' || variant === 'DDO' ? { demand } : {}),
    recent,
  };
}

// ---- composer --------------------------------------------------------------------------------

function audienceMembers(db: Db, input: ComposeInput): { members: Member[]; label: string } {
  const a = input.audience;
  const active = db.members.filter((m) => m.status === 'ACTIVE');
  switch (a?.kind) {
    case 'MEMBER': {
      const m = db.members.find((x) => x.id === a.memberId) ?? fail('VALIDATION_ERROR', 'Choose a member.', { fieldErrors: { audience: 'Choose a member' } });
      return { members: [m], label: `${m.name} (${m.generalNo})` };
    }
    case 'DEPARTMENT': {
      const d = db.departments.find((x) => x.id === a.departmentId) ?? fail('VALIDATION_ERROR', 'Choose a department.', { fieldErrors: { audience: 'Choose a department' } });
      return { members: active.filter((m) => m.departmentId === d.id), label: `All members · ${d.name}` };
    }
    case 'DEFAULTERS': {
      const r = runReport(db, 'defaulters', {});
      const nos = new Set(r.groups.flatMap((g) => g.rows.map((x) => String(x.generalNo))));
      return { members: active.filter((m) => nos.has(m.generalNo)), label: `All defaulters (${db.settings.defaulterCycles}+ cycles short)` };
    }
    case 'RETIRING': {
      const n = Math.max(1, Math.min(24, a.withinMonths || 6));
      return { members: active.filter((m) => m.dor >= db.demo.today && fullMonthsBetween(db.demo.today, m.dor) < n), label: `Retiring within ${n} months` };
    }
    default:
      return fail('VALIDATION_ERROR', 'Choose who receives it.', { fieldErrors: { audience: 'Choose who receives it' } });
  }
}

function varsFor(db: Db, m: Member): Record<string, string> {
  const dues = memberDues(db, m.id);
  return {
    name: m.name,
    generalNo: m.generalNo,
    department: db.departments.find((d) => d.id === m.departmentId)?.name ?? '',
    overdue: formatINR(dues.totalArrears + dues.shareCapitalDue),
    cycle: formatCycle(db.currentCycle),
    dor: formatDisplayDate(m.dor),
  };
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

function validateCompose(input: ComposeInput): void {
  const fieldErrors: Record<string, string> = {};
  if (!['SMS', 'WHATSAPP', 'EMAIL'].includes(input.channel)) fieldErrors.channel = 'Choose SMS, WhatsApp or Email';
  if (input.channel === 'EMAIL' && !input.title?.trim()) fieldErrors.title = 'Add a subject';
  if (!input.body?.trim() || input.body.trim().length < 10) fieldErrors.body = 'Write the message (at least 10 characters)';
  if (input.channel === 'SMS' && input.body.length > 480) fieldErrors.body = 'SMS is limited to 480 characters (3 parts)';
  if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
}

function previewOf(db: Db, input: ComposeInput): ComposePreview & { send: Member[] } {
  validateCompose(input);
  const { members, label } = audienceMembers(db, input);
  const send = input.channel === 'EMAIL' ? members.filter((m) => m.email) : members;
  return {
    recipients: send.length,
    audienceLabel: label,
    skipped: members.length - send.length,
    sample: send.slice(0, 3).map((m) => {
      const v = varsFor(db, m);
      return { memberId: m.id, name: m.name, generalNo: m.generalNo, to: input.channel === 'EMAIL' ? m.email! : m.mobileMasked, title: fill(input.title || 'Message from the society', v), body: fill(input.body, v) };
    }),
    send,
  };
}

// ---- defaulter notice ------------------------------------------------------------------------

export function defaulterNotice(db: Db, memberId: string): DefaulterNotice {
  const m = db.members.find((x) => x.id === memberId || x.generalNo === memberId) ?? fail('NOT_FOUND', 'Member not found.');
  const history: Array<{ cycle: string; demand: number; recovered: number }> = [];
  for (const sh of [...db.demandSheets].filter((s) => s.status === 'RECOVERY_POSTED').sort((a, b) => a.cycle.localeCompare(b.cycle))) {
    const line = sh.lines.find((l) => l.memberId === m.id);
    if (line) history.push({ cycle: sh.cycle, demand: line.totalDemand, recovered: sum(line.components.map((c) => c.allocated)) });
  }
  const r = checkDefaulter(history, db.settings.defaulterCycles);
  const rows = history.filter((h) => h.recovered < h.demand).map((h) => ({ ...h, unpaid: h.demand - h.recovered }));
  const total = sum(rows.map((x) => x.unpaid));
  const t = db.notificationTemplates.find((x) => x.key === 'defaulter.notice');
  const v = { ...varsFor(db, m), overdue: formatINR(total), cycles: String(rows.length) };
  return {
    member: { id: m.id, name: m.name, generalNo: m.generalNo, designation: m.designation, departmentName: db.departments.find((d) => d.id === m.departmentId)?.name ?? '', address: m.presentAddress },
    asOf: db.demo.today,
    refNo: `TGSECCSL/DN/${m.generalNo}/${db.demo.today.slice(0, 7).replace('-', '')}`,
    rows,
    totalUnpaid: total,
    consecutiveShort: r.consecutiveShort,
    defaulterCycles: db.settings.defaulterCycles,
    isDefaulter: !r.pass,
    text: {
      greeting: `Dear ${m.name},`,
      body: fill(t?.body ?? 'Our records show that {overdue} due to the society from your salary deductions has not been recovered in full for {cycles} month(s), as detailed below. Please pay this amount at the society counter or by bank transfer within 15 days of this notice, and report the payment in the member app. If the amount is not paid, the society will recover it from your salary and, where applicable, from your sureties as per the bye-laws and your agreement with the society.', v),
      closing: 'If you have already paid, please ignore this notice and share the receipt or payment reference with the society office.',
    },
    payTo: PAY_TO,
  };
}

// ---- routes ------------------------------------------------------------------------------------

export function registerInsight(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const staff = (user: SessionUser) => (requireStaff(user), user);

  api.get('/dashboard/role', requireSession, (c) => c.json<RoleDashboard>(roleDashboard(db(), staff(c.get('session')))));

  // ST-50 / ST-51
  api.get('/reports', requireSession, (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'reports.view', 'Reports are not available for your role.');
    return c.json({ reports: REPORTS, options: reportOptions(db()) });
  });
  api.get('/reports/:id', requireSession, (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'reports.view', 'Reports are not available for your role.');
    const q = c.req.query();
    const params: Partial<Record<ReportFilterKey, string>> = {};
    for (const k of ['cycle', 'departmentId', 'minCycles', 'from', 'to', 'scheme', 'memberId', 'product', 'withinMonths'] as const) if (q[k]) params[k] = q[k];
    const result = runReport(db(), c.req.param('id'), params, user.departmentId);
    audit(store, user, 'report', c.req.param('id'), 'run', `Ran ${result.def.title} (${result.rowCount} rows)`);
    return c.json(result);
  });
  api.get('/print/defaulter-notice/:memberId', requireSession, (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'reports.view', 'Reports are not available for your role.');
    return c.json<DefaulterNotice>(defaulterNotice(db(), c.req.param('memberId')));
  });

  // ST-03 notifications for the signed-in staff user
  api.get('/notifications', requireSession, (c) => {
    const user = staff(c.get('session'));
    const items = db().notifications.filter((n) => n.recipientId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return c.json<StaffNotifications>({ items: items.slice(0, 100), unread: items.filter((n) => !n.read).length });
  });
  api.post('/notifications/read-all', requireSession, (c) => {
    const user = staff(c.get('session'));
    for (const n of db().notifications) if (n.recipientId === user.id) n.read = true;
    store.save();
    return c.json({ ok: true as const });
  });
  api.post('/notifications/:id/read', requireSession, (c) => {
    const user = staff(c.get('session'));
    const n = db().notifications.find((x) => x.id === c.req.param('id') && x.recipientId === user.id) ?? fail('NOT_FOUND', 'Notification not found.');
    n.read = true;
    store.save();
    return c.json({ ok: true as const });
  });

  // ST-03 composer (simulated delivery)
  api.get('/messages', requireSession, (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant send messages.');
    return c.json<OutboxMessage[]>(db().messageLog.slice(0, 100));
  });
  api.post('/messages/preview', requireSession, async (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant send messages.');
    const { send: _send, ...p } = previewOf(db(), await c.req.json<ComposeInput>());
    return c.json<ComposePreview>(p);
  });
  api.post('/messages', requireSession, async (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant send messages.');
    const input = await c.req.json<ComposeInput>();
    const p = previewOf(db(), input);
    if (!p.recipients) fail('VALIDATION_ERROR', 'Nobody to send to.', { fieldErrors: { audience: p.skipped ? 'None of these members has an email on file' : 'No members match' } });
    const at = nowIso();
    for (const m of p.send) {
      const v = varsFor(db(), m);
      const n: AppNotification & { alsoSentVia?: string[] } = { id: `ntf-msg-${db().notifications.length + 1}-${Date.now().toString(36)}`, recipientId: m.id, title: fill(input.title || 'Message from the society', v), body: fill(input.body, v), channel: 'IN_APP', createdAt: at, read: false, alsoSentVia: [input.channel] };
      db().notifications.unshift(n);
    }
    const msg: OutboxMessage = { id: `msg-${db().messageLog.length + 1}-${Date.now().toString(36)}`, at, byId: user.id, byName: user.name, channel: input.channel, audienceLabel: p.audienceLabel, recipients: p.recipients, skipped: p.skipped, title: input.title || 'Message from the society', body: input.body, ...(input.templateKey ? { templateKey: input.templateKey } : {}), status: 'DELIVERED_SIMULATED' };
    db().messageLog.unshift(msg);
    audit(store, user, 'message', msg.id, 'send', `${input.channel} to ${p.audienceLabel} (${p.recipients})`);
    store.save();
    return c.json<OutboxMessage>(msg, 201);
  });

  // ST-03 member questions (MB-13)
  api.get('/support/tickets', requireSession, (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'support.reply', 'Member questions are answered by the Accountant and the Super Admin.');
    const rows: StaffTicketRow[] = db()
      .supportTickets.map((t) => {
        const m = db().members.find((x) => x.id === t.memberId);
        return { ...t, member: { id: t.memberId, name: m?.name ?? '', generalNo: m?.generalNo ?? '', departmentName: db().departments.find((d) => d.id === m?.departmentId)?.name ?? '' } };
      })
      .sort((a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
    return c.json(rows);
  });
  api.post('/support/tickets/:id/reply', requireSession, async (c) => {
    const user = staff(c.get('session'));
    requirePermission(user, 'support.reply', 'Member questions are answered by the Accountant and the Super Admin.');
    const t = db().supportTickets.find((x) => x.id === c.req.param('id')) ?? fail('NOT_FOUND', 'Question not found.');
    const { text = '', close = false } = await c.req.json<{ text?: string; close?: boolean }>().catch(() => ({}) as { text?: string; close?: boolean });
    if (t.status === 'CLOSED') fail('INVALID_TRANSITION', 'This question is closed.');
    if (!close && text.trim().length < 5) fail('VALIDATION_ERROR', 'Write a reply.', { fieldErrors: { text: 'Write a reply (at least 5 characters)' } });
    const at = nowIso();
    if (text.trim()) (t.messages ??= []).push({ from: 'OFFICE', byName: `${user.name} (society office)`, at, text: text.trim() });
    t.status = close ? 'CLOSED' : 'ANSWERED';
    t.updatedAt = at;
    if (text.trim()) db().notifications.unshift({ id: `ntf-tkt-${db().notifications.length + 1}-${Date.now().toString(36)}`, recipientId: t.memberId, title: 'Reply from the society office', body: `${t.subject}: ${text.trim().slice(0, 120)}`, channel: 'IN_APP', createdAt: at, read: false, link: '/account/help' });
    audit(store, user, 'ticket', t.id, close ? 'close' : 'reply', `${close ? 'Closed' : 'Replied to'} "${t.subject}"`);
    store.save();
    return c.json(t);
  });

  /** Unread staff notifications + open questions, for the topbar bell. */
  api.get('/notifications/count', requireSession, (c) => {
    const user = staff(c.get('session'));
    const unread = db().notifications.filter((n) => n.recipientId === user.id && !n.read).length;
    const openQuestions = can(user, 'support.reply') ? db().supportTickets.filter((t) => t.status === 'OPEN').length : 0;
    return c.json({ unread, openQuestions });
  });
}
