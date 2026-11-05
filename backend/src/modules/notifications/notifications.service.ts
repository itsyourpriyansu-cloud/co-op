import { randomUUID } from 'node:crypto';
import { calculateLeftoverService, formatCycle, formatDisplayDate, formatINR, fullMonthsBetween } from '@tgs/domain';
import type {
  ComposeInput,
  ComposePreview,
  DeliveryStatus,
  Member,
  MemberHome,
  MemberPreferences,
  MessageChannel,
  MyNotifications,
  OutboxMessage,
  SessionUser,
  StaffNotifications,
  StaffTicketRow,
  SupportCenter,
  SupportTicket,
} from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessCycle, businessNow, businessToday } from '../../common/utils/business-date';
import { createSenders, type MessageSender } from '../../integrations/messaging';
import type { NotificationsRepository, StoredNotification } from './notifications.repository';

type Via = Partial<Record<MessageChannel, DeliveryStatus>>;
type Vars = Record<string, string | number>;

const OFFICE: SupportCenter['office'] = {
  name: 'TGSECCSL Society Office',
  address: '2nd Floor, West Ancillary Building, Dr. B.R Ambedkar Telangana Secretariat, Hyderabad-500004',
  phone: '040-2345 0929',
  email: 'office@tgseccsl.example.org',
  whatsapp: '+91 90000 00929',
  hours: 'Mon–Sat, 10:30 am – 5:00 pm (closed on 2nd Saturday and public holidays)',
};

const FAQS: SupportCenter['faqs'] = [
  { topic: 'Loans', q: 'How much can I borrow?', a: 'It depends on the loan, your salary and your remaining service: the loan must end before you retire (BR-002). The Apply screen shows your limit as you type.' },
  { topic: 'Loans', q: 'Why does my surety have to confirm?', a: 'A surety promises to repay if you cannot. They confirm their details and sign with an OTP in their own app before the office reviews your loan.' },
  { topic: 'Loans', q: 'What is a top-up?', a: 'A new, bigger loan that first pays off what you still owe on your running loan (with interest up to today). You receive the rest.' },
  { topic: 'Payments', q: 'Why was my deduction short?', a: 'Your department deducts what your salary allows. A short amount is applied in the society order (RRF, insurance, CRD, interest, principal) and the rest stays unpaid. Pay it at the counter or by bank and report it.' },
  { topic: 'Payments', q: 'I paid by UPI. What now?', a: 'Report the payment from Payments → Report with the UTR number. The cashier matches it with the bank statement and you get a receipt.' },
  { topic: 'Deposits', q: 'When does my FD start earning interest?', a: 'From the day the society receives your money. You get the FD receipt (FDR) when the Secretary and the President accept it.' },
  { topic: 'Deposits', q: 'Can I borrow against my FD?', a: 'Yes. Open the FD and choose "Take a loan against this FD": you can borrow up to 90% of it without breaking it.' },
  { topic: 'Account', q: 'How do I sign in?', a: 'With the mobile number registered with the society. We send a one-time code to it; there is no password to remember (D-067).' },
];

const CATEGORIES: NonNullable<SupportTicket['category']>[] = ['LOAN', 'DEPOSIT', 'PAYMENT', 'PROFILE', 'APP', 'OTHER'];
const fill = (s: string, vars: Vars) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

/**
 * P8a (docs/22 §5.7): in-app notifications, delivery on the other channels through
 * integrations/messaging, the ST-03 composer, member questions (MB-13), preferences (MB-14) and
 * the member home (MB-01).
 */
export class NotificationsService {
  readonly senders: Record<MessageChannel, MessageSender>;

  constructor(
    private readonly app: FastifyInstance,
    readonly repo: NotificationsRepository,
  ) {
    this.senders = createSenders(app.log, app.env);
  }

  // ---- sending ----

