# @tgs/backend

Production backend for TGSECCSL: **Fastify 5 + PostgreSQL + Drizzle**. Plan and phases: `docs/22-backend-plan.md`.
The console, the member app and the e2e suite use it by default (P9, D-100). The mock API (`apps/mock-api`) stays only for the prototype demo (`npm run demo`).

## First run

1. PostgreSQL running locally with two empty databases: `tgseccsl_dev`, `tgseccsl_test`.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `TEST_DATABASE_URL`.
3. From the repo root:
   ```bash
   npm install
   npm run db:migrate -w @tgs/backend
   npm run db:seed -w @tgs/backend
   npm run dev:backend
   ```
4. Open http://localhost:4100/health (server + database status) and http://localhost:4100/docs (API docs).

## Commands (from the repo root)

| Command | Does |
|---|---|
| `npm run dev:backend` | Backend on :4100, reloads on save |
| `npm run demo:backend` | Backend (:4100) + console (:5180) |
| `npm run test:backend` | Wipes `tgseccsl_test`, applies migrations, runs every backend test |
| `npm run db:generate -w @tgs/backend` | Writes a new SQL migration after changing `src/models` |
| `npm run db:migrate -w @tgs/backend` | Applies pending migrations to `DATABASE_URL` |
| `npm run db:seed -w @tgs/backend` | Loads the fictional demo data (dev only) |
| `npm run db:studio -w @tgs/backend` | Drizzle Studio to browse the tables |
| `npm run db:backup -w @tgs/backend` | Dump of `DATABASE_URL` into `backend/backups/` (git-ignored). Needs `pg_dump` on PATH, in `PG_BIN`, or the Windows PostgreSQL 18 folder |
| `npm run db:restore-drill -w @tgs/backend [-- file.dump]` | Restores a dump (a fresh one if none) into a throw-away database, compares row counts and the ledger, drops it |
| `npm run db:import-register -w @tgs/backend -- <file.csv> [--as-on YYYY-MM-DD] [--commit]` | Member register import (F-11): checks every row, writes only with `--commit` and no problems. Template and a fictional sample in `import/` |

## Layout

```
src/
  server.ts            starts HTTP          app.ts   builds the app (plugins → modules)
  config/              env.ts (validated .env), constants.ts
  db/                  client, transaction, migrate, migrations/, seed/
  models/              Drizzle tables = database models
  modules/<name>/      <name>.routes · .controller · .service · .repository · .schema · .test
  common/              errors (AppError), guards (requireAuth/requireRole/department scope), http (pagination), utils
  plugins/             db, error-handler, security (CORS + helmet), swagger
  integrations/        messaging, storage (from P6/P8)
  jobs/                pg-boss jobs (from P5)
tests/                 helpers (test app, global DB setup) + integration tests
```

Calls go one way: routes → controller → service → repository → models. A service may call another module's
service, never another module's repository. Business math comes only from `@tgs/domain`.
`modules/health` is the reference example of all five layers.

## Signing in (P1a)

| Who | How |
|---|---|
| Demo staff (seeded) | User IDs `admin`, `accounts`, `secretary`, `president`, `cashier`, `ddo.fin` with `SEED_STAFF_PASSWORD` (default `Society@2026`). Super Admin, Secretary and President then set up an authenticator app (QR code) |
| Members | `POST /api/v1/auth/otp/start` with their mobile, then `/auth/otp/verify`. Demo mode: the code is `123456` |
| Demo one-click | `GET /api/v1/__demo/personas`, `POST /api/v1/auth/persona` (DEMO_MODE only) |

Try them at http://localhost:4100/docs. Use the token from a sign-in with the **Authorize** button.

## Errors

Every error is `{ code, message, fieldErrors?, ruleId? }` with the status from docs/11 §1. Throw `fail('RULE_VIOLATION', '…', { ruleId: 'BR-002' })`
from any layer. Zod validation failures become `VALIDATION_ERROR` with `fieldErrors`.

## Production (P9, D-100)

- `NODE_ENV=production` needs `JWT_SECRET`, `DATA_ENCRYPTION_KEY` and `CORS_ORIGIN` (the console and app origins); demo sign-in, seeding and `/docs` are off.
- Every route has a per-IP limit (`RATE_LIMIT_PER_MINUTE`, default 600); sign-in has its own stricter one. Set `TRUST_PROXY=true` only behind a known proxy (Azure App Service).
- Container: `docker build -t tgseccsl-backend .` from the repo root; it applies migrations, then starts on :4100.
- Backups: Azure point-in-time backups first; `db:backup` for a portable copy and `db:restore-drill` to prove a restore works.
