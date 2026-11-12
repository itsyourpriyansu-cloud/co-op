import type { FastifyBaseLogger } from 'fastify';

/**
 * G4 / G5 (D-114): push notifications to the Member App and the staff screens (same app) through the
 * Expo push service, which forwards to Google (FCM) and Apple (APNs). Behind this interface like the
 * other senders, so tests and development use the simulated one.
 */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Where a tap opens, e.g. `/deposit/dep-1`. */
  link?: string;
}

export interface PushResult {
  to: string;
  ok: boolean;
  /** The phone uninstalled the app or the token expired: stop sending to it. */
  unregistered: boolean;
  error?: string;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

export function simulatedPush(log: FastifyBaseLogger): PushSender {
  return {
    async send(messages) {
      for (const m of messages) log.info({ to: `${m.to.slice(0, 22)}…`, link: m.link }, 'simulated push');
      return messages.map((m) => ({ to: m.to, ok: true, unregistered: false }));
    },
  };
}

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
/** The service takes at most 100 messages per request. */
const BATCH = 100;

type Ticket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };

/** `accessToken` is needed only if "enhanced push security" is switched on for the Expo project. */
export function expoPush(accessToken = '', fetchImpl: typeof fetch = fetch): PushSender {
  return {
    async send(messages) {
      const results: PushResult[] = [];
      for (let i = 0; i < messages.length; i += BATCH) {
        const batch = messages.slice(i, i + BATCH);
        const res = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify(batch.map((m) => ({ to: m.to, title: m.title, body: m.body, sound: 'default', channelId: 'default', priority: 'high', ...(m.link ? { data: { link: m.link } } : {}) }))),
        });
        if (!res.ok) {
          results.push(...batch.map((m) => ({ to: m.to, ok: false, unregistered: false, error: `HTTP ${res.status}` })));
          continue;
        }
        const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
        batch.forEach((m, k) => {
          const t = tickets[k];
          if (t?.status === 'ok') results.push({ to: m.to, ok: true, unregistered: false });
          else results.push({ to: m.to, ok: false, unregistered: t?.details?.error === 'DeviceNotRegistered', error: t?.details?.error ?? t?.message ?? 'no ticket' });
        });
      }
      // shortcut: receipts (sent ~15 min later) are not polled, so a token Google or Apple drops is removed at the next ticket error instead.
      return results;
    },
  };
}
