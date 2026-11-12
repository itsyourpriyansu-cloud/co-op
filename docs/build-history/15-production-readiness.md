# Production readiness G1–G8: built

**Built:** everything in `docs/24` except the owner items. G1 idempotency, early closure, FD payouts, audit log, documents (D-111). G2 accounting: heads, office vouchers, 11 statements, year end, period lock (D-112). G3 platform: CI, deploy with slot swap, Bicep, Blob file store, bootstrap, daily housekeeping (D-113). G4 store release: `eas.json`, `app.config.ts`, update gate, staff lock, push, account deletion, store-review sign-in (D-114). G5 real senders: WhatsApp Cloud API, Azure Communication Services email (D-115). G6 data migration: deposit, loan and opening-balance imports, reconciliation (D-116). G7 hardening: guards before validation, route sweep, member isolation, audit fixes, DPDP consent and retention, load test (D-117). G8 go-live papers and key rotation (D-118).

**Key files:** `backend/src/integrations/{whatsapp-cloud,acs-email,azure-identity,azure-blob,push,file-store}.ts`; `backend/src/modules/{loans,deposits}/register-import.ts`, `ledger/opening-import.ts`, `src/db/{import-books,rotate-key,bootstrap}.ts`; `backend/scripts/load-test.ts`; `src/plugins/{jobs,security.test}.ts`; `infra/` (Bicep, README); `.github/workflows/`; `apps/member-app/app.config.ts`, `src/lib/{push,appLock}.ts`, `src/components/AppGate.tsx`; console `pages/PublicPages.tsx`. Docs: `docs/24` (tracker), `docs/store-release.md`, `docs/security-review.md`, `docs/runbook.md`, `docs/uat-script.md`, `docs/training-guides.md`, `docs/go-live-checklist.md`.

**API:** docs/11 G1–G5 tables. G5: `OutboxMessage.status` SENT / `failed`; OTP start may answer `OTP_NOT_SENT`. G7: every guard is an `onRequest` hook, so a signed-out call is 401 before the body is read.

**Domain:** `isAppVersionAllowed`, settings `minAppVersion`, `applicantDataRetentionMonths`; F1 validation needs `privacyConsent`; `PRIVACY_NOTICE_VERSION` and the fourth agreement in `joining-reference.ts`.

**Decisions:** D-111 … D-118. BR-044 … BR-050.

**Things to know before touching this:**
- Run Vitest from **PowerShell**, not Git Bash: Git Bash's `/c/...` path makes Vitest load itself twice ("failed to find the runner") in the root suite.
- A test that moves the demo clock must put it back (`POST /__demo/clock {today:null}`); the seed does not reset it. `accounts.test.ts` does this now.
- A new public route must be added to `PUBLIC` in `src/plugins/security.test.ts`, on purpose.
- Imports run in order: `db:import-register` → `db:import deposits` → `loans` → `opening` → `reconcile`. Each is all-or-nothing.
- `db:rotate-key` is re-runnable; run it with the app stopped (runbook §6).
- Real senders are chosen by env: `WHATSAPP_PROVIDER=meta`, `EMAIL_PROVIDER=acs`, `PUSH_PROVIDER=expo`; simulated is the default everywhere else.

**Verified:** backend 184/184, root 312/312, e2e 267/267 (Expo web, throw-away PostgreSQL), typecheck green, load test 60 users p95 0.52 s.

**Gaps / TODO (owner):** Azure subscription and first deploy; store accounts and the real-phone check (docs/23 S10); F-10 WhatsApp number and approved templates; F-11 real registers and a staging rehearsal; UAT, training, cutover date. Accepted: Blend's dompurify (major upgrade), push receipts not polled, email bounces not tracked, audit lines of an erased applicant still name them, Docker image build proven only in CI.

**Next:** owner items in `docs/go-live-checklist.md` §1.