  /**
   * An in-app notification by template (ST-63) to a member or staff user; a member also gets it on
   * each other channel of the template they switched on (MB-14). Undefined when the template is missing.
   */
  async notify(recipientId: string, templateKey: string, vars: Vars, link?: string): Promise<{ id: string; via: Via } | undefined> {
    const t = (await this.app.masters.templates()).find((x) => x.key === templateKey);
    if (!t) return undefined;
    const n: StoredNotification = { id: newId('ntf'), recipientId, title: fill(t.title, vars), body: fill(t.body, vars), channel: 'IN_APP', createdAt: await businessNow(this.app), read: false, ...(link ? { link } : {}), via: {} };
    await this.repo.insert(n, templateKey);
    const member = await this.app.members.byId(recipientId);
    if (member) {
      const on = (await this.preferencesOf(member)).channels;
      n.via = await this.deliver(member, t.channels.filter((c): c is MessageChannel => (c === 'WHATSAPP' || c === 'EMAIL') && on[c]), n.title, n.body, { notificationId: n.id });
      if (Object.keys(n.via).length) await this.repo.setVia(n.id, n.via);
    }
    return { id: n.id, via: n.via };
  }

  /** Sends one message per channel and records each provider answer; a channel without an address is skipped. */
  private async deliver(m: Member, channels: MessageChannel[], title: string, body: string, ref: { notificationId?: string; messageId?: string }): Promise<Via> {
    const via: Via = {};
    for (const channel of channels) {
      const to = channel === 'EMAIL' ? m.email : m.mobile;
      if (!to) continue;
      const res = await this.senders[channel].send({ channel, to, title, body }).catch((err: Error) => ({ status: 'FAILED' as const, provider: 'unknown', error: err.message }));
      await this.repo.insertDelivery({ id: newId('dlv'), notificationId: ref.notificationId ?? null, messageId: ref.messageId ?? null, recipientId: m.id, channel, to, status: res.status, provider: res.provider, error: res.error ?? null });
      via[channel] = res.status;
    }
    return via;
  }

  // ---- staff ST-03 ----

  private staff(user: SessionUser): SessionUser {
    if (user.role === 'MEMBER' || user.role === 'APPLICANT') fail('FORBIDDEN', 'Staff only.');
    return user;
  }

  private async requirePermission(user: SessionUser, permission: 'messages.send' | 'support.reply', message: string) {
    if (!(await this.app.permissions.has(this.staff(user).role, permission))) fail('FORBIDDEN', message);
  }

  async staffList(user: SessionUser): Promise<StaffNotifications> {
    const items = await this.repo.of(this.staff(user).id);
    return { items: items.map(({ via: _v, ...n }) => n), unread: await this.repo.unread(user.id) };
  }

  async count(user: SessionUser): Promise<{ unread: number; openQuestions: number }> {
    const canReply = await this.app.permissions.has(this.staff(user).role, 'support.reply');
    return { unread: await this.repo.unread(user.id), openQuestions: canReply ? await this.repo.openTickets() : 0 };
  }

  async markRead(user: SessionUser, id?: string): Promise<{ ok: true }> {
    if (!(await this.repo.markRead(user.id, id))) fail('NOT_FOUND', 'Notification not found.');
    return { ok: true };
  }

  // ---- composer ----

