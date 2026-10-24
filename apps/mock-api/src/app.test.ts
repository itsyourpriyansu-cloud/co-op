import { beforeEach, describe, expect, it } from 'vitest';
import type { Me, Persona, Session } from '@tgs/types';
import { createApp } from './app';
import { Store } from './store';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const store = new Store({ persist: false, dataDir: '.data-test', latencyMs: [0, 0] });
  app = createApp({ store, version: 'test' });
});

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function login(personaId: string, channel: 'console' | 'app') {
  const res = await app.request('/api/v1/auth/persona', json({ personaId, channel }));
  return { res, session: (await res.json()) as Session };
}

describe('mock API foundation', () => {
  it('reports health without auth', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: 'tgseccsl-mock-api' });
  });

  it('lists personas per channel', async () => {
    const res = await app.request('/api/v1/__demo/personas?channel=console');
    const personas = (await res.json()) as Persona[];
    expect(personas.length).toBeGreaterThan(0);
    expect(personas.every((p) => p.channel === 'console')).toBe(true);
  });

  it('logs a staff persona in and returns permissions via /me', async () => {
    const { res, session } = await login('stf-admin', 'console');
    expect(res.status).toBe(200);
    const me = await app.request('/api/v1/me', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const body = (await me.json()) as Me;
    expect(body.channel).toBe('console');
    expect(body.permissions).toContain('settings.edit');
  });

  it('keeps staff out of the Member App and members out of the console (D-033)', async () => {
    expect((await login('stf-admin', 'app')).res.status).toBe(403);
    expect((await login('mem-1101', 'console')).res.status).toBe(403);
  });

  it('scopes the DDO without deposits or reports', async () => {
    const { session } = await login('stf-ddo-fin', 'console');
    const me = (await (
      await app.request('/api/v1/me', { headers: { Authorization: `Bearer ${session.token}` } })
    ).json()) as Me;
    expect(me.user.departmentId).toBe('dept-fin');
    expect(me.permissions).not.toContain('deposits.view');
    expect(me.permissions).not.toContain('reports.view');
  });

  it('rejects /me without a token using the documented error body', async () => {
    const res = await app.request('/api/v1/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('logs out', async () => {
    const { session } = await login('mem-1101', 'app');
    const headers = { Authorization: `Bearer ${session.token}` };
    expect((await app.request('/api/v1/auth/logout', { method: 'POST', headers })).status).toBe(
      200,
    );
    expect((await app.request('/api/v1/me', { headers })).status).toBe(401);
  });

  it('injects failures when the demo failure rate is 1', async () => {
    await app.request('/api/v1/__demo/failure-rate', json({ rate: 1 }));
    const res = await app.request('/api/v1/auth/persona', json({ personaId: 'stf-admin' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'NETWORK' });
  });

  it('serves the scenario catalog and dataset counts', async () => {
    const scenarios = (await (await app.request('/api/v1/__demo/scenarios')).json()) as Array<{ id: string }>;
    expect(scenarios.some((s) => s.id === 'SC-PERSONA-TOPUP')).toBe(true);
    const dataset = (await (await app.request('/api/v1/__demo/dataset')).json()) as { counts: Record<string, number> };
    expect(dataset.counts.members).toBe(605);
  });

  it('scopes the dashboard summary to the DDO department and blocks members', async () => {
    const admin = (await login('stf-admin', 'console')).session;
    const ddo = (await login('stf-ddo-fin', 'console')).session;
    const get = async (token: string) =>
      (await app.request('/api/v1/dashboard/summary', { headers: { Authorization: `Bearer ${token}` } })).json() as Promise<{ activeMembers: number; myQueue: number; collectionRate: number }>;
    const all = await get(admin.token);
    const fin = await get(ddo.token);
    expect(fin.activeMembers).toBeLessThan(all.activeMembers);
    expect(fin.myQueue).toBeGreaterThanOrEqual(3); // 2 loans + Ravi's membership application
    expect(all.collectionRate).toBeGreaterThan(0.8);
    const member = (await login('mem-1101', 'app')).session;
    expect((await app.request('/api/v1/dashboard/summary', { headers: { Authorization: `Bearer ${member.token}` } })).status).toBe(403);
  });

  it('validates the demo clock and resets state', async () => {
    expect((await app.request('/api/v1/__demo/clock', json({ today: '24-10-2026' }))).status).toBe(
      400,
    );
    await app.request('/api/v1/__demo/clock', json({ today: '2027-01-15' }));
    await app.request('/api/v1/__demo/failure-rate', json({ rate: 0.5 }));
    const reset = await (await app.request('/api/v1/__demo/reset', { method: 'POST' })).json();
    expect(reset).toMatchObject({ failureRate: 0 });
  });
});
