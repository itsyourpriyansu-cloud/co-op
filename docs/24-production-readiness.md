# 24 · Production readiness: tracker

> Version 1.0 · 2026-11-13 · G9 built: receipt cancellation, FD renewal, notifications outbox with delivery receipts and live updates (D-119 … D-121).
> Version 0.9 · 2026-11-12 · G1–G8 built. What remains is owner work (accounts, F-10 / F-11, UAT, real phones, Azure).
> Version 0.1 · 2026-11-12 · First version (D-111): everything still missing before go-live, from the audit of 2026-11-11.
> Branch `v2`. The owner commits by hand. Each phase ends with its exit test. Tick a box only when its code and its test are both done.

## 1. Why this exists

The audit of 2026-11-11 compared the code with the agreement (`docs/02`), the open questions and an industry checklist. The app is complete for its demo scope (M0–M10, P0–P9, S0–S9). What follows is what a production credit-society system still needs. Unknown society rules stay **configurable settings with a placeholder default** (CLAUDE.md rule 3).

Steps marked **(owner)** need something only the owner or the society can give: an Azure subscription, store accounts, the WhatsApp number, register samples, real phones, people for UAT. The code for those steps is built up to the point where only that input is missing.

## 2. Phases

| Phase | Builds | Exit test |
|---|---|---|
| G1 Money safety + missing flows | Duplicate guard on money POSTs, early loan closure, FD periodic interest payout, audit log screen, real document upload | Backend tests green; a repeated receipt with the same key returns the first receipt; e2e phone + console green |
| G2 Accounting + reports | Day, cash and bank book, general ledger, trial balance, P&L, balance sheet, receipts & payments, deposits and shares ledgers, birthdays; vouchers for office income and expenses; chart of accounts heads; annual interest on share deposit / CRD / SRDS; dividend; financial year close and period lock | Trial balance debits = credits after every test; balance sheet balances; closed year refuses a posting |
| G3 Platform | CI, deploy workflow, Azure Bicep (App Service, PostgreSQL, Key Vault, Blob, ACR, Static Web Apps, Log Analytics, alerts), Blob file store, new daily jobs, token clean-up | `az bicep build` passes; CI file valid; file-store tests pass with a fake Blob |
| G4 Store release | Production build settings, no clear-text traffic, build numbers, update-required screen, account deletion request, privacy and deletion pages, store listing and data-safety notes, staff app lock, shorter staff sessions, push notifications | App typecheck + phone e2e green; `expo export` builds iOS and Android |
| G5 Integrations | WhatsApp Cloud API and Azure email adapters behind `integrations/messaging.ts`, Expo push sender | Adapter tests with a fake HTTP server pass; simulated stays the default |
| G6 Data migration | Loan, deposit and opening-balance imports with templates, checks and a reconciliation report | Import tests: a fictional register imports; trial balance balances after import |
| G7 Hardening | Security review fixes, DPDP consent and retention, load test script and result | No high findings left; load test result recorded |
| G8 Go-live papers | Runbook (deploy, rollback, restore, key rotation, incidents), UAT script per role, training guides, parallel-run and go-live checklists, support (hypercare) plan | Documents exist and point at real commands |
| G9 Flow gaps + notifications | Same-day receipt cancellation with a guarded ledger reversal, FD renewal, notification outbox (retries, delivery / read receipts, failed-send retry, message hours, live console updates) and the missing notices | Backend, root and affected e2e tests green; trial balance balances after a cancellation and a renewal |

## 3. Tasks

### G1 Money safety + missing flows
- [x] Idempotency: `Idempotency-Key` header on POSTs, stored response replayed, a second request in flight refused (`idempotency_keys` table)
- [x] API client sends the key; counter receipt, FD at the counter and loan closure send one key per form
- [x] Early loan closure: quote (principal + interest to date + unpaid dues on the loan), payment at the counter, receipt, ledger, loan closed, removed from draft demand sheets
- [x] FD periodic interest payout (monthly, quarterly, half-yearly, yearly): daily job pays each period, posts to the ledger, F10 voucher, maturity pays principal only
- [x] Audit log: `GET /audit` (Super Admin), console page, phone screen
- [x] Documents: upload (JPEG, PNG, PDF, size limit setting), encrypted store, view and download for staff and the owner; joining form and member profile use real files
- [x] Tests for each, docs 09 / 11 / 22 updated

### G2 Accounting + reports
- [x] Chart of accounts: office income and expense heads; Accountant adds sub-heads
- [x] Vouchers: payment (expense) and receipt (other income) by cash or bank, console + phone
- [x] Reports: day book, cash book, bank book, general ledger, trial balance, profit & loss, balance sheet, receipts & payments (month-wise), deposits ledger, shares ledger, birthdays & anniversaries
- [x] Annual interest: share deposit, CRD, SRDS (rate and balance basis as settings), preview then post once per year
- [x] Dividend on share capital (rate set after the general body approves), preview then post
- [x] Financial year close: income and expense to surplus, year locked, postings into a closed year refused
- [x] Tests, docs 09 / 11 / 13 updated

