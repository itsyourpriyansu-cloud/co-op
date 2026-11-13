import type { AppNotification, DeliveryStatus, MemberPreferences, MessageChannel, OutboxMessage, SupportTicket } from '@tgs/types';
import { and, asc, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { deliveries, memberPreferences, messages, notifications, pushTokens, supportTickets } from '../../models';

type Via = Partial<Record<MessageChannel, DeliveryStatus>>;
export type StoredNotification = AppNotification & { via: Via };
export type DeliveryRow = typeof deliveries.$inferSelect;

/** G9 (D-121): a send in flight holds its row this long; a server that dies mid-send frees it for a retry. */
const LEASE = sql`now() + interval '5 minutes'`;

const toNotification = (r: typeof notifications.$inferSelect): StoredNotification => ({
  id: r.id,
  recipientId: r.recipientId,
  title: r.title,
  body: r.body,
  channel: 'IN_APP',
  createdAt: r.createdAt,
  read: r.read,
  ...(r.link ? { link: r.link } : {}),
  via: r.via,
});

export class NotificationsRepository {
  constructor(private readonly db: Database) {}

  async insert(n: StoredNotification, templateKey?: string): Promise<void> {
    await this.db.insert(notifications).values({ id: n.id, recipientId: n.recipientId, title: n.title, body: n.body, link: n.link ?? null, templateKey: templateKey ?? null, read: false, via: n.via, createdAt: n.createdAt });
  }

  /** G4 (D-114): a phone's push token belongs to whoever signed in on it last. */
  async savePushToken(token: string, userId: string, platform: 'ios' | 'android'): Promise<void> {
    await this.db.insert(pushTokens).values({ token, userId, platform }).onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform, lastSeenAt: sql`now()` } });
  }

  async deletePushTokens(tokens: string[], userId?: string): Promise<void> {
    if (!tokens.length) return;
    await this.db.delete(pushTokens).where(userId ? and(inArray(pushTokens.token, tokens), eq(pushTokens.userId, userId)) : inArray(pushTokens.token, tokens));
  }

  async pushTokensOf(userId: string): Promise<string[]> {
    return (await this.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId))).map((r) => r.token);
  }

  /** G3 (D-113): reminders are sent once; this says whether one went out already. */
  async exists(recipientId: string, templateKey: string, link: string): Promise<boolean> {
    return (await this.db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.recipientId, recipientId), eq(notifications.templateKey, templateKey), eq(notifications.link, link))).limit(1)).length > 0;
  }

  async setVia(id: string, via: Via): Promise<void> {
    await this.db.update(notifications).set({ via }).where(eq(notifications.id, id));
  }

  async insertDelivery(d: typeof deliveries.$inferInsert): Promise<void> {
    await this.db.insert(deliveries).values(d);
  }

  // ---- G9 (D-121) outbox ----
  async enqueue(rows: Array<typeof deliveries.$inferInsert>): Promise<void> {
    // Due now by the database clock, so a claim right after never misses it.
    if (rows.length) await this.db.insert(deliveries).values(rows.map((r) => ({ ...r, nextAttemptAt: r.nextAttemptAt ?? sql`now()` })));
  }

  /** Takes up to `limit` due rows (only `ids`, when given) for this server; another server skips them. */
  async claim(limit: number, ids?: string[]): Promise<DeliveryRow[]> {
    const due = this.db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(and(eq(deliveries.status, 'QUEUED'), lte(deliveries.nextAttemptAt, sql`now()`), ids ? inArray(deliveries.id, ids) : undefined))
      .orderBy(asc(deliveries.nextAttemptAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    return this.db
      .update(deliveries)
      .set({ attempts: sql`${deliveries.attempts} + 1`, nextAttemptAt: LEASE, updatedAt: sql`now()` })
      .where(inArray(deliveries.id, due))
      .returning();
  }

  async finish(id: string, set: Pick<DeliveryRow, 'status' | 'provider' | 'error' | 'providerMessageId' | 'nextAttemptAt'>): Promise<void> {
    await this.db.update(deliveries).set({ ...set, updatedAt: sql`now()` }).where(eq(deliveries.id, id));
  }

  /** Records one channel's latest status on the in-app notification. */
  async mergeVia(notificationId: string, channel: MessageChannel, status: DeliveryStatus): Promise<void> {
    await this.db.update(notifications).set({ via: sql`${notifications.via} || jsonb_build_object(${channel}::text, ${status}::text)` }).where(eq(notifications.id, notificationId));
  }

  async viaOf(ids: string[]): Promise<Map<string, Via>> {
    if (!ids.length) return new Map();
    return new Map((await this.db.select({ id: notifications.id, via: notifications.via }).from(notifications).where(inArray(notifications.id, ids))).map((r) => [r.id, r.via]));
  }

  async byProviderId(providerMessageId: string): Promise<DeliveryRow | undefined> {
    return (await this.db.select().from(deliveries).where(eq(deliveries.providerMessageId, providerMessageId)))[0];
  }

  async delivery(id: string): Promise<DeliveryRow | undefined> {
    return (await this.db.select().from(deliveries).where(eq(deliveries.id, id)))[0];
  }

  /** Composer messages: how many of each one's sends are at each status. */
  async progress(messageIds: string[]): Promise<Map<string, Partial<Record<DeliveryStatus, number>>>> {
    const out = new Map<string, Partial<Record<DeliveryStatus, number>>>();
    if (!messageIds.length) return out;
    const rows = await this.db.select({ messageId: deliveries.messageId, status: deliveries.status, n: count() }).from(deliveries).where(inArray(deliveries.messageId, messageIds)).groupBy(deliveries.messageId, deliveries.status);
    for (const r of rows) out.set(r.messageId!, { ...out.get(r.messageId!), [r.status]: r.n });
    return out;
  }

  async failed(limit = 200): Promise<DeliveryRow[]> {
    return this.db.select().from(deliveries).where(eq(deliveries.status, 'FAILED')).orderBy(desc(deliveries.updatedAt)).limit(limit);
  }

  /** A failed send goes back to the outbox with fresh attempts; undefined unless it was FAILED. */
  async requeue(id: string): Promise<DeliveryRow | undefined> {
    return (await this.db.update(deliveries).set({ status: 'QUEUED', attempts: 0, error: null, nextAttemptAt: sql`now()`, updatedAt: sql`now()` }).where(and(eq(deliveries.id, id), eq(deliveries.status, 'FAILED'))).returning())[0];
  }

  async of(recipientId: string, limit = 100): Promise<StoredNotification[]> {
    return (await this.db.select().from(notifications).where(eq(notifications.recipientId, recipientId)).orderBy(desc(notifications.createdAt)).limit(limit)).map(toNotification);
  }

  async unread(recipientId: string): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(notifications).where(and(eq(notifications.recipientId, recipientId), eq(notifications.read, false)));
    return r?.n ?? 0;
  }

  /** Marks one (or, without `id`, all) of a recipient's notifications read; false when not theirs. */
  async markRead(recipientId: string, id?: string): Promise<boolean> {
    const rows = await this.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.recipientId, recipientId), id ? eq(notifications.id, id) : undefined))
      .returning({ id: notifications.id });
    return !id || rows.length > 0;
  }

  // ---- composer log ----
  async messages(): Promise<OutboxMessage[]> {
    return (await this.db.select({ data: messages.data }).from(messages).orderBy(desc(messages.at)).limit(100)).map((r) => r.data);
  }

  async insertMessage(m: OutboxMessage): Promise<void> {
    await this.db.insert(messages).values({ id: m.id, at: m.at, data: m });
  }

  async updateMessage(m: OutboxMessage): Promise<void> {
    await this.db.update(messages).set({ data: m }).where(eq(messages.id, m.id));
  }

  // ---- support ----
  async tickets(memberId?: string): Promise<SupportTicket[]> {
    return (await this.db.select({ data: supportTickets.data }).from(supportTickets).where(memberId ? eq(supportTickets.memberId, memberId) : undefined).orderBy(desc(supportTickets.updatedAt))).map((r) => r.data);
  }

  async ticket(id: string): Promise<SupportTicket | undefined> {
    return (await this.db.select({ data: supportTickets.data }).from(supportTickets).where(eq(supportTickets.id, id)))[0]?.data;
  }

  async openTickets(): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, 'OPEN'));
    return r?.n ?? 0;
  }

  async saveTicket(t: SupportTicket, insert = false): Promise<void> {
    const row = { status: t.status, updatedAt: t.updatedAt ?? t.createdAt, data: t };
    if (insert) await this.db.insert(supportTickets).values({ id: t.id, memberId: t.memberId, ...row });
    else await this.db.update(supportTickets).set(row).where(eq(supportTickets.id, t.id));
  }

  // ---- preferences ----
  async preferences(memberId: string): Promise<MemberPreferences | undefined> {
    return (await this.db.select({ data: memberPreferences.data }).from(memberPreferences).where(eq(memberPreferences.memberId, memberId)))[0]?.data;
  }

  async savePreferences(memberId: string, data: MemberPreferences): Promise<void> {
    await this.db.insert(memberPreferences).values({ memberId, data }).onConflictDoUpdate({ target: memberPreferences.memberId, set: { data } });
  }
}
