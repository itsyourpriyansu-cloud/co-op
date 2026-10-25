// Joining journey end to end through the API (D-026, docs/10 §2).
import { beforeEach, describe, expect, it } from 'vitest';
import type { MembershipApplication, MembershipForm, OtpChallenge, Session } from '@tgs/types';
import { createApp } from './app';
import { Store } from './store';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp({ store: new Store({ persist: false, dataDir: '.data-test', latencyMs: [0, 0] }), version: 'test' });
});

const call = async <T>(method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as T };
};

const COMPLETE: MembershipForm = {
  personal: { fullName: 'Kavya Reddy', fatherName: 'Ramesh Reddy', dob: '1996-03-14', gender: 'F', mobile: '9876500011' },
  address: { present: { line1: 'H.No 4-12, Ameerpet', city: 'Hyderabad', district: 'Hyderabad', pincode: '500016' }, sameAsPresent: true },
  employment: { departmentId: 'dept-fin', designation: 'Junior Assistant', employmentType: 'REGULAR', regularAppointmentDate: '2022-07-01' },
  shares: { sharesProposed: 20 },
  nominee: { name: 'Ramesh Reddy', relation: 'Father' },
  documents: [
    { type: 'PHOTO', fileName: 'photo.jpg', uploadedAt: '2026-10-24T10:00:00Z' },
    { type: 'ID_PROOF', fileName: 'id.pdf', uploadedAt: '2026-10-24T10:00:00Z' },
    { type: 'APPOINTMENT_ORDER', fileName: 'order.pdf', uploadedAt: '2026-10-24T10:00:00Z' },
  ],
  declarations: { byelawsAccepted: true, noOtherSociety: true, recoveryMandateAccepted: true },
};

async function signUp() {
  const otp = await call<OtpChallenge>('POST', '/joining/signup', { fullName: 'Kavya Reddy', mobile: '9876500011' });
  expect(otp.body.demoOtp).toBe('123456');
  const session = await call<Session>('POST', '/joining/verify', { otpRef: otp.body.otpRef, otp: '123456' });
  expect(session.body.user.role).toBe('APPLICANT');
  return session.body.token;
}

describe('joining from the Member App', () => {
  it('serves reference data without sign-in', async () => {
    const ref = await call<{ departments: unknown[]; agreements: unknown[] }>('GET', '/joining/reference');
    expect(ref.status).toBe(200);
    expect(ref.body.departments).toHaveLength(15);
    expect(ref.body.agreements).toHaveLength(3);
  });

  it('validates sign-up and rejects an existing member’s mobile', async () => {
    expect((await call('POST', '/joining/signup', { fullName: 'A', mobile: '123' })).status).toBe(400);
    expect((await call('POST', '/joining/signup', { fullName: 'Someone', mobile: '9000100101' })).status).toBe(409);
  });

  it('rejects a wrong OTP', async () => {
    const otp = await call<OtpChallenge>('POST', '/joining/signup', { fullName: 'Kavya Reddy', mobile: '9876500011' });
    expect((await call('POST', '/joining/verify', { otpRef: otp.body.otpRef, otp: '000000' })).status).toBe(400);
  });

  it('runs eligibility → draft → sign → submit → advance to member', async () => {
    const token = await signUp();
    expect((await call<null>('GET', '/membership/me', undefined, token)).body).toBeNull();

    const notEligible = await call<{ eligible: boolean }>('POST', '/membership/me/eligibility', { worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: true }, token);
    expect(notEligible.body.eligible).toBe(false);
    const eligible = await call<{ eligible: boolean; application: MembershipApplication }>('POST', '/membership/me/eligibility', { worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: false }, token);
    expect(eligible.body.eligible).toBe(true);
    expect(eligible.body.application.status).toBe('DRAFT');

    // Signing an incomplete form lists exactly what is missing
    const incomplete = await call<{ fieldErrors: Record<string, string> }>('POST', '/membership/me/sign/request', undefined, token);
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.fieldErrors['personal.fatherName']).toBeDefined();

    for (const [k, v] of Object.entries(COMPLETE)) expect((await call('PUT', '/membership/me/draft', { [k]: v }, token)).status).toBe(200);

    const sign = await call<OtpChallenge>('POST', '/membership/me/sign/request', undefined, token);
    expect(sign.status).toBe(200);
    const submitted = await call<MembershipApplication>('POST', '/membership/me/submit', { otpRef: sign.body.otpRef, otp: '123456' }, token);
    expect(submitted.body).toMatchObject({ status: 'SUBMITTED', departmentId: 'dept-fin', sharesProposed: 20 });
    expect(submitted.body.signature?.method).toBe('OTP');
    expect((await call('PUT', '/membership/me/draft', { shares: { sharesProposed: 30 } }, token)).status).toBe(409);

    // Info request → fix → resubmit returns to the requesting stage
    const id = submitted.body.id;
    await call('POST', `/__demo/membership/${id}/advance`);
    const info = await call<MembershipApplication>('POST', `/__demo/membership/${id}/request-info`, {});
    expect(info.body.status).toBe('INFO_REQUESTED');
    await call('PUT', '/membership/me/draft', { employment: { regularAppointmentDate: '2022-08-01' } }, token);
    const sign2 = await call<OtpChallenge>('POST', '/membership/me/sign/request', undefined, token);
    const back = await call<MembershipApplication>('POST', '/membership/me/submit', { otpRef: sign2.body.otpRef, otp: '123456' }, token);
    expect(back.body.status).toBe('DDO_CERTIFICATION');

    // Advance to ACTIVE: General No. allotted and the same login becomes a member
    let last: MembershipApplication = back.body;
    while (last.status !== 'ACTIVE') last = (await call<MembershipApplication>('POST', `/__demo/membership/${id}/advance`)).body;
    expect(last.allottedGeneralNo).toBeDefined();
    const me = await call<{ user: { role: string; generalNo: string } }>('GET', '/me', undefined, token);
    expect(me.body.user).toMatchObject({ role: 'MEMBER', generalNo: last.allottedGeneralNo });
    // The tracker can still load the application to show the welcome screen
    const after = await call<MembershipApplication>('GET', '/membership/me', undefined, token);
    expect(after.status).toBe(200);
    expect(after.body).toMatchObject({ id, status: 'ACTIVE' });
  });
});
