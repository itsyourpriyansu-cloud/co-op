import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fp from 'fastify-plugin';

/** CORS + security headers. An empty origin list allows any origin (development, like the mock API). */
export const securityPlugin = fp<{ corsOrigins: string[] }>(
  async (app, { corsOrigins }) => {
    await app.register(cors, {
      origin: corsOrigins.length ? corsOrigins : true,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    // JSON API: the CSP only matters for the /docs page, which needs inline styles and scripts.
    await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  },
  { name: 'security' },
);
