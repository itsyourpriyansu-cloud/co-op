import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { calculateLeftoverService, formatCycle, formatDisplayDate, formatINR, fullMonthsBetween } from '@tgs/domain';
import type {
  ComposeInput,
  ComposePreview,
  DeliveryStatus,
  FailedDelivery,
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
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessCycle, businessNow, businessToday } from '../../common/utils/business-date';
import { createSenders, type MessageSender } from '../../integrations/messaging';
import { expoPush, simulatedPush, type PushSender } from '../../integrations/push';
import type { DeliveryRow, NotificationsRepository, StoredNotification } from './notifications.repository';
import { RealtimeHub } from './notifications.realtime';

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

// ---- G9 (D-121) outbox ----
const BATCH = 50;
const MAX_ATTEMPTS = 5;
/** Retries after 30 s, 2 min, 8 min, 32 min; then FAILED for the office to see. */
const BACKOFF_MS = 30_000;
/** Alerts about the member's own money and sign-in go on WhatsApp whatever the member switched off (MB-14 says so). */
export const MANDATORY_TEMPLATES = new Set(['receipt.issued', 'receipt.cancelled', 'account.mobileChanged']);
/** WhatsApp status webhook: a later status never moves a row back (Meta may send them out of order). */
const RANK: Record<DeliveryStatus, number> = { QUEUED: 0, SIMULATED: 1, SENT: 1, FAILED: 2, DELIVERED: 3, READ: 4 };
const WA_STATUS: Record<string, DeliveryStatus> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
const maskTo = (to: string) => (to.includes('@') ? to.replace(/^(.).*(@.*)$/, '$1•••$2') : to.replace(/^(.{2}).*(.{2})$/, '$1••••••$2'));

/**
 * G9 (D-121): when a composed message may go out. Inside the window: now (undefined). Outside: the
 * next start hour, in IST (UTC+5:30, no daylight saving).
 */
export function nextSendTime(nowMs: number, startHour: number, endHour: number): string | undefined {
  const IST = 330 * 60_000;
  const ist = new Date(nowMs + IST);
  const h = ist.getUTCHours();
  if (h >= startHour && h < endHour) return undefined;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (h >= endHour ? 1 : 0), startHour) - IST).toISOString();
}

/**
 * P8a (docs/22 §5.7): in-app notifications, delivery on the other channels through
 * integrations/messaging, the ST-03 composer, member questions (MB-13), preferences (MB-14) and
 * the member home (MB-01).
 */
export class NotificationsService {
  readonly senders: Record<MessageChannel, MessageSender>;
  push: PushSender;
  readonly hub: RealtimeHub;
  private running?: Promise<void>;
  private again = false;
  private closing = false;
  private readonly streams = new Set<() => void>();

  constructor(
    private readonly app: FastifyInstance,
    readonly repo: NotificationsRepository,
  ) {
    this.senders = createSenders(app.log, app.env);
    this.push = app.env.PUSH_PROVIDER === 'expo' ? expoPush(app.env.EXPO_ACCESS_TOKEN) : simulatedPush(app.log);
    this.hub = new RealtimeHub(app.dbHandle.pool, app.log);
    // Open streams would hold the shutdown; the outbox finishes the send in hand first.
    app.addHook('preClose', async () => {
      this.closing = true;
      for (const end of this.streams) end();
    });
    app.addHook('onClose', async () => {
      await this.running;
      await this.hub.close();
    });
  }

  /** G4 (D-114): the signed-in phone asks for pushes (Expo push token). */
  async registerPush(user: SessionUser, body: { token?: string; platform?: string }): Promise<{ ok: true }> {
    const token = (body?.token ?? '').trim();
    if (!/^(Exponent|Expo)PushToken\[[\w-]{10,200}\]$/.test(token)) fail('VALIDATION_ERROR', 'Not a push token.', { fieldErrors: { token: 'Not a push token' } });
    if (body.platform !== 'ios' && body.platform !== 'android') fail('VALIDATION_ERROR', 'Choose ios or android.', { fieldErrors: { platform: 'ios or android' } });
    await this.repo.savePushToken(token, user.id, body.platform);
    return { ok: true };
  }

  /** Sign-out on the phone: stop pushes to it for this user. */
  async removePush(user: SessionUser, body: { token?: string }): Promise<{ ok: true }> {
    if (body?.token) await this.repo.deletePushTokens([body.token], user.id);
    return { ok: true };
  }

