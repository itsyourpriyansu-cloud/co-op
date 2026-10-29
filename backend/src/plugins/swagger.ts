import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { APP_VERSION } from '../config/constants';

/** OpenAPI generated from each route's Zod schemas. Browse at /docs, raw JSON at /docs/json. */
export const swaggerPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'TGSECCSL backend API',
          description: 'Production backend for the Admin Console and Member App (docs/11, docs/22).',
          version: APP_VERSION,
        },
        components: {
          securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  },
  { name: 'swagger' },
);
