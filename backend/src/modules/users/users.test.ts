import type { Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

describe('staff users, permissions and audit (P1a)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    admin = await signInAs(app, 'stf-admin');
    accountant = await signInAs(app, 'stf-accountant');
  });
  afterAll(() => app.close());

  it('lists users for staff in the mock API shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users', headers: bearer(accountant) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toContainEqual(expect.objectContaining({ id: 'stf-ddo-fin', userId: 'ddo.fin', role: 'DDO', departmentId: 'dept-fin', active: true }));
  });

  it('lets only the Super Admin add users', async () => {
    const body = { name: 'Asha K', userId: 'asha.k', role: 'CASHIER' };
    expect((await app.inject({ method: 'POST', url: '/api/v1/users', headers: bearer(accountant), payload: body })).statusCode).toBe(403);
    const res = await app.inject({ method: 'POST', url: '/api/v1/users', headers: bearer(admin), payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toContainEqual(expect.objectContaining({ id: 'stf-asha-k', userId: 'asha.k', active: true }));
    // Same user ID again
    expect((await app.inject({ method: 'POST', url: '/api/v1/users', headers: bearer(admin), payload: body })).json().fieldErrors.userId).toBe('This user ID is taken.');
  });

  it('validates the form like the mock API', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/users', headers: bearer(admin), payload: { name: '', userId: 'X Y', role: 'DDO' } });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().fieldErrors)).toEqual(expect.arrayContaining(['name', 'userId']));
  });

  it('hands over a temporary password that must be changed', async () => {
    const reset = await app.inject({ method: 'POST', url: '/api/v1/users/stf-asha-k/reset-password', headers: bearer(admin) });
    expect(reset.statusCode).toBe(200);
    const { temporaryPassword } = reset.json();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/login', payload: { username: 'asha.k', password: temporaryPassword } });
    expect(login.json()).toMatchObject({ status: 'OK', mustChangePassword: true });
    const session = login.json().session;

    const weak = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/password', headers: bearer(session), payload: { currentPassword: temporaryPassword, newPassword: 'short' } });
    expect(weak.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/password', headers: bearer(session), payload: { currentPassword: temporaryPassword, newPassword: 'Cashbook2026' } });
    expect(ok.statusCode).toBe(200);
    const again = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/login', payload: { username: 'asha.k', password: 'Cashbook2026' } });
    expect(again.json()).toMatchObject({ status: 'OK', mustChangePassword: false });
  });

  it('stops the Super Admin deactivating themself', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/users/stf-admin', headers: bearer(admin), payload: { name: 'Anitha Rao', userId: 'admin', role: 'SUPER_ADMIN', active: false } });
    expect(res.statusCode).toBe(400);
  });

  it('serves the permission matrix and applies an edit to the guards at once', async () => {
    const matrix = await app.inject({ method: 'GET', url: '/api/v1/permissions', headers: bearer(accountant) });
    expect(matrix.json().grants.CASHIER).toContain('reports.view');

    const cashier = await signInAs(app, 'stf-cashier');
    const canSee = () => app.inject({ method: 'GET', url: '/api/v1/users', headers: bearer(cashier) });
    expect((await canSee()).statusCode).toBe(200);

    const without = matrix.json().grants.CASHIER.filter((p: string) => p !== 'settings.view');
    expect((await app.inject({ method: 'PUT', url: '/api/v1/permissions/CASHIER', headers: bearer(accountant), payload: { permissions: without } })).statusCode).toBe(403);
    const put = await app.inject({ method: 'PUT', url: '/api/v1/permissions/CASHIER', headers: bearer(admin), payload: { permissions: without } });
    expect(put.statusCode).toBe(200);
    expect((await canSee()).statusCode).toBe(403);
  });

  it('keeps the Super Admin able to manage settings and users', async () => {
    const put = await app.inject({ method: 'PUT', url: '/api/v1/permissions/SUPER_ADMIN', headers: bearer(admin), payload: { permissions: ['dashboard.view'] } });
    expect(put.json().grants.SUPER_ADMIN).toEqual(expect.arrayContaining(['settings.edit', 'users.manage', 'settings.view']));
    expect((await app.inject({ method: 'PUT', url: '/api/v1/permissions/CASHIER', headers: bearer(admin), payload: { permissions: ['no.such'] } })).statusCode).toBe(400);
  });

  it('writes an audit row for sign-ins and changes', async () => {
    // Plain SQL keeps the test independent of the repository it checks.
    const result = await app.db.execute<{ action: string }>(sql`select action from audit_log`);
    const actions = new Set(result.rows.map((r) => r.action));
    for (const a of ['auth.demoLogin', 'users.create', 'users.resetPassword', 'auth.passwordChanged', 'permissions.update']) expect(actions).toContain(a);
  });
});
