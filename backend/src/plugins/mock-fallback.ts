import proxy from '@fastify/http-proxy';
import type { SessionUser } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    /** Dev only (docs/22 §4, §5.1): talks to the mock API for routes and data not moved yet. */
    mockBridge?: SessionBridge;
  }
  interface FastifyRequest {
    /** Session bridge: the mock API token for this request's user. */
    mockToken?: string;
  }
}

/**
 * Backend writes the mock still depends on (it calculates loans, deposits and demand with its own
 * copy of settings, departments and staff). After the backend saves one, the same request is sent
 * to the mock so both agree. Removed with the fallback in P9 (each route leaves this list when the
 * modules reading it move to the backend).
 */
/** Mock routes that can create a member while joining still runs there (until P4c). */

const MIRRORED_ROUTES = new Set([
  'PUT /api/v1/settings/society',
  'PUT /api/v1/settings/values',
  'PUT /api/v1/settings/loan-products/:code',
  'POST /api/v1/departments',
  'PUT /api/v1/departments/:id',
  'PUT /api/v1/notification-templates/:key',
  'POST /api/v1/users',
  'PUT /api/v1/users/:id',
]);

/**
 * Session bridge (docs/22 §5.1): the backend signs users in, but routes the backend has not built
 * yet still run on the mock API, which only accepts its own session tokens. For a signed-in user
 * we ask the mock for a session of the same user (cached per user).
 */
export class SessionBridge {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(readonly upstream: string) {}

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

  /** Calls the mock as `user` (or anonymously), retrying once with a fresh session after a 401. */
  async send(user: SessionUser | undefined, method: string, path: string, body?: unknown): Promise<Response> {
    const attempt = async () => {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (user) headers.authorization = `Bearer ${await this.tokenFor(user)}`;
      return fetch(`${this.upstream}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    };
    let res = await attempt();
    if (res.status === 401 && user) {
      this.clear();
      res = await attempt();
    }
    return res;
  }

  /** Dev-only mock endpoints that need no session (`/__demo/...`). */
  async getPublic<T>(path: string): Promise<T> {
    const res = await this.send(undefined, 'GET', path);
    if (!res.ok) throw new Error(`mock GET ${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  /** Record sync (docs/22 §5.4): upsert records the backend now owns into the mock. */
  async sync(records: Record<string, unknown[]>): Promise<void> {
    const res = await this.send(undefined, 'POST', '/api/v1/__demo/sync', records);
    if (!res.ok) throw new Error(`mock sync: ${res.status}`);
  }

  async getAs<T>(user: SessionUser, path: string): Promise<T> {
    const res = await this.send(user, 'GET', path);
    if (!res.ok) throw new Error(`mock GET ${path}: ${res.status}`);
    return (await res.json()) as T;
  }
}

/**
 * Registered BEFORE the modules: creates the bridge and the mirror hook (hooks only apply to
 * routes registered after them). Never registered in production (config/env.ts).
 */
export const mockBridgePlugin = fp<{ upstream: string }>(
  async (app, { upstream }) => {
    const bridge = new SessionBridge(upstream);
    app.decorate('mockBridge', bridge);

    // Mirror: runs before the reply leaves, so the caller's next request sees both servers agree.
    app.addHook('onSend', async (request, reply, payload) => {
      const route = `${request.method} ${request.routeOptions.url ?? ''}`;
      if (reply.statusCode >= 300 || !MIRRORED_ROUTES.has(route)) return payload;
      try {
        const res = await bridge.send(request.session, request.method, request.url.split('?')[0]!, request.body);
        if (!res.ok) request.log.warn({ route, status: res.status, body: await res.text() }, 'mock mirror refused the change');
      } catch (err) {
        request.log.warn({ route, err }, 'mock mirror failed');
      }
      return payload;
    });
  },
  { name: 'mock-bridge' },
);

/**
 * Dev-only strangler fallback (docs/22 §4): any request the backend has no route for yet is
 * forwarded to the mock API, so both apps work end to end against :4100.
 * Routes the backend does implement always win (static routes beat the `/*` wildcard).
 * Registered LAST. Removed in P9; never registered in production (config/env.ts).
 */
export const mockFallbackPlugin = fp(
  async (app) => {
    const bridge = app.mockBridge;
    if (!bridge) throw new Error('mock-fallback needs mock-bridge');

    await app.register(proxy, {
      upstream: bridge.upstream,
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
          // A 401 on a bridged token means the mock forgot its sessions (restart).
          if ((request as FastifyRequest).mockToken && res.statusCode === 401) bridge.clear();
          reply.send(res.stream);
        },
      },
    });
    app.log.warn({ upstream: bridge.upstream }, 'mock fallback ON: unbuilt routes are forwarded to the mock API');
  },
  { name: 'mock-fallback', dependencies: ['mock-bridge'] },
);
