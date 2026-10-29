import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from './config/env';
import { createDb, type DbHandle } from './db/client';
import { registerModules } from './modules';
import { dbPlugin } from './plugins/db';
import { errorHandlerPlugin } from './plugins/error-handler';
import { mockFallbackPlugin } from './plugins/mock-fallback';
import { securityPlugin } from './plugins/security';
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
  await app.register(swaggerPlugin);

  await registerModules(app);

  if (env.MOCK_FALLBACK_URL) await app.register(mockFallbackPlugin, { upstream: env.MOCK_FALLBACK_URL });

  return app;
}
