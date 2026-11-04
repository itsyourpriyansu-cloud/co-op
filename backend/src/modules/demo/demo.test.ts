import type { DatasetSummary } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { businessToday } from '../../common/utils/business-date';
import { demoDataset } from '../../db/seed/dataset';

// P8d (docs/22 §5.7): the demo controls live on the backend.
describe('demo controls (P8d)', () => {
  let app: FastifyInstance;
  const post = (url: string, payload?: object) => app.inject({ method: 'POST', url: `/api/v1${url}`, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('the clock starts at the dataset date, moves, and a reset puts it back', async () => {
    const data = demoDataset();
    expect((await app.inject({ method: 'GET', url: '/api/v1/__demo/state' })).json()).toMatchObject({ today: data.today, currentCycle: data.currentCycle, failureRate: 0 });
    expect((await post('/__demo/clock', { today: '2026-12-01' })).json().today).toBe('2026-12-01');
    expect(await businessToday(app)).toBe('2026-12-01');
    expect((await post('/__demo/clock', { today: '1 Dec' })).statusCode).toBe(400);
    expect((await post('/__demo/failure-rate', { rate: 0.5 })).json().failureRate).toBe(0.5);
    const reset = (await post('/__demo/reset')).json();
    expect(reset).toMatchObject({ today: data.today, failureRate: 0 });
  });

  it('the State Explorer reads the database', async () => {
    const d = (await app.inject({ method: 'GET', url: '/api/v1/__demo/dataset' })).json() as DatasetSummary;
    expect(d.counts.members).toBe(demoDataset().members.length);
    expect(d.counts.scenarios).toBe(demoDataset().scenarios.length);
    expect((await app.inject({ method: 'GET', url: '/api/v1/__demo/sample' })).json().loans.length).toBeGreaterThan(0);
    expect((await app.inject({ method: 'GET', url: '/api/v1/__demo/scenarios' })).statusCode).toBe(200);
  });
});
