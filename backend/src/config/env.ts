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
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
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
  WHATSAPP_PROVIDER: z.enum(['simulated']).default('simulated'),
  /** The society's WhatsApp Business number (F-10). */
  WHATSAPP_FROM: z.string().trim().default(''),
  EMAIL_PROVIDER: z.enum(['simulated']).default('simulated'),
  /** The sender address for society email (F-10). */
  EMAIL_FROM: z.string().trim().default(''),
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
