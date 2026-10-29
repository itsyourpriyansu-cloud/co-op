import { z } from 'zod';

/** GET /health (docs/11 demo.health). Same fields as the mock API plus `database`. */
export const healthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal('tgseccsl-backend'),
  version: z.string(),
  today: z.iso.date(),
  database: z.object({
    ok: z.boolean(),
    latencyMs: z.number().int().nonnegative(),
    serverVersion: z.string().optional(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
