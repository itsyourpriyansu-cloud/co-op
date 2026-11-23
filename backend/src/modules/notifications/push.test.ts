import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import type { Session } from '@tgs/types';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { loadEnv } from '../../config/env';
import { expoPush, fcmPush, routedPush, type PushMessage, type PushSender } from '../../integrations/push';
import { appAccounts, pushTokens, refreshTokens } from '../../models';

// G4 (D-114): push tokens and delivery, the public app config, and the shorter staff sign-in.
describe('push notifications and store-release basics (G4)', () => {
  let app: FastifyInstance;
  let member: Session;
  let accountant: Session;
  const TOKEN = 'ExponentPushToken[abcdefghijklmnop123]';
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, s?: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, ...(s ? { headers: bearer(s) } : {}), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [member, accountant] = await Promise.all([signInAs(app, 'mem-1101'), signInAs(app, 'stf-accountant')]);
  });
  afterAll(() => app.close());

  it('a phone registers its token; notifications are pushed to it; a dead token is forgotten', async () => {
    expect((await call('POST', '/me/push-token', member, { token: 'not-a-token', platform: 'android' })).json().fieldErrors).toHaveProperty('token');
    expect((await call('POST', '/me/push-token', undefined, { token: TOKEN, platform: 'android' })).statusCode).toBe(401);
    expect((await call('POST', '/me/push-token', member, { token: TOKEN, platform: 'android' })).statusCode).toBe(200);

    const sent: PushMessage[] = [];
    let dead = false;
    app.notifications.push = { send: async (ms) => (sent.push(...ms), ms.map((m) => ({ to: m.to, ok: !dead, unregistered: dead }))) };
    await app.notifications.notify(member.user.id, 'fd.maturing', { fdrNo: 'FDR-1', maturityDate: '01 Dec 2026' }, '/deposit/dep-x');
    expect(sent).toEqual([{ to: TOKEN, title: 'FD maturing soon', body: expect.stringContaining('FDR-1'), link: '/deposit/dep-x' }]);

    dead = true;
    await app.notifications.notify(member.user.id, 'fd.maturing', { fdrNo: 'FDR-2', maturityDate: '01 Dec 2026' });
    expect(await app.db.select().from(pushTokens).where(eq(pushTokens.token, TOKEN))).toHaveLength(0);
  });

  it('office replies, composer messages and staff handoffs reach the phone too', async () => {
    const STAFF_TOKEN = 'ExponentPushToken[staffstaffstaff123]';
    const admin = await signInAs(app, 'stf-admin');
    await call('POST', '/me/push-token', member, { token: TOKEN, platform: 'ios' });
    await call('POST', '/me/push-token', accountant, { token: STAFF_TOKEN, platform: 'ios' });
    const sent: PushMessage[] = [];
    app.notifications.push = { send: async (ms) => (sent.push(...ms), ms.map((m) => ({ to: m.to, ok: true, unregistered: false }))) };
    const titlesTo = (to: string) => sent.filter((m) => m.to === to).map((m) => m.title);

    const ticket = (await call('POST', '/me/support/tickets', member, { subject: 'Interest certificate', message: 'Please send my interest certificate.' })).json();
    await call('POST', `/support/tickets/${ticket.id}/reply`, accountant, { text: 'Sent to your email today.' });
    expect(titlesTo(TOKEN)).toContain('Reply from the society office');

    await call('POST', '/messages', accountant, { channel: 'WHATSAPP', audience: { kind: 'MEMBER', memberId: member.user.id }, title: 'Hello {name}', body: 'The office is closed on Friday.' });
    await vi.waitFor(() => expect(titlesTo(TOKEN).some((t) => t.startsWith('Hello '))).toBe(true));

    expect((await call('POST', `/members/${member.user.id}/retirement-change`, admin, { newDor: '2043-03-31', reason: 'Service register entry corrected' })).statusCode).toBe(200);
    expect(titlesTo(STAFF_TOKEN)).toEqual(expect.arrayContaining(['Member question', 'Date of retirement change waiting']));
    await call('DELETE', '/me/push-token', accountant, { token: STAFF_TOKEN });
  });

  it('the token moves to whoever signs in on the phone, and sign-out removes it', async () => {
    await call('POST', '/me/push-token', member, { token: TOKEN, platform: 'ios' });
    await call('POST', '/me/push-token', accountant, { token: TOKEN, platform: 'ios' });
    expect((await app.db.select().from(pushTokens).where(eq(pushTokens.token, TOKEN)))[0]?.userId).toBe(accountant.user.id);
    // The member's sign-out cannot remove a token that now belongs to someone else.
    await call('DELETE', '/me/push-token', member, { token: TOKEN });
    expect(await app.db.select().from(pushTokens).where(eq(pushTokens.token, TOKEN))).toHaveLength(1);
    await call('DELETE', '/me/push-token', accountant, { token: TOKEN });
    expect(await app.db.select().from(pushTokens).where(eq(pushTokens.token, TOKEN))).toHaveLength(0);
  });

  it('the Expo sender batches by 100 and reads each ticket', async () => {
    const bodies: unknown[][] = [];
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      const batch = JSON.parse(String(init!.body)) as Array<{ to: string }>;
      bodies.push(batch);
      return Response.json({ data: batch.map((m) => (m.to.endsWith('7]') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'r' })) });
    }) as typeof fetch;
    const messages = Array.from({ length: 150 }, (_, i) => ({ to: `ExponentPushToken[t${i}]`, title: 'T', body: 'B', link: '/x' }));
    const results = await expoPush('', fake).send(messages);
    expect(bodies.map((b) => b.length)).toEqual([100, 50]);
    expect(bodies[0]![0]).toMatchObject({ channelId: 'default', data: { link: '/x' } });
    expect(results.filter((r) => r.unregistered).map((r) => r.to)).toContain('ExponentPushToken[t7]');
    expect(results.filter((r) => r.ok)).toHaveLength(150 - results.filter((r) => r.unregistered).length);
  });

  it('an Android FCM token is accepted, an FCM-shaped token from an iPhone is not (D-135)', async () => {
    const fcmToken = `dGVzdA:APA91b${'x'.repeat(140)}`;
    expect((await call('POST', '/me/push-token', member, { token: fcmToken, platform: 'android' })).statusCode).toBe(200);
    expect((await call('POST', '/me/push-token', member, { token: fcmToken, platform: 'ios' })).json().fieldErrors).toHaveProperty('token');
    await call('DELETE', '/me/push-token', member, { token: fcmToken });
  });

  it('the FCM sender signs in with the service account once, sends v1 data messages, and reads errors (D-135)', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const sa = { project_id: 'tgs-test', client_email: 'push@tgs-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
    let signIns = 0;
    const sends: Array<{ url: string; auth: string; body: { message: { token: string; data: Record<string, string>; android: object } } }> = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        signIns++;
        const jwt = new URLSearchParams(String(init!.body)).get('assertion')!.split('.');
        expect(createVerify('RSA-SHA256').update(`${jwt[0]}.${jwt[1]}`).verify(publicKey, jwt[2]!, 'base64url')).toBe(true);
        expect(JSON.parse(Buffer.from(jwt[1]!, 'base64url').toString())).toMatchObject({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging' });
        return Response.json({ access_token: 'ya29.test', expires_in: 3599 });
      }
      const body = JSON.parse(String(init!.body));
      sends.push({ url: String(url), auth: new Headers(init!.headers).get('authorization')!, body });
      if (body.message.token === 'gone') return Response.json({ error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 404 });
      if (body.message.token === 'busy') return Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, { status: 429 });
      if (body.message.token === 'bad-payload') return Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } }, { status: 400 });
      return Response.json({ name: 'projects/tgs-test/messages/1' });
    }) as typeof fetch;

    const sender = fcmPush(sa, fake);
    const results = await sender.send(['ok-1', 'gone', 'busy', 'bad-payload'].map((to) => ({ to, title: 'T', body: 'B', link: '/loan/l-1' })));
    await sender.send([{ to: 'ok-2', title: 'T', body: 'B' }]);
    expect(signIns).toBe(1);
    expect(sends[0]).toMatchObject({ url: 'https://fcm.googleapis.com/v1/projects/tgs-test/messages:send', auth: 'Bearer ya29.test' });
    expect(sends[0]!.body.message).toEqual({ token: 'ok-1', data: { title: 'T', message: 'B', channelId: 'default', body: '{"link":"/loan/l-1"}' }, android: { priority: 'high' } });
    expect(results.map((r) => [r.to, r.ok, r.unregistered])).toEqual([
      ['ok-1', true, false],
      ['gone', false, true],
      ['busy', false, false],
      ['bad-payload', false, false],
    ]);
  });

  it('iPhone (Expo) and Android (FCM) tokens go to their own service (D-135)', async () => {
    const seen: Record<string, string[]> = { expo: [], fcm: [] };
    const fake = (name: string): PushSender => ({ send: async (ms) => (seen[name]!.push(...ms.map((m) => m.to)), ms.map((m) => ({ to: m.to, ok: true, unregistered: false }))) });
    const results = await routedPush(fake('expo'), fake('fcm')).send(['ExponentPushToken[abc123abc123]', 'fcm-1', 'ExpoPushToken[zz]'].map((to) => ({ to, title: 'T', body: 'B' })));
    expect(seen).toEqual({ expo: ['ExponentPushToken[abc123abc123]', 'ExpoPushToken[zz]'], fcm: ['fcm-1'] });
    expect(results).toHaveLength(3);
  });

  it('PUSH_PROVIDER=fcm needs a real service-account key file', () => {
    const base = { ...process.env, PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: '' };
    expect(() => loadEnv(base)).toThrow(/FCM_SERVICE_ACCOUNT_JSON is required/);
    expect(() => loadEnv({ ...base, FCM_SERVICE_ACCOUNT_JSON: '{not json' })).toThrow(/not valid JSON/);
    expect(() => loadEnv({ ...base, FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"x"}' })).toThrow(/service-account key file/);
  });

  it('anyone can read the oldest app version allowed', async () => {
    expect((await call('GET', '/app/config')).json()).toEqual({ minAppVersion: '0.0.0' });
  });

  it('the store review mobile signs in with its fixed code, which is never sent', async () => {
    const [acct] = await app.db.select().from(appAccounts).where(eq(appAccounts.status, 'ACTIVE')).limit(1);
    const review = await buildTestApp({ DEMO_MODE: 'false', STORE_REVIEW_MOBILE: acct!.mobile, STORE_REVIEW_OTP: '246810' });
    try {
      const started = await review.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile: acct!.mobile, purpose: 'LOGIN' } });
      expect(started.json()).not.toHaveProperty('demoOtp');
      const ok = await review.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { otpRef: started.json().otpRef, otp: '246810' } });
      expect(ok.statusCode).toBe(200);
    } finally {
      await review.close();
    }
    await expect(buildTestApp({ STORE_REVIEW_MOBILE: '9000000000' })).rejects.toThrow(/both/);
  });

  it('a staff sign-in lasts 7 days without use, a member one 30', async () => {
    const days = async (s: Session) => {
      const [row] = await app.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, createHash('sha256').update(s.refreshToken!).digest('hex')));
      return Math.round((row!.expiresAt.getTime() - Date.now()) / 86_400_000);
    };
    expect(await days(accountant)).toBe(7);
    expect(await days(member)).toBe(30);
  });
});
