import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { systemInfo } from '../../models';
import { createDb, type Database } from '../client';
import { withTransaction, type Tx } from '../transaction';

/**
 * Seed runner (dev and test only). Each phase adds a seeder that loads its tables from the
 * same fictional data as the demo (@tgs/mock-data), so IDs match the mock API and the
 * strangler fallback stays consistent (docs/22 §4). Seeders run in this order, in one transaction.
 */
export interface Seeder {
  name: string;
  run: (tx: Tx) => Promise<void>;
}

/** Registered per phase: P1 users, P2 masters + departments, P4 members, … */
export const seeders: Seeder[] = [];

export async function runSeed(db: Database, list: Seeder[] = seeders): Promise<string[]> {
  return withTransaction(db, async (tx) => {
    for (const s of list) await s.run(tx);
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
  const url = process.env.DATABASE_URL;
  if (!url || process.env.NODE_ENV === 'production') {
    console.error(url ? 'Seeding is disabled in production.' : 'DATABASE_URL is not set (backend/.env).');
    process.exit(1);
  }
  const handle = createDb({ url });
  runSeed(handle.db)
    .then((names) => console.log(`Seed done (${names.length ? names.join(', ') : 'no seeders yet'}).`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => handle.close());
}
