import type { AuditLogEntry, AuditLogList, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

describe('audit log viewer (G1, D-111)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  const get = (url: string, s: Session) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant')]);
  });
  afterAll(() => app.close());

  it('the Super Admin reads it newest first; others are refused', async () => {
    expect((await get('/audit', accountant)).statusCode).toBe(403);
    const list = (await get('/audit?pageSize=5', admin)).json() as AuditLogList;
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.total).toBeGreaterThanOrEqual(list.items.length);
    expect(list.entities.length).toBeGreaterThan(0);
    const times = list.items.map((r) => r.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('filters by text, entity and date, and opens one row with what changed', async () => {
    const signIns = (await get('/audit?q=signed%20in&pageSize=50', admin)).json() as AuditLogList;
    expect(signIns.items.every((r) => /signed in/i.test(`${r.summary} ${r.action} ${r.actorName} ${r.entityId}`))).toBe(true);
    const entity = signIns.items[0]?.entity ?? 'auth';
    const byEntity = (await get(`/audit?entity=${entity}`, admin)).json() as AuditLogList;
    expect(byEntity.items.every((r) => r.entity === entity)).toBe(true);
    expect(((await get('/audit?from=2000-01-01&to=2000-01-02', admin)).json() as AuditLogList).total).toBe(0);
    expect((await get('/audit?from=yesterday', admin)).statusCode).toBe(400);
    const one = (await get(`/audit/${byEntity.items[0]!.id}`, admin)).json() as AuditLogEntry;
    expect(one).toMatchObject({ id: byEntity.items[0]!.id, entity });
    expect(one).toHaveProperty('before');
    expect((await get('/audit/not-a-uuid', admin)).statusCode).toBe(404);
  });
});
