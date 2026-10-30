import type { Address, ChangeRequestInput } from '@tgs/types';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fail } from '../../common/errors/app-error';
import { requireAuth, sessionOf } from '../../common/guards';
import { ProfileChangesController } from './profile-changes.controller';

const passthrough = (name: string) => z.any().describe(`${name} (packages/types)`);
const decisionBody = z.object({ approve: z.boolean().optional(), remarks: z.string().max(500).optional() });
const idParams = z.object({ id: z.string().min(1) });

/** ST-18 change requests (staff) and MB-02 / MB-19 my profile (member) — docs/22 §5.4 P4b. */
export const profileChangesRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new ProfileChangesController(app.profileChanges, app.members);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const staffTags = ['members'];
  const meTags = ['my profile'];

  app.get('/profile-change-requests', { ...pre, schema: { tags: staffTags, summary: 'Profile change requests (DDO: own department, employment/pay only)', security, response: { 200: passthrough('ChangeRequestList') } } }, controller.list);
  app.post('/profile-change-requests/:id/certify', { ...pre, schema: { tags: staffTags, summary: 'DDO certifies (or refuses) employment / pay changes', security, params: idParams, body: decisionBody, response: { 200: passthrough('ChangeRequestRow') } } }, controller.certify);
  app.post('/profile-change-requests/:id/decision', { ...pre, schema: { tags: staffTags, summary: 'Accountant approves or rejects (approval writes the member record)', security, params: idParams, body: decisionBody, response: { 200: passthrough('ChangeRequestRow') } } }, controller.decide);

  app.get('/me/profile', { ...pre, schema: { tags: meTags, summary: 'My profile', security, response: { 200: passthrough('MyProfile') } } }, controller.myProfile);
  app.patch('/me/profile/contact', { ...pre, schema: { tags: meTags, summary: 'Change my email or present address (saved straight away)', security, body: z.record(z.string(), z.unknown()), response: { 200: passthrough('MyProfile') } } }, (r) =>
    app.members.updateContact(r, r.body as { email?: string; presentAddress?: Address }),
  );
  app.post('/me/profile/mobile', { ...pre, schema: { tags: meTags, summary: 'Start changing my mobile: a code goes to the new number', security, body: z.object({ mobile: z.string().optional() }), response: { 200: passthrough('OtpChallenge') } } }, async (r) => {
    const m = await app.members.mine(sessionOf(r));
    const mobile = r.body.mobile ?? '';
    if (!/^[6-9]\d{9}$/.test(mobile)) fail('VALIDATION_ERROR', 'Enter a 10-digit mobile number.', { fieldErrors: { mobile: 'Enter a 10-digit mobile number' } });
    if (mobile === m.mobile) fail('VALIDATION_ERROR', 'This is already your number.', { fieldErrors: { mobile: 'This is already your number' } });
    return app.appAccounts.startMobileChange(m.id, mobile);
  });
  app.post('/me/profile/mobile/verify', { ...pre, schema: { tags: meTags, summary: 'Confirm the code: the new mobile becomes my sign-in', security, body: z.object({ otpRef: z.string().optional(), otp: z.string().optional() }), response: { 200: passthrough('MyProfile') } } }, async (r) => {
    const m = await app.members.mine(sessionOf(r));
    const mobile = await app.appAccounts.verifyMobileChange(m.id, r.body.otpRef ?? '', r.body.otp ?? '');
    return app.members.changeMobile(r, mobile);
  });
  app.get('/me/profile/change-requests', { ...pre, schema: { tags: meTags, summary: 'My change requests', security, response: { 200: passthrough('ProfileChangeRequest[]') } } }, controller.mine);
  app.post('/me/profile/change-requests', { ...pre, schema: { tags: meTags, summary: 'Ask the office to change certified details', security, body: z.record(z.string(), z.unknown()), response: { 201: passthrough('ProfileChangeRequest') } } }, async (r, reply) =>
    reply.status(201).send(await app.profileChanges.create(r, r.body as Partial<ChangeRequestInput>)),
  );
};
