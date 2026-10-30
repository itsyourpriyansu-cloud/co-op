// The mock API application. `createApp` is pure (no listening) so tests can call it directly.
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import {
  API_PREFIX,
  channelForRole,
  type Channel,
  type Health,
  type Me,
  type Session,
  type SessionUser,
} from '@tgs/types';
import { bindDemoClock } from './clock';
import { fail, ServiceError } from './errors';
import { permissionsFor } from './permissions';
import { Store } from './store';
import { registerJoining } from './joining';
import { registerAccount } from './account';
import { registerInsight } from './insight';
import { registerCollections } from './collections';
import { registerDeposits } from './deposits';
import { registerLoanWorkflow } from './loan-workflow';
import { registerLoans } from './loans';
import { registerDevSync } from './dev-sync';
import { registerMembers } from './members';
import { registerMembership } from './membership';
import { registerSettings } from './settings';
import { dashboardSummary, datasetSample, datasetSummary } from './summary';

type Env = { Variables: { session: SessionUser; token: string } };

export interface AppOptions {
  store: Store;
  version: string;
  /** Allowed browser origins. Omit (or '*') for any origin, which is fine on localhost. */
  corsOrigins?: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createApp({ store, version, corsOrigins }: AppOptions) {
  const app = new Hono<Env>();
  // D-065: server timestamps follow this store's demo date.
  bindDemoClock(() => store.db.demo.today);

  app.use('*', cors(corsOrigins?.length ? { origin: corsOrigins } : undefined));

  app.onError((err, c) => {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400);
    console.error(err);
    return c.json({ code: 'NETWORK', message: 'Unexpected server error.' }, 500);
  });
  app.notFound((c) =>
    c.json({ code: 'NOT_FOUND', message: `No route for ${c.req.method} ${c.req.path}` }, 404),
  );

  // Health check (unversioned, no latency): used by MA-05 to validate a server URL.
  app.get('/health', (c) =>
    c.json<Health>({ ok: true, service: 'tgseccsl-mock-api', version, today: store.db.demo.today }),
  );

  const api = new Hono<Env>();

  // Simulated network latency + failures (docs/07 §6). Demo controls are exempt so they always work.
  api.use('*', async (c, next) => {
    if (c.req.path.includes('/__demo/')) return next();
    const [min, max] = store.db.demo.latencyMs;
    if (max > 0) await sleep(min + Math.random() * (max - min));
    if (store.db.demo.failureRate > 0 && Math.random() < store.db.demo.failureRate) {
      fail('NETWORK', 'Simulated network failure (demo).');
    }
    return next();
  });

