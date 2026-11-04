import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, sessionOf } from '../../common/guards';
import { InsightService } from './insight.service';

const ok = (name: string) => ({ 200: z.any().describe(`${name} (packages/types)`) });

/** ST-02 Work Queue, ST-01 dashboards and the topbar search (docs/22 §5.7 P8b). */
export const insightRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new InsightService(app);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const tags = ['dashboard'];

  app.get('/work-queue', { ...pre, schema: { tags, summary: 'Everything waiting on me, oldest first, with REQ-135 service-target flags', security, response: ok('WorkQueue') } }, (r) => service.workQueue(sessionOf(r)));
  app.get('/dashboard/role', { ...pre, schema: { tags, summary: 'My role block: tiles, queue by stage, done this month', security, response: ok('RoleDashboard') } }, (r) => service.roleDashboard(sessionOf(r)));
  app.get('/dashboard/summary', { ...pre, schema: { tags, summary: 'KPIs, pipeline, collections trend and risks (DDO: own department)', security, response: ok('DashboardSummary') } }, (r) => service.summary(sessionOf(r)));
  app.get('/search', { ...pre, schema: { tags, summary: 'Members, loans, deposits, joining applications and receipts', security, querystring: z.object({ q: z.string().optional() }), response: ok('SearchHit[]') } }, (r) => service.search(sessionOf(r), r.query.q ?? ''));
};
