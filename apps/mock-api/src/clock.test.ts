// D-065: every business timestamp the API writes falls on the demo date, whatever the real date is.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DepositDetail, OtpChallenge, ProfileChangeRequest, Session } from '@tgs/types';
import { createApp } from './app';
import { demoTimestamp } from './clock';
import { Store } from './store';

let app: ReturnType<typeof createApp>;
let store: Store;
beforeEach(() => {
  store = new Store({ persist: false, dataDir: '.data-test', latencyMs: [0, 0] });
  app = createApp({ store, version: 'test' });
});

const call = async <T>(method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as T };
};
const login = async (personaId: string, channel: 'console' | 'app' = 'console') => (await call<Session>('POST', '/auth/persona', { personaId, channel })).body.token;

describe('demoTimestamp', () => {
  it('keeps the real time of day on the demo date', () => {
    expect(demoTimestamp('2026-10-24', new Date('2031-03-02T07:45:12.345Z'))).toBe('2026-10-24T07:45:12.345Z');
  });
  it('caps late UTC hours so the India-time date is still the demo date', () => {
    const t = demoTimestamp('2026-10-24', new Date('2031-03-02T21:10:00.000Z'));
    expect(t).toBe('2026-10-24T18:29:59.999Z');
    // 18:29:59.999Z + 05:30 = 23:59:59.999 IST, same day.
    expect(new Date(Date.parse(t) + 330 * 60_000).toISOString().slice(0, 10)).toBe('2026-10-24');
  });
});

describe('server writes use the demo date', () => {
  it('seed date: a new change request, audit entry and notification are stamped 24 Oct 2026', async () => {
    const phone = await login('mem-1101', 'app');
    const r = await call<ProfileChangeRequest>('POST', '/me/profile/change-requests', { fields: [{ field: 'designation', newValue: 'Assistant Secretary' }], reason: 'Promoted this month' }, phone);
    expect(r.body.createdAt.slice(0, 10)).toBe('2026-10-24');
    expect(store.db.auditLog[0]?.at.slice(0, 10)).toBe('2026-10-24');
  });

  it('after POST /__demo/clock, events, receipts, sign-offs and notifications follow the new date', async () => {
    await call('POST', '/__demo/clock', { today: '2026-11-05' });
    const phone = await login('mem-1101', 'app');
    const otp = await call<OtpChallenge>('POST', '/me/deposits/sign/request', { principal: 5_000_000, tenureMonths: 24, payoutFrequency: 'ON_MATURITY', holding: 'SINGLE', nominee: { name: 'Mahesh Goud', relation: 'Spouse' } }, phone);
    const fd = await call<DepositDetail>('POST', '/me/deposits', { otpRef: otp.body.otpRef, otp: '123456' }, phone);
    expect(fd.body.deposit.requestedAt?.slice(0, 10)).toBe('2026-11-05');
    const cashier = await login('stf-cashier');
    const paid = await call<DepositDetail>('POST', `/deposits/${fd.body.deposit.id}/actions/recordPayment`, { payment: { mode: 'TRANSFER', date: '2026-11-05', reference: 'UTR1' } }, cashier);
    expect(paid.body.deposit.payment?.at.slice(0, 10)).toBe('2026-11-05');
    expect(paid.body.deposit.events?.every((e) => e.at.slice(0, 10) === '2026-11-05')).toBe(true);
    await call('POST', `/deposits/${fd.body.deposit.id}/actions/accept`, {}, await login('stf-secretary'));
    const active = await call<DepositDetail>('POST', `/deposits/${fd.body.deposit.id}/actions/accept`, {}, await login('stf-president'));
    expect(active.body.deposit.signOffs?.president?.at.slice(0, 10)).toBe('2026-11-05');
    expect(active.body.deposit.openedOn).toBe('2026-11-05');
    expect(store.db.notifications.find((n) => n.recipientId === 'mem-1101')?.createdAt.slice(0, 10)).toBe('2026-11-05');
  });
});