  const requireSession = createMiddleware<Env>(async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = token ? store.db.sessions[token] : undefined;
    if (!session) fail('UNAUTHENTICATED', 'Please sign in again.');
    c.set('session', session);
    c.set('token', token);
    await next();
  });

  // ---- auth -------------------------------------------------------------
  api.post('/auth/persona', async (c) => {
    const body = await c.req
      .json<{ personaId?: string; channel?: Channel }>()
      .catch(() => ({}) as { personaId?: string; channel?: Channel });
    const persona = store.db.personas.find((p) => p.id === body.personaId);
    if (!persona) fail('NOT_FOUND', 'Unknown demo persona.');
    // D-033: staff use only the Admin Console, members/applicants only the app.
    if (body.channel && body.channel !== persona.channel) {
      fail(
        'FORBIDDEN',
        persona.channel === 'console'
          ? 'Staff sign in on the Admin Console.'
          : 'Members sign in on the Member App.',
      );
    }
    const user = sessionUserFor(store, persona.id);
    const token = randomUUID();
    store.db.sessions[token] = user;
    store.save();
    return c.json<Session>({ token, user });
  });

  api.post('/auth/logout', requireSession, (c) => {
    delete store.db.sessions[c.get('token')];
    store.save();
    return c.json({ ok: true as const });
  });

  api.get('/me', requireSession, (c) => {
    const user = c.get('session');
    return c.json<Me>({
      user,
      channel: channelForRole(user.role),
      permissions: permissionsFor(user.role),
    });
  });

  // ---- demo controls (docs/07 §6) ----------------------------------------
  api.get('/__demo/personas', (c) => {
    const channel = c.req.query('channel');
    const list = store.db.personas.filter((p) => !channel || p.channel === channel);
    return c.json(list);
  });
  api.get('/__demo/state', (c) => c.json(store.db.demo));
  // Session bridge (docs/22 §5.1, dev only): the backend signs users in and asks for a mock
  // session of the same user, so routes still served here accept them. Removed with the fallback in P9.
  api.post('/__demo/session', async (c) => {
    const user = await c.req.json<SessionUser>().catch(() => undefined);
    if (!user?.id || !user.name || !user.role) fail('VALIDATION_ERROR', 'Send the session user.');
    // An applicant who signed up on the backend is new here: register them so joining works.
    if (user!.role === 'APPLICANT' && !store.db.applicants.some((a) => a.id === user!.id)) {
      store.db.applicants.push({ id: user!.id, name: user!.name, mobileMasked: '' });
    }
    const token = randomUUID();
    store.db.sessions[token] = user!;
    return c.json<Session>({ token, user: user! });
  });
  api.post('/__demo/reset', (c) => c.json(store.reset().demo));
  api.post('/__demo/clock', async (c) => {
    const { today } = await c.req.json<{ today?: string | null }>();
    if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today))
      fail('VALIDATION_ERROR', 'Date must be YYYY-MM-DD.', {
        fieldErrors: { today: 'Use YYYY-MM-DD' },
      });
    // null → back to the dataset's anchor date (docs/20).
    store.db.demo.today = today ?? store.db.today;
    store.save();
    return c.json(store.db.demo);
  });
  api.post('/__demo/failure-rate', async (c) => {
    const { rate } = await c.req.json<{ rate?: number }>();
    if (typeof rate !== 'number' || rate < 0 || rate > 1)
      fail('VALIDATION_ERROR', 'Rate must be between 0 and 1.', { fieldErrors: { rate: '0–1' } });
    store.db.demo.failureRate = rate;
    store.save();
    return c.json(store.db.demo);
  });

  // Scenario catalog + dataset counts power the State Explorer (docs/20).
  api.get('/__demo/scenarios', (c) => c.json(store.db.scenarios));
  api.get('/__demo/dataset', (c) => c.json(datasetSummary(store.db)));
  api.get('/__demo/sample', (c) => c.json(datasetSample(store.db)));

  // Role-aware KPIs (scoped to the DDO's department). Full dashboards arrive in M9.
  api.get('/dashboard/summary', requireSession, (c) => {
    const user = c.get('session');
    if (channelForRole(user.role) !== 'console') fail('FORBIDDEN', 'Dashboard is for staff.');
    return c.json(dashboardSummary(store.db, user));
  });

  // Joining the society from the Member App (D-026).
  registerJoining(api, store, requireSession);
  registerMembership(api, store, requireSession);
  registerSettings(api, store, requireSession);
  // Loans first: its static /members/search must win over /members/:id.
  registerLoans(api, store, requireSession);
  registerLoanWorkflow(api, store, requireSession);
  registerDeposits(api, store, requireSession);
  registerCollections(api, store, requireSession);
  registerAccount(api, store, requireSession);
  registerInsight(api, store, requireSession);
  registerMembers(api, store, requireSession);
  registerDevSync(api, store);

  app.route(API_PREFIX, api);
  return app;
}

function sessionUserFor(store: Store, personaId: string): SessionUser {
  const db = store.db;
  const staff = db.staffUsers.find((u) => u.id === personaId);
  if (staff?.active === false) fail('FORBIDDEN', 'This user has been deactivated. Ask the Super Admin.');
  if (staff)
    return { id: staff.id, name: staff.name, role: staff.role, departmentId: staff.departmentId };
  const member = db.members.find((m) => m.id === personaId);
  if (member)
    return {
      id: member.id,
      name: member.name,
      role: 'MEMBER',
      memberId: member.id,
      generalNo: member.generalNo,
    };
  const applicant = db.applicants.find((a) => a.id === personaId);
  if (applicant) return { id: applicant.id, name: applicant.name, role: 'APPLICANT' };
  return fail('NOT_FOUND', 'Unknown demo persona.');
}
