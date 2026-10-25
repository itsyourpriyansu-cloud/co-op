# 20 · Scenario catalog and demo controls (as built)

> Version: 1.0 · Last updated: 2026-10-25 · Written from `packages/mock-data/src/scenarios.ts`, `packages/types/src/scenarios.ts` and `apps/mock-api/src/app.ts` (`/__demo/*`).
> Seed rules: `docs/13-mock-data-spec.md`. UI states (loading, error, …): `docs/19` §3.

## 1. What it is

The **scenario catalog** lists every demoable data state. Each entry points at a real record in the seeded dataset, the persona to sign in as, and the screens that show it.
- **Built by:** `buildScenarios()` (`packages/mock-data/src/scenarios.ts`), from the generated data, so it cannot drift from the seed.
- **Checked by:** `packages/mock-data/src/dataset.test.ts` ("every state exists"), which fails if a scenario has no record.
- **Shown in:** the console's **Design System → Scenarios** tab. Each row links to the record and names the persona.

Each entry has: `id` (`SC-…`), `area`, `title`, `description`, `personaId`, `role`, `screens` (docs/05 ids), `entityType`, `entityId`, `state` and `milestone`.

## 2. The dataset (seed version 12)

The data is deterministic and fictional.
- **Anchor date:** 24 Oct 2026. Current cycle: 2026-10.
- **Counts:** 605 members, 775 loans, 983 deposits, 177 demand sheets, 5,702 receipts, 19 membership applications.
- **Catalog:** 54 scenarios. Live counts: `GET /api/v1/__demo/dataset`.

## 3. The catalog (54 entries)

| Area | Entries |
|---|---|
| Personas (4) | `SC-PERSONA-TOPUP`: Lakshmi (1101), top-up with share-deposit netting (BR-004) · `SC-PERSONA-RETIRING`: Ramaiah (1102), tenure capped by retirement (BR-002) · `SC-PERSONA-SURETY`: Sravani (1103), surety request waiting · `SC-PERSONA-SHORT`: Mahesh (1104), short recovery waterfall |
| Loans (14) | One per status: DRAFT, SURETY_PENDING, ACCOUNTANT_REVIEW, RETURNED, DDO_CERTIFICATION, ASSESSMENT, SANCTION_SECRETARY, SANCTION_PRESIDENT, SANCTIONED, ACTIVE, CLOSED, CLOSED_BY_TOPUP, REJECTED, WITHDRAWN (`SC-LOAN-<STATUS>`) |
| Sureties (2) | `SC-SURETY-DECLINED` · `SC-SURETY-RETIRING`: the surety retires during the loan (BR-024 warning) |
| Joining (11) | One per status: SUBMITTED, DDO_CERTIFICATION, OFFICE_REVIEW, INFO_REQUESTED, APPROVAL_SECRETARY, APPROVAL_PRESIDENT, SHARE_PAYMENT_PENDING, ACTIVE, REJECTED · `SC-JOIN-APPLICANT-TRACKER` (Ravi) · `SC-JOIN-NEW` (Divya, not started) |
| Deposits (8) | FD per status: REQUESTED, PAYMENT_RECEIVED, ACCEPTANCE_SECRETARY, ACCEPTANCE_PRESIDENT, ACTIVE, MATURED, CANCELLED · `SC-FD-PLEDGED` |
| Collections (5) | Demand sheet GENERATED, CERTIFIED, SENT_TO_DDO, RECOVERY_POSTED, NOT_GENERATED |
| Members (2) | `SC-TRANSFER-NEXT-CYCLE` (BR-010) · `SC-MEMBER-RETIRED` |
| Payments (3) | Member-reported payment REPORTED, VERIFIED, REJECTED |
| Profile (3) | Change request PENDING, APPROVED, REJECTED |
| System (2) | `SC-SYS-OFFLINE` (MA-04, SYS-03) · `SC-SYS-NOACCESS` (the DDO opens a staff-only area) |

## 4. Demo controls (`/api/v1/__demo/*`)

| Endpoint | What it does |
|---|---|
| `GET /__demo/personas` | Sign-in personas for both apps |
| `GET /__demo/state` | `{ today, failureRate, … }` |
| `POST /__demo/reset` | Back to the seed. Run before every demo |
| `POST /__demo/clock` `{ today }` | Moves the demo date (`YYYY-MM-DD`); `null` returns to the anchor. Server timestamps follow it (D-065) |
| `POST /__demo/failure-rate` `{ rate }` | 0–1. A share of API calls fail with a simulated 503. Used to show the error states; **set back to 0** |
| `GET /__demo/scenarios` | The catalog above |
| `GET /__demo/dataset` · `GET /__demo/sample` | Counts by status · sample records |

On a record waiting on another role, the console's "Act as …" button uses the demo-act endpoints. Each press completes one stage as its owner (docs/19 §2).
