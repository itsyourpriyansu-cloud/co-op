import { calculateLeftoverService } from '@tgs/domain';
import type { DatasetSample, DatasetSummary, DemoState } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fail } from '../../common/errors/app-error';
import { businessCycle, businessToday, clearBusinessDate, DEMO_CLOCK_KEY } from '../../common/utils/business-date';
import { runSeed } from '../../db/seed';
import { demoDataset } from '../../db/seed/dataset';
import { systemInfo } from '../../models';

const anyResponse = { 200: z.any() };
const tally = <T>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((acc, x) => ((acc[key(x)] = (acc[key(x)] ?? 0) + 1), acc), {});

async function demoState(app: FastifyInstance): Promise<DemoState & { currentCycle: string }> {
  return { today: await businessToday(app), failureRate: app.demoFailure.rate, latencyMs: [0, 0], seedVersion: demoDataset().version, currentCycle: await businessCycle(app) };
}

async function setClock(app: FastifyInstance, today: string | null): Promise<void> {
  await app.db.insert(systemInfo).values({ key: DEMO_CLOCK_KEY, value: { today } }).onConflictDoUpdate({ target: systemInfo.key, set: { value: { today } } });
  clearBusinessDate();
}

/**
 * Demo controls (DEMO_MODE only, docs/20; P8d moved them here from the mock API). Never in
 * production (DEMO_MODE is always off there).
 */
export const demoRoutes: FastifyPluginAsyncZod = async (app) => {
  const demoOnly = () => {
    if (!app.env.DEMO_MODE) fail('NOT_FOUND', 'Demo controls are not available on this server.');
  };
  const tags = ['demo'];

  app.get('/__demo/state', { schema: { tags, summary: 'Demo date, cycle and failure rate', response: anyResponse } }, async () => (demoOnly(), demoState(app)));

  app.post('/__demo/reset', { schema: { tags, summary: 'Put every table back to the demo dataset; the clock back to its date', response: anyResponse } }, async (request) => {
    demoOnly();
    await runSeed(app.db, { staffPassword: app.env.SEED_STAFF_PASSWORD, dataKey: app.env.DATA_ENCRYPTION_KEY });
    app.permissions.reload();
    app.demoFailure.rate = 0;
    await setClock(app, null);
    // Dev only, until the fallback goes (P9): the mock starts over too.
    app.mockBridge?.clear();
    await app.mockBridge?.send(undefined, 'POST', '/api/v1/__demo/reset').catch((err) => app.log.warn({ err }, 'mock reset failed'));
    await app.audit.record(request, { action: 'demo.reset', entity: 'system', summary: 'Demo data reset', actor: { id: 'demo', name: 'Demo reset' } });
    return demoState(app);
  });

  app.post('/__demo/clock', { schema: { tags, summary: 'Move the demo date (null = back to the dataset date)', body: z.object({ today: z.string().nullish() }), response: anyResponse } }, async (request) => {
    demoOnly();
    const today = request.body.today ?? null;
    if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today)) fail('VALIDATION_ERROR', 'Date must be YYYY-MM-DD.', { fieldErrors: { today: 'Use YYYY-MM-DD' } });
    await setClock(app, today);
    return demoState(app);
  });

  app.post('/__demo/failure-rate', { schema: { tags, summary: 'Simulate network errors on a share of API calls (0–1)', body: z.object({ rate: z.number().min(0).max(1) }), response: anyResponse } }, async (request) => {
    demoOnly();
    app.demoFailure.rate = request.body.rate;
    return demoState(app);
  });

  // The State Explorer (docs/20): scenario catalogue, live counts and sample rows.
  app.get('/__demo/scenarios', { schema: { tags, summary: 'Scenario catalogue of the demo dataset', response: anyResponse } }, async () => (demoOnly(), demoDataset().scenarios));

  app.get('/__demo/dataset', { schema: { tags, summary: 'Counts by status, from the database', response: anyResponse } }, async (): Promise<DatasetSummary> => {
    demoOnly();
    const [members, loans, deposits, sheets, receipts, applications] = await Promise.all([app.members.all(), app.loans.repo.all(), app.deposits.repo.list(), app.collections.repo.allSheetHeads(), app.collections.repo.receiptPage({}, 0, 1), app.joining.repo.all()]);
    return {
      version: demoDataset().version,
      today: await businessToday(app),
      currentCycle: await businessCycle(app),
      counts: { members: members.length, loans: loans.length, deposits: deposits.length, demandSheets: sheets.length, receipts: receipts.total, membershipApplications: applications.length, scenarios: demoDataset().scenarios.length },
      byStatus: {
        member: tally(members, (m) => m.status),
        loan: tally(loans, (l) => l.status),
        deposit: tally(deposits.filter((d) => d.scheme === 'FD'), (d) => d.status),
        membership: tally(applications, (a) => a.status),
        demandSheet: tally(sheets, (s) => s.status),
      },
    };
  });

  app.get('/__demo/sample', { schema: { tags, summary: 'Representative rows: each loan status once, then a spread of members', response: anyResponse } }, async (): Promise<DatasetSample> => {
    demoOnly();
    const [members, loans, departments, today] = await Promise.all([app.members.all(), app.loans.repo.all(), app.departments.all(), businessToday(app)]);
    const sorted = [...members].sort((a, b) => a.generalNo.localeCompare(b.generalNo));
    const dept = new Map(departments.map((d) => [d.id, d.name]));
    const byId = new Map(members.map((m) => [m.id, m]));
    const seen = new Set<string>();
    const oneEach = [...loans].sort((a, b) => a.id.localeCompare(b.id)).filter((l) => (seen.has(l.status) ? false : (seen.add(l.status), true)));
    return {
      members: [...sorted.slice(100, 112), ...sorted.filter((m) => m.status !== 'ACTIVE').slice(0, 3)].map((m) => {
        const own = loans.filter((l) => l.memberId === m.id && l.status === 'ACTIVE');
        return { id: m.id, generalNo: m.generalNo, name: m.name, department: dept.get(m.departmentId) ?? m.departmentId, designation: m.designation, status: m.status, leftoverMonths: calculateLeftoverService(m.dor, today).months, activeLoans: own.length, outstanding: own.reduce((s, l) => s + l.outstandingPrincipal, 0) };
      }),
      loans: oneEach.map((l) => ({ id: l.id, applicationNo: l.applicationNo, member: byId.get(l.memberId)?.name ?? l.memberId, generalNo: byId.get(l.memberId)?.generalNo ?? '', product: l.product, status: l.status, amount: l.sanctionedAmount ?? l.appliedAmount, appliedOn: l.appliedOn, emi: l.emi ?? 0 })),
    };
  });

  app.get('/__demo/activation-sample', { schema: { tags, summary: 'A member who has not used the app yet', response: anyResponse } }, async () => {
    demoOnly();
    const m = (await app.members.all()).filter((x) => x.status === 'ACTIVE' && !x.portalActivated).sort((a, b) => a.generalNo.localeCompare(b.generalNo))[0] ?? fail('NOT_FOUND', 'Every member has activated the app.');
    return { name: m.name, generalNo: m.generalNo, employeeId: m.employeeId, mobile: m.mobile };
  });
};
