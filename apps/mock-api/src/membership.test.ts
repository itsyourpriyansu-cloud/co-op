// Staff side of joining (ST-14 … ST-17, D-053): each role acts at its own stage only.
import { beforeEach, describe, expect, it } from 'vitest';
import type { MembershipDetail, MembershipList, Session } from '@tgs/types';
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

const login = async (personaId: string) => (await call<Session>('POST', '/auth/persona', { personaId, channel: 'console' })).body.token;
const act = (id: string, action: string, token: string, body: unknown = {}) => call<MembershipDetail & { code?: string; fieldErrors?: Record<string, string> }>('POST', `/membership/applications/${id}/actions/${action}`, body, token);

describe('membership applications (staff)', () => {
  it('scopes the DDO to their department and hides drafts', async () => {
    const admin = await call<MembershipList>('GET', '/membership/applications', undefined, await login('stf-admin'));
    const ddo = await call<MembershipList>('GET', '/membership/applications', undefined, await login('stf-ddo-fin'));
    expect(admin.body.rows.length).toBeGreaterThan(ddo.body.rows.length);
    expect(ddo.body.rows.every((r) => r.departmentId === 'dept-fin')).toBe(true);
    expect(ddo.body.scope.departmentName).toBe('Finance');
    expect(admin.body.rows.some((r) => r.status === 'DRAFT')).toBe(false);
  });

  it('flags the seeded application that reuses a member mobile', async () => {
    const list = await call<MembershipList>('GET', '/membership/applications', undefined, await login('stf-admin'));
    expect(list.body.rows.some((r) => r.flags.includes('EXISTING_MEMBER') || r.flags.includes('DUPLICATE_MOBILE'))).toBe(true);
  });

  it('runs Received → DDO → Office → Secretary → President → Cashier → Member', async () => {
    const accountant = await login('stf-accountant');
    const list = await call<MembershipList>('GET', '/membership/applications', undefined, accountant);
    const target = list.body.rows.find((r) => r.status === 'SUBMITTED' && r.departmentId === 'dept-fin');
    expect(target?.waitingOnMe).toBe(true);
    const id = target!.id;

    // Wrong role at a stage is refused
    expect((await act(id, 'sendToDdo', await login('stf-secretary'))).status).toBe(403);
    expect((await act(id, 'approve', accountant)).status).toBe(409); // not a step at this stage

    let r = await act(id, 'sendToDdo', accountant, { remarks: 'Documents complete.' });
    expect(r.body.application.status).toBe('DDO_CERTIFICATION');

    const ddo = await login('stf-ddo-fin');
    const noMandate = await act(id, 'certify', ddo, { items: { name: 'OK' } });
    expect(noMandate.status).toBe(400);
    expect(Object.keys(noMandate.body.fieldErrors ?? {})).toEqual(expect.arrayContaining(['items', 'mandateAgreed']));
    const all = { name: 'OK', fatherName: 'OK', dob: 'OK', address: 'OK', designation: 'OK', office: 'OK', appointment: 'OK' };
    r = await act(id, 'certify', ddo, { items: all, mandateAgreed: true });
    expect(r.body.application.ddoCertification?.departmentName).toBe('Finance');

    r = await act(id, 'forward', accountant, { remarks: 'Recommended.' });
    r = await act(id, 'approve', await login('stf-secretary'), {});
    expect(r.body.application.status).toBe('APPROVAL_PRESIDENT');

    const president = await login('stf-president');
    expect((await act(id, 'approve', president, {})).status).toBe(400); // must choose the share route
    r = await act(id, 'approve', president, { sharePaymentRoute: 'COUNTER' });
    expect(r.body.application.status).toBe('SHARE_PAYMENT_PENDING');

    const cashier = await login('stf-cashier');
    expect((await act(id, 'recordSharePayment', cashier, { mode: 'UPI' })).status).toBe(400); // UPI needs a reference
    r = await act(id, 'recordSharePayment', cashier, { mode: 'UPI', reference: 'UPI-778812' });
    expect(r.body.application.status).toBe('ACTIVE');
    expect(r.body.application.allottedGeneralNo).toBeDefined();
    expect(r.body.application.shareReceipt?.amount).toBe(r.body.shareAmount);
    expect(r.body.application.events.slice(-6).map((e) => e.actorRole)).toEqual(['ACCOUNTANT', 'DDO', 'ACCOUNTANT', 'SECRETARY', 'PRESIDENT', 'CASHIER']);
  });

  it('returns to the applicant with a reason, and demo controls can act for another department', async () => {
    const admin = await login('stf-admin');
    const list = await call<MembershipList>('GET', '/membership/applications', undefined, admin);
    const other = list.body.rows.find((r) => r.status === 'DDO_CERTIFICATION' && r.departmentId !== 'dept-fin');
    expect(other).toBeDefined();
    const detail = await call<MembershipDetail>('GET', `/membership/applications/${other!.id}`, undefined, admin);
    expect(detail.body.actions).toEqual([]);
    expect(detail.body.demoActAs?.role).toBe('DDO');
    const after = await call<MembershipDetail>('POST', `/membership/applications/${other!.id}/demo-act`, {}, admin);
    expect(after.body.application.status).toBe('OFFICE_REVIEW');

    const accountant = await login('stf-accountant');
    expect((await act(other!.id, 'returnToApplicant', accountant, { remarks: 'short' })).status).toBe(400);
    const back = await act(other!.id, 'returnToApplicant', accountant, { remarks: 'Upload a clearer appointment order.', field: 'documents.APPOINTMENT_ORDER' });
    expect(back.body.application.status).toBe('INFO_REQUESTED');
    expect(back.body.application.infoRequest?.by).toBe('Accountant');
  });
});
