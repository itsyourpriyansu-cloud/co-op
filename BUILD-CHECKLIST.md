# BUILD CHECKLIST: the whole journey, start to finish

> **This file is the project's memory.** If the chat is lost, open a new session and say:
> *"Read CLAUDE.md and BUILD-CHECKLIST.md, then continue from 'Resume here'."*
> Update it at the **end of every session** (see the ritual at the bottom).

---

## ▶ Resume here

| | |
|---|---|
| **Current step** | C. M0 Foundation ✅ done on branch `m0-foundation` → next **M1 Brain + data** |
| **Next action** | User: review M0 (run `npm run demo` + `npm run dev:app`), push/merge the branch, answer Q-005 (Fusil backend) before M1 data model work. Then start M1 |
| **Blockers** | None for M1 start. Q-005 is a risk for data-model alignment |
| **Last updated** | 2026-10-24 |

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
- [ ] Q-005: does Fusil already have a backend/API? (yes → align docs 08/11 first)
- [ ] APK route chosen: EAS cloud (Expo account) **or** local build (JDK 17 + Android SDK)
- [ ] Society questions sent: Batch 3 + Batch 5 (`docs/open-questions.md`)
- [ ] Back sides of the Membership and Ordinary-loan forms requested
- [ ] Machine setup: Node + npm ✅ (already installed, no pnpm needed, D-038) · `git init` · Expo Go on an Android phone · (local route: JDK 17 + `ANDROID_HOME` + adb)

## C. Build milestones (details in `docs/14-implementation-plan.md`)
Each milestone ends with its exit test passing. Tick the box only then.

- [x] **M0 Foundation:** monorepo · mock API (health, login, `/me`, demo endpoints) · console shell + login · app shell + Welcome/Login/Offline/Demo settings · Android bundle verified. **Still open: first real APK on a phone** (needs an Expo account → `npm run build:apk`) — tracked in M10 if not done earlier
- [ ] **M1 Brain + data:** 15 domain functions with tests (incl. agreement examples) · seed data generator · store
- [ ] **M2 Settings:** loan products + workflow config · deposit schemes · insurance · departments/DDOs · users · permissions · templates
- [ ] **M3 Members & Joining:** member master + profile · transfers · mandates · **join flow on the phone → DDO → office → Secretary → President → General No.**
- [ ] **M4 Loans core:** loans list · F2/F3 application forms (web + phone) · eligibility · surety picker
- [ ] **M5 Loan workflow:** surety signing · review · DDO certify · office-use assessment · 2-step sanction · disbursement · top-up
- [ ] **M6 Deposits:** FD request on the phone · cashier receipt with denominations · acceptance · FDR · CRD/SRDS/Savings
- [ ] **M7 Collections:** demand sheets · certify & send · recovery allocation waterfall · receipts · statements on the phone
- [ ] **M8 App completion:** activation · forgot password · home · calculators · notifications · help · settings
- [ ] **M9 Reports & dashboards:** 5 dashboards · 8 reports · 9 printable form twins
- [ ] **M10 Polish & release:** every state designed · WCAG 2.2 AA · device test · signed APK · demo script

## D. Demo & hand-over
- [ ] Usability test: 5 members + 3 staff. Record task success, time, SUS (targets in `docs/12` §9)
- [ ] Client demo run (script in `docs/15` §4)
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
