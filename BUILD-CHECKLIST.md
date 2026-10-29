# BUILD CHECKLIST: the whole journey, start to finish

> **This file is the project's memory.** If the chat is lost, open a new session and say:
> *"Read CLAUDE.md and BUILD-CHECKLIST.md, then continue from 'Resume here'."*
> Update it at the **end of every session** (see the ritual at the bottom).

---

## ▶ Resume here

| | |
|---|---|
| **Current step** | C. **M0–M10 done + demo-ready.** Both apps, all MVP screens, reports and printables, and a Playwright suite that plays every journey, the cross-app hand-offs, accessibility, error states, screen sizes and the whole `DEMO-SCRIPT.md` (docs/build-history/11-demo-ready.md) |
| **Next action** | P0 + P1 design are on `main` (D-075: main only). Next: build **P1a** (backend auth, users, permissions, audit, session bridge, `docs/22` §5.1) |
| **Blockers** | None. Demo-only scope, localhost now, Azure later, no APK until asked (D-054) |
| **Last updated** | 2026-10-29 |

---

## A. Planning ✅ (done)
- [x] Read the agreement + flow diagrams → docs 01–15 written
- [x] Batch 1 decisions: MVP scope, Expo Android app, React + Vite console, shared mock API
- [x] Paper forms analysed → doc 16. Join flow, Secretary → President sign-off, FD rules
- [x] Clean structure fixed: Admin Console (staff, desktop) / Member App (members, Android) → doc 00
- [x] Design direction researched → doc 12
- [x] Screen count: **63 screens** (38 console + 25 app) → doc 05

## B. Pre-build gate ⏳
- [x] **Plan approved** → D-000 Accepted 2026-10-24 (proposed decisions = working defaults)
- [x] ~~Q-005: does Fusil already have a backend/API?~~ Skipped: demo only (D-054)
- [ ] APK route chosen: EAS cloud (Expo account) **or** local build (JDK 17 + Android SDK). **Deferred until the user asks (D-054)**
- [x] Society questions sent and **answered 2026-10-29** (D-067): plain-language list in `docs/client-questions.md` (from Batch 1–6, `docs/open-questions.md`)
- [ ] Back sides of the Membership and Ordinary-loan forms requested
- [ ] Machine setup: Node + npm ✅ (already installed, no pnpm needed, D-038) · `git init` · Expo Go on an Android phone · (local route: JDK 17 + `ANDROID_HOME` + adb)

## C. Build milestones (details in `docs/14-implementation-plan.md`)
Each milestone ends with its exit test passing. Tick the box only then.

- [x] **M0 Foundation:** monorepo · mock API (health, login, `/me`, demo endpoints) · console shell + login · app shell + Welcome/Login/Offline/Demo settings · Android bundle verified. **Still open: first real APK on a phone** (needs an Expo account → `npm run build:apk`) — tracked in M10 if not done earlier
- [x] **M1 Brain + data:** domain functions with tests (incl. agreement examples) · seed data generator · store. ✅ 100% branch coverage, seed integrity green (see docs/build-history/01-domain-engine.md)
- [x] **M2 Settings:** loan products + workflow config · deposit schemes · insurance · departments/DDOs · users · permissions · templates · MB-16 rates ✅ (exit test passed, see docs/build-history/02-settings.md)
- [x] **M3 Members & Joining:** member master + profile · transfers · mandates · **join flow on the phone → DDO → office → Secretary → President → General No.** ✅ joining (03a) + members module ST-10…13, ST-18, MB-02, MB-19 (03b, D-057)
- [x] **M4 Loans core:** loans list · F2/F3 application forms (web + phone) · eligibility · surety picker ✅ (docs/build-history/04-loans-core.md, D-058)
- [x] **M5 Loan workflow:** surety signing · review · DDO certify · office-use assessment · 2-step sanction · disbursement · top-up ✅ (docs/build-history/05-loan-workflow.md, D-059)
- [x] **M6 Deposits:** FD request on the phone · cashier receipt with denominations · acceptance · FDR · CRD/SRDS/Savings ✅ (docs/build-history/06-deposits.md, D-060)
- [x] **M7 Collections:** demand sheets · certify & send · recovery allocation waterfall · receipts · statements on the phone ✅ (docs/build-history/07-collections.md, D-061)
- [x] **M8 App completion:** activation · forgot password · home · calculators · notifications · help · settings ✅ (docs/build-history/08-member-app.md, D-062)
- [x] **M9 Reports & dashboards:** 5 dashboards · 8 reports · 9 printable form twins ✅ (docs/build-history/09-insight.md, D-063)
- [x] **M10 Polish & release (demo scope):** every state designed · WCAG 2.2 AA · demo script ✅ (docs/build-history/10-polish.md, D-064). **Deferred until asked:** signed APK, physical-device test, hosting (D-054)
- [x] **Demo-ready:** demo clock (D-065) · Playwright suite as the acceptance gate · a11y / paper / port bugs fixed · `demo:prod` · docs 18–20, client questions (D-066, docs/build-history/11-demo-ready.md)

