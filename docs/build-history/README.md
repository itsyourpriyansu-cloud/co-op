# Build history (handoff log)

One file per milestone / module, written **when it is finished**, so the next Claude session can see exactly what exists, why, and how to check it. Read this after `CLAUDE.md` and `BUILD-CHECKLIST.md` → "Resume here".

Every entry has the same sections: **Built** (screens by ID) · **Key files** · **API** · **Domain** · **Decisions** · **Verified** · **Gaps / TODO** · **Next**.

| # | Entry | Status | Date |
|---|---|---|---|
| 0 | [M0 foundation, design system, dashboard, logo](00-foundation-design-dashboard.md) | Done | 2026-10-24 |
| 1 | [M3a Joining (phone + console, live)](03a-joining.md) | Done | 2026-10-24 |
| 2 | [M1 Domain engine + seed](01-domain-engine.md) | Done | 2026-10-24 |
| 3 | [M2 Settings & masters + MB-16 rates](02-settings.md) | Done | 2026-10-24 |
| 4 | [M3b Members module (phone + console)](03b-members.md) | Done | 2026-10-24 |
| 5 | [M4 Loans core (phone + console)](04-loans-core.md) | Done | 2026-10-24 |
| 6 | [M5 Loan workflow (phone + console)](05-loan-workflow.md) | Done | 2026-10-24 |
| 7 | [M6 Deposits (phone + console)](06-deposits.md) | Done | 2026-10-24 |
| 8 | [M7 Demand & collections (phone + console)](07-collections.md) | Done | 2026-10-24 |
| 9 | [M8 Member app completion (phone)](08-member-app.md) | Done | 2026-10-25 |
| 10 | [M9 Dashboards, notifications & reports (console)](09-insight.md) | Done | 2026-10-25 |
| 11 | [M10 Polish: a11y, states, search, demo script](10-polish.md) | Done (demo scope) | 2026-10-25 |

## How to resume
1. `npm install` (once) → `npm run demo` (mock API :4000 + console :5173; the user's other project may hold 5173, then use `npm run dev -w @tgs/admin-console -- --port 5180`) → `npm run dev:app` or `npx expo start --web --port 8090` in `apps/member-app` for the phone preview.
2. `npm run typecheck` and `npx vitest run` must be green before and after your change.
3. Demo data: `POST http://localhost:4000/api/v1/__demo/reset` restores the seed. Demo OTP is always `123456`.
4. Visual checks were done with headless Playwright scripts (kept outside the repo). Do not run the Playwright e2e suite unless the user asks (they test at the end).

## Working rules the user gave (also in memory)
- Demo only: localhost now, **Azure later** → keep every URL/port/origin in env vars (D-054).
- No APK work until asked. Fusil backend alignment skipped.
- Unanswered society rules: decide sensibly, keep configurable, log as [P] + decision.
- Design system stays as is (Blend, blue). New screens should feel modern within it.
- Commit only when the user says so.