  /** Pushes never block or fail the action that caused them; a dead token is forgotten. */
  private async pushTo(userId: string, title: string, body: string, link?: string): Promise<void> {
    try {
      const tokens = await this.repo.pushTokensOf(userId);
      if (!tokens.length) return;
      const results = await this.push.send(tokens.map((to) => ({ to, title, body, ...(link ? { link } : {}) })));
      await this.repo.deletePushTokens(results.filter((r) => r.unregistered).map((r) => r.to));
      const failed = results.filter((r) => !r.ok && !r.unregistered);
      if (failed.length) this.app.log.warn({ failed: failed.length, error: failed[0]!.error }, 'push not accepted');
    } catch (err) {
      this.app.log.warn({ err }, 'push failed');
    }
  }

  // ---- sending ----

  /**
   * An in-app notification by template (ST-63) to a member or staff user; a member also gets it on
   * each other channel of the template they switched on (MB-14). Undefined when the template is missing.
   */
  /** G3 (D-113): send a reminder only if this recipient never got this template for this link. */
  async notifyOnce(recipientId: string, templateKey: string, vars: Vars, link: string): Promise<boolean> {
    if (await this.repo.exists(recipientId, templateKey, link)) return false;
    return Boolean(await this.notify(recipientId, templateKey, vars, link));
  }

  /**
   * G9 (D-121): the sends go through the outbox and are tried at once; a failure is retried by the
   * dispatcher. `alsoTo` sends the WhatsApp copy to one more number too (the old mobile, after a change).
   */
  async notify(recipientId: string, templateKey: string, vars: Vars, link?: string, opts: { alsoTo?: string } = {}): Promise<{ id: string; via: Via } | undefined> {
    const t = (await this.app.masters.templates()).find((x) => x.key === templateKey);
    if (!t) return undefined;
    const n: StoredNotification = { id: newId('ntf'), recipientId, title: fill(t.title, vars), body: fill(t.body, vars), channel: 'IN_APP', createdAt: await businessNow(this.app), read: false, ...(link ? { link } : {}), via: {} };
    await this.repo.insert(n, templateKey);
    await this.hub.publish({ recipientId, id: n.id, title: n.title });
    await this.pushTo(recipientId, n.title, n.body, link);
    const member = await this.app.members.byId(recipientId);
    if (member) {
      const on = { ...(await this.preferencesOf(member)).channels, ...(MANDATORY_TEMPLATES.has(templateKey) ? { WHATSAPP: true } : {}) };
      const channels = t.channels.filter((c): c is MessageChannel => (c === 'WHATSAPP' || c === 'EMAIL') && on[c]);
      const q = await this.enqueue(member, channels, n.title, n.body, { notificationId: n.id }, undefined, channels.includes('WHATSAPP') ? opts.alsoTo : undefined);
      n.via = q.via;
      if (q.ids.length) {
        await this.repo.setVia(n.id, n.via);
        for (const d of await this.repo.claim(q.ids.length, q.ids)) {
          const status = await this.sendOne(d);
          if (d.notificationId) n.via[d.channel] = status;
        }
      }
    }
    return { id: n.id, via: n.via };
  }

  /** Queues one send per channel; a channel without an address is skipped. */
  private async enqueue(m: Member, channels: MessageChannel[], title: string, body: string, ref: { notificationId?: string; messageId?: string }, notBefore?: string, alsoTo?: string): Promise<{ via: Via; ids: string[] }> {
    const via: Via = {};
    const rows = channels.flatMap((channel) => {
      const to = channel === 'EMAIL' ? m.email : m.mobile;
      if (!to) return [];
      via[channel] = 'QUEUED';
      return [to, ...(channel === 'WHATSAPP' && alsoTo && alsoTo !== to ? [alsoTo] : [])].map((addr) => ({ id: newId('dlv'), notificationId: addr === to ? (ref.notificationId ?? null) : null, messageId: ref.messageId ?? null, recipientId: m.id, channel, to: addr, title, body, status: 'QUEUED' as const, provider: 'outbox', nextAttemptAt: notBefore ?? null }));
    });
    await this.repo.enqueue(rows);
    return { via, ids: rows.map((r) => r.id) };
  }

