import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HealthController } from './health.controller';
import { HealthRepository } from './health.repository';
import { healthResponseSchema } from './health.schema';
import { HealthService } from './health.service';

/**
 * Reference module for the layered pattern (docs/22 §2):
 * routes → controller → service → repository → models, with Zod schemas per route.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new HealthController(new HealthService(new HealthRepository(app.db)));

  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Server and database status',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    controller.get,
  );
};
