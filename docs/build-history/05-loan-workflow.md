# 05 · M5 Loan workflow (ST-02, ST-22, ST-24…28, ST-52 letter, MB-06, MB-07) — done

## Built
- **Console**
  - ST-02 **Work Queue** `/queue`: one list of everything waiting on the signed-in user, oldest first, tabs by stage, waiting-since chips (amber > 3 days, red > 7, [P]), live 5 s refresh. It covers:
    - loan stages for the role;
    - joining applications at the user's stage;
    - profile change requests (DDO certify or Accountant decide);
    - for DDOs, mandates to agree after a transfer.
    - DDOs see their department only.
  - ST-23 now carries the real actions. One drawer `LoanActionDrawer` covers:
    - ST-24 review: checklist plus live rule checks; Forward / Return / Reject.
    - ST-25 DDO certificate: items 1–5 plus "recovery from salary is possible". The Accountant can instead record a paper certificate (DDO name, designation, date, letter ref, Q-102).
    - ST-26 assessment "For Office Use": amount and tenure may only be reduced, re-validated against BR-002/BR-022. The live sanction sheet shows OL/SL balances and dates, EMI first→last, total interest, top-up settlement with interest to date (BR-007), share-deposit netting (BR-004) and net disbursable.
    - ST-27 two-step sanction with the sign-off block. Secretary signs; President signs, rejects or sends back (SOD-1).
    - ST-28 disbursement: mode NEFT/cheque/transfer, reference, date ≤ demo today.
  - Also on ST-23:
    - Return / reject / send-back require a reason.
    - "Act as <owner>" demo button pushes the stage as its owner (sureties, other DDOs, other officers).
    - Sign-offs panel, sanction sheet section, banners for returned / rejected / disbursed.
  - **ST-52 sanction letter** `/loans/:id/letter`: letterhead with the seal, terms, deductions, net payable, both digital signatures, print.
  - **ST-22 top-up** inside `/loans/new`: when the member has a running loan of that product that can be topped up, choose "New loan" or "Top-up of LN-…"; the eligibility panel shows the settlement.
- **App**
  - **MB-07** `/surety`:
    - Requests and "I am surety for" tabs.
    - Detail `/surety/[loanId]`: loan, my particulars (item 9), loans I already guarantee (item 10), undertaking (item 12) → **Agree & sign with OTP**, or Decline with a reason.
    - Home shows a banner when a request is waiting; More → Surety requests is live.
  - **MB-04** actions:
    - Correct & resubmit (RETURNED → wizard → OTP), keeping sureties who already signed.
    - Replace a declined surety (search, eligible first).
    - Withdraw before sanction (two-step confirm).
    - Request a top-up (ACTIVE and top-up allowed).
    - Banners for rejected and sanctioned.
  - **MB-06** top-up: `/loan/apply?topup=<loanId>`, product locked, settlement and interest-to-date in the eligibility card.

## Key files
- Domain `packages/domain/src/loan-workflow.ts` (+ test):
  - `lastInterestChargedOn`;
  - `checkTopupEligibility` (D-059);
  - `buildSanctionSheet`;
  - `validateSanctionAdjustment`;
  - `suretyProgress`.
  - It reuses `nextLoanStatus`, `loanActionsFor`, `PRIMARY_LOAN_ACTION`, `calculateTopupSettlement` and `generateSchedule`.
- Types:
  - `Loan.signOffs/sanctionSheet/sanctionedInstalments/sanctionLetterNo/returnInfo/rejection/disbursement`;
  - `SanctionSheet`, `LoanSignOffs`;
  - DTOs `LoanActionInput`, `SanctionPreview`, `WorkItem/WorkQueue`, `SuretyRequest(s)`;
  - `LoanRequestInput.topupOf`, `LoanContext.topupCandidates`, `LoanDetail.demoActAs`, `preview.topup`.
