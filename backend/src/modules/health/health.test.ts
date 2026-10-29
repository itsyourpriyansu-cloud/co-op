import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAppWithDeadDatabase, buildTestApp } from '../../../tests/helpers/test-app';

describe('GET /health (P0 exit test)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  it('reports the server and a reachable database', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ ok: true, service: 'tgseccsl-backend', database: { ok: true } });
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.database.serverVersion).toMatch(/^\d+/);
  });

  it('answers 503 with ok:false when the database is down', async () => {
    const dead = await buildAppWithDeadDatabase();
    try {
      const res = await dead.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ ok: false, database: { ok: false } });
    } finally {
      await dead.close();
    }
  });
});