  /** One claimed send: the provider's answer, or a retry with backoff, or FAILED after the last try. */
  private async sendOne(d: DeliveryRow): Promise<DeliveryStatus> {
    const res = await this.senders[d.channel].send({ channel: d.channel, to: d.to, title: d.title ?? '', body: d.body ?? '' }).catch((err: Error) => ({ status: 'FAILED' as const, provider: 'unknown', error: err.message, retryable: true, providerMessageId: undefined }));
    const retry = res.status === 'FAILED' && Boolean(res.retryable) && d.attempts < MAX_ATTEMPTS;
    const status: DeliveryStatus = retry ? 'QUEUED' : res.status;
    await this.repo.finish(d.id, { status, provider: res.provider, error: res.error ?? null, providerMessageId: res.providerMessageId ?? null, nextAttemptAt: retry ? new Date(Date.now() + BACKOFF_MS * 4 ** (d.attempts - 1)).toISOString() : null });
    if (d.notificationId) await this.repo.mergeVia(d.notificationId, d.channel, status);
    if (status === 'FAILED') this.app.log.warn({ delivery: d.id, channel: d.channel, attempts: d.attempts, error: res.error }, 'message not delivered');
    return status;
  }

  /** G9 (D-121): sends everything due in the outbox (the job calls it every few seconds; tests call it directly). */
  async dispatch(): Promise<number> {
    let done = 0;
    for (;;) {
      const batch = await this.repo.claim(BATCH);
      for (const d of batch) {
        await this.sendOne(d);
        done += 1;
      }
      if (batch.length < BATCH || this.closing) return done;
    }
  }

