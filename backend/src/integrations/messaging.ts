import type { DeliveryStatus, MessageChannel } from '@tgs/types';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env';
import { acsEmail } from './acs-email';
import { whatsAppCloud } from './whatsapp-cloud';

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
  /** G5: a one-time code; WhatsApp sends it with the authentication template. */
  otp?: string;
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
export function simulatedSender(log: FastifyBaseLogger, production: boolean, from: string): MessageSender {
  return {
    async send(m) {
      log.info({ channel: m.channel, ...(from ? { from } : {}), to: m.to.replace(/^(.{2}).*(.{2})$/, '$1…$2'), ...(production ? {} : { title: m.title, body: m.body }) }, 'simulated message');
      return { status: 'SIMULATED', provider: 'simulated' };
    },
  };
}

/** G5 (D-115): the real WhatsApp (Meta Cloud API) and email (Azure Communication Services) senders, chosen by the environment. */
export function createSenders(log: FastifyBaseLogger, env: Env, fetchImpl: typeof fetch = fetch): Record<MessageChannel, MessageSender> {
  const production = env.NODE_ENV === 'production';
  return {
    WHATSAPP:
      env.WHATSAPP_PROVIDER === 'meta'
        ? whatsAppCloud({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, token: env.WHATSAPP_TOKEN, apiVersion: env.WHATSAPP_API_VERSION, noticeTemplate: env.WHATSAPP_NOTICE_TEMPLATE, otpTemplate: env.WHATSAPP_OTP_TEMPLATE, language: env.WHATSAPP_LANGUAGE, fetchImpl })
        : simulatedSender(log, production, env.WHATSAPP_FROM),
    EMAIL: env.EMAIL_PROVIDER === 'acs' ? acsEmail({ endpoint: env.ACS_ENDPOINT, from: env.EMAIL_FROM, clientId: env.AZURE_CLIENT_ID, fetchImpl }) : simulatedSender(log, production, env.EMAIL_FROM),
  };
}
