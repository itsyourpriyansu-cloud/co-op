import type { DeliveryStatus, MessageChannel } from '@tgs/types';
import type { FastifyInstance } from 'fastify';

/** In-app notification by template (ST-63), also sent on the member's channels (P8a). Undefined when the template is missing. */
export function notifyMember(app: FastifyInstance, recipientId: string, templateKey: string, vars: Record<string, string | number>, link?: string): Promise<{ id: string; via: Partial<Record<MessageChannel, DeliveryStatus>> } | undefined> {
  return app.notifications.notify(recipientId, templateKey, vars, link);
}
