// J-14 member sign-in by mobile + one-time code (D-067; passwords retired), home snapshot (MB-01),
// notifications (MB-12), preferences (MB-14) and support tickets (MB-13).
import { beforeEach, describe, expect, it } from 'vitest';
import type { ActivationSample, MemberHome, MemberPreferences, MyNotifications, OtpStarted, Session, SupportCenter, SupportTicket } from '@tgs/types';
import { createApp } from './app';
import { Store } from './store';

let app: ReturnType<typeof createApp>;
let store: Store;
beforeEach(() => {
  store = new Store({ persist: false, dataDir: '.data-test', latencyMs: [0, 0] });
  app = createApp({ store, version: 'test' });
});

type Err = { code?: string; message?: string; ruleId?: string; fieldErrors?: Record<string, string> };
const call = async <T>(method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as T & Err };
};
/** Demo one-tap sign-in for a member by General No. (persona id mem-<no>). */
const signIn = (generalNo: string) => call<Session>('POST', '/auth/persona', { personaId: store.db.members.find((m) => m.generalNo === generalNo)!.id, channel: 'app' });
const lakshmi = () => store.db.members.find((m) => m.generalNo === '1101')!;

describe('J-14 member sign-in by mobile + one-time code (D-067)', () => {
  const start = (mobile: string, purpose = 'LOGIN') => call<OtpStarted>('POST', '/auth/otp/start', { mobile, purpose });
  const verify = (otpRef: string, otp = '123456', name?: string) => call<Session>('POST', '/auth/otp/verify', { otpRef, otp, ...(name ? { name } : {}) });

  it('signs a member in with their registered mobile and explains every failure', async () => {
    const started = await start(lakshmi().mobile);
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ demoOtp: '123456', channel: 'SIMULATED' });
    expect(started.body.mobileMasked).toMatch(/^\d\dX{6}\d\d$/);
    expect((await verify(started.body.otpRef, '000000')).body.fieldErrors?.otp).toBe('Incorrect code');
    const ok = await verify(started.body.otpRef);
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ role: 'MEMBER', memberId: lakshmi().id, generalNo: '1101' });
    expect((await call('GET', '/me/home', undefined, ok.body.token)).status).toBe(200);
    expect((await verify(started.body.otpRef)).body.fieldErrors?.otp).toBe('Expired');

    expect((await start('12345')).body.fieldErrors?.mobile).toBeTruthy();
    expect((await start('9999999990')).body.fieldErrors?.mobile).toMatch(/^Not registered/);
  });

  it('a member who never used the app signs in the same way (no activation step)', async () => {
    const sample = (await call<ActivationSample>('GET', '/__demo/activation-sample')).body;
    const s = await verify((await start(sample.mobile)).body.otpRef);
    expect(s.body.user.generalNo).toBe(sample.generalNo);
  });

  it('signs up a new applicant, who then signs in with the same mobile', async () => {
    expect((await start(lakshmi().mobile, 'SIGNUP')).status).toBe(409);
    const ref = (await start('9123400002', 'SIGNUP')).body.otpRef;
    expect((await verify(ref)).body.fieldErrors?.name).toBeTruthy();
    const ref2 = (await start('9123400002', 'SIGNUP')).body.otpRef;
    const created = await verify(ref2, '123456', 'Test Applicant');
    expect(created.body.user).toMatchObject({ role: 'APPLICANT', name: 'Test Applicant' });
    const again = await verify((await start('9123400002')).body.otpRef);
    expect(again.body.user.id).toBe(created.body.user.id);
  });

  it('retires the password routes', async () => {
    expect((await call('POST', '/auth/member-login', { login: '1101', password: 'x' })).status).toBe(404);
    expect((await call('POST', '/auth/activate/start', {})).status).toBe(404);
  });

  it('staff tokens cannot use member account routes', async () => {
    const staff = (await call<Session>('POST', '/auth/persona', { personaId: 'stf-cashier', channel: 'console' })).body.token;
    expect((await call('GET', '/me/home', undefined, staff)).status).toBe(403);
  });
});

