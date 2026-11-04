import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, sessionOf } from '../../common/guards';
import { ReportsService } from './reports.service';

const ok = (name: string) => ({ 200: z.any().describe(`${name} (packages/types)`) });

/** ST-50 / ST-51 reports and the ST-52 defaulter notice (docs/22 §5.7 P8c). CSV / Excel / PDF stay in the browser. */
export const reportsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ReportsService(app);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const tags = ['reports'];

  app.get('/reports', { ...pre, schema: { tags, summary: 'The report catalogue and filter options', security, response: ok('{ reports, options }') } }, (r) => service.catalogue(sessionOf(r)));
  app.get('/reports/:id', { ...pre, schema: { tags, summary: 'Run one report (DDO: own department); recorded in the audit trail', security, params: z.object({ id: z.string().min(1) }), querystring: z.record(z.string(), z.string()), response: ok('ReportResult') } }, (r) => service.run(r, r.params.id, r.query));
  app.get('/print/defaulter-notice/:memberId', { ...pre, schema: { tags, summary: 'The defaulter notice letter for one member', security, params: z.object({ memberId: z.string().min(1) }), response: ok('DefaulterNotice') } }, (r) => service.defaulterNotice(sessionOf(r), r.params.memberId));
};
