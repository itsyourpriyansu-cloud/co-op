# 14 · Implementation Plan

> Phase 5 · Version 0.3 · 2026-10-25 (status: demo-ready) · Applies to the **accepted MVP** (D-023): Admin Console 36 pages, Member App 19 screens, shared mock API.
> Gate: no milestone starts before D-000 "Plan approved" is Accepted in `decisions-log.md`.
> Milestones are **vertical slices**: each one delivers the API endpoints, the web screens and the mobile screens for one module, so cross-app journeys work as soon as the module is done.

## 1. Dependency graph

```mermaid
flowchart LR
  M0[M0 Foundation<br/>monorepo · API skeleton · both shells · first APK] --> M1[M1 Domain engine + seed + store]
  M0 --> M2[M2 Settings & masters]
  M1 --> M3[M3 Members]
  M2 --> M3
  M3 --> M4[M4 Loans core<br/>web + mobile apply]
  M4 --> M5[M5 Loan workflow + surety + top-up]
  M3 --> M6[M6 Deposits]
  M5 --> M7[M7 Demand & collections]
  M6 --> M7
  M5 --> M8[M8 Member app completion]
  M7 --> M8
  M7 --> M9[M9 Reports & dashboards]
  M8 --> M10[M10 Polish · release APK · demo]
  M9 --> M10
```

## 2. Milestones

| # | Milestone | Mock API | Staff web | Member mobile | Blocking Qs | Exit criteria |
|---|---|---|---|---|---|---|
| M0 | Foundation | Hono skeleton: `/health`, `/auth/persona`, `/me`, `/__demo/*`, error mapping, latency, auth middleware | Vite + Tailwind + shadcn, tokens, StaffShell, router, guards, AU-01, SYS-01..03 | Expo + Expo Router + NativeWind, tab shell, MA-01, MA-04, MA-05. **First Android APK** | Q-008, Q-010, Q-011 | Each persona logs into the correct app. APK on a real Android phone reaches the laptop server. Forbidden routes blocked server- and client-side |
| M1 | Domain engine + seed + store | Store, snapshot persistence, seed loader | — | — | Q-302, Q-303 (placeholders OK) | 11 domain functions with tests (incl. agreement examples). Seed integrity checks pass. 100% branch coverage on `packages/domain` |
| M2 | Settings & masters | settings, loan-products, deposit-schemes, departments, users, permissions, templates | ST-60..67 | MB-14 rates view | Q-108 | Changing a rate on the web changes the mobile EMI calculator result after refresh |
| M3 | Members & Joining | members, pay profile, transfers, documents, mandates, **membership pipeline**, signatures | ST-10..17 | MB-02 profile + agreements, **MJ-01..05 join flow** | Q-402, Q-403, Q-406 | J-09, J-11 pass |
| M4 | Loans core | loans list/get, eligibility, drafts, member search | ST-20, ST-21, ST-23 | MB-03, MB-04, **MB-05 apply wizard** | Q-104, Q-106, Q-115 | Application submitted on the phone appears in ST-20 on the web. BR-002 block shown for Ramaiah |
| M5 | Loan workflow | transitions (state machine), surety responses, top-up, sanction sheet, work queue, notifications | ST-02, ST-22, ST-24..28, sanction letter (ST-52) | MB-06 top-up, **MB-07 surety**, status timeline in MB-04 | Q-101, Q-102, Q-113, Q-114 | J-01 → J-08 pass **across both apps** (phone apply → phone surety → web stages → phone sees ACTIVE) |
| M6 | Deposits | deposits, preview, ledger, **FD requests + acceptance**, receipts with denominations | ST-30..33 | MB-08, MB-09, **MB-15** | Q-301, Q-313 | J-12 pass. FD visible on the phone |
| M7 | Demand & collections | demand preview/generate/send, recovery preview/post, receipts, statements | ST-40..46 | MB-10 | Q-306, Q-308, Q-309, Q-316 | J-10 pass. Mahesh's allocation waterfall identical on web and phone |
| M8 | Member app completion | activation/OTP, password reset, support tickets | — | MA-02, MA-03, MB-01 home, MB-11 calculators, MB-12, MB-13 | Q-105/116, Q-107 | J-14 pass. Activation flow works for a non-activated seeded member |
| M9 | Reports & dashboards | report registry + 8 builders, CSV export, dashboard aggregates | ST-01 (5 variants), ST-03, ST-50..52 | — | Q-310, Q-405 | J-13 pass. Report totals reconcile with ledgers |
| M10 | Polish & release | Hosted demo instance if Q-010 = hosted | States/a11y/responsive audit | Signed release APK, app icon/name, TalkBack pass | Q-011 | Test plan §5 checklist 100%. Demo script rehearsed on a device |

**Lean fallback (if time is cut):** M0 → M1 (loan functions only) → M2 (ST-64) → M3 → M4 → M5. Mobile: MA-01, MA-04, MA-05, MB-01..07, MB-11, MB-12.

