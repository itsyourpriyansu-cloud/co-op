import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// F-12 (D-093): retired and resigned members keep read-only use of the app; the deceased do not.
describe('ex-employees keep the app (F-12)', () => {
  let app: FastifyInstance;
  const data = demoDataset();
  const start = (mobile: string) => app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile } });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('a retired or resigned member can sign in; a deceased member cannot', async () => {
    const left = data.members.find((m) => m.status === 'RETIRED' || m.status === 'RESIGNED');
    const deceased = data.members.find((m) => m.status === 'DECEASED');
    expect(left ?? deceased).toBeDefined();
    if (left) expect((await start(left.mobile)).statusCode).toBe(200);
    if (deceased) expect((await start(deceased.mobile)).statusCode).not.toBe(200);
  });

});
