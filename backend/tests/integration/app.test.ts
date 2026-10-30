import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fail } from '../../src/common/errors/app-error';
import { requireRole } from '../../src/common/guards';
import { loadEnv } from '../../src/config/env';
import { runSeed } from '../../src/db/seed';
import { buildTestApp } from '../helpers/test-app';

describe('app wiring (P0)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  it('serves the OpenAPI document with /health in it', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().paths).toHaveProperty('/health');
  });

  it('answers unknown routes with the documented NOT_FOUND body', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nothing-here?x=1' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: 'NOT_FOUND', message: 'No route for GET /api/v1/nothing-here' });
  });

  it('sends CORS headers and answers preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'http://localhost:5180', 'access-control-request-method': 'GET' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5180');
  });

  it('records the seed in system_info', async () => {
    const names = await runSeed(app.db, { staffPassword: 'unused-here' }, [{ name: 'probe', run: async () => {} }]);
    expect(names).toEqual(['probe']);
  });
});

describe('error envelope (docs/11 §1)', () => {
  it('maps AppError, Zod validation and guards to the documented bodies', async () => {
    const probe = await buildTestApp({}, { ready: false });
    const typed = probe.withTypeProvider<ZodTypeProvider>();
    typed.get('/probe/rule', async () => fail('RULE_VIOLATION', 'Loan ends after retirement.', { ruleId: 'BR-002' }));
    typed.post('/probe/body', { schema: { body: z.object({ amount: z.number().positive() }) } }, async () => ({ ok: true }));
    typed.get('/probe/guarded', { preHandler: requireRole('ACCOUNTANT') }, async () => ({ ok: true }));
    typed.get('/probe/crash', async () => {
      throw new Error('boom');
    });
    await probe.ready();
    try {
      const rule = await probe.inject({ method: 'GET', url: '/probe/rule' });
      expect(rule.statusCode).toBe(422);
      expect(rule.json()).toEqual({ code: 'RULE_VIOLATION', message: 'Loan ends after retirement.', ruleId: 'BR-002' });

      const bad = await probe.inject({ method: 'POST', url: '/probe/body', payload: { amount: -5 } });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { amount: expect.any(String) } });

      const guarded = await probe.inject({ method: 'GET', url: '/probe/guarded' });
      expect(guarded.statusCode).toBe(401);
      expect(guarded.json()).toMatchObject({ code: 'UNAUTHENTICATED' });

      const crash = await probe.inject({ method: 'GET', url: '/probe/crash' });
      expect(crash.statusCode).toBe(500);
      expect(crash.json()).toEqual({ code: 'NETWORK', message: 'Unexpected server error.' });
    } finally {
      await probe.close();
    }
  });
});

describe('mock fallback (docs/22 §4)', () => {
  let upstream: FastifyInstance;
  let app: FastifyInstance;
  beforeAll(async () => {
    upstream = Fastify();
    upstream.setValidatorCompiler(validatorCompiler);
    upstream.setSerializerCompiler(serializerCompiler);
    upstream.get('/api/v1/deposits', async (_req, reply) =>
      reply.header('access-control-allow-origin', '*').send({ items: [], from: 'mock' }),
    );
    upstream.get('/health', async () => ({ service: 'tgseccsl-mock-api' }));
    await upstream.listen({ port: 0, host: '127.0.0.1' });
    const { port } = upstream.server.address() as { port: number };
    app = await buildTestApp({ MOCK_FALLBACK_URL: `http://127.0.0.1:${port}` });
  });
  afterAll(async () => {
    await app.close();
    await upstream.close();
  });

  it('forwards routes the backend does not have yet', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/deposits', headers: { origin: 'http://localhost:5180' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], from: 'mock' });
    expect(res.headers['x-served-by']).toBe('mock-fallback');
    // Only this server's CORS header, never a duplicate from the mock.
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5180');
  });

  it('keeps routes the backend owns', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json().service).toBe('tgseccsl-backend');
  });

  it('is never enabled in production, and neither is demo sign-in', () => {
    const secrets = { JWT_SECRET: 'x'.repeat(40), DATA_ENCRYPTION_KEY: 'y'.repeat(40) };
    const env = loadEnv({ ...process.env, ...secrets, NODE_ENV: 'production', MOCK_FALLBACK_URL: 'http://localhost:4000', DEMO_MODE: 'true' });
    expect(env.MOCK_FALLBACK_URL).toBeUndefined();
    expect(env.DEMO_MODE).toBe(false);
  });

  it('refuses to start in production without real secrets', () => {
    expect(() => loadEnv({ ...process.env, NODE_ENV: 'production' })).toThrow(/JWT_SECRET and DATA_ENCRYPTION_KEY are required/);
  });
});

describe('configuration', () => {
  it('fails fast with a readable message', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL must be a postgres:\/\/ URL/);
  });
});