## 3. Sequencing rules for Claude sessions
1. One milestone per branch. Do not start M(n+1) before M(n)'s exit criteria pass.
2. Inside a milestone, build in this order: `packages/types` → `packages/domain` (if needed) → mock-api routes + tests → `api-client` → web screens → mobile screens → states → E2E.
3. Before building any screen, re-read its spec in `06` and the rules it references in `09`.
4. When a spec gap is found, stop and add a question to `open-questions.md`. Do not improvise business logic.
5. At the end of each session, update the status table below and `CLAUDE.md` §2.

## 4. Status tracker

| Milestone | Status | Notes |
|---|---|---|
| M0 | ✅ Done 2026-10-24 (branch `m0-foundation`) | Real APK on a phone still to do (needs an Expo account). Console visual check by the user pending |
| M1 | ✅ Done 2026-10-24 | 76 domain tests, **100% statements/branches/functions/lines** (`npm run test:domain-coverage`); 53 seed integrity tests; state machines for loans, FDs, demand sheets, membership |
| M2 | ✅ Done 2026-10-24 | ST-60…68 console + MB-16 rates with EMI estimate. Exit test passed live (11% → 13% changes the phone EMI). See build-history/02 |
| M3 | ✅ Done 2026-10-24 | Joining (03a) + Members module (03b): ST-10…13, ST-18, MB-02, MB-19. J-09 (API tests), J-11 (browser) and the cross-app change request pass |
| M4 | ✅ Done 2026-10-24 | ST-20, ST-21, ST-23 + MB-03, MB-04, MB-05. Exit passed on the live API (phone application → ST-20; Ramaiah BR-002 block). See build-history/04 |
| M5 | ✅ Done 2026-10-24 | ST-02, ST-22, ST-24…28, sanction letter, MB-06, MB-07, MB-04 actions. Exit J-01 → J-08 passed on the live API with personas. See build-history/05 |
| M6 | ✅ Done 2026-10-24 | ST-30…33, FDR print, MB-08, MB-09, MB-15. Exit J-16 passed live across both apps (phone request → cashier → Secretary → President → FDR on the phone). See build-history/06 |
| M7 | ✅ Done 2026-10-24 | ST-40…47, MB-10, MB-18. J-10 passed live; Mahesh's September waterfall identical on web and phone; his reported payment verified and dues cleared. See build-history/07 |
| M8 | ✅ Done 2026-10-25 | MA-01 real sign-in, MA-02 activation, MA-03 forgot password, MB-01 live home, MB-11 calculators, MB-12 notifications, MB-13 help & support, MB-14 settings, MB-17 change password. J-14 passed live (a seeded member who never activated activates and signs in). See build-history/08 |
| M9 | ✅ Done 2026-10-25 | ST-01 five dashboard variants, ST-03 notifications + simulated composer + member questions, ST-50 catalogue, ST-51 viewer with 8 reports (CSV + print), ST-52 defaulter notice and F1–F6 form twins. J-13 passed (report totals reconcile with the ledgers). See build-history/09 |
| M10 | ✅ Done 2026-10-25 (demo scope) | a11y pass (axe WCAG 2.2 AA clean, console light + dark, phone), state audit with the failure switch (console guard fix), topbar global search, M3–M5 visual check, DEMO-SCRIPT.md with Act 3 rehearsed. Signed APK, device test and hosting deferred until asked (D-054). See build-history/10 |
| Demo-ready | ✅ Done 2026-10-25 | Demo clock (D-065). Playwright suite as the acceptance gate (D-066): console routes, J-03…J-14, cross-app AC-X01, axe light + dark + phone, error states, screen sizes, the whole DEMO-SCRIPT. `npm run demo:prod` on :5180. Six real bugs fixed (see build-history/11). Real phone over Wi-Fi documented, not verified on a device |

### v0.3 notes
- M3 also delivers **J-15 (join)** and **J-19 (DDO certify)** across both apps. Exit: an applicant joins on the phone → DDO, office, Secretary and President act on the web → the share payment is recorded → the phone switches to member mode with a General No.
- M4/M5 deliver the product-specific forms (F2, F3), the surety particulars and signing (J-18), the office-use panel and the **two-step sanction**. Exit: J-17 (salary loan) passes.
- M6 exit: J-16 (FD via app) passes, with the FDR visible on the phone.
- M7 adds demand **certification** (BR-030).
- M9 adds the 9 printable form twins (ST-52).
### v0.4 notes (doc 17)
- M3 adds MB-19 edit profile + ST-18 change requests. M6 adds loan against FD (MB-09 → MB-05). M7 adds MB-18 report a payment + ST-47 verification. M8 adds MB-16 interest rates + MB-17 change password and arranges the More tab as the sitemap's Settings / Index.