describe('MB-01 / MB-12 / MB-13 / MB-14', () => {
  it('home snapshot matches the ledgers and dues', async () => {
    const t = (await signIn('1104')).body.token;
    const home = (await call<MemberHome>('GET', '/me/home', undefined, t)).body;
    expect(home.member.generalNo).toBe('1104');
    expect(home.member.leftoverMonths).toBeGreaterThan(0);
    expect(home.loans.length).toBeGreaterThan(0);
    expect(home.loansOutstanding).toBe(home.loans.reduce((s, l) => s + l.outstanding, 0));
    expect(home.deposits.total).toBe(home.deposits.fd + home.deposits.crd + home.deposits.srds + home.deposits.savings);
    const dues = (await call<{ dues: { totalArrears: number; shareCapitalDue: number } }>('GET', '/me/payments', undefined, t)).body.dues;
    expect(home.unpaid).toBe(dues.totalArrears + dues.shareCapitalDue);
    if (home.unpaid) expect(home.actions.some((a) => a.key === 'dues' && a.link === '/payments')).toBe(true);
  });

  it('notifications read one / read all', async () => {
    const t = (await signIn('1101')).body.token;
    const n = (await call<MyNotifications>('GET', '/me/notifications', undefined, t)).body;
    expect(n.items.length).toBeGreaterThan(0);
    const unreadOne = n.items.find((x) => !x.read);
    if (unreadOne) {
      await call('POST', `/me/notifications/${unreadOne.id}/read`, {}, t);
      expect((await call<MyNotifications>('GET', '/me/notifications', undefined, t)).body.unread).toBe(n.unread - 1);
    }
    expect((await call('POST', '/me/notifications/nope/read', {}, t)).status).toBe(404);
    await call('POST', '/me/notifications/read-all', {}, t);
    expect((await call<MyNotifications>('GET', '/me/notifications', undefined, t)).body.unread).toBe(0);
    expect((await call<MemberHome>('GET', '/me/home', undefined, t)).body.unreadNotifications).toBe(0);
  });

  it('preferences save, email needs an email on the profile', async () => {
    const t = (await signIn('1101')).body.token;
    const p = (await call<MemberPreferences>('GET', '/me/preferences', undefined, t)).body;
    expect(p.channels.SMS).toBe(true);
    const saved = await call<MemberPreferences>('PUT', '/me/preferences', { channels: { WHATSAPP: true } }, t);
    expect(saved.body.channels).toMatchObject({ SMS: true, WHATSAPP: true });
    expect((await call<MemberPreferences>('GET', '/me/preferences', undefined, t)).body.channels.WHATSAPP).toBe(true);
    delete lakshmi().email;
    expect((await call('PUT', '/me/preferences', { channels: { EMAIL: true } }, t)).body.fieldErrors?.EMAIL).toBeTruthy();
  });

  it('support centre lists FAQs and tickets; a new ticket gets an auto-reply', async () => {
    const t = (await signIn('1101')).body.token;
    const s = (await call<SupportCenter>('GET', '/me/support', undefined, t)).body;
    expect(s.faqs.length).toBeGreaterThan(5);
    expect(s.office.address).toContain('Secretariat');
    expect((await call('POST', '/me/support/tickets', { subject: 'Hi', message: 'short' }, t)).body.fieldErrors).toMatchObject({ subject: expect.any(String), message: expect.any(String) });
    const tk = await call<SupportTicket>('POST', '/me/support/tickets', { subject: 'Interest certificate', category: 'DEPOSIT', message: 'Please send my FD interest certificate for 2025-26.' }, t);
    expect(tk.status).toBe(201);
    expect(tk.body.messages).toHaveLength(2);
    expect(tk.body.category).toBe('DEPOSIT');
    expect((await call<SupportTicket>('POST', '/me/support/tickets', { subject: 'Something else', category: 'BOGUS', message: 'Any category we do not know becomes Other.' }, t)).body.category).toBe('OTHER');
    const after = (await call<SupportCenter>('GET', '/me/support', undefined, t)).body;
    expect(after.tickets.map((x) => x.id)).toContain(tk.body.id);
    expect(after.tickets.length).toBe(s.tickets.length + 2);
  });
});
