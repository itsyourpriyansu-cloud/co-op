import type { MemberInput, Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('members (P4a)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let ddoFin: Session;
  let admin: Session;
  const data = demoDataset();
  const lakshmi = data.members.find((m) => m.generalNo === '1101')!;
  const get = (url: string, s: Session) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });
  const send = (method: 'POST' | 'PUT', url: string, s: Session, payload: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), payload });

  /** A valid new member: Lakshmi's details with a new employee ID and mobile. */
  const newMember = (over: Partial<MemberInput> = {}): MemberInput => ({
    name: 'Test Member',
    fatherName: lakshmi.fatherName,
    gender: 'F',
    dob: lakshmi.dob,
    mobile: '9123499901',
    presentAddress: lakshmi.presentAddress,
    permanentAddress: lakshmi.permanentAddress,
    employeeId: 'TSTEST01',
    departmentId: 'dept-fin',
    designation: lakshmi.designation,
    doj: lakshmi.doj,
    dor: lakshmi.dor,
    employmentType: 'REGULAR',
    numberOfShares: 20,
    nominee: lakshmi.nominee,
    payProfile: { scaleOfPay: lakshmi.payProfile.scaleOfPay, grossSalary: lakshmi.payProfile.grossSalary, substantivePay: lakshmi.payProfile.substantivePay, govtLoanDeductions: 0, otherLoanDeductions: 0 },
    ...over,
  });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, ddoFin, admin] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-ddo-fin'), signInAs(app, 'stf-admin')]);
  });
  afterAll(() => app.close());

  it('lists active members with counts; a DDO sees only their department', async () => {
    const all = (await get('/members?pageSize=10', accountant)).json();
    expect(all.counts.all).toBe(data.members.length);
    expect(all.total).toBe(data.members.filter((m) => m.status === 'ACTIVE').length);
    expect(all.items).toHaveLength(10);
    expect(all.items[0]).toMatchObject({ generalNo: expect.any(String), departmentName: expect.any(String), leftoverMonths: expect.any(Number) });
    expect(all.canCreate).toBe(true);

    const ddo = (await get('/members?status=ALL&pageSize=100', ddoFin)).json();
    expect(ddo.scope).toEqual({ departmentId: 'dept-fin', departmentName: expect.any(String) });
    expect(ddo.items.every((r: { departmentId: string }) => r.departmentId === 'dept-fin')).toBe(true);
    expect(ddo.canCreate).toBe(false);

    const search = (await get('/members?q=1101', accountant)).json();
    expect(search.items.map((r: { generalNo: string }) => r.generalNo)).toContain('1101');
  });

  it('opens a member by id or General No., with service history and mandate', async () => {
    const byNo = await get('/members/1101', accountant);
    expect(byNo.statusCode).toBe(200);
    const d = byNo.json();
    expect(d.member).toMatchObject({ id: lakshmi.id, generalNo: '1101', mobile: lakshmi.mobile });
    expect(d.serviceEvents.length).toBeGreaterThan(0);
    expect(d.mandate).toMatchObject({ memberId: lakshmi.id });
    expect(d.documents.length).toBeGreaterThan(0);
    expect(d.can).toMatchObject({ edit: true, transfer: true, seeFullMobile: true });
    // A DDO sees the masked mobile, and nothing outside their department.
    expect((await get(`/members/${lakshmi.id}`, ddoFin)).json().member.mobile).toBe(lakshmi.mobileMasked);
    const other = data.members.find((m) => m.departmentId !== 'dept-fin')!;
    expect((await get(`/members/${other.id}`, ddoFin)).statusCode).toBe(404);
    const member = await signInAs(app, 'mem-1103');
    expect((await get('/members', member)).statusCode).toBe(403);
  });

  it('adds a member with the next General No., a mandate, a JOINED event and a Member App sign-in', async () => {
    const bad = await send('POST', '/members', accountant, { ...newMember(), mobile: '123', name: '' });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().fieldErrors)).toEqual(expect.arrayContaining(['mobile', 'name']));
    expect((await send('POST', '/members', ddoFin, newMember())).statusCode).toBe(403);

    const top = Math.max(...data.members.map((m) => Number(m.generalNo)));
    const res = await send('POST', '/members', accountant, newMember());
    expect(res.statusCode).toBe(201);
    const d = res.json();
    expect(d.member).toMatchObject({ generalNo: String(top + 1), id: `mem-${top + 1}`, status: 'ACTIVE', joinedSocietyOn: expect.any(String) });
    expect(d.mandate).toMatchObject({ status: 'AGREED' });
    expect(d.serviceEvents[0]).toMatchObject({ type: 'JOINED', byName: 'Suresh Goud' });

    // The new member can sign in to the app with their mobile.
    const started = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile: '9123499901' } });
    expect(started.statusCode).toBe(200);
    const signedIn = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { otpRef: started.json().otpRef, otp: '123456' } });
    expect(signedIn.json().user).toMatchObject({ role: 'MEMBER', memberId: d.member.id, generalNo: d.member.generalNo });

    // Same employee ID or mobile again is refused.
    const dup = await send('POST', '/members', accountant, newMember({ mobile: '9123499902' }));
    expect(dup.json().fieldErrors.employeeId).toBeTruthy();
  });

  it('edits a member, logging service events; department changes need a transfer', async () => {
    const input = { ...newMember(), employeeId: lakshmi.employeeId, mobile: lakshmi.mobile, name: lakshmi.name, designation: 'Assistant Secretary' };
    const moved = await send('PUT', `/members/${lakshmi.id}`, accountant, { ...input, departmentId: 'dept-rev' });
    expect(moved.json().fieldErrors.departmentId).toMatch(/Transfer/);
    const res = await send('PUT', `/members/${lakshmi.id}`, accountant, { ...input, departmentId: lakshmi.departmentId });
    expect(res.statusCode).toBe(200);
    expect(res.json().member.designation).toBe('Assistant Secretary');
    // One edit can log several events in one transaction (same timestamp), so check presence, not order.
    expect(res.json().serviceEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'DESIGNATION_CHANGED' })]));
  });

  it('transfers a member: new department, mandate waits for the new DDO, who agrees it', async () => {
    const mover = data.members.find((m) => m.status === 'ACTIVE' && m.departmentId === 'dept-rev')!;
    const bad = await send('POST', `/members/${mover.id}/transfers`, accountant, { toDepartmentId: mover.departmentId });
    expect(Object.keys(bad.json().fieldErrors)).toEqual(expect.arrayContaining(['toDepartmentId', 'effectiveDate']));
    const res = await send('POST', `/members/${mover.id}/transfers`, accountant, { toDepartmentId: 'dept-fin', effectiveDate: '2026-10-25', orderRef: 'G.O. 12' });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.member.departmentId).toBe('dept-fin');
    expect(d.mandate).toMatchObject({ departmentId: 'dept-fin', status: 'PENDING_NEW_DDO' });
    expect(d.serviceEvents[0]).toMatchObject({ type: 'TRANSFERRED', effectiveCycle: expect.stringMatching(/^\d{4}-\d{2}$/) });

    // The Finance DDO agrees; the accountant may not (Finance has a DDO login).
    expect((await send('POST', `/members/${mover.id}/mandate/agree`, accountant, {})).statusCode).toBe(403);
    const agreed = await send('POST', `/members/${mover.id}/mandate/agree`, ddoFin, {});
    expect(agreed.json().mandate).toMatchObject({ status: 'AGREED', agreedByName: 'Kiran Kumar' });
    expect((await send('POST', `/members/${mover.id}/mandate/agree`, ddoFin, {})).statusCode).toBe(409);
  });

  it('a demo user may agree for a department whose DDO has no login', async () => {
    const mover = data.members.find((m) => m.status === 'ACTIVE' && m.departmentId === 'dept-fin' && m.id !== lakshmi.id)!;
    await send('POST', `/members/${mover.id}/transfers`, accountant, { toDepartmentId: 'dept-rev', effectiveDate: '2026-10-25' });
    const d = (await get(`/members/${mover.id}`, admin)).json();
    expect(d.demoAgreeAs).toMatch(/DDO/);
    const agreed = await send('POST', `/members/${mover.id}/mandate/agree`, admin, {});
    expect(agreed.json().mandate.status).toBe('AGREED');
  });

  it('writes audit rows for member changes', async () => {
    const result = await app.db.execute<{ action: string }>(sql`select action from audit_log where entity in ('member', 'mandate')`);
    const actions = new Set(result.rows.map((r) => r.action));
    for (const a of ['create', 'update', 'transfer', 'agree']) expect(actions).toContain(a);
  });
});
