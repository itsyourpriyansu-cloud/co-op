# 22 · Production backend plan

> Version 0.6 · 2026-10-30 · v0.6: §5.2 P2 as built (masters, departments, mirror to the mock, demo reset).
> Version 0.5 · 2026-10-29 · v0.5: §5.1 P1 design (auth, users, permissions, audit; session bridge; P1a/b/c).
> Version 0.4 · 2026-10-29 · v0.4: local server is PostgreSQL 18.1, user `postgres`; `tgseccsl_dev` and `tgseccsl_test` exist; URLs in `backend/.env`.
> Version 0.3 · 2026-10-29 · Status: **[P] Proposed (D-068, D-069)**.
> v0.2: Fastify instead of Hono; local PostgreSQL now, Azure PostgreSQL later (user choices). v0.3: **Envizon builds the backend** (Q-005 answered: Fusil has no backend); separate `backend/` folder with a layered, module-based structure; implementation phases P0–P9 with integration into both apps.
> Inputs: `docs/08` data model, `docs/09` rules, `docs/10` workflows, `docs/11` API contracts, `docs/21` society answers (D-067), the mock API (`apps/mock-api`, the reference implementation) and the Playwright suite (`tests/e2e`, the acceptance gate).

## 1. Stack

| Layer | Choice |
|---|---|
| Runtime / language | Node.js 24 LTS · TypeScript 6 (strict) |
| Framework | **Fastify 5** · `fastify-type-provider-zod` · `@fastify/swagger` + `@fastify/swagger-ui` (docs at `/docs`) |
| Plugins | `@fastify/jwt` · `@fastify/rate-limit` · `@fastify/multipart` · `@fastify/cors` · `@fastify/helmet` · `@fastify/sensible` |
| Database | **PostgreSQL 17**: local now (pgAdmin), Azure Database for PostgreSQL Flexible Server later. Only `DATABASE_URL` changes |
| ORM / migrations | **Drizzle ORM** + drizzle-kit (SQL migrations committed to git) |
| Validation | **Zod** (shared with `packages/types`) |
| Jobs | **pg-boss** (queue in Postgres), run by a separate worker process |
| Logging | **pino** (Fastify built-in), request id on every log line |
| Auth | Staff: username + password (argon2id) + TOTP for signers · Members: mobile + OTP (WhatsApp / push; simulated locally) · JWT access 15 min + rotating refresh token |
| Files | Local `storage/` folder now → Azure Blob later (one `StorageProvider` interface) |
| Messages | Simulated provider now → WhatsApp Cloud API, Azure email, Expo push later (one `MessageProvider` interface) |
| PDF / Excel | `@react-pdf/renderer` · `exceljs` |
| Tests | Vitest · Fastify `inject()` for API tests · separate test database · existing Playwright e2e suite |
| Reuse | `@tgs/domain` (all calculations), `@tgs/types` (entities, envelope), `@tgs/mock-data` (seed) |

## 2. Folder structure

The backend lives in its own top-level folder `backend/`, registered as an npm workspace (`@tgs/backend`) so it can import `@tgs/domain` and `@tgs/types`. It follows the common **layered, feature-module** layout: each business module owns its route, controller, service, repository and schema files; database tables (models) live together under `src/models`.

