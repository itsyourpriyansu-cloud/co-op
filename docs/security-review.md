# Security review, DPDP and load test (G7)

> Version 0.1 · 2026-11-12 · G7 (D-117). Reviewed by the build team, not an outside tester. An external penetration test is the society's choice (docs/24, owner item).

## 1. What was checked

| Area | How | Result |
|---|---|---|
| Every route needs sign-in | `src/plugins/security.test.ts` calls every route in the OpenAPI list without a session | **Fixed.** 32 routes answered 400 (body checked) before 401, because guards ran after validation. All guards are now `onRequest` hooks, so a signed-out caller learns nothing about the body. Public routes are an explicit list in the test |
| A member sees only their own records | Same test: member B asks for member A's loan, deposit, profile, and for staff lists, books, audit, users, reports | 403 / 404 for all |
| Staff sign-in | Code read (`auth.service.ts`) | Password + authenticator (TOTP) for office bearers; account locks for 15 minutes after repeated wrong passwords; every failure audited; per-IP limit 10 / minute on sign-in routes |
| Member sign-in | Code read (`otp.service.ts`) | One-time code, 5 tries per code, 5 codes per 15 minutes per mobile; a code WhatsApp refused is now refused to the member (G5) |
| Sessions | Code read | Access tokens short-lived; refresh tokens rotated with reuse detection; staff sign-ins lapse after 7 days unused (G4); phone app locks after 5 minutes away (G4) |
| Secrets | `config/env.ts`, Bicep | `JWT_SECRET` and `DATA_ENCRYPTION_KEY` required in production (32+ characters), held in Key Vault; no Azure keys at all (managed identity for Blob, email) |
| Stored files and secrets | `integrations/file-store.ts` | AES-256-GCM before storage; Blob container private; reading another person's file needs a staff role that may see them, and is audited |
| Uploads | `documents.service.ts` | Size limit per route; type detected from the bytes (PDF / JPEG / PNG), not from the name |
| Money routes | G1 | `Idempotency-Key` on POSTs; workflow status checks; double-entry ledger refuses an unbalanced entry and a closed period |
| Logs | `app.ts` | Authorization and cookie headers redacted; one-time codes never logged in production |
| Headers, CORS, limits | `plugins/security.ts`, P9 | Helmet headers; CORS limited to the configured origins in production; global per-IP rate limit; `/docs` off in production; console has its own security headers (`staticwebapp.config.json`) |
| Dependencies | `npm audit --omit=dev` | **Fixed:** zod (memory exhaustion on oversized input, high) and node-forge (high) by `npm audit fix`. **Accepted:** dompurify via the console's design system (Blend; fix needs a major Blend upgrade; the console renders no user HTML through it), glob / minimatch inside Expo build tools (build time only) |

## 2. DPDP Act 2023

| Duty | Built |
|---|---|
| Notice and consent | The join form has a fourth agreement, **Privacy notice and consent** (version `PN-2026.1`), signed with the same OTP; the version is stored on the application's signature and shown to staff. The public notice is `/privacy` on the console, linked from the app (Settings → Account) and the store listings |
| Purpose limit | The notice lists the purposes; the DDO sees only what deductions need (docs/03 scope) |
| Retention | Setting **`applicantDataRetentionMonths`** (12, placeholder). The daily housekeeping erases a rejected or withdrawn application, its documents and signature (rows and blobs), the applicant's app sign-in, tokens and notifications after that time, leaving one audit line with the application number. Members' records stay as the society's accounts and the law require |
| Rights | Access (the app), correction (profile change requests), erasure of app data (account deletion request), grievance (member questions, then the Data Protection Board) |
| Security | Section 1 |

Not done: older audit lines about an erased applicant still name them (the audit trail is append-only); members admitted before PN-2026.1 have no consent record (the office can ask them to read the notice in the app).

## 3. Load test

`npm run load-test -w @tgs/backend -- --url <server> --users 60 --seconds 90 --think 5000` (`backend/scripts/load-test.ts`). Virtual users sign in with demo personas, so it runs only against a DEMO_MODE server with fictional data and `RATE_LIMIT_PER_MINUTE=0`. About a quarter are staff (Accountant, Secretary, Cashier, Admin screens and reports), the rest members (home, loans, deposits, payments, notifications, surety requests). Users arrive spread over the first think period.

Recorded 2026-11-12 on the developer laptop (one Node 24 process, PostgreSQL 18 on the same machine, seeded data: 605 members):

| Profile | Requests | Rate | Errors | Result |
|---|---|---|---|---|
| **Society peak:** 60 people at once, 5 s between screens, 90 s | 1,049 | 11.7 / s | 0 | **Pass.** Member screens p95 ≤ 0.29 s; staff lists p95 ≤ 0.41 s; reports p95 ≤ 0.52 s |
| **Stress:** 60 users, 0.5 s between screens, all starting together | 1,706 | 28.4 / s | 0 | Saturated: p95 2–8 s. One instance tops out near 28 requests / s; no errors |

At ~600 members the realistic peak (a recovery day, most members opening the app once) is a few requests a second, so one App Service instance (P0v3) is enough. If the society grows or the stress figure is reached in monitoring (App Insights request duration), scale out to a second instance first; the slowest handlers to optimise are `/me/home`, `/me/payments`, `/work-queue` and the reports, which compute over all members in Node.

Per-screen figures for the society-peak run:

| Screen | Count | p50 ms | p95 ms |
|---|---|---|---|
| /me | 113 | 17 | 37 |
| /me/home | 112 | 85 | 289 |
| /me/loans | 114 | 21 | 71 |
| /me/deposits | 116 | 20 | 56 |
| /me/payments | 112 | 80 | 175 |
| /me/notifications | 112 | 20 | 64 |
| /me/surety-requests | 113 | 35 | 210 |
| /work-queue | 47 | 105 | 257 |
| /dashboard/role | 37 | 103 | 216 |
| /dashboard/summary | 10 | 128 | 408 |
| /loans | 23 | 78 | 139 |
| /receipts | 21 | 89 | 132 |
| /reports/dues | 8 | 259 | 511 |
| /reports/trial-balance | 7 | 186 | 520 |
| /reports/balance-sheet | 10 | 157 | 392 |
| /reports/books | 13 | 234 | 388 |

Run it again on Azure staging before go-live (owner item) with the same command against the staging URL and a DEMO_MODE copy of staging; production never runs demo mode.
