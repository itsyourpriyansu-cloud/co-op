// M8 exit: J-14 member sign-in with General No. / Employee ID + password, activation of a seeded
// member who has not activated the app (MA-02), forgot password (MA-03), change password (MB-17),
// home snapshot (MB-01), notifications (MB-12), preferences (MB-14) and support tickets (MB-13).
import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountOtp, ActivationSample, MemberHome, MemberPreferences, MyNotifications, PasswordToken, Session, SupportCenter, SupportTicket } from '@tgs/types';
import { DEMO_PASSWORD } from './account';
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
const signIn = (login: string, password = DEMO_PASSWORD) => call<Session>('POST', '/auth/member-login', { login, password });
const lakshmi = () => store.db.members.find((m) => m.generalNo === '1101')!;

describe('J-14 member sign-in', () => {
  it('signs in by General No. or Employee ID and explains every failure', async () => {
    const byNo = await signIn('1101');
    expect(byNo.status).toBe(200);
    expect(byNo.body.user).toMatchObject({ role: 'MEMBER', memberId: lakshmi().id });
    expect((await signIn(lakshmi().employeeId.toLowerCase())).status).toBe(200);
    expect((await call('GET', '/me/home', undefined, byNo.body.token)).status).toBe(200);

    expect((await signIn('', '')).body.fieldErrors).toMatchObject({ login: expect.any(String), password: expect.any(String) });
    expect((await signIn('9999')).body.fieldErrors?.login).toBeTruthy();
    expect((await signIn('1101', 'wrong-pass1')).body.fieldErrors?.password).toBeTruthy();
    const sample = (await call<ActivationSample>('GET', '/__demo/activation-sample')).body;
    const notActive = await signIn(sample.generalNo);
    expect(notActive.status).toBe(422);
    expect(notActive.body.ruleId).toBe('NOT_ACTIVATED');
  });

  it('activates a member who never used the app, then signs in with the new password', async () => {
    const sample = (await call<ActivationSample>('GET', '/__demo/activation-sample')).body;
    expect(store.db.members.find((m) => m.generalNo === sample.generalNo)?.portalActivated).toBe(false);

    expect((await call('POST', '/auth/activate/start', { employeeId: sample.employeeId, mobile: '9000000000' })).body.fieldErrors?.mobile).toContain('registered');
    expect((await call('POST', '/auth/activate/start', { employeeId: lakshmi().employeeId, mobile: lakshmi().mobile })).body.ruleId).toBe('ALREADY_ACTIVE');
    const otp = await call<AccountOtp>('POST', '/auth/activate/start', { employeeId: sample.employeeId, mobile: sample.mobile });
    expect(otp.body.mobileMasked).toMatch(/^\d\dX{6}\d\d$/);
    expect((await call('POST', '/auth/otp/verify', { otpRef: otp.body.otpRef, otp: '000000' })).body.fieldErrors?.otp).toBeTruthy();
    const tok = await call<PasswordToken>('POST', '/auth/otp/verify', { otpRef: otp.body.otpRef, otp: '123456' });
    expect(tok.status).toBe(200);

    expect((await call('POST', '/auth/password/set', { passwordToken: tok.body.passwordToken, password: `abc${sample.generalNo}9` })).body.fieldErrors?.password).toContain('General No.');
    const set = await call<{ activated: boolean; session: Session }>('POST', '/auth/password/set', { passwordToken: tok.body.passwordToken, password: 'Garden42!' });
    expect(set.body.activated).toBe(true);
    expect(set.body.session.user.generalNo).toBe(sample.generalNo);
    expect(store.db.members.find((m) => m.generalNo === sample.generalNo)?.portalActivated).toBe(true);
    expect(store.db.credentials[set.body.session.user.memberId!]?.hash).toBeTruthy();

    expect((await signIn(sample.generalNo, DEMO_PASSWORD)).status).toBe(400);
    expect((await signIn(sample.generalNo, 'Garden42!')).status).toBe(200);
    expect(store.db.auditLog.some((a) => a.action === 'activate' && a.entityId === set.body.session.user.memberId)).toBe(true);
    expect((await call<ActivationSample>('GET', '/__demo/activation-sample')).body.generalNo).not.toBe(sample.generalNo);
  });

  it('forgot password resets it and signs out the old sessions; change password keeps this one', async () => {
    const old = (await signIn('1102')).body.token;
    const otp = await call<AccountOtp>('POST', '/auth/forgot/start', { login: '1102' });
    const tok = await call<PasswordToken>('POST', '/auth/otp/verify', { otpRef: otp.body.otpRef, otp: '123456' });
    expect((await call('POST', '/auth/otp/verify', { otpRef: otp.body.otpRef, otp: '123456' })).status).toBe(400);
    expect((await call<{ activated: boolean }>('POST', '/auth/password/set', { passwordToken: tok.body.passwordToken, password: 'River2026x' })).body.activated).toBe(false);
    expect((await call('GET', '/me/home', undefined, old)).status).toBe(401);
    expect((await signIn('1102', 'River2026x')).status).toBe(200);

    const a = (await signIn('1102', 'River2026x')).body.token;
    const b = (await signIn('1102', 'River2026x')).body.token;
    expect((await call('POST', '/me/password', { current: 'nope', next: 'Ocean77xy' }, a)).body.fieldErrors?.current).toBeTruthy();
    expect((await call('POST', '/me/password', { current: 'River2026x', next: 'short1' }, a)).body.fieldErrors?.password).toBeTruthy();
    const changed = await call<{ signedOutOtherSessions: number }>('POST', '/me/password', { current: 'River2026x', next: 'Ocean77xy' }, a);
    expect(changed.body.signedOutOtherSessions).toBeGreaterThanOrEqual(2);
    expect((await call('GET', '/me/home', undefined, a)).status).toBe(200);
    expect((await call('GET', '/me/home', undefined, b)).status).toBe(401);
    expect((await call('POST', '/auth/forgot/start', { login: (await call<ActivationSample>('GET', '/__demo/activation-sample')).body.generalNo })).body.ruleId).toBe('NOT_ACTIVATED');
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
