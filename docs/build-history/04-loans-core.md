# 04 · M4 Loans core (ST-20, ST-21, ST-23, MB-03, MB-04, MB-05) — done

## Built
- **Console**
  - ST-20 `/loans`: product tabs with counts (All, Ordinary, Education, Salary, Deposit, Top-ups), status group (In process default, Active, Closed, Rejected/withdrawn), department, search (member, General No., application or loan no.), server paging, live 5 s refresh. Rows show "waiting on …" for loans in process.
  - ST-21 `/loans/new` (Super Admin, Accountant), entering a signed paper form:
    - member search → snapshot (DOR, left-over service, running loans, share deposit);
    - loan-type cards;
    - F2 items 4–5 pay details, pre-filled from the pay profile; or F3 pay-this-month with itemised deductions, Ordinary-loan dues and net pay earned;
    - amount with words, instalments, purpose, Education student details, Deposit FD to pledge;
    - surety picker with auto-filled particulars and warnings;
    - live **Eligibility** panel (server) with EMI, share deduction and net disbursable.
    - Submit only (no OTP); it goes to SURETY_PENDING or straight to ACCOUNTANT_REVIEW per product (D-030).
  - ST-23 `/loans/:id`: header (product, amount, status, form F2/F3), stage stepper, tabs:
    - Application (items 7–11, pay items 4–5 / F3 items 5–9, how it was entered and signed);
    - Eligibility (re-run live);
    - Sureties (items 9–10 incl. "already a surety for");
    - Schedule (or the estimate before sanction);
    - Activity.
    - Side panels: Next step (the role's action, shown disabled with "arrives in M5"), Money, Borrower.
- **App**
  - MB-03 Loans tab: segments In process / Active / Closed / Drafts, cards with outstanding + next EMI, "waiting on …", or "continue draft". Apply button. Home → "Apply loan" now works.
  - MB-04 `/loan/[id]`: amount hero, stage tracker (product-skipped steps hidden), amounts, sureties with status, schedule (6 + show all), points the office will look at. Drafts can be continued or discarded.
  - MB-05 `/loan/apply` (or `?draft=<id>`): wizard Choose a loan → About your pay (F2 or F3) → Your loan (live server eligibility card) → Your sureties (F2 only; search, eligible members first) → Review & sign (declaration text, Sign with OTP, demo `123456`). A draft is saved on every step. Types already held (BR-018) are not selectable and suggest a top-up.
  - `/loan/_layout.tsx` guard sends a lost session back to `/`.

## Key files
- Domain `packages/domain/src/loan-application.ts` (+ test):
  - `firstDueCycle`, `lastInstalmentCycle`;
  - `checkSalaryLoan` (BR-023 + D-058 limit);
  - `validateLoanRequest` (F2/F3 completeness);
  - `loanStatusGroup`, `loanStages` (MB-04 labels, D-030 skips).
  - Existing `assessLoanApplication`, `checkSuretyEligibility` and `loanActionsFor` are reused.
- Types:
  - `LoanApplicationForm` (pay, additionalShares, security, education, salary);
  - `Loan.form/channel/createdByName/submittedAt/signature`;
  - DTOs `LoanRow`, `LoanList`, `LoanListParams`, `LoanDetail`, `LoanStage`, `SuretyCard`, `LoanContext`, `LoanRequestInput`, `LoanAssessment`, `CheckResult`, `MemberPick`;
  - permission `loans.create` (Super Admin, Accountant).
- API `apps/mock-api/src/loans.ts` (+ `loans.test.ts`, 5 tests). Registered **before** members so `/members/search` beats `/members/:id`.
- Console `apps/admin-console/src/pages/loans/*`. App `src/app/(member)/loans.tsx`, `src/app/loan/*`, `src/lib/loans.ts`.

## API
- Staff:
  - `GET /loans?product&group&departmentId&q&page&pageSize`
  - `GET /loans/:id` (id or application no.)
  - `GET /members/:id/loan-context`
  - `POST /loans` `{memberId, …LoanRequestInput, submit}`
- Shared:
  - `GET /members/search?q=` (staff, or members for sureties; DDO-scoped; eligible sureties first)
  - `POST /loans/surety-preview`
  - `POST /loans/assess` (live eligibility, surety cards, field errors)
- Member:
  - `GET /me/loans`, `GET /me/loans/context`, `GET /me/loans/:id`
  - `POST /me/loans` (draft), `PUT /me/loans/:id`, `DELETE /me/loans/:id` (draft only)
  - `POST /me/loans/:id/sign/request`, `POST /me/loans/:id/submit {otpRef, otp}`

Submitting:
- notifies each surety (`loan.surety`) and the member (`loan.submitted`);
- reserves a pledged FD (`pledgedToLoanId`);
- records the signature text version `F2+F3-2026.1`.

## Decisions
**D-058**:
- A Salary loan may be at most the net pay earned to date, and net substantive pay must be positive (Q-502 placeholder).
- BR-018 counts every open application, not only active loans.
- Staff never see a member's unsubmitted draft.
- Office entries need no OTP (the paper is signed).
- A pledged FD is reserved at submission.

## Verified (2026-10-24)
- `npm run typecheck` green, `npx vitest run` **210 tests** green, domain coverage 100% (685/685 branches).
- **M4 exit on the live API:**
  - Sravani drafts → signs (OTP) → submits an Ordinary loan on the phone endpoints → SURETY_PENDING, "waiting on Sureties: …" → the Accountant's ST-20 list shows APP-2026-00776.
  - Ramaiah's 24-month Education loan is BLOCKED by BR-002 ("Max available: 13 months"); the server refuses to send the signing code (422, BR-002).
- Console production build OK; Android bundle export OK.
- **Not visually checked:** the browser pane was closed / declined this session, so ST-20/21/23 and MB-03/04/05 were not clicked through. Do that first next session.

## Gaps / TODO
- M5: surety accept/decline (MB-07), review / DDO / assessment / sanction / disbursement drawers (ST-24…28), top-up (ST-22, MB-06), withdraw, Work Queue (ST-02), release of a reserved FD on rejection.
- Staff cannot edit a staff draft (ST-21 only submits). Documents for loans are not modelled.
- After adding route files while `expo start` runs on Windows, regenerate typed routes (see 03b).

## Next
M5 Loan workflow (J-01 → J-08 across both apps).
