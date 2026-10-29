import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../models';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export interface DbOptions {
  url: string;
  ssl?: boolean;
  /** Pool size. The society's load is small (~2,000 members), so a modest pool is enough. */
  max?: number;
}

export function createDb({ url, ssl = false, max = 10 }: DbOptions): DbHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    ssl: ssl ? { rejectUnauthorized: true } : undefined,
    application_name: 'tgseccsl-backend',
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
