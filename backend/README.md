# @tgs/backend

Production backend for TGSECCSL: **Fastify 5 + PostgreSQL + Drizzle**. Plan and phases: `docs/22-backend-plan.md`.
The mock API (`apps/mock-api`) stays for demos; this server replaces it phase by phase.

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
| `npm run demo:backend` | Mock API (:4000) + backend (:4100) + console (:5180) pointed at the backend |
| `npm run test:backend` | Wipes `tgseccsl_test`, applies migrations, runs every backend test |
| `npm run db:generate -w @tgs/backend` | Writes a new SQL migration after changing `src/models` |
| `npm run db:migrate -w @tgs/backend` | Applies pending migrations to `DATABASE_URL` |
| `npm run db:seed -w @tgs/backend` | Loads the fictional demo data (dev only) |
| `npm run db:studio -w @tgs/backend` | Drizzle Studio to browse the tables |

## Layout

```
src/
  server.ts            starts HTTP          app.ts   builds the app (plugins → modules → fallback)
  config/              env.ts (validated .env), constants.ts
  db/                  client, transaction, migrate, migrations/, seed/
  models/              Drizzle tables = database models
  modules/<name>/      <name>.routes · .controller · .service · .repository · .schema · .test
  common/              errors (AppError), guards (requireAuth/requireRole/department scope), http (pagination), utils
  plugins/             db, error-handler, security (CORS + helmet), swagger, mock-fallback
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

## Mock fallback (development only)

With `MOCK_FALLBACK_URL` set, any route the backend has not built yet is forwarded to the mock API, so both apps
work against :4100 from day one. Backend routes always win. The fallback is ignored in production and removed in P9.
If another program already uses port 4000, start the mock API on another port (`PORT=4001`) and point
`MOCK_FALLBACK_URL` at it.
