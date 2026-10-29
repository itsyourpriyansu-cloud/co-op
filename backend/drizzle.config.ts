import { defineConfig } from 'drizzle-kit';

// `npm run db:generate -w @tgs/backend` writes SQL migrations from src/models.
// Migrations are committed; tables are never created by hand in pgAdmin (docs/22 §3).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/models/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
