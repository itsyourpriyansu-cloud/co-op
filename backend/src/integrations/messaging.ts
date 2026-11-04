import type { DeliveryStatus, MessageChannel } from '@tgs/types';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Outside messaging (D-074, docs/22 §5.7): one sender per channel behind this interface, so a real
 * WhatsApp / email provider replaces the simulated one without touching the modules.
 */
export interface OutgoingMessage {
  channel: MessageChannel;
  /** Mobile number or email address. */
  to: string;
  title: string;
  body: string;
}

export interface SendResult {
  status: DeliveryStatus;
  provider: string;
  error?: string;
}

export interface MessageSender {
  send(message: OutgoingMessage): Promise<SendResult>;
}

/** Logs the message instead of sending it; the text is never logged in production. */
export function simulatedSender(log: FastifyBaseLogger, production: boolean): MessageSender {
  return {
    async send(m) {
      log.info({ channel: m.channel, to: m.to.replace(/^(.{2}).*(.{2})$/, '$1…$2'), ...(production ? {} : { title: m.title, body: m.body }) }, 'simulated message');
      return { status: 'SIMULATED', provider: 'simulated' };
    },
  };
}

// shortcut: every channel is simulated; add the real WhatsApp / email adapters here once F-10 names the provider and number.
export function createSenders(log: FastifyBaseLogger, production: boolean): Record<MessageChannel, MessageSender> {
  const simulated = simulatedSender(log, production);
  return { WHATSAPP: simulated, EMAIL: simulated, SMS: simulated };
}
