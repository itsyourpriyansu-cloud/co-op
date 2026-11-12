import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../tests/helpers/test-app';

describe('Idempotency-Key (G1, D-111)', () => {
  let app: FastifyInstance;
  let runs = 0;
  let release: () => void = () => {};

  beforeAll(async () => {
    app = await buildTestApp({}, { ready: false });
    app.post('/__probe/pay', async (req, reply) => {
      runs += 1;
      const body = req.body as { amount: number; slow?: boolean; fail?: boolean };
      if (body.slow) await new Promise<void>((r) => (release = r));
      if (body.fail) return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'bad' });
      return reply.status(201).send({ receiptNo: `R-${runs}`, amount: body.amount });
    });
    await app.ready();
  });
  afterAll(() => app.close());

  const pay = (key: string | undefined, payload: object) => app.inject({ method: 'POST', url: '/__probe/pay', headers: key ? { 'idempotency-key': key } : {}, payload });

  it('replays the first answer for a repeat with the same key', async () => {
    const first = await pay('key-aaaa-0001', { amount: 500 });
    const again = await pay('key-aaaa-0001', { amount: 500 });
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.json()).toEqual(first.json());
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(runs).toBe(1);
  });

  it('runs every time without a key, and refuses a reused key with another body', async () => {
    const before = runs;
    await pay(undefined, { amount: 1 });
    await pay(undefined, { amount: 1 });
    expect(runs).toBe(before + 2);
    expect((await pay('key-aaaa-0001', { amount: 999 })).json().code).toBe('VALIDATION_ERROR');
    expect((await pay('bad key!', { amount: 1 })).statusCode).toBe(400);
  });

  it('refuses a repeat while the first is still running', async () => {
    const slow = pay('key-slow-0001', { amount: 10, slow: true });
    await new Promise((r) => setTimeout(r, 100));
    const second = await pay('key-slow-0001', { amount: 10, slow: true });
    expect(second.statusCode).toBe(409);
    release();
    expect((await slow).statusCode).toBe(201);
  });

  it('does not keep a failed answer, so a retry runs again', async () => {
    const before = runs;
    expect((await pay('key-fail-0001', { amount: 5, fail: true })).statusCode).toBe(400);
    expect((await pay('key-fail-0001', { amount: 5, fail: true })).statusCode).toBe(400);
    expect(runs).toBe(before + 2);
  });

  it('purges old keys', async () => {
    expect(await app.purgeIdempotencyKeys(new Date(Date.now() + 60_000).toISOString())).toBeGreaterThan(0);
  });
});
