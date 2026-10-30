# TGSECCSL Society Management System — Project Context (Source of Truth)

> **Every Claude session must read this file first, then `BUILD-CHECKLIST.md` → "Resume here"**, then the docs listed under "Doc map" for the current step.
> At the end of every session, follow the **Session ritual** in `BUILD-CHECKLIST.md` (tick boxes, update "Resume here", add a session-log line).
> Plain-language guide for humans: `LEARN-THE-APP.md`.
> Version: 0.6 (draft) · Last updated: 2026-10-29 · Scope widened: production backend (D-069, D-074) · Owner: Envizon Studio

---

## 1. What we are building

A Co-operative Credit Society Management System for
**The Telangana Secretariat Employees Co-operative Credit Society Ltd. (TGSECCSL)**. Two stages:
- **Done:** a clickable, finished-UI prototype on mock data (M0–M10, demo-ready).
- **Now:** the **production backend** (Fastify + PostgreSQL) that replaces the mock API phase by phase (P0–P9, `docs/22`). Envizon builds it (Q-005 → D-069).

- Contract context: Software Supply, Implementation & Support Agreement dated 05 July 2026 between **Fusil Solutions Pvt Ltd** (Service Provider) and TGSECCSL (Client). Product name in the agreement: "FUSIL EMPLOYEES SOCIETY ERP".
- UX flow diagrams were prepared by **Envizon** (6 role flows).
- The society's **paper forms** (Membership, Ordinary/Education loan, Salary loan, FD, 2 recovery agreements) were photographed and mapped field by field in `docs/16-paper-forms-digitization.md`. Letterhead: Regd. No. P-929, 2nd Floor, West Ancillary Building, Dr. B.R Ambedkar Telangana Secretariat, Hyderabad-500004.
- Deliverables in one monorepo:
  1. **Admin Console** (desktop web, React + Vite): Super Admin, Accountant, Secretary, President, Cashier/Disbursement, DDO
  2. **Member App** (Expo React Native, **Android APK**): applicants (join the society + track) and members. **Members use only the app. Staff use only the console** (D-033)
  3. **Backend** (`backend/`, Fastify + PostgreSQL + Drizzle): the real server for both apps (`docs/22`)
  4. **Mock API server** (`apps/mock-api`, Node + Hono, in-memory, seeded): the demo server and, until P9, the dev fallback for routes the backend has not built yet
- Scope accepted: **MVP = 38 console pages + 29 app screens (67) + 11 decision drawers + 8 report templates + 9 printable form twins** (D-046).
- Start with `docs/00-system-overview.md` for the one-page structure.

## 2. Current phase & gate

| Phase | Status |
|---|---|
| 1 Product Discovery | v0.3 (paper forms analysed), awaiting review |
| 2 Experience Architecture | v0.3 (join flow, FD, salary loan, surety, DDO journeys), awaiting review |
| 3 System Architecture | v0.3, awaiting review |
| 4 Context Engineering | v0.3 (this file + docs/) |
| 5 Implementation Planning | v0.3, awaiting review |
| **Build** | **M0–M10 done (demo scope)** on branch `m0-foundation` (Settings, Joining + Members, Loans core + workflow, Deposits, Demand & collections, Member app completion, Dashboards + notifications + reports, a11y / states polish + global search + demo script; D-053 … D-064). **Demo-ready (D-065, D-066):** demo clock, full Playwright suite in `tests/e2e/` (journeys, cross-app, a11y, states, screen sizes, the whole demo script), `npm run demo:prod` on :5180. Demo-only, localhost now, Azure later (D-054). Deferred until asked: signed APK, device test, hosting. Presenting: `DEMO-SCRIPT.md`; society questions: `docs/client-questions.md` |

Decided so far: MVP scope, Expo Android app, React + Vite console, shared mock API, digital membership join with stage tracker, Secretary → President sign-off, FDs for members + joint/minor, share payment by counter or first demand. **Society answers received 2026-10-29 (D-067):** recorded in `docs/client-questions.md`; what changes, conflicts (C-1 EMI method, C-2 approvals) and follow-ups F-01..F-12 in `docs/21-society-answers-impact.md`. **Production backend: Envizon builds it** (Q-005 → D-069) in `backend/` (Fastify + PostgreSQL + Drizzle, layered modules), phases P0–P9 in `docs/22-backend-plan.md` (D-068, D-069). **P0–P3 + P4a built** (D-073, D-076…D-081): Fastify on :4100 with PostgreSQL, real sign-in (staff password + authenticator, members mobile + OTP), users, permissions, audit, versioned settings and loan products, departments, templates, the ledger (double entry, append-only), members (service history, mandates, transfers); everything else still comes from the mock API through the dev fallback + session bridge (master changes are mirrored to the mock). Next: P4b change requests, then P4c joining.