```
backend/
├─ package.json                 @tgs/backend · scripts: dev, start, worker, build, test, db:*
├─ tsconfig.json
├─ drizzle.config.ts            migrations config (reads DATABASE_URL)
├─ .env.example                 every variable, no secrets (copy to .env)
├─ .env                         YOUR local values, git-ignored
├─ Dockerfile                   for Azure later
├─ README.md
├─ storage/                     local uploaded documents (git-ignored)
├─ src/
│  ├─ server.ts                 starts the HTTP server
│  ├─ worker.ts                 starts the background job worker
│  ├─ app.ts                    builds the Fastify app: plugins → modules → error handler
│  │
│  ├─ config/
│  │  ├─ env.ts                 loads + validates .env with Zod (fails fast if wrong)
│  │  └─ constants.ts
│  │
│  ├─ db/
│  │  ├─ client.ts              Postgres pool + Drizzle instance
│  │  ├─ transaction.ts         withTransaction() helper
│  │  ├─ migrations/            generated SQL migrations (committed)
│  │  └─ seed/                  loads @tgs/mock-data into the database (dev/test only)
│  │
│  ├─ models/                   Drizzle table definitions = the database models
│  │  ├─ index.ts
│  │  ├─ users.model.ts         staff users, roles, permissions, sessions, otp
│  │  ├─ masters.model.ts       loan_product_versions, fd_rate_versions, insurance/fee/penal versions
│  │  ├─ departments.model.ts
│  │  ├─ members.model.ts       members, service_events, recovery_mandates, nominees
│  │  ├─ membership.model.ts    membership applications, documents
│  │  ├─ loans.model.ts         loans, sureties, schedules, assessments
│  │  ├─ deposits.model.ts      fixed deposits, holders, payouts
│  │  ├─ ledger.model.ts        accounts, journal_entries, journal_lines
│  │  ├─ collections.model.ts   demand_sheets, demand_lines, recoveries, receipts, payment_reports, dues
│  │  ├─ notifications.model.ts notifications, outbox, templates, support tickets
│  │  └─ audit.model.ts         workflow_events, audit_log
│  │
│  ├─ modules/                  one folder per business module (same set as the mock API)
│  │  ├─ auth/
│  │  │  ├─ auth.routes.ts      URL → controller, attaches schemas and guards
│  │  │  ├─ auth.controller.ts  reads the request, calls the service, shapes the response
│  │  │  ├─ auth.service.ts     business logic + transactions; calls @tgs/domain
│  │  │  ├─ auth.repository.ts  all SQL for this module (Drizzle queries only here)
│  │  │  ├─ auth.schema.ts      Zod request/response schemas (also feed OpenAPI)
│  │  │  └─ auth.test.ts
│  │  ├─ users/                 staff users + permission map (ST-61/62)
│  │  ├─ masters/               settings & versioned master files (ST-60…67)
│  │  ├─ departments/
│  │  ├─ members/               members, profile, transfers, change requests, search
│  │  ├─ membership/            joining applications + workflow
│  │  ├─ documents/             uploads (Aadhaar, PAN, service particulars)
│  │  ├─ loans/                 applications, eligibility, workflow, top-up, disbursement
│  │  ├─ sureties/              surety requests and responses
│  │  ├─ deposits/              FDs, acceptance, maturity, premature withdrawal
│  │  ├─ ledger/                postings, statements, trial balance
│  │  ├─ demand/                demand sheets, DDO deduction entry, allocation
│  │  ├─ payments/              receipts, counter payments, member payment reports, dues
│  │  ├─ work-queue/            work queue + dashboards (ST-01/02)
│  │  ├─ notifications/         in-app notifications, messages, templates, support
│  │  ├─ reports/               reports, CSV/Excel, PDFs
│  │  └─ me/                    member-app endpoints (/me/*): home, loans, deposits, payments
│  │
│  ├─ common/
│  │  ├─ errors/                AppError + codes from docs/11 (VALIDATION_ERROR, RULE_VIOLATION…)
│  │  ├─ guards/                requireAuth, requireRole, requirePermission, departmentScope
│  │  ├─ http/                  response envelope, pagination (ListParams → Paged<T>)
│  │  └─ utils/                 ids, dates (IST), money helpers (paise)
│  │
│  ├─ plugins/                  Fastify plugins: db, auth/jwt, swagger, cors, helmet, rate-limit, error-handler
│  │
│  ├─ integrations/             outside services behind interfaces (swap simulated → real)
│  │  ├─ messaging/             simulated · whatsapp · email · push
│  │  └─ storage/               local · azure-blob
│  │
│  └─ jobs/                     pg-boss job handlers
│     ├─ penal-interest.job.ts  daily interest on unpaid dues (REQ-133)
│     ├─ insurance-renewal.job.ts  12 months from last renewal
│     ├─ fd-maturity.job.ts
│     ├─ demand-reminder.job.ts list to DDOs 3–5 days before the 1st
│     └─ notifications.job.ts   sends queued WhatsApp / email / push
│
└─ tests/
   ├─ helpers/                  test app builder, test database reset, login helpers
   └─ integration/              cross-module flows (join → loan → demand → ledger)
```

### What each layer may do

| Layer | Does | Must not |
|---|---|---|
| **routes** | Register URLs, attach Zod schemas, guards, rate limits | Hold logic |
| **controller** | Take the validated request + user, call one service method, return the envelope | Touch the database |
| **service** | Business logic, workflow transitions, transactions, calls `@tgs/domain`, writes audit + workflow events, queues notifications | Build HTTP responses or write raw SQL |
| **repository** | Drizzle queries for its own module's tables | Contain business rules |
| **schema** | Zod shapes for body, params, query and response | — |
| **models** | Table definitions, indexes, constraints | — |

Calls go one way: `routes → controller → service → repository → models`. A service may call another module's **service**, never another module's repository.

## 3. Database (pgAdmin)

