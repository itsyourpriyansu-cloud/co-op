import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fail } from '../../common/errors/app-error';
import { todayIST } from '../../common/utils/dates';
import { runSeed } from '../../db/seed';

const demoState = z.record(z.string(), z.unknown());

/**
 * Demo controls (DEMO_MODE only, docs/20). Not available in production (DEMO_MODE is always off).
 * - Reset: puts the backend's tables back to the demo dataset and resets the mock API too.
 * - Failure rate: the backend fails that share of calls (plugins/demo-failures) and so does the mock.
 */
export const demoRoutes: FastifyPluginAsyncZod = async (app) => {
  const demoOnly = () => {
    if (!app.env.DEMO_MODE) fail('NOT_FOUND', 'Demo controls are not available on this server.');
  };

  app.post('/__demo/reset', { schema: { tags: ['demo'], summary: 'Reset the demo data on the backend and the mock API', response: { 200: demoState } } }, async (request) => {
    demoOnly();
    await runSeed(app.db, { staffPassword: app.env.SEED_STAFF_PASSWORD });
    app.permissions.reload();
    if (app.demoFailure) app.demoFailure.rate = 0;
    await app.audit.record(request, { action: 'demo.reset', entity: 'system', summary: 'Demo data reset', actor: { id: 'demo', name: 'Demo reset' } });
    const bridge = app.mockBridge;
    if (!bridge) return { today: todayIST(), failureRate: 0 };
    bridge.clear();
    const res = await bridge.send(undefined, 'POST', '/api/v1/__demo/reset');
    if (!res.ok) fail('NETWORK', `The mock API did not reset (${res.status}).`);
    return (await res.json()) as Record<string, unknown>;
  });

  app.post(
    '/__demo/failure-rate',
    { schema: { tags: ['demo'], summary: 'Simulate network errors on a share of API calls (0–1)', body: z.object({ rate: z.number().min(0).max(1) }), response: { 200: demoState } } },
    async (request) => {
      demoOnly();
      app.demoFailure.rate = request.body.rate;
      const bridge = app.mockBridge;
      if (!bridge) return { today: todayIST(), failureRate: request.body.rate };
      const res = await bridge.send(undefined, 'POST', '/api/v1/__demo/failure-rate', request.body);
      if (!res.ok) fail('NETWORK', `The mock API did not accept the failure rate (${res.status}).`);
      return (await res.json()) as Record<string, unknown>;
    },
  );
};
