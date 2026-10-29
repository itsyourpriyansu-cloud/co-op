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
  MOCK_FALLBACK_URL: z
    .string()
    .trim()
    .default('')
    .transform((v) => v || undefined)
    .pipe(z.url().optional()),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid backend configuration (see backend/.env.example):\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  // The strangler fallback must never run in production (docs/22 §4).
  if (env.NODE_ENV === 'production') env.MOCK_FALLBACK_URL = undefined;
  return env;
}
