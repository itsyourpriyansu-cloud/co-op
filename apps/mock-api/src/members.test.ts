// Members module (ST-10 … ST-13, ST-18, MB-02, MB-19): J-09, J-11 and the change-request chain.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChangeRequestList, ChangeRequestRow, MemberDetail, MemberInput, MemberList, MyProfile, OtpChallenge, ProfileChangeRequest, Session } from '@tgs/types';
import { createApp } from './app';
import { Store } from './store';

let app: ReturnType<typeof createApp>;
let store: Store;
beforeEach(() => {
  store = new Store({ persist: false, dataDir: '.data-test', latencyMs: [0, 0] });
  app = createApp({ store, version: 'test' });
});

type Err = { code?: string; fieldErrors?: Record<string, string> };
const call = async <T>(method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as T & Err };
};
const login = async (personaId: string, channel: 'console' | 'app' = 'console') => (await call<Session>('POST', '/auth/persona', { personaId, channel })).body.token;

const address = { line1: 'H.No 4-12, Lane 3', city: 'Hyderabad', district: 'Hyderabad', pincode: '500004' };
const newMember: MemberInput = {
  name: 'Anil Varma',
  fatherName: 'Krishna Varma',
  gender: 'M',
  dob: '1992-08-17',
  mobile: '9123456780',
  presentAddress: address,
  permanentAddress: address,
  employeeId: 'TS77001',
  departmentId: 'dept-fin',
  designation: 'Junior Assistant',
  doj: '2018-03-01',
  dor: '2053-08-31',
  employmentType: 'REGULAR',
  numberOfShares: 20,
  nominee: { name: 'Swathi Varma', relation: 'Spouse' },
  payProfile: { scaleOfPay: '24280-72850', grossSalary: 4_500_000, substantivePay: 2_800_000, govtLoanDeductions: 0, otherLoanDeductions: 0 },
};

describe('member index (ST-10)', () => {
  it('lists, filters and scopes the DDO to their department with masked mobiles', async () => {
    const admin = await call<MemberList>('GET', '/members?pageSize=10', undefined, await login('stf-admin'));
    expect(admin.status).toBe(200);
    expect(admin.body.items).toHaveLength(10);
    expect(admin.body.canCreate).toBe(true);
    expect(admin.body.items.every((r) => r.mobileMasked.includes('XXXXXX'))).toBe(true);
    const ddo = await call<MemberList>('GET', '/members?pageSize=100', undefined, await login('stf-ddo-fin'));
    expect(ddo.body.total).toBeLessThan(admin.body.total);
    expect(ddo.body.items.every((r) => r.departmentId === 'dept-fin')).toBe(true);
    expect(ddo.body.canCreate).toBe(false);
    const retiring = await call<MemberList>('GET', '/members?retiringWithinMonths=6', undefined, await login('stf-admin'));
    expect(retiring.body.items.every((r) => r.leftoverMonths <= 6)).toBe(true);
    const found = await call<MemberList>('GET', '/members?q=lakshmi', undefined, await login('stf-admin'));
    expect(found.body.items.some((r) => r.generalNo === '1101')).toBe(true);
    expect((await call<MemberList>('GET', '/members?q=1101', undefined, await login('stf-admin'))).body.items[0]?.name).toBe('Lakshmi Devi');
    expect((await call('GET', '/members', undefined, await login('mem-1101', 'app'))).status).toBe(403);
  });

  it('profile shows loans, ledger, service history and a DDO cannot open another department', async () => {
    const admin = await login('stf-admin');
    const d = await call<MemberDetail>('GET', '/members/mem-1101', undefined, admin);
    expect(d.body.loans.length).toBeGreaterThan(0);
    expect(d.body.ledger.length).toBeGreaterThan(0);
    expect(d.body.serviceEvents.some((e) => e.type === 'JOINED')).toBe(true);
    expect(d.body.mandate?.status).toBe('AGREED');
    expect(d.body.can.seeFullMobile).toBe(true);
    const sec = await call<MemberDetail>('GET', '/members/mem-1101', undefined, await login('stf-secretary'));
    expect(sec.body.member.mobile).toContain('XXXXXX');
    expect((await call('GET', '/members/mem-1104', undefined, await login('stf-ddo-fin'))).status).toBe(404);
  });
});

