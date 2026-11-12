import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, requirePermission, sessionOf } from '../../common/guards';

const ok = (name: string) => ({ 200: z.any().describe(`${name} (packages/types)`) });

/** G1 (D-111): documents (JPEG, PNG or PDF), sent as base64 and stored encrypted. */
export const documentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const s = app.documents;
  const security = [{ bearer: [] }];
  const tags = ['documents'];
  const noStore = { 'cache-control': 'no-store' };
  // base64 is 4/3 of the file, plus the JSON around it.
  const bodyLimit = Math.ceil((app.env.DOCUMENT_MAX_BYTES * 4) / 3) + 16_384;
  const body = z.object({ type: z.string().min(1).max(40), fileName: z.string().max(200).optional(), data: z.string().min(1) });

  app.get('/me/documents', { onRequest: requireAuth, schema: { tags, summary: 'My uploaded documents, newest first', security, response: ok('StoredDocument[]') } }, async (r, reply) => reply.headers(noStore).send(await s.list(sessionOf(r).id)));
  app.post('/me/documents', { onRequest: requireAuth, bodyLimit, schema: { tags, summary: 'Upload one of my documents (applicant or member)', security, body, response: { 201: z.any().describe('StoredDocument') } } }, async (r, reply) => reply.code(201).headers(noStore).send(await s.uploadMine(r, r.body)));
  app.post(
    '/members/:id/documents',
    { onRequest: requirePermission('members.edit', 'Only the society office adds documents to a member record.'), bodyLimit, schema: { tags, summary: "Upload a document to a member's record (staff)", security, params: z.object({ id: z.string().min(1) }), body, response: { 201: z.any().describe('StoredDocument') } } },
    async (r, reply) => reply.code(201).headers(noStore).send(await s.uploadFor(r, r.params.id, r.body)),
  );
  app.get('/files/:id', { onRequest: requireAuth, schema: { tags, summary: 'One uploaded document (its owner, or staff who may see that member or application)', security, params: z.object({ id: z.string().min(1) }), response: ok('FileContent') } }, async (r, reply) => reply.headers(noStore).send(await s.content(r, r.params.id)));
};
