import type { AppNotification, DeliveryStatus, MemberPreferences, MessageChannel, OutboxMessage, SupportTicket } from '@tgs/types';
import { and, count, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { deliveries, memberPreferences, messages, notifications, supportTickets } from '../../models';

type Via = Partial<Record<MessageChannel, DeliveryStatus>>;
export type StoredNotification = AppNotification & { via: Via };

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

  async setVia(id: string, via: Via): Promise<void> {
    await this.db.update(notifications).set({ via }).where(eq(notifications.id, id));
  }

  async insertDelivery(d: typeof deliveries.$inferInsert): Promise<void> {
    await this.db.insert(deliveries).values(d);
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
