import type { Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

describe('settings & master files (P2, REQ-130)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  let member: Session;
  const get = (url: string, s: Session) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });
  const put = (url: string, s: Session, payload: object) => app.inject({ method: 'PUT', url: `/api/v1${url}`, headers: bearer(s), payload });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant, member] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant'), signInAs(app, 'mem-1101')]);
  });
  afterAll(() => app.close());

  it('serves the settings bundle in the mock API shape, edit rights by permission', async () => {
    const res = await get('/settings', accountant);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.canEdit).toBe(false);
    expect(b.society.registrationNo).toBe('P-929');
    expect(b.loanProducts.map((p: { code: string }) => p.code)).toEqual(['ORDINARY', 'EDUCATION', 'SALARY', 'DEPOSIT']);
    expect(b.settings.insurance).toMatchObject({ loaneeAmount: 100000, nonLoaneeAmount: 20000 });
    expect((await get('/settings', admin)).json().canEdit).toBe(true);
    expect((await get('/settings', member)).statusCode).toBe(403);
  });

  it('a settings change creates a new active version, keeps the old one and confirms the value', async () => {
    expect((await put('/settings/values', accountant, { shareValue: 20000 })).statusCode).toBe(403);
    const before = (await get('/settings', admin)).json().settings;
    expect(before.placeholders).toContain('shareValue');

    const res = await put('/settings/values', admin, { shareValue: 20000, ignoredKey: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.shareValue).toBe(20000);
    expect(res.json().settings.placeholders).not.toContain('shareValue');
    expect(res.json().recentChanges[0]).toMatchObject({ entity: 'settings', actorName: 'Anitha Rao' });

    const versions = (await get('/settings/versions', admin)).json();
    expect(versions.map((v: { version: number; status: string }) => [v.version, v.status])).toEqual([
      [2, 'ACTIVE'],
      [1, 'INACTIVE'],
    ]);
    expect(versions[1].data.shareValue).toBe(before.shareValue);
  });

  it('rejects invalid settings with field errors from @tgs/domain', async () => {
    const res = await put('/settings/values', admin, { minShares: 50, maxShares: 10 });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().fieldErrors).length).toBeGreaterThan(0);
  });

  it('a loan product change is a new version; members see the new rate', async () => {
    const res = await put('/settings/loan-products/ORDINARY', admin, { ratePercent: 13 });
    expect(res.statusCode).toBe(200);
    expect(res.json().loanProducts[0]).toMatchObject({ code: 'ORDINARY', ratePercent: 13, placeholder: false });
    const history = (await get('/settings/loan-products/ORDINARY/versions', admin)).json();
    expect(history[0]).toMatchObject({ version: 2, status: 'ACTIVE', product: { ratePercent: 13 } });
    expect(history[0].summary).toContain('rate 11% → 13%');
    expect(history[1]).toMatchObject({ version: 1, status: 'INACTIVE', product: { ratePercent: 11 } });

    const rates = (await get('/reference/rates', member)).json();
    expect(rates.loanProducts.find((p: { code: string }) => p.code === 'ORDINARY').ratePercent).toBe(13);
    expect(rates.updatedAt).toBeTruthy();

    expect((await put('/settings/loan-products/ORDINARY', admin, { ratePercent: -1 })).statusCode).toBe(400);
    expect((await put('/settings/loan-products/GOLD', admin, { ratePercent: 9 })).statusCode).toBe(400);
  });

  it('edits the society profile and message templates with the same checks as the mock', async () => {
    const soc = await put('/settings/society', admin, { address: '' });
    expect(soc.json().fieldErrors.address).toBeTruthy();
    expect((await put('/settings/society', admin, { shortName: 'TGSECCSL Ltd' })).json().society.shortName).toBe('TGSECCSL Ltd');

    const key = 'loan.surety';
    const bad = await put(`/notification-templates/${key}`, admin, { body: 'Hello {nobody}, please respond in the app.' });
    expect(bad.json().fieldErrors.body).toContain('{nobody}');
    const ok = await put(`/notification-templates/${key}`, admin, { body: '{borrower} asked you to stand surety for {amount}. Please respond in the app.' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().find((t: { key: string }) => t.key === key).body).toContain('stand surety');
  });

  it('the demo "simulate network errors" switch fails backend calls too, never the demo controls', async () => {
    const set = (rate: number) => app.inject({ method: 'POST', url: '/api/v1/__demo/failure-rate', payload: { rate } });
    expect((await set(1)).statusCode).toBe(200);
    const failed = await get('/reference/rates', member);
    expect(failed.statusCode).toBe(503);
    expect(failed.json().code).toBe('NETWORK');
    expect((await set(0)).statusCode).toBe(200);
    expect((await get('/reference/rates', member)).statusCode).toBe(200);
    expect((await set(2)).statusCode).toBe(400);
  });

  it('a demo reset puts every master back to version 1', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/__demo/reset' });
    const b = (await get('/settings', admin)).json();
    expect(b.loanProducts[0].ratePercent).toBe(11);
    expect(b.settings.placeholders).toContain('shareValue');
    expect((await get('/settings/versions', admin)).json()).toHaveLength(1);
  });
});

describe('departments (P2, ST-67)', () => {
  let app: FastifyInstance;
  let admin: Session;
  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    admin = await signInAs(app, 'stf-admin');
  });
  afterAll(() => app.close());

  it('lists departments with the DDO login; every staff role may read', async () => {
    const ddo = await signInAs(app, 'stf-ddo-fin');
    const res = await app.inject({ method: 'GET', url: '/api/v1/departments', headers: bearer(ddo) });
    expect(res.statusCode).toBe(200);
    expect(res.json().find((d: { id: string }) => d.id === 'dept-fin')).toMatchObject({ ddoUserId: 'stf-ddo-fin', memberCount: 0 });
    const member = await signInAs(app, 'mem-1103');
    expect((await app.inject({ method: 'GET', url: '/api/v1/departments', headers: bearer(member) })).statusCode).toBe(403);
  });

  it('adds and edits a department with code checks', async () => {
    const body = { code: 'tstd', name: 'Test Department', ddoName: 'A. Officer', ddoDesignation: 'Section Officer (Claims)' };
    const created = await app.inject({ method: 'POST', url: '/api/v1/departments', headers: bearer(admin), payload: body });
    expect(created.statusCode).toBe(200);
    expect(created.json().find((d: { id: string }) => d.id === 'dept-tstd')).toMatchObject({ code: 'TSTD', kind: 'SECRETARY_DEPT' });
    const dup = await app.inject({ method: 'POST', url: '/api/v1/departments', headers: bearer(admin), payload: body });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().fieldErrors.code).toBe('This code is already used.');
    const edited = await app.inject({ method: 'PUT', url: '/api/v1/departments/dept-tstd', headers: bearer(admin), payload: { name: 'Test Department (renamed)' } });
    expect(edited.json().find((d: { id: string }) => d.id === 'dept-tstd').name).toBe('Test Department (renamed)');
  });
});
