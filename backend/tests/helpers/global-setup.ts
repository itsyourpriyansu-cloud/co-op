import pg from 'pg';
import { runMigrations } from '../../src/db/migrate';

/** Before the whole run: wipe tgseccsl_test and apply every migration from scratch. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (backend/.env). See backend/.env.example.');
  if (!/tgseccsl_test/.test(url)) throw new Error('TEST_DATABASE_URL must point at the tgseccsl_test database.');

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await client.end();
  }
  await runMigrations(url);
}
