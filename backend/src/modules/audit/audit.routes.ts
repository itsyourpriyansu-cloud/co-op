import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../common/guards';
import { AuditController } from './audit.controller';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const listQuery = z.object({ q: z.string().trim().max(100).optional(), entity: z.string().max(60).optional(), actorId: z.string().max(80).optional(), from: day.optional(), to: day.optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(200).optional() });

/** G1 (D-111): read the append-only audit log (docs/07 §7). Super Admin by default; the matrix can grant it. */
export const auditRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = new AuditController(app.audit);
  const pre = { onRequest: requirePermission('audit.view', 'Only the Super Admin reads the audit log.') };
  const schema = { tags: ['audit'], security: [{ bearer: [] }] };
  app.get('/audit', { ...pre, schema: { ...schema, summary: 'Audit log, newest first, with filters', querystring: listQuery } }, c.list);
  app.get('/audit/:id', { ...pre, schema: { ...schema, summary: 'One audit entry with what changed', params: z.object({ id: z.string() }) } }, c.get);
};
