import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../common/guards';
import { CollectionsController } from './collections.controller';

const passthrough = (name: string) => z.any().describe(`${name} (packages/types)`);
const idParams = z.object({ id: z.string().min(1) });
const body = z.record(z.string(), z.unknown());

/** Demand & collections: ST-40…47 (staff), MB-10/18 (member) — docs/22 §5.6 P7. */
export const collectionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = new CollectionsController(app.collections);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const st = ['collections'];
  const mb = ['my payments'];
  const ok = (name: string) => ({ 200: passthrough(name) });

  app.get('/demand', { ...pre, schema: { tags: st, summary: 'Demand sheets of a cycle, one row per department (DDO: own department)', security, querystring: z.object({ cycle: z.string().optional() }), response: ok('DemandCycleOverview') } }, c.overview);
  app.get('/demand/preview', { ...pre, schema: { tags: st, summary: 'What generating a cycle would produce (BR-009)', security, querystring: z.object({ cycle: z.string().optional(), departmentIds: z.string().optional() }), response: ok('DemandPreview') } }, c.preview);
  app.post('/demand/generate', { ...pre, schema: { tags: st, summary: 'Generate demand sheets (Accountant)', security, body: z.object({ cycle: z.string().optional(), departmentIds: z.array(z.string()).optional() }), response: ok('{ generated }') } }, c.generate);
  app.get('/demand/sheets/:id', { ...pre, schema: { tags: st, summary: 'One demand sheet with its member lines', security, params: idParams, response: ok('DemandSheetDetail') } }, c.sheet);
  app.post('/demand/sheets/:id/actions/:action', { ...pre, schema: { tags: st, summary: 'Certify (BR-030), send to the DDO, or post the recovery (allocates BR-011, posts to the ledger)', security, params: z.object({ id: z.string().min(1), action: z.enum(['certify', 'sendToDdo', 'postRecovery']) }), body: body.nullish(), response: ok('DemandSheetDetail') } }, c.act as never);
  app.post('/demand/sheets/:id/demo-act', { ...pre, schema: { tags: st, summary: 'Demo: next step as the Accountant', security, params: idParams, response: ok('DemandSheetDetail') } }, c.demoAct);

  app.get('/receipts', { ...pre, schema: { tags: st, summary: 'Receipts with tabs, search and totals', security, querystring: z.object({ tab: z.enum(['ALL', 'SALARY_RECOVERY', 'COUNTER']).optional(), q: z.string().optional(), cycle: z.string().optional(), departmentId: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }), response: ok('ReceiptList') } }, c.receipts);
  app.get('/receipts/:id', { ...pre, schema: { tags: st, summary: 'A receipt by id or number', security, params: idParams, response: ok('ReceiptDetail') } }, c.receipt);
  app.post('/receipts', { ...pre, schema: { tags: st, summary: 'Counter receipt: dues (oldest first, D-061) or share capital', security, body, response: { 201: passthrough('ReceiptDetail') } } }, async (req, reply) => reply.status(201).send(await c.counterReceipt(req as never)));
  app.get('/members/:id/dues', { ...pre, schema: { tags: st, summary: "A member's unpaid dues from posted sheets", security, params: idParams, response: ok('MemberDues') } }, c.dues);

  app.get('/payment-reports', { ...pre, schema: { tags: st, summary: 'Payments members reported (MB-18)', security, querystring: z.object({ status: z.string().optional() }), response: ok('PaymentReportRow[]') } }, c.reports);
  app.post('/payment-reports/:id/verify', { ...pre, schema: { tags: st, summary: 'Verify against the bank statement: issues the receipt', security, params: idParams, body: z.object({ remarks: z.string().max(500).optional() }).nullish(), response: ok('ReceiptDetail') } }, c.verify as never);
  app.post('/payment-reports/:id/reject', { ...pre, schema: { tags: st, summary: 'Reject a reported payment (reason required)', security, params: idParams, body: z.object({ reason: z.string().max(500).optional() }).nullish(), response: ok('PaymentReportRow') } }, c.reject as never);

  app.get('/me/payments', { ...pre, schema: { tags: mb, summary: 'My demand history, receipts, reports and dues', security, response: ok('MyPayments') } }, c.myPayments);
  app.get('/me/receipts/:id', { ...pre, schema: { tags: mb, summary: 'One of my receipts', security, params: idParams, response: ok('ReceiptDetail') } }, c.myReceipt);
  app.post('/me/payments/reports', { ...pre, schema: { tags: mb, summary: 'Report a payment I made to the society', security, body, response: { 201: passthrough('PaymentReport') } } }, async (req, reply) => reply.status(201).send(await c.reportPayment(req as never)));
};
