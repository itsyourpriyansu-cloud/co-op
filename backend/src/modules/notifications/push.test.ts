import { createHash } from 'node:crypto';
import type { Session } from '@tgs/types';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { expoPush, type PushMessage } from '../../integrations/push';
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