| Database | Use |
|---|---|
| **`tgseccsl_dev`** | Day-to-day development. Seeded with the same fictional data as the demo |
| **`tgseccsl_test`** | Automated tests only. Wiped and re-migrated on every test run |

Production later: `tgseccsl` on Azure.

- Encoding **UTF8**. Local development uses the **`postgres`** user (user choice, 2026-10-29); both databases exist. Production on Azure uses a dedicated, non-superuser role.
- Put the credentials in `backend/.env` yourself; they never go into git:
  ```
  DATABASE_URL=postgres://tgseccsl_app:<password>@localhost:5432/tgseccsl_dev
  TEST_DATABASE_URL=postgres://tgseccsl_app:<password>@localhost:5432/tgseccsl_test
  ```
- Tables are created by migrations (`npm run db:migrate -w @tgs/backend`), never by hand in pgAdmin. One schema `public`; pg-boss creates its own `pgboss` schema.

### Data design rules
- Money: `bigint` paise. Dates: `date`; timestamps: `timestamptz` (displayed in IST).
- IDs: the same readable IDs the prototype uses (e.g. `MEM-…`, General No.) as unique keys; UUID primary keys.
- **Versioned masters** (REQ-130): never update a master row; insert a new version and mark it ACTIVE (one ACTIVE per code, partial unique index). Loans, FDs and demand lines store the version id they used.
- **Ledger** (REQ-131): double entry. Every posting is one `journal_entry` with lines whose debits = credits (checked in the service and by a deferred constraint). No updates or deletes; corrections are reversing entries.
- **Workflow:** status column + `workflow_events`. Transitions run in a transaction with `SELECT … FOR UPDATE` on the row.
- **Audit:** every write adds an `audit_log` row (who, role, what, before/after, IP, device).
- **Sensitive:** Aadhaar encrypted at the application level and shown masked; documents stored privately.

## 4. Integration with the two apps

- Backend runs on **port 4100**; the mock API stays on 4000. Nothing breaks while the backend grows.
- The apps switch by environment variable only: `VITE_API_URL=http://localhost:4100` (console), `EXPO_PUBLIC_API_URL=http://localhost:4100` (phone). `packages/api-client` is unchanged.
- **Dev-only fallback (strangler pattern):** while phases are in progress, routes the backend does not have yet are forwarded to the mock API (`MOCK_FALLBACK_URL=http://localhost:4000`). Both are seeded from the same `@tgs/mock-data`, so IDs match. This lets you use the real apps against the backend from phase P1. The fallback is removed in P9.
- New root scripts: `npm run dev:backend`, `npm run dev:worker`, `npm run demo:backend` (backend + console).
- The society's changes (doc 21 §2) are built into `@tgs/domain` first (tested), then into the backend in the matching phase. Contract changes go into `docs/11` and `@tgs/types` first. The mock API keeps the current demo behaviour unless asked.

## 5. Phases

Each phase ends with its exit test passing. Never start the next phase before that (CLAUDE.md rule 1).

| Phase | Builds | Integrates | Exit test |
|---|---|---|---|
| **P0 Foundation** ✅ built 2026-10-29 (D-073) | `backend/` scaffold, env validation, Postgres + Drizzle, migrations, seed, error envelope, pino logs, swagger, guards skeleton, test DB helpers, mock fallback, root scripts | Console works fully on :4100 (everything via fallback) | `GET /health` reports database OK; `npm test -w @tgs/backend` green; `/docs` opens |
| **P1 Auth, users, audit** | Staff login (password + TOTP for signers), member login (mobile + OTP, simulated WhatsApp), refresh tokens, `/me`, permission map (docs/03), users admin, audit log | Console + phone sign in against the backend | Every persona signs in; role guards return 403 correctly; e2e login tests pass on :4100 |
| **P2 Masters & departments** ✅ built 2026-10-30 (D-079) | Versioned masters (loan products, FD rates, insurance ₹200/₹1,000, joining fee ₹0, penal %), society profile, departments, templates, reference rates | Settings screens + MB-16 rates | Editing a product creates a new ACTIVE version; old loans keep their version |
| **P3 Ledger core** | Chart of accounts, member sub-accounts, posting service, statements, trial balance | — (used by P4–P7) | Every posting balances; reversal works; trial balance = 0 |
| **P4 Members & joining** | Members, service history, mandates, documents (Aadhaar, PAN, service particulars), joining workflow (Accountant → Secretary → President, D-070), share payment, profile change requests, search | Joining board, member pages, MJ screens on the phone | Joining journey e2e passes on :4100; General No. allotted; share receipt posted to ledger |
| **P5 Loans & sureties** | Applications, eligibility, sureties (FD check for retiring sureties), workflow, assessment with counter-offer, sanction, disbursement (10% share + insurance deducted, ledger posting), schedule (EMI method per product: reducing, amortised or flat, D-071), top-up, multiple loans per type | Loans screens, work queue, MB-03…07 | Loan journeys e2e pass; disbursement entries balance; remaining balance + months shown |
| **P6 Deposits** | FD request, payment (cash denominations / transfer), acceptance, FDR, maturity job, premature withdrawal with penalty, loan against FD | Deposits screens, MB-08/09/15 | FD journey e2e passes; interest and penalty posted to ledger |
| **P7 Collections** | Demand sheets per department, send-by date, **DDO enters actual deduction**, allocation (BR-011), dues (not carried forward), counter receipts, member payment reports (QR, no screenshot), daily penal job, defaulter after 1 month, guarantor notices | Demand screens, DDO console, MB-10/18 | Month-end journey e2e passes; reports match ledger totals |
| **P8 Notifications, dashboards, reports** | Work queue + dashboards (48 h / 4–5 day alerts), in-app notifications, WhatsApp/email/push providers (simulated + real adapters), support tickets, 8 reports, CSV/Excel, PDFs | Every remaining screen | Full Playwright suite (188 tests) green against :4100 with fallback **switched off** |
| **P9 Hardening & go-live prep** | Remove fallback, security review (rate limits, headers, OWASP checks), backups, Dockerfile, data import tool for the society's registers (F-11), performance check, Azure deployment (Bicep) when asked | Apps default to the backend | e2e green; restore drill; import of a sample register succeeds |

