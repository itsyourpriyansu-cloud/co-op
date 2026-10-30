import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { loadEnv } from '../../config/env';
import { systemInfo } from '../../models';
import { createDb, type Database } from '../client';
import { withTransaction, type Tx } from '../transaction';
import { authSeeders } from './auth.seed';
import { ledgerSeeders } from './ledger.seed';
import { masterSeeders } from './masters.seed';
import { memberSeeders } from './members.seed';

/**
 * Seed runner (dev and test only). Each phase adds seeders that load its tables from the
 * same fictional data as the demo (@tgs/mock-data), so IDs match the mock API and the
 * strangler fallback stays consistent (docs/22 §4). Seeders run in order, in one transaction,
 * and are idempotent (running the seed twice gives the same rows).
 */
export interface SeedContext {
  staffPassword: string;
}

export interface Seeder {
  name: string;
  run: (tx: Tx, ctx: SeedContext) => Promise<void>;
}

/** Registered per phase: P1 auth · P2 masters + departments · P3 ledger · P4 members · … */
export const seeders: Seeder[] = [...authSeeders, ...masterSeeders, ...ledgerSeeders, ...memberSeeders];

export async function runSeed(db: Database, ctx: SeedContext, list: Seeder[] = seeders): Promise<string[]> {
  return withTransaction(db, async (tx) => {
    for (const s of list) await s.run(tx, ctx);
    const value = { source: '@tgs/mock-data', seeders: list.map((s) => s.name) };
    await tx
      .insert(systemInfo)
      .values({ key: 'seed', value })
      .onConflictDoUpdate({ target: systemInfo.key, set: { value, updatedAt: sql`now()` } });
    return value.seeders;
  });
}

// `npm run db:seed -w @tgs/backend`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    console.error('Seeding is disabled in production.');
    process.exit(1);
  }
  const handle = createDb({ url: env.DATABASE_URL, ssl: env.DATABASE_SSL });
  runSeed(handle.db, { staffPassword: env.SEED_STAFF_PASSWORD })
    .then((names) => console.log(`Seed done (${names.length ? names.join(', ') : 'no seeders yet'}).`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => handle.close());
}
