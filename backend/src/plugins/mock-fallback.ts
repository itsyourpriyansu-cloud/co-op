import proxy from '@fastify/http-proxy';
import type { SessionUser } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    /** Session bridge: the mock API token for this request's user. */
    mockToken?: string;
  }
}

/**
 * Session bridge (docs/22 §5.1): the backend signs users in, but routes the backend has not built
 * yet still run on the mock API, which only accepts its own session tokens. For a signed-in
 * request we ask the mock for a session of the same user (cached per user) and swap the
 * Authorization header on the way through.
 */
export class SessionBridge {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(private readonly upstream: string) {}

  private key(u: SessionUser): string {
    return [u.id, u.role, u.name, u.departmentId ?? '', u.memberId ?? '', u.generalNo ?? ''].join('|');
  }

  tokenFor(user: SessionUser): Promise<string> {
    const key = this.key(user);
    let token = this.cache.get(key);
    if (!token) {
      token = fetch(`${this.upstream}/api/v1/__demo/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(user),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`mock session failed: ${res.status}`);
        return ((await res.json()) as { token: string }).token;
      });
      token.catch(() => this.cache.delete(key));
      this.cache.set(key, token);
    }
    return token;
  }

  /** The mock forgot its sessions (demo reset, restart): drop ours. */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Dev-only strangler fallback (docs/22 §4): any request the backend has no route for yet is
 * forwarded to the mock API, so both apps work end to end against :4100 from P0 on.
 * Routes the backend does implement always win (static routes beat the `/*` wildcard).
 * Removed in P9; never registered in production (config/env.ts).
 */
export const mockFallbackPlugin = fp<{ upstream: string }>(
  async (app, { upstream }) => {
    const bridge = new SessionBridge(upstream);

    await app.register(proxy, {
      upstream,
      prefix: '/',
      // OPTIONS stays with @fastify/cors so preflight answers come from this server.
      httpMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      preHandler: async (request: FastifyRequest) => {
        if (request.session) request.mockToken = await bridge.tokenFor(request.session);
      },
      replyOptions: {
        rewriteRequestHeaders: (request, headers) => {
          const token = (request as FastifyRequest).mockToken;
          return token ? { ...headers, authorization: `Bearer ${token}` } : headers;
        },
        rewriteHeaders: (headers) => {
          // The mock API adds its own CORS headers; this server already sets them.
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(headers)) {
            if (!k.toLowerCase().startsWith('access-control-')) out[k] = v;
          }
          out['x-served-by'] = 'mock-fallback';
          return out as typeof headers;
        },
        onResponse: (request, reply, res) => {
          const fr = request as FastifyRequest;
          // A demo reset wipes the mock's sessions; a 401 on a bridged token means they are gone.
          if (fr.url.startsWith('/api/v1/__demo/reset') || (fr.mockToken && res.statusCode === 401)) bridge.clear();
          reply.send(res.stream);
        },
      },
    });
    app.log.warn({ upstream }, 'mock fallback ON: unbuilt routes are forwarded to the mock API');
  },
  { name: 'mock-fallback' },
);
