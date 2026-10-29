import { z } from 'zod';
import { ALL_ROLES } from '../permissions/permissions.schema';

const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');
const sixDigits = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(ALL_ROLES),
  departmentId: z.string().optional(),
  memberId: z.string().optional(),
  generalNo: z.string().optional(),
});

export const sessionSchema = z.object({
  token: z.string(),
  refreshToken: z.string().optional(),
  expiresInSeconds: z.number().int().optional(),
  user: sessionUserSchema,
});

export const meSchema = z.object({
  user: sessionUserSchema,
  channel: z.enum(['console', 'app']),
  permissions: z.array(z.string()),
});

// ---- staff ----
export const staffLoginBody = z.object({
  username: z.string().trim().min(1, 'Enter your user ID').max(60),
  password: z.string().min(1, 'Enter your password').max(200),
});

export const staffLoginResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('OK'), session: sessionSchema, mustChangePassword: z.boolean() }),
  z.object({ status: z.literal('TOTP_REQUIRED'), challengeToken: z.string() }),
  z.object({ status: z.literal('TOTP_SETUP_REQUIRED'), challengeToken: z.string() }),
]);

export const challengeBody = z.object({ challengeToken: z.string().min(1) });
export const challengeCodeBody = challengeBody.extend({ code: sixDigits });

export const totpSetupSchema = z.object({ otpauthUrl: z.string(), qrDataUrl: z.string(), secret: z.string() });

// ---- member OTP ----
export const otpStartBody = z.object({ mobile, purpose: z.enum(['LOGIN', 'SIGNUP']).default('LOGIN') });

export const otpStartedSchema = z.object({
  otpRef: z.string(),
  expiresInSeconds: z.number().int(),
  channel: z.enum(['WHATSAPP', 'PUSH', 'SIMULATED']),
  mobileMasked: z.string(),
  demoOtp: z.string().optional(),
});

export const otpVerifyBody = z.object({
  otpRef: z.uuid('Request a new code'),
  otp: sixDigits,
  /** Sign-up only: the applicant's full name. */
  name: z.string().trim().min(2).max(80).optional(),
});

// ---- tokens ----
export const refreshBody = z.object({ refreshToken: z.string().min(20) });
export const logoutBody = z.object({ refreshToken: z.string().optional() }).optional();
export const okSchema = z.object({ ok: z.literal(true) });

// ---- demo ----
export const personaLoginBody = z.object({ personaId: z.string().min(1), channel: z.enum(['console', 'app']).optional() });
export const personasQuery = z.object({ channel: z.enum(['console', 'app']).optional() });
export const personaSchema = z.object({ id: z.string(), name: z.string(), role: z.enum(ALL_ROLES), channel: z.enum(['console', 'app']), story: z.string() });
