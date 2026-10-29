import { createSeed } from '@tgs/mock-data';
import type { FastifyInstance } from 'fastify';
import { generate } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs, STAFF_PASSWORD } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

const staffLogin = (app: FastifyInstance, username: string, password = STAFF_PASSWORD) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/staff/login', payload: { username, password } });

describe('staff sign-in (P1a)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  beforeEach(() => reseed(app));
  afterAll(() => app.close());

  it('signs in a non-signer with user ID + password and serves /me', async () => {
    const res = await staffLogin(app, 'accounts');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status: 'OK', mustChangePassword: false, session: { user: { id: 'stf-accountant', role: 'ACCOUNTANT' } } });
    expect(body.session.refreshToken).toBeTruthy();

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(body.session) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { id: 'stf-accountant' }, channel: 'console' });
    expect(me.json().permissions).toContain('members.decideChanges');
  });

  it('treats user IDs case-insensitively and keeps the DDO department on the session', async () => {
    const res = await staffLogin(app, 'DDO.FIN');
    expect(res.json().session.user).toEqual({ id: 'stf-ddo-fin', name: 'Kiran Kumar', role: 'DDO', departmentId: 'dept-fin' });
  });

  it('rejects a wrong password and an unknown user with the same message', async () => {
    const wrong = await staffLogin(app, 'accounts', 'nope12345');
    const unknown = await staffLogin(app, 'nobody', 'nope12345');
    expect(wrong.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
    expect(wrong.json().message).toBe(unknown.json().message);
  });

  it('locks the account for 15 minutes after 5 wrong passwords', async () => {
    for (let i = 0; i < 5; i++) await staffLogin(app, 'cashier', 'wrong-pass1');
    const locked = await staffLogin(app, 'cashier');
    expect(locked.statusCode).toBe(403);
    expect(locked.json()).toMatchObject({ ruleId: 'ACCOUNT_LOCKED' });
  });

  it('makes a signer set up an authenticator, then asks for its code every time', async () => {
    const first = (await staffLogin(app, 'secretary')).json();
    expect(first.status).toBe('TOTP_SETUP_REQUIRED');

    const setup = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/totp/setup', payload: { challengeToken: first.challengeToken } });
    expect(setup.statusCode).toBe(200);
    const { secret, qrDataUrl, otpauthUrl } = setup.json();
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(otpauthUrl).toContain('TGSECCSL');

    const bad = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/totp/confirm', payload: { challengeToken: first.challengeToken, code: '000000' } });
    expect(bad.statusCode).toBe(400);
    const confirm = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/totp/confirm', payload: { challengeToken: first.challengeToken, code: await generate({ secret }) } });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().user.role).toBe('SECRETARY');

    const second = (await staffLogin(app, 'secretary')).json();
    expect(second.status).toBe('TOTP_REQUIRED');
    const verified = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/totp', payload: { challengeToken: second.challengeToken, code: await generate({ secret }) } });
    expect(verified.statusCode).toBe(200);
  });

  it('refuses a forged or expired challenge token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/totp', payload: { challengeToken: 'not-a-token', code: '123456' } });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a deactivated user', async () => {
    const admin = await signInAs(app, 'stf-admin');
    const cashier = { name: 'Venkat Naidu', userId: 'cashier', role: 'CASHIER', active: false };
    expect((await app.inject({ method: 'PUT', url: '/api/v1/users/stf-cashier', headers: bearer(admin), payload: cashier })).statusCode).toBe(200);
    expect((await staffLogin(app, 'cashier')).statusCode).toBe(403);
  });
});

describe('tokens (P1a)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('rotates refresh tokens and revokes the whole sign-in when an old one is reused', async () => {
    const s0 = (await staffLogin(app, 'accounts')).json().session;
    const r1 = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: s0.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const s1 = r1.json();
    expect(s1.refreshToken).not.toBe(s0.refreshToken);

    // s0 was already used: presenting it again ends the family, so s1 dies too.
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: s0.refreshToken } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: s1.refreshToken } })).statusCode).toBe(401);
  });

  it('ends a sign-in on logout', async () => {
    const s = (await staffLogin(app, 'accounts')).json().session;
    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: bearer(s), payload: { refreshToken: s.refreshToken } });
    expect(out.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: s.refreshToken } })).statusCode).toBe(401);
  });

  it('answers 401 without a token or with a forged one', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer('eyJhbGciOiJIUzI1NiJ9.e30.x') })).statusCode).toBe(401);
  });
});