## 3. Hard rules for every Claude session

1. **Build phase by phase.** Prototype milestones M0–M10 are done (`docs/14`). Backend phases P0–P9 (`docs/22` §5): never start P(n+1) before P(n)'s exit test passes.
2. **Scope (D-074):** the backend is real: PostgreSQL, real authentication (staff password + TOTP, member mobile + OTP), ledgers, jobs. **Outside services stay simulated until their phase connects them** behind an interface (`backend/src/integrations`): WhatsApp, email, push, file storage (P8/P9). No payment gateway (members pay by the society's QR code, D-067). The mock API keeps the demo working and serves as the dev fallback until P9; never add new business features to the mock API only.
3. **Never invent business logic.** Rules come only from `docs/09-business-rules.md`. If a rule is `UNKNOWN`, implement it as a **configurable setting** that has the placeholder default listed there. Do not hard-code the guess. Log any new assumption in `docs/open-questions.md`.
4. **Source precedence:** Agreement (A) and paper forms (PF) > Accepted decisions (decisions-log) > Flow diagrams (F) > Proposals (P). Conflicts are tracked as `CONFLICT` in `docs/02-requirements-register.md`.
5. **Status tags used across all docs:**
   `[A]` confirmed by Agreement · `[PF]` confirmed by a paper form · `[S]` confirmed by the society in writing (D-067) · `[F]` confirmed by Flow diagram · `[D-xxx]` decided · `[P]` proposal (needs approval) · `[ASSUMPTION]` domain assumption (needs confirmation) · `[UNKNOWN]` · `[CONFLICT]`
6. **Change discipline:** when anything changes: (a) add or modify an entry in `docs/decisions-log.md`, (b) update every affected doc, (c) bump the version line at the top of each changed doc, (d) update section 2 above.
7. **Domain math** (EMI, eligibility, share deduction, top-up settlement, recovery allocation, demand generation) lives only in `packages/domain` as pure, unit-tested functions driven by settings. The backend services (and the mock API) use it for every posting; never re-implement a calculation in a service. UIs use it only for previews.
8. **Mock data** is deterministic (seeded) and fictional. Never use real member names, phone numbers, Aadhaar or PAN.
9. **Git: one branch.** Commit and push directly to `main` (D-075). No feature branches or pull requests.
10. Use stable IDs everywhere: `REQ-###`, `BR-###`, screen IDs (`AU-`, `ST-`, `SYS-`, `MJ-`, `MA-`, `MB-`), `J-##` journeys, `Q-###` questions, `D-###` decisions, `AC-…` acceptance criteria. Reference them in commits and code comments where relevant.

## 4. Doc map: which document to use at each stage

| Stage / task | Read | Update |
|---|---|---|
| Where are we / what's next | `BUILD-CHECKLIST.md` | **every session** |
| Explaining the app to a person | `LEARN-THE-APP.md` | when flows/stack change |
| One-page structure (start here) | `docs/00-system-overview.md` | same |
| Understanding the product | `docs/01-product-discovery.md`, `docs/glossary.md` | — |
| Digitising any paper form / field | `docs/16-paper-forms-digitization.md` | same + 08 |
| Member App structure vs Envizon sitemap | `docs/17-member-sitemap-review.md` | same |
| Checking whether something is in scope | `docs/02-requirements-register.md` | register + decisions-log |
| Roles & access | `docs/03-roles-permissions.md` | same |
| Navigation, journeys, states | `docs/04-experience-architecture.md` | same |
| "How many things do we build?" | `docs/05-screen-inventory.md` | same |
| Building a screen | `docs/06-screen-specs.md` (incl. v0.3 addendum), `docs/16`, `docs/12-design-system.md` (layout, icons, imagery, metrics), `docs/18` (tokens + components as built), `docs/19` (patterns + the ten states) | specs if a gap is found |
| Demo data states / demo controls | `docs/20-scenario-catalog.md` | same |
| Testing end to end | `tests/e2e/`, `docs/15` §1 | same |
| App structure, folders, services | `docs/07-system-architecture.md` | same |
| Entities / TypeScript types | `docs/08-data-model.md` | same |
| Any calculation or validation | `docs/09-business-rules.md` | same + open-questions |
| Loan / demand / payment flows | `docs/10-workflows.md` | same |
| Service layer (mock API) | `docs/11-api-contracts.md` | same |
| Seed data | `docs/13-mock-data-spec.md` | same |
| Sequencing & milestones | `docs/14-implementation-plan.md` | status column |
| Done-ness / QA | `docs/15-test-plan-acceptance.md` | same |
| Decisions & questions | `docs/decisions-log.md`, `docs/open-questions.md` | always |
| Society answers → app changes | `docs/21-society-answers-impact.md` | same + 09/10 when built |
| Production backend | `docs/22-backend-plan.md` | same + 07 |

## 5. Quick glossary (full list in `docs/glossary.md`)

DDO = Drawing & Disbursing Officer · CRD / SRDS / RRF = deposit/fund heads named in the agreement (expansions **UNKNOWN**, see Q-301) · Demand Sheet = monthly department-wise recovery statement · Surety = guarantor member · Leftover service = time remaining until retirement · Top-up = enhancement of an existing loan · General No. = society identifier on all forms (Q-501) · OL/SL = Ordinary/Salary Loan · FDR = Fixed Deposit Receipt · Sign with OTP = digital signature (D-031).

## 6. Tech stack

| Part | Stack | Decision |
|---|---|---|
| Monorepo | **npm workspaces** (built into Node, no extra install): `apps/{admin-console,member-app,mock-api}`, `packages/{domain,types,api-client,mock-data,design-tokens}`. Demo = `npm run demo` | D-024 (Proposed), D-038 (Accepted) |
| Admin Console | React 18 + TypeScript + Vite · React Router · TanStack Query/Table · React Hook Form + Zod · Tailwind + shadcn/ui · Recharts · date-fns · Vitest · Playwright | D-008 (Accepted) |
| Member App | Expo SDK 58 (React Native 0.88) + TypeScript · Expo Router (`src/app/`) · StyleSheet + shared tokens (D-039) · TanStack Query · expo-secure-store · lucide-react-native · Jest + RNTL · Maestro · Android APK via EAS | D-019, D-020, D-022, D-039, D-040 |
| Mock API | Node + Hono · in-memory store + JSON snapshot · demo endpoints (reset, clock, failure rate, personas) | D-021 (Accepted), D-025 (Proposed) |
| Backend | Node 24 · Fastify 5 · Zod 4 (fastify-type-provider-zod) · PostgreSQL 18 locally (Azure PostgreSQL later) · Drizzle ORM + drizzle-kit migrations · pg-boss jobs · Vitest on `tgseccsl_test`. Port 4100, docs at `/docs`. Layout: `backend/README.md` | D-068, D-069, D-073 |

## 7. Conventions (apply once the build is approved)

- Currency: INR with Indian digit grouping (`₹1,00,000.00`), via one `formatINR()` helper.
- Dates: display `DD MMM YYYY` (e.g. 05 Jul 2026), store ISO `YYYY-MM-DD`.
- Months for tenure and service. Rates stored as annual % numbers.
- File names: kebab-case. Components: PascalCase. Domain functions: camelCase verbs (`calculateEmi`, `allocateRecovery`).
- Every list screen implements loading, empty, error and no-results states (`docs/04` §6). Mobile also handles offline (MA-04).
- Business data comes only from the server (the backend; the mock API for demos and unbuilt routes). Apps may call `packages/domain` for live previews, but the server's result is authoritative.
- Backend: one module per area in `backend/src/modules/<name>/` with `.routes · .controller · .service · .repository · .schema · .test`. Calls go routes → controller → service → repository → models. Tables only through migrations (`npm run db:generate` / `db:migrate`). Keep the docs/11 contracts unless a decision changes them.
- Screen ID prefixes: `AU-`/`SYS-`/`ST-` = Admin Console. `MJ-` (joining) / `MA-` (auth) / `MB-` (member) = Member App.
- Icons: Lucide only (`lucide-react` / `lucide-react-native`). Font: Inter. Tokens from `packages/design-tokens` (`docs/12`).

## 8. Codebase map (M0)

```
apps/mock-api        Hono server: src/app.ts (routes), store.ts (in-memory + snapshot), permissions.ts (docs/03), errors.ts
apps/admin-console   Vite + React: src/app (auth, router, guards, shell), src/config/navigation.ts, src/pages, src/components/ui
apps/member-app      Expo Router: src/app (_layout, welcome, login, offline, demo-settings, (member)/ tabs, (applicant)/tracker), src/lib, src/components
packages/types       roles, entities, API envelope (docs/08, 11)
packages/domain      money (Indian format, amount in words) + dates. Business rules go here from M1 (docs/09)
packages/api-client  createApiClient(): the only way the apps talk to the API
packages/mock-data   fictional personas, departments, society profile (docs/13)
packages/design-tokens  src/index.ts → css/tokens.css (npm run tokens)
backend              Fastify + PostgreSQL (docs/22): src/{config,db,models,modules/<name>/{routes,controller,service,repository,schema},common,plugins,jobs}. See backend/README.md
```
Expo note: Expo changes every SDK. Before touching an Expo API, read `apps/member-app/AGENTS.md` and the SDK 58 docs. Always add native packages with `npx expo install` inside `apps/member-app`.

