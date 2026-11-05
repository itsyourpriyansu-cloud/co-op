import type { MemberHome, MyNotifications, OutboxMessage, Session, StaffNotifications, StaffTicketRow, SupportCenter, SupportTicket } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

// P8a (docs/22 §5.7): notifications, delivery through integrations/messaging, composer, questions, preferences, home.
describe('notifications (P8a)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  let member: Session;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, cashier, member] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier'), signInAs(app, 'mem-1103')]);
  });
  afterAll(() => app.close());

  it('staff see their seeded notifications and mark them read', async () => {
    const list = (await call('GET', '/notifications', accountant)).json() as StaffNotifications;
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.unread).toBeGreaterThan(0);
    expect((await call('POST', `/notifications/${list.items[0]!.id}/read`, accountant)).statusCode).toBe(200);
    expect((await call('POST', '/notifications/nope/read', accountant)).statusCode).toBe(404);
    await call('POST', '/notifications/read-all', accountant);
    expect((await call('GET', '/notifications/count', accountant)).json()).toMatchObject({ unread: 0 });
    expect((await call('GET', '/me/notifications', accountant)).statusCode).toBe(403);
  });

  it('a template notification goes in the app and on each channel the member switched on', async () => {
    const before = (await call('GET', '/me/notifications', member)).json() as MyNotifications;
    // Default channels (F-09, D-093): WhatsApp on, email when on file (MB-14). loan.sanctioned goes IN_APP, WHATSAPP, EMAIL.
    const sent = await app.notifications.notify('mem-1103', 'loan.sanctioned', { amount: '₹1,00,000.00' });
    expect(sent?.via.WHATSAPP).toBe('SIMULATED');
    const after = (await call('GET', '/me/notifications', member)).json() as MyNotifications;
    expect(after.unread).toBe(before.unread + 1);
    expect(after.items[0]).toMatchObject({ id: sent!.id, read: false });
    expect(after.items[0]!.alsoSentVia).toContain('WHATSAPP');
    const rows = await app.db.execute(sql`select channel, status, provider from deliveries where notification_id = ${sent!.id}`);
    expect(rows.rows).toContainEqual({ channel: 'WHATSAPP', status: 'SIMULATED', provider: 'simulated' });

    // Switch WhatsApp off: the next one stays in the app.
    const prefs = await call('PUT', '/me/preferences', member, { channels: { WHATSAPP: false } });
    expect(prefs.json().channels).toMatchObject({ WHATSAPP: false });
    expect((await app.notifications.notify('mem-1103', 'membership.active', {}))?.via).toEqual({});
    await call('PUT', '/me/preferences', member, { channels: { WHATSAPP: true } });
    expect(await app.notifications.notify('mem-1103', 'no.such.template', {})).toBeUndefined();

    await call('POST', `/me/notifications/${sent!.id}/read`, member);
    await call('POST', '/me/notifications/read-all', member);
    expect(((await call('GET', '/me/notifications', member)).json() as MyNotifications).unread).toBe(0);
  });

  it('the composer sends in the app and on the chosen channel, only for the Accountant and the Admin', async () => {
    expect((await call('GET', '/messages', cashier)).statusCode).toBe(403);
    const bad = await call('POST', '/messages/preview', accountant, { channel: 'EMAIL', audience: { kind: 'DEFAULTERS' }, title: '', body: 'short' });
    expect(bad.statusCode).toBe(400);
    const input = { channel: 'WHATSAPP', audience: { kind: 'MEMBER', memberId: 'mem-1103' }, title: 'Hello', body: 'Dear {name}, your General No. is {generalNo}.' };
    const preview = (await call('POST', '/messages/preview', accountant, input)).json();
    expect(preview).toMatchObject({ recipients: 1, skipped: 0 });
    expect(preview.sample[0].body).not.toContain('{name}');
    const res = await call('POST', '/messages', accountant, input);
    expect(res.statusCode).toBe(201);
    const msg = res.json() as OutboxMessage;
    expect(((await call('GET', '/messages', accountant)).json() as OutboxMessage[])[0]!.id).toBe(msg.id);
    const mine = (await call('GET', '/me/notifications', member)).json() as MyNotifications;
    expect(mine.items[0]).toMatchObject({ title: 'Hello', alsoSentVia: ['WHATSAPP'] });
    // Defaulters and retiring audiences resolve on the backend's own data.
    expect((await call('POST', '/messages/preview', accountant, { ...input, audience: { kind: 'DEFAULTERS' } })).statusCode).toBe(200);
    expect((await call('POST', '/messages/preview', accountant, { ...input, audience: { kind: 'RETIRING', withinMonths: 12 } })).statusCode).toBe(200);
  });

  it('a member asks a question; the office replies and the member is notified', async () => {
    expect((await call('POST', '/me/support/tickets', member, { subject: 'Hi', message: 'x' })).statusCode).toBe(400);
    const asked = await call('POST', '/me/support/tickets', member, { subject: 'FD receipt missing', message: 'I paid for my FD last week but see no receipt.', category: 'DEPOSIT' });
    expect(asked.statusCode).toBe(201);
    const t = asked.json() as SupportTicket;
    expect(((await call('GET', '/me/support', member)).json() as SupportCenter).tickets.map((x) => x.id)).toContain(t.id);
    expect((await call('GET', '/notifications/count', accountant)).json().openQuestions).toBeGreaterThan(0);
    expect((await call('GET', '/support/tickets', cashier)).statusCode).toBe(403);
    expect(((await call('GET', '/support/tickets', accountant)).json() as StaffTicketRow[]).find((x) => x.id === t.id)?.member.id).toBe('mem-1103');
    const replied = (await call('POST', `/support/tickets/${t.id}/reply`, accountant, { text: 'Your FDR is ready at the counter.' })).json() as SupportTicket;
    expect(replied.status).toBe('ANSWERED');
    expect(((await call('GET', '/me/notifications', member)).json() as MyNotifications).items[0]!.title).toBe('Reply from the society office');
    await call('POST', `/support/tickets/${t.id}/reply`, accountant, { close: true });
    expect((await call('POST', `/support/tickets/${t.id}/reply`, accountant, { text: 'Again, hello' })).statusCode).toBe(409);
  });

  it('the member home comes from the backend', async () => {
    const home = (await call('GET', '/me/home', member)).json() as MemberHome;
    expect(home.member.generalNo).toBeTruthy();
    expect(typeof home.unpaid).toBe('number');
    expect(home.unreadNotifications).toBe(((await call('GET', '/me/notifications', member)).json() as MyNotifications).unread);
  });
});