describe('J-09 create and edit (ST-11)', () => {
  it('Accountant adds a member: next General No., share account, mandate, JOINED event', async () => {
    const acc = await login('stf-accountant');
    const res = await call<MemberDetail>('POST', '/members', newMember, acc);
    expect(res.status).toBe(201);
    expect(Number(res.body.member.generalNo)).toBeGreaterThan(1600);
    expect(res.body.shares?.numberOfShares).toBe(20);
    expect(res.body.mandate?.status).toBe('AGREED');
    expect(res.body.leftover.months).toBeGreaterThan(300);
    expect(res.body.serviceEvents[0]?.type).toBe('JOINED');
    // duplicate employee ID and mobile are refused
    const dup = await call('POST', '/members', newMember, acc);
    expect(dup.status).toBe(400);
    expect(dup.body.fieldErrors?.employeeId).toMatch(/Anil Varma/);
  });

  it('validates, refuses department edits and logs a designation change', async () => {
    const acc = await login('stf-accountant');
    const bad = await call('POST', '/members', { ...newMember, doj: '1990-01-01', mobile: '123' }, acc);
    expect(bad.body.fieldErrors).toMatchObject({ doj: expect.any(String), mobile: expect.any(String) });
    expect((await call('POST', '/members', newMember, await login('stf-secretary'))).status).toBe(403);
    const created = (await call<MemberDetail>('POST', '/members', newMember, acc)).body.member;
    const input = { ...newMember, departmentId: 'dept-gad' };
    expect((await call('PUT', `/members/${created.id}`, input, acc)).body.fieldErrors?.departmentId).toMatch(/Transfer/);
    const edited = await call<MemberDetail>('PUT', `/members/${created.id}`, { ...newMember, designation: 'Senior Assistant', email: 'anil@example.org' }, acc);
    expect(edited.body.member.designation).toBe('Senior Assistant');
    expect(edited.body.serviceEvents.map((e) => e.type)).toEqual(expect.arrayContaining(['DESIGNATION_CHANGED', 'PROFILE_UPDATED']));
  });
});

describe('J-11 transfer (ST-13, BR-010, BR-028)', () => {
  it('moves the member on the first ungenerated sheet and waits for the new DDO', async () => {
    const acc = await login('stf-accountant');
    const sravani = store.db.members.find((m) => m.id === 'mem-1103')!;
    expect(sravani.departmentId).toBe('dept-fin');
    // Move Sravani to GAD (DDO has no login) effective today: Oct sheet already generated → Nov.
    const res = await call<MemberDetail>('POST', '/members/mem-1103/transfers', { toDepartmentId: 'dept-gad', effectiveDate: '2026-10-24', orderRef: 'GAD/TR/2026/0999' }, acc);
    expect(res.status).toBe(200);
    expect(res.body.member.departmentId).toBe('dept-gad');
    expect(res.body.upcomingTransfer?.effectiveCycle).toBe('2026-11');
    expect(res.body.serviceEvents[0]).toMatchObject({ type: 'TRANSFERRED', effectiveCycle: '2026-11' });
    expect(res.body.mandate?.status).toBe('PENDING_NEW_DDO');
    // The Finance DDO no longer sees her; the Accountant can record GAD's DDO agreement (demo).
    expect((await call('GET', '/members/mem-1103', undefined, await login('stf-ddo-fin'))).status).toBe(404);
    expect(res.body.demoAgreeAs).toMatch(/General Administration/);
    const agreed = await call<MemberDetail>('POST', '/members/mem-1103/mandate/agree', {}, acc);
    expect(agreed.body.mandate).toMatchObject({ status: 'AGREED', agreedByName: 'Sunitha Rani' });
    expect((await call('POST', '/members/mem-1103/mandate/agree', {}, acc)).status).toBe(409);
  });

  it('a transfer into Finance waits for Kiran Kumar, who agrees it himself', async () => {
    const acc = await login('stf-accountant');
    const res = await call<MemberDetail>('POST', '/members/mem-1104/transfers', { toDepartmentId: 'dept-fin', effectiveDate: '2026-12-01' }, acc);
    expect(res.body.upcomingTransfer?.effectiveCycle).toBe('2026-12');
    expect(res.body.demoAgreeAs).toBeUndefined();
    expect((await call('POST', '/members/mem-1104/mandate/agree', {}, acc)).status).toBe(403);
    const ddo = await login('stf-ddo-fin');
    const view = await call<MemberDetail>('GET', '/members/mem-1104', undefined, ddo);
    expect(view.body.can.agreeMandate).toBe(true);
    expect((await call<MemberDetail>('POST', '/members/mem-1104/mandate/agree', {}, ddo)).body.mandate?.agreedByName).toBe('Kiran Kumar');
    expect((await call('POST', '/members/mem-1104/transfers', { toDepartmentId: 'dept-fin', effectiveDate: '' }, acc)).body.fieldErrors).toMatchObject({ toDepartmentId: expect.any(String), effectiveDate: expect.any(String) });
  });
});

