import type { DeliveryStatus, MemberPreferences, MessageChannel, OutboxMessage, SupportTicket } from '@tgs/types';
import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { members } from './members.model';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

// P8a notifications (docs/22 §5.7). Recipients are members or staff, so no foreign key on them.

/** ST-03 / MB-12 in-app notifications; `via` = what the other channels did with the same message. */
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    recipientId: text('recipient_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    templateKey: text('template_key'),
    read: boolean('read').notNull().default(false),
    via: jsonb('via').$type<Partial<Record<MessageChannel, DeliveryStatus>>>().notNull().default({}),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('notifications_recipient_idx').on(t.recipientId, t.createdAt)],
);

/** Every WhatsApp / email / SMS send, with the provider's answer (integrations/messaging). */
export const deliveries = pgTable(
  'deliveries',
  {
    id: text('id').primaryKey(),
    notificationId: text('notification_id'),
    messageId: text('message_id'),
    recipientId: text('recipient_id').notNull(),
    channel: text('channel').$type<MessageChannel>().notNull(),
    to: text('to').notNull(),
    status: text('status').$type<DeliveryStatus>().notNull(),
    provider: text('provider').notNull(),
    error: text('error'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('deliveries_recipient_idx').on(t.recipientId)],
);

/** ST-03 composer log. */
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  at: ts('at').notNull(),
  data: jsonb('data').$type<OutboxMessage>().notNull(),
});

/** MB-13 member questions and the office's replies. */
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    status: text('status').$type<SupportTicket['status']>().notNull(),
    updatedAt: ts('updated_at').notNull(),
    data: jsonb('data').$type<SupportTicket>().notNull(),
  },
  (t) => [index('support_tickets_member_idx').on(t.memberId)],
);

/** MB-14 channels a member switched on. */
export const memberPreferences = pgTable('member_preferences', {
  memberId: text('member_id')
    .primaryKey()
    .references(() => members.id),
  data: jsonb('data').$type<MemberPreferences>().notNull(),
});

/** G4 (D-114): phones that receive push notifications. A token moves to whoever signed in last on that phone. */
export const pushTokens = pgTable(
  'push_tokens',
  {
    token: text('token').primaryKey(),
    /** The notification recipient: a member, applicant or staff user id. */
    userId: text('user_id').notNull(),
    platform: text('platform').$type<'ios' | 'android'>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);