  /** Starts a dispatch in the background, one at a time per server; never throws. */
  kick(): void {
    if (this.closing) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.dispatch();
      } while (this.again && !this.closing);
    })()
      .catch((err: Error) => this.app.log.error({ err }, 'outbox dispatch failed'))
      .finally(() => (this.running = undefined));
  }

  // ---- G9 (D-121) WhatsApp status webhook ----

  /** Meta proves the callback URL once, with the verify token the society typed in its setup. */
  whatsappVerify(q: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string }): string {
    const token = this.app.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!token || q['hub.mode'] !== 'subscribe' || !q['hub.challenge'] || !safeEqual(q['hub.verify_token'] ?? '', token)) fail('FORBIDDEN', 'Webhook verification failed.');
    return q['hub.challenge']!;
  }

  /** Sent / delivered / read / failed for each message; only a call signed with the app secret is read. */
  async whatsappStatus(raw: string, signature: string | undefined): Promise<{ updated: number }> {
    const secret = this.app.env.WHATSAPP_APP_SECRET;
    if (!secret) fail('FORBIDDEN', 'The WhatsApp webhook is not set up.');
    if (!safeEqual(signature ?? '', `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`)) fail('UNAUTHENTICATED', 'Signature does not match.');
    let body: { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id?: string; status?: string; errors?: Array<{ code?: number; title?: string }> }> } }> }> };
    try {
      body = JSON.parse(raw);
    } catch {
      return fail('VALIDATION_ERROR', 'Not JSON.');
    }
    let updated = 0;
    for (const s of (body.entry ?? []).flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.statuses ?? [])) {
      const status = WA_STATUS[s.status ?? ''];
      const d = status && s.id ? await this.repo.byProviderId(s.id) : undefined;
      if (!d || !status || RANK[status] <= RANK[d.status]) continue;
      const e = s.errors?.[0];
      await this.repo.finish(d.id, { status, provider: d.provider, error: status === 'FAILED' ? `${e?.code ?? ''} ${e?.title ?? 'Not delivered'}`.trim().slice(0, 300) : d.error, providerMessageId: d.providerMessageId, nextAttemptAt: null });
      if (d.notificationId) await this.repo.mergeVia(d.notificationId, d.channel, status);
      updated += 1;
    }
    return { updated };
  }

  // ---- G9 (D-121) live updates ----

  /**
   * Server-sent events: `notification` each time one arrives for the signed-in user, a comment every
   * 25 s so proxies keep the line open, and an end after 15 minutes so the browser reconnects with a
   * fresh access token.
   */
  async stream(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = sessionOf(request);
    const recipientId = user.role === 'MEMBER' && user.memberId ? user.memberId : user.id;
    const raw = reply.raw;
    const write = (event: string, data: object) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const unsubscribe = await this.hub.subscribe(recipientId, (e) => write('notification', { id: e.id, title: e.title }));
    reply.hijack();
    raw.writeHead(200, { ...(reply.getHeaders() as Record<string, string>), 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    raw.write('retry: 5000\n\n');
    write('ready', { unread: await this.repo.unread(recipientId) });
    const ping = setInterval(() => raw.write(': ping\n\n'), 25_000);
    const end = () => {
      clearInterval(ping);
      clearTimeout(limit);
      unsubscribe();
      this.streams.delete(end);
      if (!raw.writableEnded) raw.end();
    };
    const limit = setTimeout(end, 15 * 60_000);
    this.streams.add(end);
    request.raw.on('close', end);
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
    const list = await this.repo.messages();
    const progress = await this.repo.progress(list.map((m) => m.id));
    return list.map((m) => {
      const p = progress.get(m.id);
      if (!p) return m;
      const { failed: _f, ...rest } = m;
      const status = p.QUEUED ? 'QUEUED' : Object.keys(p).every((k) => k === 'SIMULATED') ? 'DELIVERED_SIMULATED' : 'SENT';
      return { ...rest, status, progress: p, ...(p.FAILED ? { failed: p.FAILED } : {}) };
    });
  }

  /** G9 (D-121): sends that failed after their retries, newest first. */
  async failedDeliveries(user: SessionUser): Promise<FailedDelivery[]> {
    await this.requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant see failed messages.');
    const rows = await this.repo.failed();
    const members = new Map((await this.app.members.all()).map((m) => [m.id, m]));
    return rows.map((d) => {
      const m = members.get(d.recipientId);
      return { id: d.id, at: d.updatedAt, channel: d.channel, to: maskTo(d.to), title: d.title ?? '', attempts: d.attempts, error: d.error ?? 'Not delivered', member: m ? { id: m.id, name: m.name, generalNo: m.generalNo } : null };
    });
  }

  async retryDelivery(request: FastifyRequest, id: string): Promise<{ ok: true }> {
    const user = sessionOf(request);
    await this.requirePermission(user, 'messages.send', 'Only the Super Admin and the Accountant retry messages.');
    const d = (await this.repo.requeue(id)) ?? ((await this.repo.delivery(id)) ? fail('INVALID_TRANSITION', 'Only a failed message can be sent again.') : fail('NOT_FOUND', 'Message not found.'));
    if (d.notificationId) await this.repo.mergeVia(d.notificationId, d.channel, 'QUEUED');
    await this.app.audit.record(request, { action: 'retry', entity: 'delivery', entityId: d.id, summary: `Sent a failed ${d.channel === 'EMAIL' ? 'email' : 'WhatsApp'} again (${maskTo(d.to)})` });
    this.kick();
    return { ok: true };
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
    // G9 (D-121): outside the message hours it waits for the morning. Demo and test runs happen at any hour (production forces DEMO_MODE off).
    const settings = await this.app.masters.settings();
    const notBefore = this.app.env.DEMO_MODE ? undefined : nextSendTime(Date.now(), settings.messageWindowStartHour ?? 9, settings.messageWindowEndHour ?? 21);
    const msg: OutboxMessage = { id: newId('msg'), at, byId: user.id, byName: user.name, channel: input.channel, audienceLabel: p.audienceLabel, recipients: p.recipients, skipped: p.skipped, title: input.title || 'Message from the society', body: input.body, ...(input.templateKey ? { templateKey: input.templateKey } : {}), status: 'QUEUED', ...(notBefore ? { scheduledFor: notBefore } : {}) };
    await this.repo.insertMessage(msg);
    const vars = await this.varsFor(p.send);
    for (const m of p.send) {
      const v = vars.get(m.id)!;
      const n: StoredNotification = { id: newId('ntf'), recipientId: m.id, title: fill(msg.title, v), body: fill(input.body, v), channel: 'IN_APP', createdAt: at, read: false, via: {} };
      n.via = (await this.enqueue(m, [input.channel], n.title, n.body, { notificationId: n.id, messageId: msg.id }, notBefore)).via;
      await this.repo.insert(n, input.templateKey);
    }
    // The outbox sends in the background; GET /messages shows its progress.
    if (!notBefore) this.kick();
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

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
