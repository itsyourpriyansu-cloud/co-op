# Decisions Log

> Append-only. Never delete. To reverse a decision, add a new entry that supersedes it.
> Status: **Accepted** (user approved) · **Proposed** (awaiting user) · **Superseded by D-xxx** · **Rejected**

| ID | Date | Decision | Rationale | Status | Affects |
|---|---|---|---|---|---|
| D-000 | 2026-10-24 | **Plan approved: development may begin**, starting with the architecture (M0). Proposed decisions are working defaults until the user changes them. Inputs (Q-005 Fusil backend, APK route, Batch 3/5) are collected later | User: "lets begin building… only the architecture… afterwards we can do the things u want inputs from me" | **Accepted** | all |
| D-001 | 2026-10-24 | Documentation first. No application code until D-000 is Accepted | User instruction | Accepted | all |
| D-002 | 2026-10-24 | Deliverable is a finished-UI prototype using mock data only. No backend or real integrations | User instruction | Accepted | 07, 11, 13 |
| D-003 | 2026-10-24 | Source precedence: Agreement > Accepted decisions > Flow diagrams > Proposals | The agreement is the contractual scope. Diagrams express UX intent | Proposed | 02 |
| D-004 | 2026-10-24 | One web app with two shells: Staff Console (desktop) and Member Portal (mobile-first, responsive) | Single codebase, shared design system/mock store. Native app not needed to prove UX | **Superseded by D-019** | 04, 07 |
| D-005 | 2026-10-24 | Merge the per-type loan index pages (Ordinary/Educational/Other/Top-up) into one Loans index with type tabs | Removes ~6 redundant screens. Same data, one pattern | Proposed | 05, 06 |
| D-006 | 2026-10-24 | Workflow stages (Review, DDO, Assessment, Sanction, Disbursement) are action panels on Loan Detail, plus a role-filtered Work Queue and an activity timeline | Fewer screens, full context at the point of decision, built-in audit trail | Proposed | 04, 05, 06 |
| D-007 | 2026-10-24 | Canonical loan state machine as in `10` §1 (reconciles 5 diagrams) | Diagrams differ per role. One lifecycle is needed for consistency | Proposed (Q-102, Q-113, Q-114) | 08, 10, 11 |
| D-008 | 2026-10-24 | Stack: React + TS + Vite, Tailwind + shadcn/ui, TanStack Query/Table, RHF + Zod, Recharts, Vitest, Playwright | Fast to build a polished UI. Mock service layer swaps cleanly to an API | **Accepted** 2026-10-24 (staff web) | 07 |
| D-009 | 2026-10-24 | Replace open member "Signup" with account **activation** for pre-registered members (Employee ID + mobile OTP) | Society controls membership. The agreement places registration in Member Master | **Accepted** 2026-10-24 · **Partly superseded by D-026** (activation stays for existing members. New people join via the membership application) | AU-02 |
| D-010 | 2026-10-24 | Member payments view is read-only (no Edit/New) | Members must not alter financial records | Proposed (Q-107) | MB-10 |
| D-011 | 2026-10-24 | All money/eligibility logic in pure, tested, settings-driven domain functions. Unknown rules become configurable placeholders | Do-not-invent rule + easy correction when answers arrive | Proposed | 07, 09 |
| D-012 | 2026-10-24 | Email/WhatsApp/SMS are simulated (notification log + templates + composer) | No integration in prototype. Triggers undefined | Proposed (Q-111) | ST-03, ST-63 |
| D-013 | 2026-10-24 | Accounting books (GL, TB, P&L, BS, Day/Cash/Bank Book) deferred to P2 | Need an unspecified double-entry accounting module | Proposed (Q-401) | 05, ST-51 |
| D-014 | 2026-10-24 | Mock persistence in localStorage with Reset, demo clock, failure toggle and persona switcher | Repeatable client demos and state coverage | **Superseded by D-021** (persistence moves to the mock API server. Personas, clock and failure toggle are kept) | 07 |
| D-015 | 2026-10-24 | Add a Departments & DDOs master | Required by department-wise demand sheets and DDO scoping | Proposed | ST-67 |
| D-016 | 2026-10-24 | Permission matrix as in `03` §2 | Derived from diagram reachability | Proposed (Q-108, Q-112). Revised in `03` v0.3 for Secretary/President/Cashier/Applicant | 03 |
| D-017 | 2026-10-24 | MVP scope = 51 pages + 6 overlays + 8 report templates (see `05` §1) | Covers all contractual modules except accounting | **Superseded by D-023** (MVP accepted. Counts changed by D-019) | 05, 14 |
| D-018 | 2026-10-24 | Money stored as integer paise | Avoid floating-point rounding errors | Proposed | 08 |
| D-019 | 2026-10-24 | Member experience is a **separate native mobile app**, not a web portal | User choice (Q-002) | **Accepted** | 03, 04, 05, 06, 07, 12, 14, 15 |
| D-020 | 2026-10-24 | Mobile framework: **Expo (React Native) + TypeScript** | User choice. Shares domain engine, types and API client with the web app | **Accepted** | 07 |
| D-021 | 2026-10-24 | **Shared mock API server** (Node, in-memory, seeded, JSON snapshot persistence) serves both apps. Demo controls (reset, clock, failure rate, persona login) live on the server | User choice. Cross-app hand-offs (member applies on phone → accountant sees it on web) must be real in demos | **Accepted** (implementation details in `07` are Proposed) | 07, 11, 13 |
| D-022 | 2026-10-24 | Mobile demo distribution: **Android APK only** | User choice | **Accepted** | 14, 15 |
| D-023 | 2026-10-24 | MVP scope: Staff web 36 pages + 6 overlays + 5 dashboard variants + 8 report templates. Member mobile 19 screens (55 total). Mock API server | User chose MVP (Q-001). Recount after D-019 | **Superseded by D-036** | 05, 14 |
| D-024 | 2026-10-24 | Workspaces monorepo (tool: see D-038): `apps/admin-console`, `apps/member-app`, `apps/mock-api`, `packages/{domain,types,api-client,mock-data,design-tokens}` | Required to share one domain engine across two apps and the server | **Accepted** (built in M0) | 07 |
| D-025 | 2026-10-24 | Libraries: mock API = Hono on Node. Mobile = Expo Router, NativeWind (tokens shared with web Tailwind), TanStack Query, RHF + Zod. Mobile E2E = Maestro. Unit tests = Vitest (packages, web), Jest + RNTL (mobile) | Lightweight, TypeScript-first, consistent with the web stack | Proposed | 07, 15 |
| D-026 | 2026-10-24 | **Membership "join" flow in the Member App** with a stage tracker (no queue number): apply → DDO certify → office review → Secretary → President → share payment → General No. allotted → member mode | User request (digitise F1, "join waitlist"). Stage tracker chosen | **Accepted** | 03, 04, 05, 06, 08, 10, 11, 16 |
| D-027 | 2026-10-24 | **Sequential Secretary → President sign-off** for loan sanction and FD acceptance (separate logins) | Paper forms carry both signatures. User choice | **Accepted** | 03, 06, 10 |
| D-028 | 2026-10-24 | FD primary holder must be a member. Up to 2 joint holders or a minor with guardian. Operation mode either/any-one-or-survivor | F4 form. User choice | **Accepted** | 08, 16 |
| D-029 | 2026-10-24 | New member's share capital: paid at the counter OR scheduled on the first demand sheet | User choice | **Accepted** (activation timing Q-510) | 10, 16 |
| D-030 | 2026-10-24 | Loan workflow stages are configurable per product (`suretyStage`, `ddoCertification`). Salary loan: neither | F3 has no sureties or DDO certificate | Proposed (Q-502) | 09, 10 |
| D-031 | 2026-10-24 | Digital signature = full consent text + "Sign with OTP" + stored {who, when, device, text version} | Replaces wet signatures on F1–F6 | Proposed (legal check Q-505) | 08, 16 |
| D-032 | 2026-10-24 | Digitisation principles: pre-fill from Member Master, "For Office Use" → computed panels, printable twins of every form | Removes re-entry, the main paper pain | Proposed | 06, 16 |
| D-033 | 2026-10-24 | **Hard platform split:** Admin Console (desktop web) = all staff incl. DDO, Secretary, President, Cashier. Member App (Android) = applicants + members only. No member web, no staff in the app | User statement | **Accepted** | 00, all |
| D-034 | 2026-10-24 | Design direction "calm institutional fintech": Lucide icons on both platforms, Inter, teal/gold placeholder palette, flat 2-tone illustrations, no stock photos, drawer-based decisions, 5-tab app | UX research (`12` §10) | Proposed | 12 |
| D-035 | 2026-10-24 | Accessibility target **WCAG 2.2 AA** (web). 48 dp targets on Android | Current standard | Proposed | 12, 15 |
| D-036 | 2026-10-24 | MVP scope recount: Admin Console 38 pages + 9 overlays + 5 dashboards + 8 reports + 9 printables. Member App 25 screens. **63 screens total** | Membership flow, FD request, form printables added | **Accepted** (follows D-026) | 05, 14 |
| D-037 | 2026-10-24 | Roles: Loan Approver split into **Secretary (R3a)** and **President (R3b)**. R4 becomes **Cashier / Disbursement Officer**. New **R7 Applicant** | Forms show Secretary, President and cashier signatures | Proposed (Q-509) | 03 |
| D-038 | 2026-10-24 | Use **npm workspaces** instead of pnpm. Root scripts: `npm run demo`, `npm test`, `npm run build:apk` | pnpm isn't installed. npm ships with Node (v12.2 present) and supports workspaces. Expo supports npm monorepos | **Accepted** | 07, CLAUDE.md, BUILD-CHECKLIST |
| D-039 | 2026-10-24 | Member App styling: **React Native StyleSheet + shared tokens** (`@tgs/design-tokens`) instead of NativeWind. Supersedes the NativeWind part of D-025 | Fewer moving parts in an npm monorepo with Tailwind v4 on the web. One token source still drives both apps | **Accepted** (M0) | 07, 12 |
| D-040 | 2026-10-24 | Version baseline: Expo SDK 58 · React Native 0.88 · React 19.3.0 (pinned for both apps via root `overrides`) · TypeScript 6.0 · React Router 8 · Vite 8 · Tailwind 4.3 · TanStack Query 5 · Hono 4 · Vitest 5 · lucide 1.x | Current versions at build time. One React copy across the monorepo (Expo monorepo guidance) | **Accepted** (M0) | 07 |
| D-041 | 2026-10-24 | Workspace packages ship **TypeScript source** (`main: src/index.ts`), with no build step. Vite, Metro and tsx compile them directly | Simplest setup that all three runtimes support | **Accepted** (M0) | 07 |

