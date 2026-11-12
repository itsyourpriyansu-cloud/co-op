import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, sessionOf } from '../../common/guards';
import { SettlementsService } from './settlements.service';

const ok = (name: string) => ({ 200: z.any().describe(`${name} (packages/types)`) });
const idParams = z.object({ id: z.string().min(1) });

/** F-08 (D-098): a member leaves; the final settlement is worked out, printed and posted. */
export const settlementsRoutes: FastifyPluginAsyncZod = async (app) => {
  const s = new SettlementsService(app);
  const security = [{ bearer: [] }];
  const pre = { onRequest: requireAuth };
  const tags = ['members'];

  app.get('/members/:id/settlement', { ...pre, schema: { tags, summary: 'The member, their exit and the final settlement statement', security, params: idParams, response: ok('SettlementView') } }, (r) => s.view(sessionOf(r), r.params.id));
  app.post('/members/:id/exit', { ...pre, schema: { tags, summary: 'Mark the member as retired, resigned or deceased; demand stops and the settlement opens', security, params: idParams, body: z.object({ status: z.string().optional(), date: z.string().optional(), remarks: z.string().max(500).optional() }), response: ok('SettlementView') } }, (r) => s.exit(r, r.params.id, r.body));
  app.post('/members/:id/settlement/post', { ...pre, schema: { tags, summary: 'Post the settlement once the money has moved (Accountant)', security, params: idParams, body: z.object({ offset: z.boolean().optional(), payTo: z.string().optional(), received: z.number().int().optional(), reference: z.string().max(100).optional() }), response: ok('SettlementView') } }, (r) => s.post(r, r.params.id, r.body));
};