### 5.1 P1 design: auth, users, permissions, audit

P1 is split in three steps, each committed on its own: **P1a** backend (✅ built 2026-10-29, D-076), **P1b** console sign-in (✅ built 2026-10-29, D-077), **P1c** member-app sign-in (✅ built 2026-10-29, D-078). The P1 exit test runs after P1c.

**Tables (P1a)**

| Table | Holds |
|---|---|
| `staff_users` | id, username (unique), name, role (console role), department_id (DDO only), email, mobile, password_hash (argon2id), totp_secret (encrypted), totp_enabled, status ACTIVE/INACTIVE, failed_attempts, locked_until, last_login_at |
| `app_accounts` | The phone identity: id, kind MEMBER/APPLICANT, member_id or applicant_id, general_no, employee_id, name, **mobile (unique)**, status, last_login_at. Members and applicants themselves move in P4; this table is only who may sign in |
| `otp_challenges` | id, mobile, purpose LOGIN/SIGNUP, code_hash, channel (WHATSAPP/PUSH; simulated), attempts, expires_at (5 min), consumed_at |
| `refresh_tokens` | id, subject (staff or app account), token_hash (SHA-256), device label, ip, created_at, expires_at (30 days), revoked_at, replaced_by (rotation; reuse of a rotated token revokes the whole chain) |
| `role_permissions` | role, permission. Seeded from the docs/03 matrix (today in `apps/mock-api/src/permissions.ts`, moved to `@tgs/domain` so both servers share one list). The Super Admin edits it (ST-62) |
| `audit_log` | id, at, actor id, actor role, action, entity, entity id, summary, before/after (jsonb), ip, user agent, request id. Append-only |

**Sign-in**

| Who | Flow | Endpoints |
|---|---|---|
| Staff | username + password → if the role needs it (Super Admin, Secretary, President; setting) a 6-digit **authenticator (TOTP)** code → tokens. First sign-in of a signer enrols TOTP (QR code). 5 wrong tries lock the account for 15 min | `POST /auth/staff/login`, `POST /auth/staff/totp`, `POST /auth/staff/totp/setup`, `POST /auth/staff/totp/confirm` |
| Member / applicant | **mobile number → OTP** (D-067) → tokens. Unknown mobile on the sign-up path creates an applicant account. Simulated delivery locally (the code is logged and, outside production, returned as `demoOtp`, `123456` as in the demo); WhatsApp/push in P8 | `POST /auth/otp/start`, `POST /auth/otp/verify` |
| Everyone | short **access token** (JWT, 15 min, `JWT_SECRET`) + **refresh token** (opaque, rotated on every use, stored hashed). `/me` returns user, channel and permissions as today | `POST /auth/refresh`, `POST /auth/logout`, `GET /me` |
| Demo only (not in production) | the persona list and one-click sign-in stay, so the demo script and e2e suite keep working | `GET /__demo/personas`, `POST /auth/persona` |

Member passwords go away (D-067): MA-03 forgot password, MB-17 change password and the activation password step are retired in P1c. `/auth/member-login`, `/auth/activate/*`, `/auth/forgot/*`, `/auth/password/*`, `/me/password` are not built in the backend.

