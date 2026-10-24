# 15 · Test Plan & Acceptance Criteria

> Version 0.3 · 2026-10-24 (two apps + shared mock API)

## 1. Test layers

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| Domain unit tests | Vitest | All 11 domain functions, every BR with a formula, edge cases | Required for M1 exit. 100% branch coverage on `packages/domain` |
| Mock API tests | Vitest + Hono `app.request` | Every endpoint: happy path, validation, FORBIDDEN scoping (DDO, member), state machine (valid/invalid), idempotency | Each milestone's endpoints |
| Component tests (web) | Vitest + Testing Library | Forms, EligibilityPanel, AllocationBreakdown, DataTable states | Key composites |
| Component tests (mobile) | Jest + React Native Testing Library | Wizard steps, OTP input, surety accept/decline, offline state | Key screens |
| E2E web | Playwright | Staff journeys J-03…J-13 | Each milestone |
| E2E mobile | Maestro flows on an Android emulator | J-01, J-02, J-07, J-14, activation | M4, M5, M8 |
| **Cross-app journey** | Script: Maestro (phone) + Playwright (web) against one mock-api instance, or an API-level script for CI | Phone apply → surety on phone → web stages → phone shows ACTIVE | M5, M10 |
| Visual / responsive | Playwright at 1440 / 1024 (web). Emulator screenshots at 360×800 and 412×915 (mobile) | All P1 screens | M10 |
| Accessibility | axe-core (web) + keyboard pass. TalkBack pass on key mobile journeys | All P1 screens | M10 |
| Device test | Release APK on at least 2 physical Android phones (one low-end, Android 10+) | Install, login, J-01, offline | M10 |

## 2. Mandatory domain test cases

| ID | Case | Expected |
|---|---|---|
| T-BR002-1 | leftover 24, tenure 24 | **Fail** (must exceed) |
| T-BR002-2 | leftover 25, tenure 24 | Pass |
| T-BR004-1 | **Agreement example**: sanctioned ₹20,000, 10%, existing ₹1,000 | required ₹2,000, deduction ₹1,000 |
| T-BR004-2 | existing ₹3,000 ≥ required ₹2,000 | deduction ₹0 |
| T-BR004-3 | new member, no balance, ₹50,000 | deduction ₹5,000 |
| T-BR006-1 | AMORTIZED ₹1,00,000, 12%, 12 m | EMI ₹8,885 (rounded), Σ principal = ₹1,00,000 |
| T-BR006-2 | EQUAL_PRINCIPAL ₹1,20,000, 12%, 12 m | principal ₹10,000/m, first interest ₹1,200, last ₹100 |
| T-BR007-1 | outstanding ₹50,000, 11%, 30 days, actual/365 | interest ₹452 (rounded) |
| T-BR007-2 | net disbursable ≤ 0 | RULE_VIOLATION |
| T-BR008-1 | member with ACTIVE loan in collection month | ₹1,000. Without loan ₹200. Non-collection month ₹0 |
| T-BR010-1 | transfer after Oct sheet generated | Oct stays old dept. Nov under new dept |
| T-BR011-1 | demand RRF 100, Ins 1000, CRD 500, Penal 0, Interest 900, Principal Edu 2000/Ord 3000. Recovered ₹2,000 | RRF 100, Ins 1000, CRD 500, Interest 400, Principal 0 |
| T-BR011-2 | recovered > demand | all heads full, excess → unallocated credit |
| T-BR011-3 | Principal Edu 2000, Salary 1000, Ord 3000, ₹2,500 left for principal | Edu 2000, Salary 500, Ord 0 |
| T-SM-1 | Approver tries `sanction` on ACCOUNTANT_REVIEW | INVALID_TRANSITION |
| T-SM-2 | DDO of Finance acts on a Revenue member's loan | FORBIDDEN |
| T-SM-3 | Generate the same cycle+dept twice | ALREADY_EXISTS |

## 3. Acceptance criteria (Given / When / Then)

### AC-AU-01 Login & personas
- Given the staff web login, when I pick a staff persona, then I land on that role's dashboard and the sidebar shows only permitted items. A forbidden route shows SYS-01, and the API returns 403 for the same call.
- Given the mobile app, when I pick a member persona, then I land on MB-01 showing that member's data only.
- Given the server is stopped, when the mobile app makes a request, then MA-04 appears, and Retry recovers once the server is back.

### AC-X01 Cross-app hand-off
- Given Sravani submits an application on the phone, when the Accountant opens the Work Queue on the web (refresh), then the application appears there. When it is disbursed on the web, the phone shows `ACTIVE` with a schedule after pull-to-refresh.

### AC-J01 Member applies for a loan
- Given Sravani (non-loanee), when she completes all Education-loan wizard steps with valid data, then an application number appears and the loan shows `SURETY_PENDING` in MB-03 and in the Accountant's Loans index.
- Given Lakshmi (active Ordinary loan), when she starts a new Ordinary loan, then she is redirected to the Top-up flow (BR-018 placeholder).
- Given Ramaiah (14 months left), when he enters tenure 24, then the eligibility panel shows a fail with "Max tenure available: 13 months" and Submit is disabled.

### AC-J02 Surety
- Given Sravani has a pending request, when she accepts and all other sureties have accepted, then the loan moves to `ACCOUNTANT_REVIEW` and the applicant gets a notification.
- When she declines with a reason, then the applicant sees "Replace surety" on MB-04.

