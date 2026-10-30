import type { ServiceErrorBody } from '@tgs/types';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    /** Demo control "Simulate network errors" (docs/20): share of API calls that fail on purpose. */
    demoFailure: { rate: number };
  }
}

/**
 * DEMO_MODE only, registered before the modules: with a failure rate set from the console's Demo
 * tag, that share of API calls answers 503 NETWORK, exactly like the mock API, so every screen's
 * error state can be shown on the backend too. Demo controls themselves never fail.
 */
export const demoFailuresPlugin = fp(
  async (app) => {
    app.decorate('demoFailure', { rate: 0 });
    app.addHook('onRequest', async (request, reply) => {
      const { rate } = app.demoFailure;
      if (rate <= 0 || !request.url.startsWith('/api/v1/') || request.url.includes('/__demo/')) return;
      if (Math.random() < rate) {
        await reply.status(503).send({ code: 'NETWORK', message: 'Simulated network failure (demo).' } satisfies ServiceErrorBody);
      }
    });
  },
  { name: 'demo-failures' },
);
