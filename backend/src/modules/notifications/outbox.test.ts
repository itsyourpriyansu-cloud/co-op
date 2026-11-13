import { createHmac } from 'node:crypto';
import type { FailedDelivery, Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import type { MessageSender } from '../../integrations/messaging';
import { nextSendTime } from './notifications.service';

const SECRET = 'test-app-secret';
const VERIFY = 'test-verify-token';

/** G9 (D-121): the outbox retries, the WhatsApp webhook moves statuses on, the office retries what failed. */
describe('notification outbox (G9)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  let member: Session;
  let real: MessageSender;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const row = async (notificationId: string) => (await app.db.execute(sql`select id, status, attempts, provider_message_id, error, next_attempt_at > now() as later from deliveries where notification_id = ${notificationId} and channel = 'WHATSAPP'`)).rows[0] as { id: string; status: string; attempts: number; later: boolean };
  const hook = (statuses: object[], secret = SECRET) => {
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses } }] }] });
    return app.inject({ method: 'POST', url: '/api/v1/webhooks/whatsapp', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}` }, payload });
  };

  beforeAll(async () => {
    app = await buildTestApp({ WHATSAPP_APP_SECRET: SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY });
    await reseed(app);
    [accountant, cashier, member] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier'), signInAs(app, 'mem-1103')]);
    real = app.notifications.senders.WHATSAPP;
  });
  afterAll(async () => {
    app.notifications.senders.WHATSAPP = real;
    await app.close();
  });

  it('composed messages wait for the message hours (IST)', () => {
    expect(nextSendTime(Date.parse('2026-11-13T06:00:00Z'), 9, 21)).toBeUndefined(); // 11:30 IST
    expect(nextSendTime(Date.parse('2026-11-13T17:00:00Z'), 9, 21)).toBe('2026-11-14T03:30:00.000Z'); // 22:30 IST → 09:00 tomorrow
    expect(nextSendTime(Date.parse('2026-11-12T22:00:00Z'), 9, 21)).toBe('2026-11-13T03:30:00.000Z'); // 03:30 IST → 09:00 today
  });

  it('a provider fault is retried with backoff; the webhook then marks it delivered and read', async () => {
    app.notifications.senders.WHATSAPP = { send: async () => ({ status: 'FAILED', provider: 'whatsapp-cloud', error: '503 busy', retryable: true }) };
    const sent = (await app.notifications.notify('mem-1103', 'loan.sanctioned', { amount: '₹1,00,000.00' }))!;
    expect(sent.via.WHATSAPP).toBe('QUEUED');
    expect(await row(sent.id)).toMatchObject({ status: 'QUEUED', attempts: 1, later: true });

    app.notifications.senders.WHATSAPP = { send: async () => ({ status: 'SENT', provider: 'whatsapp-cloud', providerMessageId: 'wamid.G9TEST' }) };
    expect(await app.notifications.dispatch()).toBe(0); // not due yet
    await app.db.execute(sql`update deliveries set next_attempt_at = now() where notification_id = ${sent.id}`);
    expect(await app.notifications.dispatch()).toBe(1);
    expect(await row(sent.id)).toMatchObject({ status: 'SENT', attempts: 2 });

    expect((await hook([{ id: 'wamid.G9TEST', status: 'delivered' }], 'wrong-secret')).statusCode).toBe(401);
    expect((await hook([{ id: 'wamid.G9TEST', status: 'read' }])).json()).toEqual({ updated: 1 });
    expect((await hook([{ id: 'wamid.G9TEST', status: 'delivered' }])).json()).toEqual({ updated: 0 }); // late, never moves back
    expect((await row(sent.id)).status).toBe('READ');
    const notices = (await call('GET', '/me/notifications', member)).json();
    expect(notices.items.find((n: { id: string }) => n.id === sent.id).alsoSentVia).toContain('WHATSAPP');
    const v = await app.notifications.repo.viaOf([sent.id]);
    expect(v.get(sent.id)?.WHATSAPP).toBe('READ');
  });

  it('a refused send fails at once; the office sees it and sends it again', async () => {
    app.notifications.senders.WHATSAPP = { send: async () => ({ status: 'FAILED', provider: 'whatsapp-cloud', error: '400 131026 Message undeliverable', retryable: false }) };
    const sent = (await app.notifications.notify('mem-1103', 'loan.sanctioned', { amount: '₹50,000.00' }))!;
    expect(sent.via.WHATSAPP).toBe('FAILED');
    expect((await call('GET', '/notifications/deliveries/failed', cashier)).statusCode).toBe(403);
    const failed = (await call('GET', '/notifications/deliveries/failed', accountant)).json() as FailedDelivery[];
    const mine = failed.find((f) => f.member?.id === 'mem-1103' && f.error.includes('131026'))!;
    expect(mine).toMatchObject({ channel: 'WHATSAPP', attempts: 1, error: expect.stringContaining('131026'), member: { id: 'mem-1103' } });
    expect(mine.to).toMatch(/•/);

    app.notifications.senders.WHATSAPP = real;
    expect((await call('POST', `/notifications/deliveries/${mine.id}/retry`, accountant, {})).statusCode).toBe(200);
    await app.notifications.dispatch();
    expect((await row(sent.id)).status).toBe('SIMULATED');
    expect((await call('POST', `/notifications/deliveries/${mine.id}/retry`, accountant, {})).json().code).toBe('INVALID_TRANSITION');
  });

  it('money and sign-in alerts go on WhatsApp even when the member switched it off', async () => {
    await call('PUT', '/me/preferences', member, { channels: { WHATSAPP: false } });
    expect((await app.notifications.notify('mem-1103', 'loan.sanctioned', { amount: '₹1.00' }))?.via.WHATSAPP).toBeUndefined();
    expect((await app.notifications.notify('mem-1103', 'receipt.issued', { receiptNo: 'RCT-1', amount: '₹1.00', date: '13 Nov 2026' }))?.via.WHATSAPP).toBe('SIMULATED');
    // The old number gets the mobile-change alert too.
    const changed = (await app.notifications.notify('mem-1103', 'account.mobileChanged', { mobile: '98••••••10', date: '13 Nov 2026' }, '/profile', { alsoTo: '9000000001' }))!;
    const sends = (await app.db.execute(sql`select "to", status from deliveries where notification_id = ${changed.id} or ("to" = '9000000001' and created_at > now() - interval '1 minute')`)).rows;
    expect(sends).toHaveLength(2);
    await call('PUT', '/me/preferences', member, { channels: { WHATSAPP: true } });
  });

  it("Meta's URL check needs the verify token", async () => {
    const q = (token: string) => app.inject({ method: 'GET', url: `/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345` });
    expect((await q('nope')).statusCode).toBe(403);
    const ok = await q(VERIFY);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('12345');
  });

  it('the live stream needs a session and tells the open tab at once', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/notifications/stream' })).statusCode).toBe(401);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const ac = new AbortController();
    const res = await fetch(`${address}/api/v1/notifications/stream`, { headers: bearer(accountant), signal: ac.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    let text = '';
    const until = async (word: string) => {
      while (!text.includes(word)) text += new TextDecoder().decode((await reader.read()).value);
    };
    await until('event: ready');
    await app.notifications.notify('stf-accountant', 'demand.sent', { cycle: 'Nov 2026', department: 'Finance', members: 3, amount: '₹1.00' });
    await until('event: notification');
    expect(text).toContain('Demand sheet for Nov 2026');
    ac.abort();
  });
});
