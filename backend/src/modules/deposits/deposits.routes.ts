import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../../common/guards';
import { DepositsController } from './deposits.controller';

const passthrough = (name: string) => z.any().describe(`${name} (packages/types)`);
const idParams = z.object({ id: z.string().min(1) });
const ACTIONS = ['recordPayment', 'accept', 'reject', 'refund', 'cancel', 'payout', 'withdraw'] as const;
const body = z.record(z.string(), z.unknown());
const listQuery = z.object({
  tab: z.enum(['FD', 'REQUESTS', 'CRD', 'SRDS', 'SAVINGS']).optional(),
  status: z.string().optional(),
  maturingWithinDays: z.coerce.number().int().min(0).optional(),
  departmentId: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** Deposits: ST-30…33 (staff), MB-08/09/15 (member) — docs/22 P6. */
export const depositsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = new DepositsController(app.deposits);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const st = ['deposits'];
  const mb = ['my deposits'];
  const ok = (name: string) => ({ 200: passthrough(name) });
  const created = (name: string) => ({ 201: passthrough(name) });

  app.get('/deposits', { ...pre, schema: { tags: st, summary: 'Deposits by tab (FD, requests, CRD, SRDS, savings) with totals', security, querystring: listQuery, response: ok('DepositList') } }, c.list);
  app.get('/deposits/:id', { ...pre, schema: { tags: st, summary: 'A deposit by id, FDR No. or account No.', security, params: idParams, response: ok('DepositDetail') } }, c.get);
  app.post('/deposits', { ...pre, schema: { tags: st, summary: 'Open an FD at the counter from the signed form F4', security, body, response: created('DepositDetail') } }, async (req, reply) => reply.status(201).send(await c.open(req as never)));
  app.post('/deposits/:id/actions/:action', { ...pre, schema: { tags: st, summary: 'Payment, acceptance, refund, cancel or payout (money steps post to the ledger)', security, params: z.object({ id: z.string().min(1), action: z.enum(ACTIONS) }), body: body.optional(), response: ok('DepositDetail') } }, c.act as never);
  app.get('/deposits/:id/withdrawal-preview', { ...pre, schema: { tags: st, summary: 'What a premature withdrawal would pay today (D-086): principal, interest, penalty, payable', security, params: idParams, response: ok('FdSettlement') } }, c.withdrawalPreview);
  app.post('/deposits/maturity/run', { preHandler: [requireAuth, requirePermission('settings.edit')], schema: { tags: st, summary: 'Run the daily FD maturity job now (Admin); a repeat run changes nothing', security, response: ok('{ matured, date }') } }, c.runMaturity);
  app.post('/deposits/:id/demo-act', { ...pre, schema: { tags: st, summary: 'Demo: complete the stage as its owner', security, params: idParams, response: ok('DepositDetail') } }, c.demoAct);

  app.get('/me/deposits', { ...pre, schema: { tags: mb, summary: 'My deposits and FD requests', security, response: ok('DepositRow[]') } }, c.mine);
  app.get('/me/deposits/context', { ...pre, schema: { tags: mb, summary: 'Rates, minimum, rules and where to pay', security, response: ok('DepositContext') } }, c.context);
  app.get('/me/deposits/:id', { ...pre, schema: { tags: mb, summary: 'One of my deposits', security, params: idParams, response: ok('DepositDetail') } }, c.myDetail);
  app.post('/me/deposits/sign/request', { ...pre, schema: { tags: mb, summary: 'Check an FD request and send the signing code (D-031)', security, body, response: ok('OtpChallenge') } }, c.requestSign as never);
  app.post('/me/deposits', { ...pre, schema: { tags: mb, summary: 'Sign with the code: the request is created', security, body: z.object({ otpRef: z.string().optional(), otp: z.string().optional() }), response: created('DepositDetail') } }, async (req, reply) => reply.status(201).send(await c.createMine(req)));
  app.post('/me/deposits/:id/cancel', { ...pre, schema: { tags: mb, summary: 'Cancel an unpaid request', security, params: idParams, body: z.object({ reason: z.string().max(500).optional() }).optional(), response: ok('DepositDetail') } }, c.cancelMine as never);
};