  private async audience(input: ComposeInput): Promise<{ members: Member[]; label: string }> {
    const a = input.audience;
    const all = await this.app.members.all();
    const active = all.filter((m) => m.status === 'ACTIVE');
    switch (a?.kind) {
      case 'MEMBER': {
        const m = all.find((x) => x.id === a.memberId) ?? fail('VALIDATION_ERROR', 'Choose a member.', { fieldErrors: { audience: 'Choose a member' } });
        return { members: [m], label: `${m.name} (${m.generalNo})` };
      }
      case 'DEPARTMENT': {
        const d = (await this.app.departments.get(a.departmentId)) ?? fail('VALIDATION_ERROR', 'Choose a department.', { fieldErrors: { audience: 'Choose a department' } });
        return { members: active.filter((m) => m.departmentId === d.id), label: `All members · ${d.name}` };
      }
      case 'DEFAULTERS': {
        const [ids, settings] = await Promise.all([this.app.collections.defaulterIds(), this.app.masters.settings()]);
        return { members: active.filter((m) => ids.has(m.id)), label: `All defaulters (${settings.defaulterCycles}+ cycles short)` };
      }
      case 'RETIRING': {
        const n = Math.max(1, Math.min(24, a.withinMonths || 6));
        const today = await businessToday(this.app);
        return { members: active.filter((m) => m.dor >= today && fullMonthsBetween(today, m.dor) < n), label: `Retiring within ${n} months` };
      }
      default:
        return fail('VALIDATION_ERROR', 'Choose who receives it.', { fieldErrors: { audience: 'Choose who receives it' } });
    }
  }

  private async varsFor(members: Member[]): Promise<Map<string, Vars>> {
    const [dues, depts, cycle] = await Promise.all([this.app.collections.duesOf(members.map((m) => m.id)), this.app.departments.all(), businessCycle(this.app)]);
    return new Map(
      members.map((m) => {
        const d = dues.get(m.id);
        return [m.id, { name: m.name, generalNo: m.generalNo, department: depts.find((x) => x.id === m.departmentId)?.name ?? '', overdue: formatINR((d?.totalArrears ?? 0) + (d?.shareCapitalDue ?? 0)), cycle: formatCycle(cycle), dor: formatDisplayDate(m.dor) }];
      }),
    );
  }

  private async compose(input: ComposeInput): Promise<ComposePreview & { send: Member[] }> {
    const fieldErrors: Record<string, string> = {};
    if (!['WHATSAPP', 'EMAIL'].includes(input?.channel)) fieldErrors.channel = 'Choose WhatsApp or Email';
    if (input?.channel === 'EMAIL' && !input.title?.trim()) fieldErrors.title = 'Add a subject';
    if (!input?.body?.trim() || input.body.trim().length < 10) fieldErrors.body = 'Write the message (at least 10 characters)';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const { members, label } = await this.audience(input);
    const send = input.channel === 'EMAIL' ? members.filter((m) => m.email) : members;
    const vars = await this.varsFor(send.slice(0, 3));
    return {
      recipients: send.length,
      audienceLabel: label,
      skipped: members.length - send.length,
      sample: send.slice(0, 3).map((m) => ({ memberId: m.id, name: m.name, generalNo: m.generalNo, to: input.channel === 'EMAIL' ? m.email! : m.mobileMasked, title: fill(input.title || 'Message from the society', vars.get(m.id)!), body: fill(input.body, vars.get(m.id)!) })),
      send,
    };
  }

  async messages(user: SessionUser): Promise<OutboxMessage[]> {
    await this.requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant send messages.');
    return this.repo.messages();
  }

  async preview(user: SessionUser, input: ComposeInput): Promise<ComposePreview> {
    await this.requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant send messages.');
    const { send: _s, ...p } = await this.compose(input);
    return p;
  }

