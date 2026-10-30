import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from './config/env';
import { createDb, type DbHandle } from './db/client';
import { registerModules } from './modules';
import { authPlugin } from './plugins/auth';
import { dbPlugin } from './plugins/db';
import { demoFailuresPlugin } from './plugins/demo-failures';
import { errorHandlerPlugin } from './plugins/error-handler';
import { mockBridgePlugin, mockFallbackPlugin } from './plugins/mock-fallback';
import { securityPlugin } from './plugins/security';
import { servicesPlugin } from './plugins/services';
import { swaggerPlugin } from './plugins/swagger';

export interface BuildAppOptions {
  env: Env;
  /** Tests pass their own handle (test database); otherwise one is made from DATABASE_URL. */
  dbHandle?: DbHandle;
  logger?: boolean;
}

/** Builds the Fastify app: plugins → modules → (dev) mock fallback. Does not listen. */
export async function buildApp({ env, dbHandle, logger = true }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger
      ? {
          level: env.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        }
      : false,
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { corsOrigins: env.CORS_ORIGIN });
  await app.register(dbPlugin, { handle: dbHandle ?? createDb({ url: env.DATABASE_URL, ssl: env.DATABASE_SSL }) });
  await app.register(authPlugin, { env });
  // Off by default; sign-in routes opt in with `config.rateLimit` (docs/22 §5.1).
  // Not registered under NODE_ENV=test, where one IP signs in hundreds of times.
  if (env.NODE_ENV !== 'test') await app.register(rateLimit, { global: false });
  await app.register(servicesPlugin);
  await app.register(swaggerPlugin);
  // Dev only: the bridge and its mirror hook must exist before the module routes (docs/22 §4).
  if (env.MOCK_FALLBACK_URL) await app.register(mockBridgePlugin, { upstream: env.MOCK_FALLBACK_URL });
  // Demo "simulate network errors" must sit before every route it can fail (docs/20).
  if (env.DEMO_MODE) await app.register(demoFailuresPlugin);

  await registerModules(app);

  if (env.MOCK_FALLBACK_URL) await app.register(mockFallbackPlugin);

  return app;
}
