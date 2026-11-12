import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, sessionOf } from '../../common/guards';

const ok = (name: string) => ({ 200: z.any().describe(`${name} (packages/types)`) });

/** F-01 (D-096): my signature (members, applicants, staff) and signatures on printed forms. */
export const signaturesRoutes: FastifyPluginAsyncZod = async (app) => {
  const s = app.signatures;
  const security = [{ bearer: [] }];
  const pre = { onRequest: requireAuth };
  const tags = ['signatures'];
  const noStore = { 'cache-control': 'no-store' };

  app.get('/me/signature', { ...pre, schema: { tags, summary: 'My signature on file (null when none)', security, response: ok('MySignature | null') } }, async (r, reply) => reply.headers(noStore).send(await s.mine(sessionOf(r))));
  app.put(
    '/me/signature',
    { ...pre, bodyLimit: 400_000, schema: { tags, summary: 'Upload my signature: a PNG, at most 200 KB, sent as base64', security, body: z.object({ png: z.string().max(300_000) }), response: ok('MySignature') } },
    async (r, reply) => reply.headers(noStore).send(await s.upload(r, r.body)),
  );
  app.get('/signatures/:id', { ...pre, schema: { tags, summary: 'One signature image (staff, or its owner)', security, params: z.object({ id: z.string().min(1) }), response: ok('SignatureImage') } }, async (r, reply) => reply.headers(noStore).send(await s.image(r, r.params.id)));
};
