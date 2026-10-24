// @tgs/api-client: the single way both apps talk to the API (docs/11).
// Swapping the mock API for the production backend should only change `baseUrl`.
import {
  API_PREFIX,
  type Channel,
  type DemoState,
  type Health,
  type ISODate,
  type Me,
  type Persona,
  type ServiceErrorBody,
  type ServiceErrorCode,
  type Session,
} from '@tgs/types';

export class ApiError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly ruleId?: string;

  constructor(status: number, body: ServiceErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors;
    this.ruleId = body.ruleId;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export interface ApiClientOptions {
  /** Server root, e.g. http://localhost:4000 (no trailing slash needed). May change at runtime (MA-05). */
  baseUrl: string | (() => string | Promise<string>);
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Called on 401 so the app can drop its session. */
  onUnauthenticated?: () => void;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function createApiClient(options: ApiClientOptions) {
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function resolveBase(): Promise<string> {
    const raw = typeof options.baseUrl === 'function' ? await options.baseUrl() : options.baseUrl;
    return raw.replace(/\/+$/, '');
  }

  async function request<T>(
    method: Method,
    path: string,
    body?: unknown,
    versioned = true,
  ): Promise<T> {
    const url = (await resolveBase()) + (versioned ? API_PREFIX : '') + path;
    const token = options.getToken ? await options.getToken() : undefined;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    // Manual timeout: AbortSignal.timeout is not available on every JS engine (Hermes).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, {
        code: 'NETWORK',
        message: "Can't reach the society server. Check your connection and try again.",
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const data: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const errorBody = isErrorBody(data)
        ? data
        : { code: 'NETWORK' as const, message: `Unexpected response (${res.status}).` };
      if (res.status === 401) options.onUnauthenticated?.();
      throw new ApiError(res.status, errorBody);
    }
    return data as T;
  }

  return {
    health: () => request<Health>('GET', '/health', undefined, false),
    me: () => request<Me>('GET', '/me'),
    auth: {
      loginAsPersona: (personaId: string, channel: Channel) =>
        request<Session>('POST', '/auth/persona', { personaId, channel }),
      logout: () => request<{ ok: true }>('POST', '/auth/logout'),
    },
    demo: {
      personas: (channel?: Channel) =>
        request<Persona[]>('GET', `/__demo/personas${channel ? `?channel=${channel}` : ''}`),
      state: () => request<DemoState>('GET', '/__demo/state'),
      reset: () => request<DemoState>('POST', '/__demo/reset'),
      setClock: (today: ISODate | null) => request<DemoState>('POST', '/__demo/clock', { today }),
      setFailureRate: (rate: number) =>
        request<DemoState>('POST', '/__demo/failure-rate', { rate }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isErrorBody(x: unknown): x is ServiceErrorBody {
  return typeof x === 'object' && x !== null && 'code' in x && 'message' in x;
}
