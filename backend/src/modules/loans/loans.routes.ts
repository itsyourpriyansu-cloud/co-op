import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../common/guards';
import { LoansController } from './loans.controller';

const passthrough = (name: string) => z.any().describe(`${name} (packages/types)`);
const idParams = z.object({ id: z.string().min(1) });
const loanIdParams = z.object({ loanId: z.string().min(1) });
const ACTIONS = ['forward', 'returnToMember', 'reject', 'ddoCertify', 'ddoRecordManual', 'sendForSanction', 'secretarySign', 'presidentSign', 'sendBack', 'disburse'] as const;
const loanInput = z.record(z.string(), z.unknown());
const otpBody = z.object({ otpRef: z.string().optional(), otp: z.string().optional() });
const reasonBody = z.object({ reason: z.string().max(500).optional() });
const listQuery = z.object({
  q: z.string().optional(),
  product: z.string().optional(),
  group: z.string().optional(),
  departmentId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** Loans: ST-20…28 (staff), MB-03…07 (member, surety) — docs/22 §5.5 P5. */
export const loansRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = new LoansController(app.loans, app.loanWorkflow);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const st = ['loans'];
  const mb = ['my loans'];
  const ok = (name: string) => ({ 200: passthrough(name) });
  const created = (name: string) => ({ 201: passthrough(name) });

  app.get('/loans', { ...pre, schema: { tags: st, summary: 'Loans with filters, counts and paging (DDO: own department)', security, querystring: listQuery, response: ok('LoanList') } }, c.list);
  app.get('/loans/:id', { ...pre, schema: { tags: st, summary: 'A loan by id or application no., with live checks and stages', security, params: idParams, response: ok('LoanDetail') } }, c.get);
  app.post('/loans', { ...pre, schema: { tags: st, summary: 'Enter a signed paper application for a member (submit: true to submit)', security, body: loanInput, response: created('LoanDetail') } }, async (req, reply) => reply.status(201).send(await c.createCounter(req as never)));
  app.post('/loans/assess', { ...pre, schema: { tags: st, summary: 'Live eligibility for an unsaved form', security, body: loanInput, response: ok('{ checks, eligible, preview, sureties, fieldErrors }') } }, c.assess as never);
  app.post('/loans/surety-preview', { ...pre, schema: { tags: st, summary: 'Surety cards for chosen members (BR-014, BR-024)', security, body: z.object({ borrowerId: z.string().optional(), sureties: z.array(z.string()).max(4).optional(), instalments: z.number().optional() }), response: ok('SuretyCard[]') } }, c.suretyPreview);
  app.get('/members/search', { ...pre, schema: { tags: st, summary: 'Pick a member or a surety (those who can still stand surety first)', security, querystring: z.object({ q: z.string().optional() }), response: ok('MemberPick[]') } }, c.search);
  app.get('/members/:id/loan-context', { ...pre, schema: { tags: st, summary: 'Loan context for an application on a member’s behalf', security, params: idParams, response: ok('LoanContext') } }, c.memberContext);
  app.get('/loans/:id/sanction-preview', { ...pre, schema: { tags: st, summary: 'ST-26 sanction sheet for an amount / tenure', security, params: idParams, querystring: z.object({ amount: z.coerce.number().optional(), instalments: z.coerce.number().optional() }), response: ok('SanctionPreview') } }, c.sanctionPreview);
  app.post('/loans/:id/actions/:action', { ...pre, schema: { tags: st, summary: 'Act on the current stage (disburse posts to the ledger)', security, params: z.object({ id: z.string().min(1), action: z.enum(ACTIONS) }), body: z.record(z.string(), z.unknown()).optional(), response: ok('LoanDetail') } }, c.act as never);
  app.post('/loans/:id/demo-act', { ...pre, schema: { tags: st, summary: 'Demo: complete the stage as its owner', security, params: idParams, response: ok('LoanDetail') } }, c.demoAct);

  app.get('/me/loans', { ...pre, schema: { tags: mb, summary: 'My loans and applications', security, response: ok('LoanRow[]') } }, c.mine);
  app.get('/me/loans/context', { ...pre, schema: { tags: mb, summary: 'What I can apply for', security, response: ok('LoanContext') } }, c.myContext);
  app.get('/me/loans/:id', { ...pre, schema: { tags: mb, summary: 'One of my loans', security, params: idParams, response: ok('LoanDetail') } }, c.myDetail);
  app.post('/me/loans', { ...pre, schema: { tags: mb, summary: 'Start a draft application', security, body: loanInput, response: created('LoanDetail') } }, async (req, reply) => reply.status(201).send(await c.createMine(req as never)));
  app.put('/me/loans/:id', { ...pre, schema: { tags: mb, summary: 'Save my draft (or a returned application)', security, params: idParams, body: loanInput, response: ok('LoanDetail') } }, c.updateMine as never);
  app.delete('/me/loans/:id', { ...pre, schema: { tags: mb, summary: 'Discard my draft', security, params: idParams, response: ok('{ ok }') } }, c.discardMine);
  app.post('/me/loans/:id/sign/request', { ...pre, schema: { tags: mb, summary: 'Send the signing code once the application passes every check (D-031)', security, params: idParams, response: ok('OtpChallenge') } }, c.requestSign);
  app.post('/me/loans/:id/submit', { ...pre, schema: { tags: mb, summary: 'Sign with the code and submit', security, params: idParams, body: otpBody, response: ok('LoanDetail') } }, c.submitMine);
  app.post('/me/loans/:id/sureties/replace', { ...pre, schema: { tags: mb, summary: 'Replace a surety who declined', security, params: idParams, body: z.object({ oldId: z.string().optional(), newId: z.string().optional() }), response: ok('LoanDetail') } }, c.replaceSurety);
  app.post('/me/loans/:id/withdraw', { ...pre, schema: { tags: mb, summary: 'Withdraw my application', security, params: idParams, body: reasonBody.optional(), response: ok('LoanDetail') } }, c.withdraw as never);

  app.get('/me/surety-requests', { ...pre, schema: { tags: mb, summary: 'Loans I am asked to guarantee, and those I guarantee', security, response: ok('SuretyRequests') } }, c.suretyRequests);
  app.post('/me/surety-requests/:loanId/sign/request', { ...pre, schema: { tags: mb, summary: 'Send the code to sign as surety', security, params: loanIdParams, response: ok('OtpChallenge') } }, c.suretySign);
  app.post('/me/surety-requests/:loanId/accept', { ...pre, schema: { tags: mb, summary: 'Sign as surety with the code', security, params: loanIdParams, body: otpBody, response: ok('SuretyRequest') } }, c.suretyAccept);
  app.post('/me/surety-requests/:loanId/decline', { ...pre, schema: { tags: mb, summary: 'Decline to stand surety (reason required)', security, params: loanIdParams, body: reasonBody, response: ok('SuretyRequest') } }, c.suretyDecline);
};