describe('member mobile + OTP (P1a, D-067)', () => {
  let app: FastifyInstance;
  const lakshmi = createSeed().members.find((m) => m.generalNo === '1101')!;
  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  const start = (mobile: string, purpose = 'LOGIN') => app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile, purpose } });
  const verify = (payload: object) => app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload });

  it('signs a member in with their registered mobile', async () => {
    const started = await start(lakshmi.mobile);
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({ demoOtp: '123456', channel: 'SIMULATED' });
    expect(started.json().mobileMasked).not.toContain(lakshmi.mobile.slice(2, 8));

    const res = await verify({ otpRef: started.json().otpRef, otp: '123456' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toEqual({ id: lakshmi.id, name: lakshmi.name, role: 'MEMBER', memberId: lakshmi.id, generalNo: '1101' });

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(res.json()) });
    expect(me.json()).toMatchObject({ channel: 'app', permissions: expect.arrayContaining(['app.member']) });
  });

  it('refuses unknown mobiles, wrong codes and a used code', async () => {
    expect((await start('9999999990')).statusCode).toBe(400);
    const ref = (await start(lakshmi.mobile)).json().otpRef;
    expect((await verify({ otpRef: ref, otp: '000000' })).statusCode).toBe(400);
    expect((await verify({ otpRef: ref, otp: '123456' })).statusCode).toBe(200);
    expect((await verify({ otpRef: ref, otp: '123456' })).json().fieldErrors.otp).toBe('Expired');
  });

  it('stops a code after 5 wrong tries', async () => {
    const ref = (await start(createSeed().members.find((m) => m.generalNo === '1103')!.mobile)).json().otpRef;
    for (let i = 0; i < 5; i++) await verify({ otpRef: ref, otp: '000000' });
    expect((await verify({ otpRef: ref, otp: '123456' })).json().fieldErrors.otp).toBe('Too many tries');
  });

  it('signs up a new applicant with a new mobile and a name', async () => {
    expect((await start(lakshmi.mobile, 'SIGNUP')).statusCode).toBe(409);
    const ref = (await start('9123400001', 'SIGNUP')).json().otpRef;
    expect((await verify({ otpRef: ref, otp: '123456' })).json().fieldErrors.name).toBeTruthy();
    const ref2 = (await start('9123400001', 'SIGNUP')).json().otpRef;
    const res = await verify({ otpRef: ref2, otp: '123456', name: 'Test Applicant' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ role: 'APPLICANT', name: 'Test Applicant' });
  });
});

describe('demo sign-in (P1a)', () => {
  it('lists personas and signs them in when DEMO_MODE is on', async () => {
    const app = await buildTestApp();
    try {
      await reseed(app);
      const list = await app.inject({ method: 'GET', url: '/api/v1/__demo/personas?channel=console' });
      expect(list.json().map((p: { id: string }) => p.id)).toContain('stf-admin');
      const s = await signInAs(app, 'mem-1104');
      expect(s.user).toMatchObject({ role: 'MEMBER', generalNo: '1104' });
      const wrongApp = await app.inject({ method: 'POST', url: '/api/v1/auth/persona', payload: { personaId: 'stf-admin', channel: 'app' } });
      expect(wrongApp.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('is not available when DEMO_MODE is off', async () => {
    const app = await buildTestApp({ DEMO_MODE: 'false' });
    try {
      expect((await app.inject({ method: 'GET', url: '/api/v1/__demo/personas' })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/persona', payload: { personaId: 'stf-admin' } })).statusCode).toBe(404);
      const started = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile: createSeed().members.find((m) => m.generalNo === '1102')!.mobile } });
      expect(started.json().demoOtp).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