**Users and permissions (P1a):** `GET/POST/PUT /users` (Super Admin; create staff with a temporary password, deactivate, reset TOTP), `GET/PUT /permissions`. Guards: `requirePermission('loans.sanction')` reads the role's permissions (cached, refreshed on change); DDO department scope as in P0. Separation-of-duties checks (Secretary ≠ President, assessor ≠ sanctioner, cashier ≠ FD acceptor, no self-surety) live in the services of P4–P6.

**Session bridge (dev only, until P9):** routes still served by the mock API need a mock session. When the backend forwards a request with a valid backend token, it swaps the `Authorization` header for a mock session of the same user, created through a new dev-only mock endpoint `POST /api/v1/__demo/session { userId }` and cached per user (re-created once on a 401, e.g. after a demo reset). Requests without a token are forwarded unchanged.

**Seed (P1a):** the 6 demo staff (username = their demo user ID, dev password from `SEED_STAFF_PASSWORD`, default the demo password), app accounts for every active member and applicant in `@tgs/mock-data` (same IDs and mobiles), the permission matrix.

**Other packages:** `@node-rs/argon2` (prebuilt, no compiler), `otplib` (TOTP), `@fastify/jwt`, `@fastify/rate-limit` (5 OTP requests per mobile per 15 min, 10 logins per IP per minute).

**P1b console:** sign-in page with username + password and the TOTP step (enrolment shows a QR code); the demo persona panel shows only when the server offers personas. `@tgs/api-client` refreshes the access token on a 401 and retries once.

**P1c member app:** MA-01 becomes mobile → OTP; applicants sign up the same way; demo member cards still sign in with one tap; retire MA-03 and MB-17 (screen count changes in docs/05).

**Exit test (after P1c):** backend tests for every flow (wrong password, lockout, TOTP, OTP expiry and attempts, refresh rotation and reuse, permission guard, DDO scope, audit rows); console e2e suite green on :4100 (personas through the backend + bridge) plus a new real staff sign-in test with TOTP; phone e2e for mobile + OTP sign-in.

### 5.2 P2 as built: masters, departments, templates (D-079)

| Table | Holds |
|---|---|
| `settings_versions` | The whole society settings document (shares, admission fee, insurance, RRF/CRD/SRDS, FD slabs, limits, placeholders) as **one version per change**; exactly one ACTIVE (partial unique index). FD rates, insurance and fees live here, so a deposit or demand line can store the one version id it used |
| `loan_product_versions` | One row per version of each loan product; one ACTIVE per code. Loans will store the version id (P5) |
| `society_profile` | One row; changes audited |
| `departments` | ST-67 departments and DDO name/designation (code unique) |
| `notification_templates` | ST-63 wording per event; placeholders limited to the event's own |

Endpoints (same contracts as the mock): `GET /settings`, `PUT /settings/society`, `PUT /settings/values` (new version), `PUT /settings/loan-products/:code` (new version), `GET /settings/versions`, `GET /settings/loan-products/:code/versions`, `GET|POST /departments`, `PUT /departments/:id`, `GET /notification-templates`, `PUT /notification-templates/:key`, `GET /reference/rates`, demo `POST /__demo/reset`.

**Keeping the mock in step (dev only, until the modules that read these move):** the mock still calculates loans, FDs and demand with its own copy of settings, products, departments and staff. After the backend saves a change on those routes, the same request is replayed to the mock as the same user before the reply leaves (`MIRRORED_ROUTES` in `plugins/mock-fallback.ts`; also P1's `/users`). **Demo reset** reseeds the backend tables and then resets the mock. Department **member counts** come from the mock until members move (P4).

## 6. Rules carried over

- Business math only in `@tgs/domain` (CLAUDE.md rule 7); services call it, never re-implement it.
- Server is authoritative; every role/scope check happens in guards and services.
- Unknown rules stay configurable (master/settings), with placeholders from `docs/09` and `docs/21` (F-01…F-12, C-1, C-2).
- Every change: decisions log, affected docs, version lines, BUILD-CHECKLIST session log.

## 7. Open decisions that affect phases

| Item | Needed by |
|---|---|
| ~~C-1 EMI method~~ resolved D-071: all methods, chosen per product | P5 |
| ~~C-2 signatures~~ resolved D-070: two (Secretary → President) | P4 |
| F-03 10% share + insurance: which loan types | P5 |
| F-06 penal and FD premature penalty rates | P6, P7 (default 0% until answered) |
| WhatsApp provider + society number (F-10) | P8 real adapter |
| Azure subscription owner | P9 |
