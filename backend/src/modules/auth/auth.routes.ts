import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../common/guards';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import {
  challengeBody,
  challengeCodeBody,
  logoutBody,
  meSchema,
  okSchema,
  otpStartBody,
  otpStartedSchema,
  otpVerifyBody,
  personaLoginBody,
  personaSchema,
  personasQuery,
  refreshBody,
  sessionSchema,
  staffLoginBody,
  staffLoginResult,
  totpSetupSchema,
} from './auth.schema';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';

/** Sign-in, tokens and /me (docs/22 §5.1). Rate limits slow down guessing. */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const repo = new AuthRepository(app.db);
  const tokens = new TokensService(app, repo);
  const controller = new AuthController(new AuthService(app, repo, tokens), new OtpService(app, repo, tokens), tokens);
  const tags = ['auth'];
  const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };
  const secured = [{ bearer: [] }];

  app.post('/auth/staff/login', { config: strict, schema: { tags, summary: 'Staff sign-in with user ID + password', body: staffLoginBody, response: { 200: staffLoginResult } } }, controller.staffLogin);
  app.post('/auth/staff/totp/setup', { config: strict, schema: { tags, summary: 'Start authenticator set-up (QR code)', body: challengeBody, response: { 200: totpSetupSchema } } }, controller.totpSetup);
  app.post('/auth/staff/totp/confirm', { config: strict, schema: { tags, summary: 'Confirm the first authenticator code and sign in', body: challengeCodeBody, response: { 200: sessionSchema } } }, controller.totpConfirm);
  app.post('/auth/staff/totp', { config: strict, schema: { tags, summary: 'Authenticator code after the password', body: challengeCodeBody, response: { 200: sessionSchema } } }, controller.totpVerify);

  app.post('/auth/otp/start', { config: strict, schema: { tags, summary: 'Member App: send a one-time code to a mobile', body: otpStartBody, response: { 200: otpStartedSchema } } }, controller.otpStart);
  app.post('/auth/otp/verify', { config: strict, schema: { tags, summary: 'Member App: sign in (or sign up) with the code', body: otpVerifyBody, response: { 200: sessionSchema } } }, controller.otpVerify);

  app.post('/auth/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags, summary: 'Swap a refresh token for new tokens (rotation)', body: refreshBody, response: { 200: sessionSchema } } }, controller.refresh);
  app.post('/auth/logout', { preHandler: requireAuth, schema: { tags, summary: 'End this sign-in', security: secured, body: logoutBody, response: { 200: okSchema } } }, controller.logout);
  app.get('/me', { preHandler: requireAuth, schema: { tags, summary: 'Signed-in user, channel and permissions', security: secured, response: { 200: meSchema } } }, controller.me);

  // Demo sign-in: answers 404 when DEMO_MODE is off (always off in production).
  app.get('/__demo/personas', { schema: { tags: ['demo'], summary: 'Demo personas for one-click sign-in', querystring: personasQuery, response: { 200: z.array(personaSchema) } } }, controller.personas);
  app.post('/auth/persona', { schema: { tags: ['demo'], summary: 'Demo one-click sign-in', body: personaLoginBody, response: { 200: sessionSchema } } }, controller.personaLogin);
};
