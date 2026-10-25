// M2 settings & masters (ST-60 … ST-67, MB-16).
import { beforeEach, describe, expect, it } from 'vitest';
import type { DepartmentRow, NotificationTemplate, PermissionMatrix, RatesReference, Session, SettingsBundle, StaffUser } from '@tgs/types';
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
  return { status: res.status, body: (await res.json()) as T & { fieldErrors?: Record<string, string> } };
};
const login = async (personaId: string, channel: 'console' | 'app' = 'console') => (await call<Session>('POST', '/auth/persona', { personaId, channel })).body.token;

describe('settings (ST-60, ST-64 … ST-66)', () => {
  it('Super Admin changes the Ordinary rate → members see it on the rate card (M2 exit)', async () => {
    const admin = await login('stf-admin');
    const member = await login('mem-1101', 'app');
    const before = await call<RatesReference>('GET', '/reference/rates', undefined, member);
    expect(before.body.loanProducts.find((p) => p.code === 'ORDINARY')?.ratePercent).toBe(11);
    const r = await call<SettingsBundle>('PUT', '/settings/loan-products/ORDINARY', { ratePercent: 10.5 }, admin);
    expect(r.status).toBe(200);
    expect(r.body.loanProducts.find((p) => p.code === 'ORDINARY')).toMatchObject({ ratePercent: 10.5, placeholder: false });
    expect(r.body.recentChanges[0]?.summary).toContain('11% → 10.5%');
    const after = await call<RatesReference>('GET', '/reference/rates', undefined, member);
    expect(after.body.loanProducts.find((p) => p.code === 'ORDINARY')?.ratePercent).toBe(10.5);
    expect(after.body.updatedAt).toBeDefined();
  });

  it('only the Super Admin can change; bad values are rejected with field errors', async () => {
    const accountant = await login('stf-accountant');
    expect((await call('GET', '/settings', undefined, accountant)).body).toMatchObject({ canEdit: false });
    expect((await call('PUT', '/settings/values', { shareValue: 20000 }, accountant)).status).toBe(403);
    const admin = await login('stf-admin');
    const bad = await call('PUT', '/settings/loan-products/SALARY', { ratePercent: 45, maxAmount: 100 }, admin);
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fieldErrors ?? {})).toEqual(expect.arrayContaining(['ratePercent', 'maxAmount']));
    const slabs = await call('PUT', '/settings/values', { fdSlabs: [{ fromMonths: 12, toMonths: 24, ratePercent: 7 }, { fromMonths: 20, toMonths: 36, ratePercent: 7.5 }] }, admin);
    expect(slabs.status).toBe(400);
    expect(slabs.body.fieldErrors?.['fdSlabs.1.fromMonths']).toContain('Overlaps');
  });

  it('editing a placeholder confirms it', async () => {
    const admin = await login('stf-admin');
    const r = await call<SettingsBundle>('PUT', '/settings/values', { shareValue: 20000, insurance: { collectionMonth: 5 } }, admin);
    expect(r.body.settings.shareValue).toBe(20000);
    expect(r.body.settings.insurance).toMatchObject({ collectionMonth: 5, loaneeAmount: 100000 });
    expect(r.body.settings.placeholders).not.toContain('shareValue');
    expect(r.body.settings.placeholders).not.toContain('insurance.collectionMonth');
  });

  it('society profile requires every field', async () => {
    const admin = await login('stf-admin');
    expect((await call('PUT', '/settings/society', { name: '' }, admin)).status).toBe(400);
    const ok = await call<SettingsBundle>('PUT', '/settings/society', { address: 'Room 12, West Ancillary Building, Hyderabad' }, admin);
    expect(ok.body.society.address).toContain('Room 12');
  });
});

describe('masters (ST-61, ST-62, ST-63, ST-67)', () => {
  it('departments: add, duplicate code refused, update', async () => {
    const admin = await login('stf-admin');
    const list = await call<DepartmentRow[]>('GET', '/departments', undefined, admin);
    expect(list.body.find((d) => d.id === 'dept-fin')).toMatchObject({ ddoUserId: 'stf-ddo-fin' });
    expect(list.body.every((d) => d.memberCount >= 0)).toBe(true);
    const dup = await call('POST', '/departments', { code: 'FIN', name: 'X', ddoName: 'Y', ddoDesignation: 'Z' }, admin);
    expect(dup.body.fieldErrors?.code).toContain('already');
    const added = await call<DepartmentRow[]>('POST', '/departments', { code: 'tour', name: 'Tourism', ddoName: 'Lalitha K', ddoDesignation: 'Assistant Secretary', kind: 'SECRETARY_DEPT' }, admin);
    expect(added.body.some((d) => d.code === 'TOUR')).toBe(true);
    const upd = await call<DepartmentRow[]>('PUT', '/departments/dept-tour', { ddoName: 'Lalitha Kumari' }, admin);
    expect(upd.body.find((d) => d.id === 'dept-tour')?.ddoName).toBe('Lalitha Kumari');
  });

  it('users: create a DDO, deactivate → cannot sign in', async () => {
    const admin = await login('stf-admin');
    expect((await call('POST', '/users', { name: 'X', userId: 'x', role: 'DDO' }, admin)).body.fieldErrors).toMatchObject({ userId: expect.any(String), departmentId: expect.any(String) });
    const created = await call<StaffUser[]>('POST', '/users', { name: 'Sunitha Rani', userId: 'ddo.gad', role: 'DDO', departmentId: 'dept-gad', mobile: '9876543210' }, admin);
    expect(created.body.find((u) => u.userId === 'ddo.gad')).toMatchObject({ role: 'DDO', departmentId: 'dept-gad', active: true });
    expect((await call('PUT', '/users/stf-admin', { active: false }, admin)).status).toBe(400);
    await call('PUT', '/users/stf-cashier', { active: false }, admin);
    expect((await call('POST', '/auth/persona', { personaId: 'stf-cashier', channel: 'console' })).status).toBe(403);
    expect((await call('POST', '/users', { name: 'A', userId: 'abc', role: 'CASHIER' }, await login('stf-accountant'))).status).toBe(403);
  });

  it('permission matrix keeps segregation of duties', async () => {
    const m = await call<PermissionMatrix>('GET', '/permissions', undefined, await login('stf-secretary'));
    expect(m.body.roles).toHaveLength(6);
    expect(m.body.grants.SUPER_ADMIN).toContain('settings.edit');
    expect(m.body.grants.ACCOUNTANT).not.toContain('settings.edit');
  });

  it('templates: edit text, unknown placeholders refused', async () => {
    const admin = await login('stf-admin');
    const bad = await call('PUT', '/notification-templates/loan.sanctioned', { body: 'Hi {nickname}, sanctioned!' }, admin);
    expect(bad.body.fieldErrors?.body).toContain('{nickname}');
    const ok = await call<NotificationTemplate[]>('PUT', '/notification-templates/loan.sanctioned', { body: 'Good news: your {product} of {amount} is sanctioned. EMI {emi}.', channels: ['IN_APP', 'WHATSAPP'] }, admin);
    expect(ok.body.find((t) => t.key === 'loan.sanctioned')).toMatchObject({ channels: ['IN_APP', 'WHATSAPP'] });
  });
});
