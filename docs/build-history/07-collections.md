# 07 · M7 Demand & collections (ST-40…47, MB-10, MB-18) — done

## Built
- **Console**
  - ST-40 **Demand sheets** `/demand-sheets?cycle=`: cycle picker (all posted cycles + current + next), KPI cards (demand, recovered, short, waiting on you), one row per department with status, members, demand, recovered, short and the signed-in user's next step. DDOs see their department only.
  - ST-41 **Generate** `/demand-sheets/generate?cycle=`: current or next cycle, department checkboxes, preview per department with totals per head and warnings (already generated, missing pay profile), generate (Accountant only).
  - ST-42 **Sheet** `/demand-sheets/:id`: stepper Generated → Certified (BR-030) → Sent to DDO → Posted; member rows with a column per head in recovery order, totals, recovered/short after posting, click a row → allocation breakdown in BR-011 order; drawers **Certify** (stamp with name/time) and **Send to DDO** (simulated email + DDO notification); Export (CSV for Excel), Print (letterhead), "Act as Suresh Goud" demo control.
  - ST-43 **Recovery entry** `/demand-sheets/:id/recovery`: recovered per member (default = demand), "Mark all fully recovered", "Import DDO statement" (demo: two members short), live allocation for the selected member, summary, confirm modal → Post (one salary-recovery receipt per member).
  - ST-44 **Payments** `/payments`: KPI cards (today, this month, reported to verify), tabs All / Salary recovery / Counter & bank / Reported by members, search, server paging (5,700+ receipts).
  - ST-45 **New receipt** `/payments/new`: member search → dues by month and head + first-demand shares → purpose (Dues / Share capital) → mode (Cash with the denomination counter, Bank transfer, Adjustment = Accountant only) → live allocation → save.
  - ST-46 **Receipt** `/payments/:id`: printable receipt on letterhead with month/head lines, notes counted, cashier and seal.
  - ST-47 **Verify reported payment** drawer (Reported tab, `?report=<id>`): details + screenshot name, allocation preview, "I found this credit" → Verify & create receipt (opens it) / Reject with reason.
  - Work Queue: demand sheets to certify / send / post (Accountant) and reported payments to verify (Cashier, Accountant).
- **Phone**
  - MB-10 **Payments tab**: unpaid banner (months that came short + share capital), segments Monthly / Receipts / Reported; month card expands to the head-wise allocation in society order; receipt view `/payment/receipt/[id]`.
  - MB-18 **Report a payment** `/payment/report`: what for, amount (+ words, prefilled with what is owed), paid on, UPI / bank / cheque, UTR, screenshot (simulated), where to pay; "Nothing unpaid" state when there is nothing to report.

## Key files
- API `apps/mock-api/src/collections.ts` (+ `collections.test.ts`): `GET /demand`, `GET /demand/preview`, `POST /demand/generate`, `GET /demand/sheets/:id`, `POST /demand/sheets/:id/actions/:action` (certify · sendToDdo · postRecovery), `POST /demand/sheets/:id/demo-act`, `GET/POST /receipts`, `GET /receipts/:id`, `GET /members/:id/dues`, `GET /payment-reports`, `POST /payment-reports/:id/verify|reject`, member `GET /me/payments`, `GET /me/receipts/:id`, `POST /me/payments/reports`. `postComponents` is the single place money moves into loans (principal, schedule status, auto-close), CRD/SRDS balances and share capital.
- Domain: `allocateArrears` (collections.ts) + `buildDemandComponents`, `departmentForCycle`, `allocateRecovery`, `validateDenominations`, demand-sheet state machine.
- Console: `apps/admin-console/src/pages/collections/*`, `components/Letterhead.tsx`. Phone: `src/app/(member)/payments.tsx`, `src/app/payment/*`, `src/lib/payments.ts`.
- Seed v10: sheet sign-offs (generated 5th, certified 6th, sent 7th, posted 28th), open member reports point at members who really owe (Mahesh = his whole short ₹19,816).

## Decisions
**D-061** (counter / reported payments settle the oldest short month first, BR-011 inside a month; excess recovery over demand is refused — the DDO refunds it; generate only the current or next cycle; only the Accountant generates/certifies/posts; adjustments are Accountant-only; reports within 60 days, unique reference). D-043 (member reports), BR-030 (certify).

## Verified
- `npx vitest run` 239 tests · typecheck green · domain coverage 100% · Android bundle 5.4 MB.
- **Exit passed live** (headless, both apps): generated the 3 missing October departments; certified, sent and posted Irrigation with two short members (33 receipts, BR-011 waterfall on screen); Mahesh's September (demand ₹10,050, paid ₹4,020, short ₹6,030) is identical on the console sheet and on his phone, in the same priority order; the cashier verified his ₹19,816 report → receipt RCP-C-005743 across Jan / Mar / Sep → phone shows "Nothing unpaid". No page errors.
- Fixed on the way: verify drawer now opens the new receipt; payments tab labels/totals; matured-FD "waiting since" in the Work Queue (M6 bug) now counts from maturity.

## Gaps / TODO
- Penal interest (BR-012) is off (0%), so no PENAL lines are generated.
- Excess recovery / unallocated credit (Q-309) is refused rather than held.
- File import is simulated; Export is CSV.

## Next
M8 Member app completion (MA-02 activation, MA-03 forgot password, MB-01 home snapshot, MB-11 calculators, MB-12 notifications, MB-13 help, MB-14 settings, MB-17 change password).
