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
import { securityPlugin } from './plugins/security';
import { jobsPlugin } from './plugins/jobs';
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
    trustProxy: env.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { corsOrigins: env.CORS_ORIGIN });
  await app.register(dbPlugin, { handle: dbHandle ?? createDb({ url: env.DATABASE_URL, ssl: env.DATABASE_SSL }) });
  await app.register(authPlugin, { env });
  // Sign-in routes have their own stricter `config.rateLimit` (docs/22 §5.1); P9 (D-100) adds a per-IP
  // ceiling on every route, on by default in production. Not under NODE_ENV=test (one IP, many calls).
  const perMinute = env.RATE_LIMIT_PER_MINUTE ?? (env.NODE_ENV === 'production' ? 600 : 0);
  if (env.NODE_ENV !== 'test') await app.register(rateLimit, perMinute ? { global: true, max: perMinute, timeWindow: '1 minute' } : { global: false });
  await app.register(servicesPlugin);
  // P9 (D-100): the API explorer is for development; production does not serve it.
  if (env.NODE_ENV !== 'production') await app.register(swaggerPlugin);
  // Demo "simulate network errors" must sit before every route it can fail (docs/20).
  if (env.DEMO_MODE) await app.register(demoFailuresPlugin);

  await registerModules(app);
  // Daily jobs; tests run them on demand instead.
  if (env.NODE_ENV !== 'test') await app.register(jobsPlugin);


  return app;
}