### G3 Platform
- [x] `.github/workflows/ci.yml`: install, typecheck, (format check left out until the owner reformats once, D-113), domain + backend tests on PostgreSQL 18, console build, Docker build
- [x] `.github/workflows/deploy.yml`: image to ACR, staging slot, smoke test, approval, swap; console to Static Web Apps; OIDC, no stored Azure secret
- [x] `infra/` Bicep for staging and production
- [x] Azure Blob file store (managed identity, no keys), chosen by `FILE_STORE`
- [x] Jobs: FD payouts, reminders, expired-token clean-up; `db:bootstrap` for a new production database
- [ ] (owner) Azure subscription, domain name, GitHub environment approvers

### G4 Store release
- [x] `eas.json` production and preview server addresses, build numbers kept by EAS
- [x] `app.config.ts`: clear-text traffic only in development builds
- [x] Update-required screen driven by a `minAppVersion` setting
- [x] Member account deletion request in the app; public privacy and account-deletion pages on the console
- [x] Staff: app lock with fingerprint / face / device PIN after time away; staff refresh tokens shorter than members'
- [x] Push notifications: device tokens, sender, app registration
- [x] `docs/store-release.md`: listing text, data safety and privacy label answers, reviewer accounts, release steps
- [ ] (owner) Google Play and Apple developer accounts, Expo account, signing keys, first internal-track / TestFlight build, real-phone check (docs/23 S10)

### G5 Integrations
- [x] WhatsApp Cloud API sender (template messages, OTP template)
- [x] Azure Communication Services email sender
- [x] Expo push sender
- [ ] (owner) F-10: WhatsApp Business number, approved templates, sender email domain

### G6 Data migration
- [x] Loan register import (active loans with outstanding as on a date, sureties)
- [x] Deposit register import (FD, CRD, SRDS, share deposit)
- [x] Opening balances import (non-member accounts) as one opening entry
- [x] Reconciliation report: imported totals against the society's trial balance
- [ ] (owner) F-11: real register samples; a rehearsal on staging

### G7 Hardening
- [x] Security review of auth, permissions, uploads, money routes; fixes
- [x] DPDP: consent with version on joining, retention rules as settings, privacy notice
- [x] Load test script and recorded result
- [ ] (owner) External penetration test if the society wants one

### G8 Go-live papers
- [x] `docs/runbook.md`: deploy, rollback, restore, key rotation, incidents, monitoring
- [x] `docs/uat-script.md`: test cases per role with expected results
- [x] Training guides per role
- [x] Parallel run and go-live checklists, support plan
- [ ] (owner) UAT with society staff, training sessions, cutover date

### G9 Flow gaps + notifications
- [x] Receipt cancellation: same day, another officer with `ledger.post`, reason, latest receipt only; every effect reversed; CANCELLED print; member told (D-119)
- [x] Ledger page refuses to reverse business entries (`REVERSE_SOURCE`); manual journals and vouchers only (D-119)
- [x] FD renewal from MATURED: new FD at today's slab, interest added or paid, one `FD_RENEWAL` entry, both acceptances, linked FDRs (D-120)
- [x] Notification outbox: queued sends, retries with backoff, `SKIP LOCKED` claim, 10 s provider timeout (D-121)
- [x] WhatsApp status webhook (signed), delivered / read on sent messages and member notices (D-121)
- [x] Failed sends list and Send again, console and phone (D-121)
- [x] Live console notifications (server-sent events over PostgreSQL LISTEN / NOTIFY) (D-121)
- [x] Message hours for broadcasts (Admin setting, 9–21 IST [P]); money and mobile-change alerts always on WhatsApp (D-121)
- [x] New notices: receipt issued / cancelled, FD matured / paid / renewed / minor turns 18, monthly deduction notice, application stages and welcome, final settlement (D-121)
- [ ] (owner) Add `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` to Key Vault and set the callback in Meta (infra/README.md)

## 4. Session log

| Date | What |
|---|---|
| 2026-11-12 | Tracker written from the 2026-11-11 audit (D-111) |
| 2026-11-12 | G1 built: idempotency, early closure, FD payouts, audit log, documents. Backend tests for each pass |
| 2026-11-12 | G2 built: chart of accounts, office vouchers (console + phone), 11 statements, annual interest, dividend, year close with period lock (D-112) |
| 2026-11-12 | G3 built: CI, deploy with slot swap, Bicep, Blob store, bootstrap, daily housekeeping (D-113). Docker not installed here, so the image build is first proven in CI |
| 2026-11-12 | G4 built: eas.json, app.config.ts, update gate, account deletion + public pages, staff lock, 7-day staff sign-in, push (tokens, sender, registration), store-review sign-in, docs/store-release.md (D-114). Real-phone check still open (docs/23 S10) |
| 2026-11-12 | G5 built: WhatsApp Cloud API and ACS email senders, OTP refused when not sent, real sent status, ACS in Bicep (D-115). Expo push sender was built in G4 |
| 2026-11-12 | G6 built: deposit, loan and opening-balance imports and the reconciliation, all-or-nothing and audited (D-116). The share deposit comes with the member import |
| 2026-11-12 | G7 built: guards before validation + route sweep test, member isolation test, audit fixes, DPDP consent and retention, load test passed at society peak (D-117, docs/security-review.md) |
| 2026-11-12 | G8 built: runbook, UAT script, training guides, go-live checklist and support plan, key rotation tool (D-118). All G phases built; owner items listed under each phase |
| 2026-11-13 | G9 built: receipt cancellation + reversal guard (D-119), FD renewal (D-120), notification outbox, webhook, failed-send retry, live updates, message hours and nine new notices (D-121). Migration 0034 |