- API `apps/mock-api/src/loan-workflow.ts` (+ `loan-workflow.test.ts`, 5 tests). `applyLoanAction` is the single place for transitions and side effects. Seed v8 adds templates `loan.suretyDeclined` and `loan.suretiesSigned`.
- Console `pages/WorkQueuePage.tsx`, `pages/loans/{LoanActionDrawer,SanctionLetterPage}.tsx`, edits to `LoanDetailPage` and `LoanFormPage`.
- App `src/app/surety/*`, edits to `loan/[id].tsx`, `loan/apply.tsx`, `(member)/home.tsx`, `more.tsx`.

## API
- Staff:
  - `GET /work-queue`
  - `GET /loans/:id/sanction-preview?amount&instalments`
  - `POST /loans/:id/actions/:action` `LoanActionInput`
  - `POST /loans/:id/demo-act`
- Member:
  - `GET /me/surety-requests`
  - `POST /me/surety-requests/:loanId/sign/request`, `/accept {otpRef, otp}`, `/decline {reason}`
  - `POST /me/loans/:id/sureties/replace {oldId, newId}`
  - `POST /me/loans/:id/withdraw {reason?}`
  - `PUT /me/loans/:id` and sign/submit now also accept RETURNED (resubmit).

Side effects:
- **Return / reject:** notify the member; a reject also releases a reserved FD.
- **DDO certify:** refreshes the pay profile (`certifiedAt`).
- **Assessment:** writes the sanction sheet; it is cleared on send-back.
- **President signs:** sanction letter no. `SL-YYYY-nnnn` plus a notification.
- **Disburse:**
  - loan no. `LN-YYYY-nnnnn` and the schedule from the month after payment;
  - share deposit credited (BR-004);
  - a top-up parent goes to `CLOSED_BY_TOPUP`;
  - the member is notified.

## Decisions
**D-059**:
- **Q-102:** "DDO Manual" means the Accountant records a paper certificate.
- **Q-110:** top-ups are for running loans of products with `topupAllowed` (Ordinary), one open top-up per loan, with no minimum instalments.
- **Q-113:** the Accountant does the assessment and may only reduce the amount or tenure.
- **Q-114:** the Accountant may return or reject, with a reason; a rejected member may re-apply.
- Sureties sign with an OTP; a declined surety is replaced by the applicant; signed sureties stay signed when a loan is returned and resubmitted.
- The President can send back to assessment; both signatures are then needed again.

## Verified (2026-10-24)
- `npm run typecheck` green; `npx vitest run` **221 tests** green; domain coverage 100% (716/716 branches); console production build OK; Android bundle OK.
- **M5 exit on the live API, personas only:**
  - Sravani applies for an Ordinary loan on the phone (OTP).
  - Mahesh and Lakshmi each sign as surety on their phones.
  - The Accountant reviews; Kiran Kumar (DDO) certifies; the Accountant assesses ₹1,80,000 × 48.
  - Secretary signs, then President signs (SL-2026-0001); Cashier disburses by NEFT.
  - Sravani's phone shows ACTIVE, next EMI ₹5,400 in Nov 2026, and every tracker step done.
  - Demo data reset afterwards.
- API tests also cover:
  - surety decline → replace;
  - president send-back;
  - return → correct → resubmit with signed sureties kept;
  - withdraw;
  - top-up closing the old loan;
  - DDO-scoped Work Queue.
- **Not visually checked** (browser pane closed this session): drawers, Work Queue, letter, MB-07 and MB-04 actions.

## Gaps / TODO
- No nav badge with the Work Queue count (the page shows it). The dashboard "needs attention" does not yet include change requests or mandates.
- The sanction letter is a print view (no PDF). Payee bank details are not modelled (ST-28 shows the member only).
- Insurance impact (BR-008) is not on the sanction sheet; other deductions (Q-311) are not modelled.

## Next
M6 Deposits (FD request on the phone, cashier receipt with denominations, acceptance, FDR, CRD/SRDS/Savings) per docs/14.