  /** Every recipient gets it in the app and on the chosen channel (a staff broadcast, so MB-14 does not apply). */
  async send(request: FastifyRequest, input: ComposeInput): Promise<OutboxMessage> {
    const user = sessionOf(request);
    await this.requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant send messages.');
    const p = await this.compose(input);
    if (!p.recipients) fail('VALIDATION_ERROR', 'Nobody to send to.', { fieldErrors: { audience: p.skipped ? 'None of these members has an email on file' : 'No members match' } });
    const at = await businessNow(this.app);
    const msg: OutboxMessage = { id: newId('msg'), at, byId: user.id, byName: user.name, channel: input.channel, audienceLabel: p.audienceLabel, recipients: p.recipients, skipped: p.skipped, title: input.title || 'Message from the society', body: input.body, ...(input.templateKey ? { templateKey: input.templateKey } : {}), status: 'DELIVERED_SIMULATED' };
    await this.repo.insertMessage(msg);
    const vars = await this.varsFor(p.send);
    for (const m of p.send) {
      const v = vars.get(m.id)!;
      const n: StoredNotification = { id: newId('ntf'), recipientId: m.id, title: fill(msg.title, v), body: fill(input.body, v), channel: 'IN_APP', createdAt: at, read: false, via: {} };
      await this.repo.insert(n, input.templateKey);
      n.via = await this.deliver(m, [input.channel], n.title, n.body, { notificationId: n.id, messageId: msg.id });
      await this.repo.setVia(n.id, n.via);
    }
    await this.app.audit.record(request, { action: 'send', entity: 'message', entityId: msg.id, summary: `${input.channel} to ${p.audienceLabel} (${p.recipients})` });
    return msg;
  }

  // ---- member questions (MB-13) ----

