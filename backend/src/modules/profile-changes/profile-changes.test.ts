import type { ChangeRequestRow, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('profile change requests and my profile (P4b)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let ddoFin: Session;
  let cashier: Session;
  let sravani: Session;
  let mahesh: Session;
  const data = demoDataset();
  const sravaniRec = data.members.find((m) => m.generalNo === '1103')!;
  const get = (url: string, s: Session) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });
  const send = (method: 'POST' | 'PATCH', url: string, s: Session, payload: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), payload });
  const rows = async (s: Session): Promise<ChangeRequestRow[]> => (await get('/profile-change-requests', s)).json().rows;

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, ddoFin, cashier, sravani, mahesh] = await Promise.all([
      signInAs(app, 'stf-accountant'),
      signInAs(app, 'stf-ddo-fin'),
      signInAs(app, 'stf-cashier'),
      signInAs(app, 'mem-1103'),
      signInAs(app, 'mem-1104'),
    ]);
  });
  afterAll(() => app.close());

  it('lists the seeded requests; a DDO sees only employment / pay changes of their department', async () => {
    const all = (await get('/profile-change-requests', accountant)).json();
    expect(all.rows).toHaveLength(data.profileChangeRequests.length);
    expect(all.counts.pending).toBe(data.profileChangeRequests.filter((r) => r.status === 'PENDING').length);
    const ddo = await rows(ddoFin);
    expect(ddo.length).toBeGreaterThan(0);
    expect(ddo.every((r) => r.departmentId === 'dept-fin' && r.route === 'DDO_THEN_OFFICE')).toBe(true);
    expect(ddo.some((r) => r.myAction === 'certify')).toBe(true);
    expect((await get('/profile-change-requests', sravani)).statusCode).toBe(403);
  });

  it('a member asks for an employment change: DDO certifies, Accountant approves, the record changes', async () => {
    const created = await send('POST', '/me/profile/change-requests', sravani, { fields: [{ field: 'designation', newValue: 'Senior Assistant' }], reason: 'Promoted by G.O.' });
    expect(created.statusCode).toBe(201);
    const req = created.json();
    expect(req).toMatchObject({ route: 'DDO_THEN_OFFICE', status: 'PENDING', fields: [{ field: 'designation', oldValue: sravaniRec.designation, newValue: 'Senior Assistant' }] });

    // The same field cannot be asked for twice while one is open.
    expect((await send('POST', '/me/profile/change-requests', sravani, { fields: [{ field: 'designation', newValue: 'Superintendent' }], reason: 'x' })).statusCode).toBe(400);
    // The Accountant must wait for the DDO; the cashier cannot decide at all.
    expect((await send('POST', `/profile-change-requests/${req.id}/decision`, accountant, { approve: true })).json().code).toBe('INVALID_TRANSITION');
    expect((await send('POST', `/profile-change-requests/${req.id}/decision`, cashier, { approve: true })).statusCode).toBe(403);

    const certified = await send('POST', `/profile-change-requests/${req.id}/certify`, ddoFin, {});
    expect(certified.statusCode).toBe(200);
    expect(certified.json().ddoCertified).toMatchObject({ byName: 'Kiran Kumar' });
    expect((await rows(accountant)).find((r) => r.id === req.id)?.myAction).toBe('decide');

    const decided = await send('POST', `/profile-change-requests/${req.id}/decision`, accountant, { approve: true });
    expect(decided.json()).toMatchObject({ status: 'APPROVED', decidedByName: 'Suresh Goud' });
    const detail = (await get('/members/1103', accountant)).json();
    expect(detail.member.designation).toBe('Senior Assistant');
    expect(detail.serviceEvents.some((e: { type: string }) => e.type === 'DESIGNATION_CHANGED')).toBe(true);
    expect((await send('POST', `/profile-change-requests/${req.id}/decision`, accountant, { approve: false, remarks: 'late' })).json().code).toBe('INVALID_TRANSITION');
  });

  it('office-only changes skip the DDO; rejection needs a reason', async () => {
    const req = (await send('POST', '/me/profile/change-requests', sravani, { fields: [{ field: 'nominee.name', newValue: 'Someone New' }], reason: 'Nominee changed' })).json();
    expect(req.route).toBe('OFFICE');
    expect((await send('POST', `/profile-change-requests/${req.id}/certify`, ddoFin, {})).statusCode).toBe(404);
    expect((await send('POST', `/profile-change-requests/${req.id}/decision`, accountant, { approve: false })).json().fieldErrors).toHaveProperty('remarks');
    const rejected = (await send('POST', `/profile-change-requests/${req.id}/decision`, accountant, { approve: false, remarks: 'Attach the nomination form' })).json();
    expect(rejected).toMatchObject({ status: 'REJECTED', remarks: 'Attach the nomination form' });
    expect((await get('/me/profile/change-requests', sravani)).json().map((r: { id: string }) => r.id)).toContain(req.id);
  });

  it('a DDO cannot certify another department', async () => {
    const req = (await send('POST', '/me/profile/change-requests', mahesh, { fields: [{ field: 'payProfile.grossSalary', newValue: '90000' }], reason: 'Pay revision' })).json();
    expect(req.route).toBe('DDO_THEN_OFFICE');
    expect((await send('POST', `/profile-change-requests/${req.id}/certify`, ddoFin, {})).statusCode).toBe(404);
  });

  it('my profile; contact details save straight away', async () => {
    const me = (await get('/me/profile', sravani)).json();
    expect(me.member.generalNo).toBe('1103');
    expect(me).toMatchObject({ departmentName: expect.any(String), leftover: expect.any(Object), pendingFields: expect.any(Array) });
    expect((await get('/me/profile', accountant)).statusCode).toBe(403);

    expect((await send('PATCH', '/me/profile/contact', sravani, { email: 'not-an-email' })).json().fieldErrors).toHaveProperty('email');
    const saved = (await send('PATCH', '/me/profile/contact', sravani, { email: 'sravani@example.org' })).json();
    expect(saved.member.email).toBe('sravani@example.org');
    expect(saved.serviceEvents.some((e: { summary: string }) => e.summary.includes('email'))).toBe(true);
  });

  it('changing the mobile needs a code sent to the new number, then it becomes the sign-in', async () => {
    expect((await send('POST', '/me/profile/mobile', sravani, { mobile: '12345' })).statusCode).toBe(400);
    expect((await send('POST', '/me/profile/mobile', sravani, { mobile: sravaniRec.mobile })).statusCode).toBe(400);
    const taken = data.members.find((m) => m.id !== sravaniRec.id && m.status === 'ACTIVE')!.mobile;
    expect((await send('POST', '/me/profile/mobile', sravani, { mobile: taken })).statusCode).toBeGreaterThanOrEqual(400);

    const started = await send('POST', '/me/profile/mobile', sravani, { mobile: '9123411103' });
    expect(started.statusCode).toBe(200);
    const { otpRef } = started.json();
    expect((await send('POST', '/me/profile/mobile/verify', sravani, { otpRef, otp: '000000' })).statusCode).toBe(400);
    const done = (await send('POST', '/me/profile/mobile/verify', sravani, { otpRef, otp: '123456' })).json();
    expect(done.member.mobile).toBe('9123411103');

    // The new number signs in to the Member App.
    const otp = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile: '9123411103', purpose: 'LOGIN' } });
    expect(otp.statusCode).toBe(200);
  });
});
