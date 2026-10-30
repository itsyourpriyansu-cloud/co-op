import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../common/guards';
import { JoiningController } from './joining.controller';

const passthrough = (name: string) => z.any().describe(`${name} (packages/types)`);
const idParams = z.object({ id: z.string().min(1) });
const ACTIONS = ['sendToDdo', 'certify', 'returnToApplicant', 'forward', 'approve', 'reject', 'recordSharePayment', 'activate'] as const;
const actionInput = z.object({
  remarks: z.string().max(1000).optional(),
  items: z.record(z.string(), z.enum(['OK', 'FLAG'])).optional(),
  mandateAgreed: z.boolean().optional(),
  field: z.string().max(100).optional(),
  sharePaymentRoute: z.enum(['COUNTER', 'FIRST_DEMAND']).optional(),
  mode: z.enum(['CASH', 'UPI', 'CHEQUE']).optional(),
  reference: z.string().max(100).optional(),
});
const otpBody = z.object({ otpRef: z.string().optional(), otp: z.string().optional() });

/** Joining: MJ-02…05 (applicant) and ST-14…17 (staff) — docs/22 §5.4 P4c. */
export const joiningRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = new JoiningController(app.joining);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const mj = ['joining'];
  const st = ['membership'];

  app.get('/joining/reference', { schema: { tags: mj, summary: 'Society, departments, share limits, documents and agreement texts for the join form', response: { 200: passthrough('JoiningReference') } } }, c.reference);
  app.get('/membership/me', { ...pre, schema: { tags: mj, summary: 'My application (applicant), or the one that admitted me (new member)', security, response: { 200: passthrough('MembershipApplication | null') } } }, c.me);
  app.post('/membership/me/eligibility', { ...pre, schema: { tags: mj, summary: 'Eligibility answers (BR-026); starts the draft', security, body: z.object({ worksInSecretariatDept: z.boolean(), regularOrApprovedProbationer: z.boolean(), memberOfOtherCreditSocietyWithDues: z.boolean() }), response: { 200: passthrough('{ eligible, checks, application }') } } }, c.eligibility);
  app.put('/membership/me/draft', { ...pre, schema: { tags: mj, summary: 'Save the draft (merged section by section)', security, body: z.record(z.string(), z.unknown()), response: { 200: passthrough('MembershipApplication') } } }, c.saveDraft as never);
  app.post('/membership/me/sign/request', { ...pre, schema: { tags: mj, summary: 'Send the signing code (D-031) once the form is complete', security, response: { 200: passthrough('OtpChallenge') } } }, c.requestSign);
  app.post('/membership/me/submit', { ...pre, schema: { tags: mj, summary: 'Sign with the code and submit (or resubmit after a correction)', security, body: otpBody, response: { 200: passthrough('MembershipApplication') } } }, c.submit);

  app.get('/membership/applications', { ...pre, schema: { tags: st, summary: 'Applications in flight (DDO: own department)', security, response: { 200: passthrough('MembershipList') } } }, c.list);
  app.get('/membership/applications/:id', { ...pre, schema: { tags: st, summary: 'One application with checks and what I can do', security, params: idParams, response: { 200: passthrough('MembershipDetail') } } }, c.detail);
  app.post('/membership/applications/:id/actions/:action', { ...pre, schema: { tags: st, summary: 'Act on the current stage; share payment admits the member', security, params: z.object({ id: z.string().min(1), action: z.enum(ACTIONS) }), body: actionInput.optional(), response: { 200: passthrough('MembershipDetail') } } }, c.act as never);
  app.post('/membership/applications/:id/demo-act', { ...pre, schema: { tags: st, summary: 'Demo: act for the stage owner', security, params: idParams, response: { 200: passthrough('MembershipDetail') } } }, c.demoAct);

  if (app.env.DEMO_MODE) {
    const demo = ['demo'];
    app.post('/__demo/membership/:id/advance', { schema: { tags: demo, summary: 'Phone tracker: move to the next stage', params: idParams, response: { 200: passthrough('MembershipApplication') } } }, c.demoAdvance);
    app.post('/__demo/membership/:id/request-info', { schema: { tags: demo, summary: 'Phone tracker: return for a correction', params: idParams, body: z.object({ field: z.string().optional(), message: z.string().optional() }).optional(), response: { 200: passthrough('MembershipApplication') } } }, c.demoRequestInfo as never);
    app.post('/__demo/membership/:id/reject', { schema: { tags: demo, summary: 'Phone tracker: reject', params: idParams, response: { 200: passthrough('MembershipApplication') } } }, c.demoReject);
  }
};