describe('profile change requests (MB-19 → DDO → ST-18)', () => {
  it('phone request → Finance DDO certifies → Accountant approves → phone sees the new value', async () => {
    const lakshmi = await login('mem-1101', 'app');
    const before = (await call<MyProfile>('GET', '/me/profile', undefined, lakshmi)).body;
    expect(before.pendingFields).toContain('nominee.name');
    const req = await call<ProfileChangeRequest>('POST', '/me/profile/change-requests', { fields: [{ field: 'designation', newValue: 'Assistant Secretary' }], reason: 'Promoted from 01 Oct 2026', documentName: 'order.pdf' }, lakshmi);
    expect(req.status).toBe(201);
    expect(req.body.route).toBe('DDO_THEN_OFFICE');
    // pending field cannot be requested twice
    expect((await call('POST', '/me/profile/change-requests', { fields: [{ field: 'nominee.name', newValue: 'Someone Else' }], reason: 'Another reason' }, lakshmi)).body.fieldErrors?.['fields.nominee.name']).toBeTruthy();

    const acc = await login('stf-accountant');
    expect((await call('POST', `/profile-change-requests/${req.body.id}/decision`, { approve: true }, acc)).status).toBe(409);
    const ddo = await login('stf-ddo-fin');
    const ddoList = await call<ChangeRequestList>('GET', '/profile-change-requests', undefined, ddo);
    expect(ddoList.body.rows.find((r) => r.id === req.body.id)?.myAction).toBe('certify');
    expect(ddoList.body.rows.every((r) => r.route === 'DDO_THEN_OFFICE' && r.departmentId === 'dept-fin')).toBe(true);
    await call<ChangeRequestRow>('POST', `/profile-change-requests/${req.body.id}/certify`, { approve: true }, ddo);
    const accList = await call<ChangeRequestList>('GET', '/profile-change-requests', undefined, acc);
    expect(accList.body.rows.find((r) => r.id === req.body.id)?.myAction).toBe('decide');
    const decided = await call<ChangeRequestRow>('POST', `/profile-change-requests/${req.body.id}/decision`, { approve: true }, acc);
    expect(decided.body.status).toBe('APPROVED');

    const after = (await call<MyProfile>('GET', '/me/profile', undefined, lakshmi)).body;
    expect(after.member.designation).toBe('Assistant Secretary');
    expect(after.serviceEvents[0]?.type).toBe('DESIGNATION_CHANGED');
    expect(store.db.notifications[0]).toMatchObject({ recipientId: 'mem-1101', title: 'Profile updated' });
  });

  it('rejection needs a reason; only the Accountant decides', async () => {
    const acc = await login('stf-accountant');
    const list = (await call<ChangeRequestList>('GET', '/profile-change-requests', undefined, acc)).body;
    const office = list.rows.find((r) => r.status === 'PENDING' && r.route === 'OFFICE')!;
    expect((await call('POST', `/profile-change-requests/${office.id}/decision`, { approve: true }, await login('stf-secretary'))).status).toBe(403);
    expect((await call('POST', `/profile-change-requests/${office.id}/decision`, { approve: false }, acc)).status).toBe(400);
    const r = await call<ChangeRequestRow>('POST', `/profile-change-requests/${office.id}/decision`, { approve: false, remarks: 'Send the Aadhaar copy' }, acc);
    expect(r.body).toMatchObject({ status: 'REJECTED', remarks: 'Send the Aadhaar copy' });
    expect((await call('POST', `/profile-change-requests/${office.id}/decision`, { approve: true }, acc)).status).toBe(409);
  });

  it('member updates contact details directly and changes mobile with an OTP', async () => {
    const m = await login('mem-1103', 'app');
    const contact = await call<MyProfile>('PATCH', '/me/profile/contact', { email: 'sravani@example.org', presentAddress: { ...address, line1: 'Flat 202, Sai Residency' } }, m);
    expect(contact.body.member.email).toBe('sravani@example.org');
    expect((await call('PATCH', '/me/profile/contact', { email: 'bad' }, m)).status).toBe(400);
    const otp = await call<OtpChallenge>('POST', '/me/profile/mobile', { mobile: '9988776655' }, m);
    expect(otp.body.demoOtp).toBe('123456');
    expect((await call('POST', '/me/profile/mobile/verify', { otpRef: otp.body.otpRef, otp: '000000' }, m)).status).toBe(400);
    const done = await call<MyProfile>('POST', '/me/profile/mobile/verify', { otpRef: otp.body.otpRef, otp: '123456' }, m);
    expect(done.body.member.mobile).toBe('9988776655');
    expect(done.body.member.mobileMasked).toBe('99XXXXXX55');
    expect((await call('POST', '/me/profile/mobile', { mobile: '9000100002' }, m)).status).toBe(409);
  });
});
