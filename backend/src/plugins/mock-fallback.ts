import proxy from '@fastify/http-proxy';
import fp from 'fastify-plugin';

/**
 * Dev-only strangler fallback (docs/22 §4): any request the backend has no route for yet is
 * forwarded to the mock API, so both apps work end to end against :4100 from P0 on.
 * Routes the backend does implement always win (static routes beat the `/*` wildcard).
 * Removed in P9; never registered in production (config/env.ts).
 */
export const mockFallbackPlugin = fp<{ upstream: string }>(
  async (app, { upstream }) => {
    await app.register(proxy, {
      upstream,
      prefix: '/',
      // OPTIONS stays with @fastify/cors so preflight answers come from this server.
      httpMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      replyOptions: {
        rewriteHeaders: (headers) => {
          // The mock API adds its own CORS headers; this server already sets them.
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(headers)) {
            if (!k.toLowerCase().startsWith('access-control-')) out[k] = v;
          }
          out['x-served-by'] = 'mock-fallback';
          return out as typeof headers;
        },
      },
    });
    app.log.warn({ upstream }, 'mock fallback ON: unbuilt routes are forwarded to the mock API');
  },
  { name: 'mock-fallback' },
);
