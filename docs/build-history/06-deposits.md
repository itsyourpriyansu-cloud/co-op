# 06 · M6 Deposits (ST-30…33, FDR print, MB-08, MB-09, MB-15) — done

Built across two sessions: the first wrote the API, seed, client and console pages and ran out of credit before wiring them up; the second (this entry) wired the routes, built the phone screens, fixed what it found and ran the exit test.

## Built
- **Console**
  - ST-30 **Deposits** `/deposits`: KPI cards (FD held, maturing in 30 days, CRD + SRDS, savings), tabs Fixed deposits · FD requests · CRD · SRDS · Savings with counts, maturity filter, search, live refresh. "Open FD at counter" for Cashier / Accountant.
  - ST-31 **Open FD at the counter** `/deposits/new` (form F4 layout, shared member search).
  - ST-32 **Deposit detail** `/deposits/:id`: stepper (Requested → Payment → Secretary → President), F4 items, ledger, receipt card, acceptances, "Act as …" demo control.
  - ST-33 **payment & acceptance drawer**: cash slip with the **denomination counter** (`components/DenominationCounter.tsx`, BR-029, "Fill fewest notes"), bank transfer / cheque with reference, then Secretary accept (1 of 2) and President accept (2 of 2) → FDR No. issued.
  - **FDR print** `/deposits/:id/fdr` (ST-52 printable): letterhead with the seal, terms, the four F4 rules, both digital acceptances, Print.
- **Phone**
  - MB-08 **Deposits tab**: total saved, FD vs CRD/SRDS/savings, segments Fixed · Requests · CRD & savings, cards with maturity, pledged tag, 5 s polling.
  - MB-09 **Deposit detail** `/deposit/[id]`: request → how to pay (counter or transfer, quote the request No.), tracker, cancel while unpaid; accepted FD → maturity, interest payouts, holders & nominee, the **FDR card**, and **"Take a loan against this FD"** (D-045) → `/loan/apply?pledge=<id>` opens the Deposit-loan wizard with that FD chosen; CRD / SRDS / Savings → statement.
  - MB-15 **Open a fixed deposit** `/deposit/open`: amount (words) + period chips with the slab rate → payout options with live interest → holders (only me / joint up to 2 / minor) → nominee (prefilled) → the four rules + agree → Sign with OTP. Each step validated with `validateFdRequest` (same rule as the API).
  - Home quick action "Open FD" now works.

## Key files
- API: `apps/mock-api/src/deposits.ts` (+ `deposits.test.ts`): `GET/POST /deposits`, `GET /deposits/:id`, `POST /deposits/:id/actions/:action`, `POST /deposits/:id/demo-act`; member `GET /me/deposits`, `/me/deposits/context`, `/me/deposits/:id`, `POST /me/deposits/sign/request`, `POST /me/deposits`, `POST /me/deposits/:id/cancel`. FD items also feed the Work Queue.
- Domain: `packages/domain/src/deposits.ts` (`fdPayoutSchedule`, `minorMajorityDate`, `validateFdRequest`), `workflows.ts` (FD state machine), `collections.ts` (`validateDenominations`, `denominationsFor`).
- Console: `apps/admin-console/src/pages/deposits/{DepositsPage,DepositDetailPage,DepositFormPage,FdrPage}.tsx`, routes in `src/app/router.tsx`.
- Phone: `apps/member-app/src/app/(member)/deposits.tsx`, `src/app/deposit/{_layout,[id],open}.tsx`, `src/lib/deposits.ts`; `loan/apply.tsx` accepts `?pledge=`.
- Seed v9: deposit `events`, FD requests filled in for their stage, "deposit not accepted" template.

## Decisions
D-060 (FD minimum, payment modes, interest from payment date, joint holders, cancel/refund rules). D-027 (two acceptances), D-028 (joint/minor), D-045 (loan against FD).

## Verified
- `npm run typecheck` green · `npx vitest run` 232 tests · domain coverage 100% · Android bundle 5.4 MB.
- **Exit J-16 passed live** (headless browser, both apps): Lakshmi requests ₹1,00,000 for 24 months on the phone → Cashier cash slip ₹500 × 200 → Secretary → President → FDR-2026-00151 on the console print page and on the phone. Also checked: console list, phone loan-against-FD wizard (opens at step 2 of 4), CRD statement. No page errors.

## Gaps / TODO
- Maturity payout / renewal (MATURED → CLOSED) is an action only; no renewal form yet.
- Interest payouts are listed, not posted to a ledger (accounting is P2).
- Typed routes: after adding route files run the regenerate command from 03b in `apps/member-app`.

## Next
M7 Demand & collections (ST-40…47, MB-10, MB-18).
