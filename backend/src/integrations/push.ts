import { createSign } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';

/**
 * G4 / G5 (D-114, D-135): push notifications to the Member App and the staff screens (same app).
 * Android phones register their FCM token and are sent to directly through FCM HTTP v1; iPhones
 * register an Expo token and go through the Expo push service to Apple (APNs). Behind this
 * interface like the other senders, so tests and development use the simulated one.
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

/** D-135: an Expo token (iPhones) looks like `ExponentPushToken[...]`; anything else is an FCM registration token. */
export const isExpoToken = (token: string): boolean => /^Expo(nent)?PushToken\[/.test(token);

/** Each phone's message goes to the service that issued its token. */
export function routedPush(expo: PushSender, fcm: PushSender): PushSender {
  return {
    async send(messages) {
      const viaExpo = messages.filter((m) => isExpoToken(m.to));
      const viaFcm = messages.filter((m) => !isExpoToken(m.to));
      return [...(viaExpo.length ? await expo.send(viaExpo) : []), ...(viaFcm.length ? await fcm.send(viaFcm) : [])];
    },
  };
}

/** The fields of the Firebase service-account key file (Project settings → Service accounts) we use. */
export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** Throws when the text is not a usable service-account key file; never puts the key in the message. */
export function parseServiceAccount(json: string): FcmServiceAccount {
  let sa: Partial<FcmServiceAccount>;
  try {
    sa = JSON.parse(json) as Partial<FcmServiceAccount>;
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (!sa?.project_id || !sa.client_email || !sa.private_key?.includes('PRIVATE KEY')) throw new Error('FCM_SERVICE_ACCOUNT_JSON must be the Firebase service-account key file (project_id, client_email, private_key).');
  return { project_id: sa.project_id, client_email: sa.client_email, private_key: sa.private_key };
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** An OAuth access token for FCM from the service account (JWT bearer grant), cached until five minutes before expiry. */
export function googleAccessToken(sa: FcmServiceAccount, fetchImpl: typeof fetch = fetch): () => Promise<string> {
  let cached: { token: string; until: number } | undefined;
  return async () => {
    if (cached && cached.until > Date.now()) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: sa.client_email, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    });
    if (!res.ok) throw new Error(`Google sign-in for FCM failed (HTTP ${res.status}).`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, until: Date.now() + (body.expires_in - 300) * 1000 };
    return cached.token;
  };
}

type FcmError = { error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } };

/** FCM says the token will never work again: the app was uninstalled, or the token is from another Firebase project or malformed. */
function deadToken(status: number, e: FcmError['error']): boolean {
  const code = e?.details?.find((d) => d.errorCode)?.errorCode ?? e?.status;
  if (status === 404 || code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH') return true;
  // INVALID_ARGUMENT also covers a bad payload; only a bad token may cost the phone its registration.
  return code === 'INVALID_ARGUMENT' && /registration token/i.test(e?.message ?? '');
}

/**
 * D-135: FCM HTTP v1, one request per phone (v1 has no batch send). The message is data-only in the
 * shape the Expo push service uses, so `expo-notifications` shows it and puts `link` in
 * `content.data` exactly as before (tap handling unchanged).
 */
export function fcmPush(sa: FcmServiceAccount, fetchImpl: typeof fetch = fetch): PushSender {
  const accessToken = googleAccessToken(sa, fetchImpl);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  return {
    async send(messages) {
      let token: string;
      try {
        token = await accessToken();
      } catch (err) {
        return messages.map((m) => ({ to: m.to, ok: false, unregistered: false, error: (err as Error).message }));
      }
      // shortcut: all at once; fine for a few phones per person, add a concurrency limit if broadcasts ever push to thousands.
      return Promise.all(
        messages.map(async (m): Promise<PushResult> => {
          try {
            const res = await fetchImpl(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
              body: JSON.stringify({
                message: {
                  token: m.to,
                  data: { title: m.title, message: m.body, channelId: 'default', body: JSON.stringify(m.link ? { link: m.link } : {}) },
                  android: { priority: 'high' },
                },
              }),
            });
            if (res.ok) return { to: m.to, ok: true, unregistered: false };
            const e = ((await res.json().catch(() => ({}))) as FcmError).error;
            return { to: m.to, ok: false, unregistered: deadToken(res.status, e), error: e?.status ?? `HTTP ${res.status}` };
          } catch (err) {
            return { to: m.to, ok: false, unregistered: false, error: (err as Error).message };
          }
        }),
      );
    },
  };
}