### AC-J03…J08 Staff workflow
- Each stage action appears only for the correct role and status. It requires the mandatory fields, writes a timeline event with actor and remarks, and moves the loan to the next status per `10` §1.
- The Sanction Sheet shows share deduction and (for top-up) settlement amounts matching domain test results.
- After disbursement: loan `ACTIVE`, Loan No. assigned, schedule visible, share deposit balance increased by the deduction, parent loan `CLOSED_BY_TOPUP` (top-up).

### AC-J07 Top-up (agreement example)
- Given Lakshmi's ₹10,000 loan and ₹1,000 share deposit, when a ₹20,000 top-up is assessed, then Required share deposit ₹2,000, Existing ₹1,000, Additional deduction ₹1,000, plus settlement = outstanding principal + interest to today.

### AC-J09 Member master
- Required [A] fields enforced. Left-over service auto-calculated and read-only. Documents can be viewed, downloaded and printed.

### AC-J10 Demand & recovery
- Generating Oct 2026 for a department lists exactly the members effective in that department for the cycle, with heads per BR-009.
- Entering ₹2,000 against Mahesh's demand shows the allocation per T-BR011-1. Posting creates receipts and updates ledgers. The sheet becomes read-only.

### AC-J11 Transfer
- After a transfer, the confirmation names the next cycle. The current generated sheet is unchanged. The next generated sheet lists the member under the new department.

### AC-J13 Reports
- Each MVP report runs with default filters, shows totals that reconcile with the underlying data, and downloads a file (CSV) / opens a print preview (PDF).

### AC-GEN Global
- Every list screen (web and mobile) demonstrates loading, empty, no-results and error (via `/__demo/failure-rate`) states.
- All money is in Indian format. All dates are DD MMM YYYY.
- No console errors. axe reports no critical/serious violations.
- Reset demo data (web profile menu or MA-05) restores the seed for both apps.

## 4. Demo script (client walkthrough, ~20 min) [P]
1. Admin dashboard → settings (show the configurable insurance amounts and allocation order).
2. Member Ramaiah → eligibility block. Member Lakshmi → top-up with the agreement example.
3. Sravani accepts the surety → Accountant review → DDO validation → assessment → Approver sanction → Disbursement.
4. Accountant → generate demand sheet → partial recovery for Mahesh → allocation waterfall.
5. Transfer a member and explain the next-cycle behaviour.
6. Reports: Defaulters, Less collections, Retirement → download.

## 5. M10 release checklist
- [ ] All P1 screens built per `06` and listed in `05`
- [ ] All journeys J-01…J-14 green (Playwright / Maestro) + cross-app journey AC-X01
- [ ] Release APK installed and smoke-tested on physical devices
- [ ] Domain tests green, coverage met
- [ ] Responsive and a11y checks done
- [ ] Every PLACEHOLDER value visible and editable in Settings
- [ ] Docs updated (status tracker, decisions, open questions)

## 6. v0.3 additions (paper forms)

### Domain tests
| ID | Case | Expected |
|---|---|---|
| T-BR022-1 | leftover 150 months, Ordinary, tenure 101 | Fail (max 100) |
| T-BR022-2 | leftover 60, tenure 60 | Fail (BR-002). Max shown 59 |
| T-BR023-1 | substantive ₹60,000, deductions ₹12,000, OL dues ₹5,000 | net substantive pay ₹43,000 |
| T-BR025-1 | gross ₹80,000, govt loans ₹6,000, other ₹4,000 | total ₹10,000, net ₹70,000 |
| T-BR024-1 | surety DOR before the projected last instalment | `retiresDuringLoan = true`, warning (not blocking) |
| T-BR026-1 | "member of another credit society with dues" = yes | ineligible with reason |
| T-BR029-1 | ₹10,000 = 500×18 + 200×5 | valid. 500×18 alone → VALIDATION_ERROR |
| T-BR031-1 | the same user signs as Secretary and President | FORBIDDEN |
| T-BR030-1 | send an uncertified sheet | INVALID_TRANSITION |

### Acceptance criteria
- **AC-J15 Join:** Given Divya (new applicant), when she completes MJ-02→MJ-04 and signs with OTP, then ST-14 shows her in "Department verification" for her department's DDO only. After DDO certify → office forward → Secretary → President → share payment, her app shows "Welcome, General No. N" and opens MB-01.
- **AC-J15b Info request:** when the DDO flags item 7a, then Ravi's tracker shows "Action needed: regular appointment date". After he fixes it, the application returns to the DDO.
- **AC-J16 FD:** a member submits an FD request on the phone → the cashier records cash with denominations → Secretary → President accept → the FDR No. appears on the phone and in ST-32. Payout frequency and joint mode are printed on the FDR.
- **AC-J17 Salary loan:** no surety or DDO steps appear. Net substantive pay is computed live. The office-use panel shows OL/SL balances matching the member's loans.
- **AC-J18 Surety:** the surety's particulars are pre-filled from their records. A retiring-during-loan surety sees a warning. The signature record stores the text version and OTP time.
- **AC-SIGN:** every signed step can be printed on the original-layout form twin with "Signed digitally via OTP on <date time>".
- **AC-DES (design):** console and app use Lucide icons and the tokens in `12`. Every nav item has a label. Targets ≥ 24 px (web) / ≥ 48 dp (app). The console passes WCAG 2.2 AA checks.