## D. Demo & hand-over
- [ ] Usability test: 5 members + 3 staff. Record task success, time, SUS (targets in `docs/12` §9)
- [ ] Client demo run (script in `DEMO-SCRIPT.md`; rehearsed automatically by `npm run e2e:demo`)
- [ ] Placeholder values replaced by the society's answers. All questions closed or parked
- [ ] Hand-over notes for the production backend team

---

## 🔁 Session ritual (every session, no exceptions)

**Start**
1. Read `CLAUDE.md` → this file's **Resume here** → the docs the current step needs.
2. Check `docs/decisions-log.md` and `docs/open-questions.md` for anything new.

**End**
1. Tick the finished boxes. Update **Resume here** (step, next action, blockers, date).
2. New decision → `decisions-log.md`. New unknown → `open-questions.md`. Changed spec → bump that doc's version.
3. Add one line to the session log below.

## 📒 Session log
| Date | What happened | Next |
|---|---|---|
| 2026-10-24 | Planning docs 00–16 created. Batch 1 + form decisions taken. Checklist + learning guide added | Plan approval (B) |
| 2026-10-24 | **M0 built** on branch `m0-foundation`: npm-workspaces monorepo, 5 packages, Hono mock API (29 tests), Admin Console shell (React Router 8, Tailwind 4), Member App shell (Expo SDK 58, Expo Router). Typecheck + tests + console build + Android export + expo-doctor all green | Review M0, answer Q-005, start M1 |
| 2026-10-24 | Member sitemap reviewed (doc 17): on track. Adopted rates/password screens, loan against FD, payment reports (cashier verifies), profile edit + change requests. MVP = 67 screens (D-046) | Review M0, Q-005, start M1 |
| 2026-10-24 | Seal logo everywhere (D-052). **Joining built end to end:** console Joining board/table (ST-14), application detail (ST-15), DDO certify + Secretary→President approval + cashier share receipt drawers (ST-16/17), staff workflow in `packages/domain` (D-053), full seeded F1 forms (seed v4), live sync phone ↔ console (5 s polling). Env-driven hosting config for Azure later (D-054). 123 tests green, all typechecks green, Android bundle OK | M3 Members module, Work Queue |
| 2026-10-24 | **M2 closed** (MB-16 rates + EMI estimate, exit test passed live; D-056). **M3 Members module built:** ST-10 list, ST-11 form, ST-12 profile, ST-13 transfer, ST-18 change requests, MB-02 profile, MB-19 edit/request, recovery mandates, service history (seed v7, D-057). 196 tests green, typecheck green, domain coverage 100%. J-11 and the cross-app change request verified | M4 Loans core |
| 2026-10-24 | **M4 Loans core built:** ST-20 loans index, ST-21 application on behalf (F2/F3, surety picker, live eligibility), ST-23 detail (stepper, sureties items 9–10, schedule, activity); phone MB-03 Loans tab, MB-04 detail with tracker, MB-05 wizard with drafts + Sign with OTP (D-058). 210 tests green, coverage 100%, console build + Android bundle OK. Exit passed on the live API | M5 Loan workflow |
| 2026-10-24 | **M5 Loan workflow built:** Work Queue (ST-02), decision drawer ST-24…28 (review checklist, DDO certify / paper record, office-use sanction sheet, Secretary → President, disbursement), sanction letter (ST-52), top-up (ST-22, MB-06), surety requests with OTP signing (MB-07), MB-04 replace / withdraw / resubmit (D-059, seed v8). 221 tests green, coverage 100%, builds OK. J-01 → J-08 passed on the live API with personas | M6 Deposits |
| 2026-10-24 | **M6 Deposits finished** (previous session ran out of credit after writing the API, seed v9 and console pages): wired the console routes, built phone MB-08 Deposits tab, MB-09 detail with FDR + loan against FD (`/loan/apply?pledge=`), MB-15 Open FD wizard with Sign with OTP; fixed two phone text glitches (D-060). 232 tests green, coverage 100%, Android bundle OK. Exit J-16 passed live across both apps | M7 Demand & collections |
| 2026-10-24 | **M7 Demand & collections built:** ST-40 index, ST-41 generate, ST-42 sheet with BR-030 certify + send, ST-43 recovery entry with live BR-011 allocation, ST-44 payments, ST-45 counter receipt (denominations), ST-46 printable receipt, ST-47 verify reported payment; phone MB-10 statements and MB-18 report a payment (D-061, seed v10). 239 tests green, coverage 100%, bundle OK. Exit passed live (J-10, Mahesh's waterfall identical on web and phone) | M8 Member app completion |
| 2026-10-25 | **M8 Member app completion built:** MA-01 General No./Employee ID + password sign-in (demo members fill the demo password), MA-02 activation (Employee ID + registered mobile → OTP → password), MA-03 forgot password, MB-17 change password (D-062 strength meter), MB-01 live Home snapshot with action cards and bell, MB-11 loan + FD calculators (→ apply prefilled), MB-12 notifications, MB-13 help & support with tickets, MB-14 channel settings (seed v11). 249 tests green, coverage 100%, Android bundle 5.5 MB. J-14 passed live, no page errors | M9 Dashboards & reports |
| 2026-10-25 | **M9 Dashboards, notifications & reports built:** ST-01 role variants (Accountant, Secretary/President, Cashier, DDO + Admin) from the Work Queue; ST-03 notifications (bell with count), simulated composer (SMS/WhatsApp/Email to a member, department, defaulters, retiring; preview → send → outbox), member questions with replies that reach the phone; ST-50 catalogue, ST-51 viewer (8 reports, grouped subtotals, CSV, print on letterhead); ST-52 defaulter notice + F1, F2, F3, F4, F5/F6 twins with print buttons on joining, loan and member pages (D-063, seed v12). 257 tests green, coverage 100%, console build OK. J-13 passed live, no page errors | M10 Polish & demo |
| 2026-10-25 | **M10 Polish (demo scope):** axe WCAG 2.2 AA sweep of 27 console routes (light + dark) and 25 phone screens → no critical/serious left (tertiary token, Blend contrast lifts, Initials, tab/scroll/label fix-ups, aria-checked, on-brand colours); state audit with `/__demo/failure-rate` found and fixed the console showing "no access" when the server is down; topbar global search (`GET /search`, Ctrl K); M3–M5 screens visually checked; `DEMO-SCRIPT.md` written and Act 3 rehearsed across both apps (D-064). 258 tests green, coverage 100%, console build + Android bundle OK. APK / device / hosting deferred | Commit · APK or hosting when asked |
| 2026-10-25 | **Demo-ready:** demo clock (D-065); Playwright suite in `tests/e2e/` (188 tests: every console route, J-03…J-14, cross-app AC-X01, axe light + dark + phone, error states, screen sizes, the whole demo script twice in a row); fixed 9 real bugs (duplicate `<main>`, search box ARIA, dashboard tile names, unlabelled checkboxes, dark-mode tags, paper twins in dark mode, Blend EmptyState line-height, hard-coded receipt date, duplicate address-field names); console port 5180 via `CONSOLE_PORT` + `npm run demo:prod`; docs 18–20, `docs/client-questions.md`, LEARN-THE-APP as built, DEMO-SCRIPT v1.1 with the real-phone path (not verified on a device) (D-066, build-history/11) |
| 2026-10-29 | Society answers to the 35 questions recorded (client-questions v1.1, open-questions v0.4, Batch 7 follow-ups); impact doc 21 (23 changes, 4 conflicts, 12 follow-ups), REQ-130…137; backend stack proposed in doc 22 (D-068). No code changed | Decide C-1/C-2 + D-068, then build doc 21 changes |
| 2026-10-29 | Q-005 answered: Envizon builds the backend (D-069). Backend plan v0.3: `backend/` folder structure (routes/controller/service/repository/schema/models), DB `tgseccsl_dev`/`tgseccsl_test`, phases P0–P9 with mock-API fallback for integration | P0 Foundation |
| 2026-10-29 | C-2 → two signatures as in the prototype (D-070); C-1 → all EMI methods incl. FLAT, chosen per product (D-071); forms checked for F-03 (not stated, user will ask). Local DB login for `tgseccsl_dev` failed (password authentication), so `backend/.env` is not written yet | Fix DB login, then P0 |
| 2026-10-29 | F-03 checked against the agreement (pages 2–5): 10% only on Ordinary, netted; insurance via demand sheet, not payout (D-072). Two points still for the society. DB login `tgseccsl_dev` still fails (password authentication) | Fix DB login, then P0 |
| 2026-10-29 | DB connected as `postgres` (PostgreSQL 18.1); created empty `tgseccsl_test`; `backend/.env` written (git-ignored). Agreement rules stay in force for F-03 until the society confirms otherwise | P0 Foundation |
| 2026-10-29 | **Backend P0 Foundation built** (D-073): `backend/` Fastify + Drizzle + PostgreSQL 18.1, env validation, migrations + seed runner, error envelope, guards, `/health` (DB status), `/docs`, dev mock fallback, root scripts. Exit test passed: backend tests 11/11 on `tgseccsl_test`; root tests 263/263; all typechecks; console e2e against :4100 60/61 (the 1 failure is a phone-screen test whose app was pointed at port 4000, which another project (mnr-dairy-app) occupies). Playwright Chromium reinstalled | P1 Auth |
| 2026-10-29 | CLAUDE.md scope widened to the real backend (D-074). P0 + P1 design fast-forwarded into `main` and pushed; from now on everything goes to `main` only (D-075). Leftover branch `backend-p0-foundation` not deleted (blocked by a safety check) | P1a |
