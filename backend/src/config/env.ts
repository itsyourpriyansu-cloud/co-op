import { z } from 'zod';

// Every environment variable the backend reads, validated once at start-up (docs/22 §2).
// A wrong or missing value stops the server with a clear message instead of failing later.

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().startsWith('postgres', 'DATABASE_URL must be a postgres:// URL'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o && o !== '*'),
    ),
  /** P9 (D-100): trust X-Forwarded-For only behind a known proxy (Azure App Service); otherwise a client could fake its IP past the rate limits. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** P9 (D-100): requests per minute per IP on every route (0 = off). Sign-in has its own stricter limit. Production default 600. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).optional(),

  // ---- P1 auth (docs/22 §5.1) ----
  /** Signs access tokens. Required (32+ characters) in production; a fixed dev value otherwise. */
  JWT_SECRET: z.string().min(32).optional(),
  /** Encrypts TOTP secrets at rest. Required in production; a fixed dev value otherwise. */
  DATA_ENCRYPTION_KEY: z.string().min(32).optional(),
  /** G3 (D-113): where file bytes live. `database` (encrypted in PostgreSQL) or `azure-blob` (encrypted, in Blob Storage via managed identity). */
  FILE_STORE: z.enum(['database', 'azure-blob']).default('database'),
  AZURE_STORAGE_ACCOUNT: z.string().trim().default(''),
  AZURE_STORAGE_CONTAINER: z.string().trim().default('files'),
  /** A user-assigned managed identity's client id; empty uses the system-assigned identity. */
  AZURE_CLIENT_ID: z.string().trim().default(''),
  /** G1 (D-111): largest document upload (photo, ID card, order). 5 MB. */
  DOCUMENT_MAX_BYTES: z.coerce.number().int().min(100_000).max(20_000_000).default(2 * 1024 * 1024),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** G4 (D-114): staff sign-ins (console and staff screens) end after this many days without use. */
  STAFF_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).default(300),
  /** Console roles that must use an authenticator code (Super Admin and the signers, D-068). */
  TOTP_ROLES: z
    .string()
    .default('SUPER_ADMIN,SECRETARY,PRESIDENT')
    .transform((v) => v.split(',').map((r) => r.trim()).filter(Boolean)),
  /** Demo sign-in (persona list, fixed OTP 123456). Always off in production. */
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // ---- F-10 (D-093): outside messaging; only the simulated provider until the society names one ----
  // G5 (D-115): `meta` sends through the WhatsApp Cloud API with the society's approved templates.
  WHATSAPP_PROVIDER: z.enum(['simulated', 'meta']).default('simulated'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().trim().default(''),
  /** A permanent system-user token from Meta Business (Key Vault in production). */
  WHATSAPP_TOKEN: z.string().trim().default(''),
  WHATSAPP_API_VERSION: z.string().trim().default('v21.0'),
  /** Approved template with two body values: {{1}} title, {{2}} text. */
  WHATSAPP_NOTICE_TEMPLATE: z.string().trim().default('society_notice'),
  /** Approved authentication template (copy-code button). */
  WHATSAPP_OTP_TEMPLATE: z.string().trim().default('login_code'),
  WHATSAPP_LANGUAGE: z.string().trim().default('en'),
  /** The society's WhatsApp Business number (F-10). */
  WHATSAPP_FROM: z.string().trim().default(''),
  /** G9 (D-121): the Meta app secret; the status webhook checks every call's X-Hub-Signature-256 with it. Empty = webhook off. */
  WHATSAPP_APP_SECRET: z.string().trim().default(''),
  /** G9 (D-121): any long random text, entered again in Meta's webhook setup so Meta can prove the URL. */
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().trim().default(''),
  // G5 (D-115): `acs` sends through Azure Communication Services with the managed identity.
  EMAIL_PROVIDER: z.enum(['simulated', 'acs']).default('simulated'),
  ACS_ENDPOINT: z.string().trim().default(''),
  /** The sender address for society email (F-10). */
  EMAIL_FROM: z.string().trim().default(''),
  /** G4 / G5 (D-114): push notifications. `simulated` logs them; `expo` sends through the Expo push service. */
  PUSH_PROVIDER: z.enum(['simulated', 'expo']).default('simulated'),
  /** Only if "enhanced push security" is on for the Expo project. */
  EXPO_ACCESS_TOKEN: z.string().trim().default(''),
  /**
   * G4 (D-114): the one mobile Apple and Google reviewers sign in with (a fictional member with no
   * money, created by the Admin). Its code is this fixed one and is never sent. Empty = off. Remove after review.
   */
  STORE_REVIEW_MOBILE: z.string().trim().regex(/^(\d{10})?$/, 'STORE_REVIEW_MOBILE must be 10 digits').default(''),
  STORE_REVIEW_OTP: z.string().trim().regex(/^(\d{6})?$/, 'STORE_REVIEW_OTP must be 6 digits').default(''),
  /** Password given to the seeded demo staff (dev/test only). */
  SEED_STAFF_PASSWORD: z.string().min(8).default('Society@2026'),
});

export type Env = Omit<z.infer<typeof EnvSchema>, 'JWT_SECRET' | 'DATA_ENCRYPTION_KEY'> & {
  JWT_SECRET: string;
  DATA_ENCRYPTION_KEY: string;
};

const DEV_JWT_SECRET = 'dev-only-jwt-secret-not-for-production-0001';
const DEV_ENCRYPTION_KEY = 'dev-only-encryption-key-not-for-production-01';

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid backend configuration (see backend/.env.example):\n${lines.join('\n')}`);
  }
  const raw = parsed.data;
  const production = raw.NODE_ENV === 'production';
  if (production && (!raw.JWT_SECRET || !raw.DATA_ENCRYPTION_KEY)) {
    throw new Error('Invalid backend configuration: JWT_SECRET and DATA_ENCRYPTION_KEY are required in production.');
  }
  if (raw.WHATSAPP_PROVIDER === 'meta' && !(raw.WHATSAPP_PHONE_NUMBER_ID && raw.WHATSAPP_TOKEN)) throw new Error('Invalid backend configuration: WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN are required when WHATSAPP_PROVIDER=meta.');
  if (raw.EMAIL_PROVIDER === 'acs' && !(raw.ACS_ENDPOINT && raw.EMAIL_FROM)) throw new Error('Invalid backend configuration: ACS_ENDPOINT and EMAIL_FROM are required when EMAIL_PROVIDER=acs.');
  if (!raw.STORE_REVIEW_MOBILE !== !raw.STORE_REVIEW_OTP) throw new Error('Invalid backend configuration: set both STORE_REVIEW_MOBILE and STORE_REVIEW_OTP, or neither.');
  if (raw.FILE_STORE === 'azure-blob' && !raw.AZURE_STORAGE_ACCOUNT) throw new Error('Invalid backend configuration: AZURE_STORAGE_ACCOUNT is required when FILE_STORE=azure-blob.');
  // P9 (D-100): in production only the apps' own origins may call the API.
  if (production && !raw.CORS_ORIGIN.length) throw new Error('Invalid backend configuration: CORS_ORIGIN is required in production (the console and app origins).');
  const env: Env = {
    ...raw,
    JWT_SECRET: raw.JWT_SECRET ?? DEV_JWT_SECRET,
    DATA_ENCRYPTION_KEY: raw.DATA_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
  };
  // Demo sign-in must never run in production (docs/22 §5.1).
  if (production) {
    env.DEMO_MODE = false;
  }
  return env;
}