  async staffTickets(user: SessionUser): Promise<StaffTicketRow[]> {
    await this.requirePermission(user, 'support.reply', 'Member questions are answered by the Accountant and the Super Admin.');
    const [tickets, members, depts] = await Promise.all([this.repo.tickets(), this.app.members.all(), this.app.departments.all()]);
    const byId = new Map(members.map((m) => [m.id, m]));
    return tickets
      .map((t) => {
        const m = byId.get(t.memberId);
        return { ...t, member: { id: t.memberId, name: m?.name ?? '', generalNo: m?.generalNo ?? '', departmentName: depts.find((d) => d.id === m?.departmentId)?.name ?? '' } };
      })
      .sort((a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }

  async reply(request: FastifyRequest, id: string, body: { text?: string; close?: boolean }): Promise<SupportTicket> {
    const user = sessionOf(request);
    await this.requirePermission(user, 'support.reply', 'Member questions are answered by the Accountant and the Super Admin.');
    const t = (await this.repo.ticket(id)) ?? fail('NOT_FOUND', 'Question not found.');
    const text = (body.text ?? '').trim();
    const close = Boolean(body.close);
    if (t.status === 'CLOSED') fail('INVALID_TRANSITION', 'This question is closed.');
    if (!close && text.length < 5) fail('VALIDATION_ERROR', 'Write a reply.', { fieldErrors: { text: 'Write a reply (at least 5 characters)' } });
    const at = await businessNow(this.app);
    if (text) (t.messages ??= []).push({ from: 'OFFICE', byName: `${user.name} (society office)`, at, text });
    t.status = close ? 'CLOSED' : 'ANSWERED';
    t.updatedAt = at;
    await this.repo.saveTicket(t);
    if (text) await this.repo.insert({ id: newId('ntf'), recipientId: t.memberId, title: 'Reply from the society office', body: `${t.subject}: ${text.slice(0, 120)}`, channel: 'IN_APP', createdAt: at, read: false, link: '/account/help', via: {} });
    await this.app.audit.record(request, { action: close ? 'close' : 'reply', entity: 'ticket', entityId: t.id, summary: `${close ? 'Closed' : 'Replied to'} "${t.subject}"` });
    return t;
  }

  // ---- member app ----

  async preferencesOf(m: Member): Promise<MemberPreferences> {
    return (await this.repo.preferences(m.id)) ?? { channels: { WHATSAPP: true, EMAIL: Boolean(m.email) }, language: 'en', ...(m.email ? { email: m.email } : {}) };
  }

  async myNotifications(user: SessionUser): Promise<MyNotifications> {
    const m = await this.app.members.mine(user);
    const items = await this.repo.of(m.id);
    return { items: items.map(({ via, ...n }) => ({ ...n, alsoSentVia: Object.keys(via) as MessageChannel[] })), unread: await this.repo.unread(m.id) };
  }

  async myMarkRead(user: SessionUser, id?: string): Promise<{ ok: true }> {
    const m = await this.app.members.mine(user);
    if (!(await this.repo.markRead(m.id, id))) fail('NOT_FOUND', 'Notification not found.');
    return { ok: true };
  }

  async myPreferences(user: SessionUser): Promise<MemberPreferences> {
    return this.preferencesOf(await this.app.members.mine(user));
  }

  async savePreferences(user: SessionUser, body: Partial<MemberPreferences>): Promise<MemberPreferences> {
    const m = await this.app.members.mine(user);
    const now = await this.preferencesOf(m);
    const next: MemberPreferences = { ...now, ...(body?.channels ? { channels: { ...now.channels, ...body.channels } } : {}), language: 'en' };
    if (next.channels.EMAIL && !m.email) fail('VALIDATION_ERROR', 'Add an email to your profile first.', { fieldErrors: { EMAIL: 'No email on your profile. Add one from Profile → Edit.' } });
    await this.repo.savePreferences(m.id, next);
    return next;
  }

  async support(user: SessionUser): Promise<SupportCenter> {
    const m = await this.app.members.mine(user);
    return { office: OFFICE, faqs: FAQS, tickets: await this.repo.tickets(m.id) };
  }

  async ask(request: FastifyRequest, body: { subject?: string; message?: string; category?: SupportTicket['category'] }): Promise<SupportTicket> {
    const m = await this.app.members.mine(sessionOf(request));
    const subject = (body?.subject ?? '').trim();
    const message = (body?.message ?? '').trim();
    const fieldErrors: Record<string, string> = {};
    if (subject.length < 5) fieldErrors.subject = 'Add a short subject (at least 5 characters)';
    if (message.length < 10) fieldErrors.message = 'Tell us a little more (at least 10 characters)';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const at = await businessNow(this.app);
    const t: SupportTicket = {
      id: newId('tkt'),
      memberId: m.id,
      subject,
      status: 'OPEN',
      createdAt: at,
      updatedAt: at,
      category: CATEGORIES.includes(body?.category!) ? body.category! : 'OTHER',
      messages: [
        { from: 'MEMBER', byName: m.name, at, text: message },
        { from: 'OFFICE', byName: 'Society office (auto-reply)', at, text: 'Thank you. We have received your query and will reply within two working days.' },
      ],
    };
    await this.repo.saveTicket(t, true);
    await this.app.audit.record(request, { action: 'create', entity: 'ticket', entityId: t.id, summary: `${m.name}: ${t.subject}` });
    return t;
  }

  /** MB-01: everything on the member's home screen, with the actions waiting for them. */
  async home(user: SessionUser): Promise<MemberHome> {
    const m = await this.app.members.mine(user);
    const [today, cycle, share, deps, myLoans, suretyLoans, products, depts, dues, lines, unread] = await Promise.all([
      businessToday(this.app),
      businessCycle(this.app),
      this.app.collections.repo.share(m.id),
      this.app.deposits.repo.forMember(m.id),
      this.app.loans.repo.forMember(m.id),
      this.app.loans.repo.asSurety(m.id),
      this.app.masters.loanProducts(),
      this.app.departments.all(),
      this.app.collections.duesOf([m.id]),
      this.app.collections.repo.linesOfMember(m.id),
      this.repo.unread(m.id),
    ]);
    const leftover = calculateLeftoverService(m.dor, today);
    const fds = deps.filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE');
    const bal = (scheme: string) => deps.filter((d) => d.scheme === scheme && d.status === 'ACTIVE').reduce((s, d) => s + d.balance, 0);
    const fd = fds.reduce((s, d) => s + (d.principal ?? 0), 0);
    const next = fds.filter((d) => d.maturityDate).sort((a, b) => a.maturityDate!.localeCompare(b.maturityDate!))[0];
    const productName = (code: string) => products.find((p) => p.code === code)?.name ?? code;
    const loans = myLoans
      .filter((l) => l.status === 'ACTIVE')
      .map((l) => {
        const due = l.schedule.find((r) => r.dueCycle >= cycle && r.paidStatus !== 'PAID');
        return { id: l.id, productName: productName(l.product), loanNo: l.loanNo ?? l.applicationNo, outstanding: l.outstandingPrincipal, ...(due ? { nextDue: { cycle: due.dueCycle, amount: due.emi } } : {}) };
      });
    const d = dues.get(m.id)!;
    const unpaid = d.totalArrears + d.shareCapitalDue;
    const thisMonth = lines.find((x) => x.sheet.cycle === cycle);
    const actions: MemberHome['actions'] = [];
    const asSurety = suretyLoans.filter((l) => l.status === 'SURETY_PENDING' && l.sureties.some((s) => s.memberId === m.id && s.status === 'PENDING'));
    if (asSurety.length) {
      const borrower = await this.app.members.byId(asSurety[0]!.memberId);
      actions.push({ key: 'surety', title: asSurety.length === 1 ? `${borrower?.name ?? 'A member'} asked you to be a surety` : `${asSurety.length} surety requests`, detail: 'Read the loan and sign with an OTP, or decline.', link: '/surety', tone: 'warning' });
    }
    for (const l of myLoans.filter((x) => x.status === 'RETURNED')) actions.push({ key: `returned-${l.id}`, title: 'Your loan needs a correction', detail: `${productName(l.product)} ${l.applicationNo}`, link: `/loan/${l.id}`, tone: 'warning' });
    for (const l of myLoans.filter((x) => x.status === 'DRAFT')) actions.push({ key: `draft-${l.id}`, title: 'Finish your loan application', detail: `${productName(l.product)} · not submitted yet`, link: `/loan/${l.id}`, tone: 'primary' });
    for (const l of myLoans.filter((x) => x.status === 'SURETY_PENDING' && x.sureties.some((s) => s.status === 'DECLINED'))) actions.push({ key: `declined-${l.id}`, title: 'A surety declined', detail: 'Choose another member to stand surety.', link: `/loan/${l.id}`, tone: 'danger' });
    for (const x of deps.filter((y) => y.status === 'REQUESTED')) actions.push({ key: `fd-${x.id}`, title: `Pay ${formatINR(x.principal ?? 0)} for your FD`, detail: `Request ${x.accountNo} · at the counter or by transfer`, link: `/deposit/${x.id}`, tone: 'primary' });
    if (unpaid > 0) actions.push({ key: 'dues', title: `${formatINR(unpaid)} unpaid`, detail: d.arrears.length ? `Short deduction in ${d.arrears.map((a) => formatCycle(a.cycle)).join(', ')}` : 'Share capital', link: '/payments', tone: 'danger' });
    return {
      member: { name: m.name, generalNo: m.generalNo, designation: m.designation, departmentName: depts.find((x) => x.id === m.departmentId)?.name ?? '', leftoverMonths: leftover.months, leftoverLabel: leftover.label },
      shares: { count: share?.numberOfShares ?? m.numberOfShares, capital: share?.shareCapital ?? 0, shareDeposit: share?.shareDepositBalance ?? 0 },
      deposits: { total: fd + bal('CRD') + bal('SRDS') + bal('SAVINGS'), fd, fdCount: fds.length, crd: bal('CRD'), srds: bal('SRDS'), savings: bal('SAVINGS'), ...(next ? { nextMaturity: { date: next.maturityDate!, amount: next.maturityValue ?? next.principal ?? 0, fdrNo: next.fdrNo ?? next.accountNo } } : {}) },
      loans,
      loansOutstanding: loans.reduce((s, l) => s + l.outstanding, 0),
      ...(thisMonth ? { thisMonth: { cycle, demand: thisMonth.line.totalDemand, status: thisMonth.sheet.status } } : {}),
      unpaid,
      actions,
      unreadNotifications: unread,
    };
  }
}
