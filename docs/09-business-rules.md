# 09 · Business Rules

> Version 0.6 · 2026-10-25
> **Only rules tagged [A] are confirmed.** Everything else is a configurable placeholder, so the prototype can show numbers. Placeholders must never be presented to the client as society policy.
> Each rule maps to a pure function in `packages/domain` and a settings key.

## Rule index

| ID | Rule | Status | Function | Settings key |
|---|---|---|---|---|
| BR-001 | Left-over service | [A] field / [P] calc | `calculateLeftoverService` | `retirementAge` |
| BR-002 | Remaining service must exceed tenure | **[A]** | `checkTenureEligibility` | — |
| BR-003 | Service data auto-sourced from Member Master | **[A]** | — | — |
| BR-004 | Share deposit deduction 10% with netting | **[A]** Ordinary / [UNKNOWN] others | `calculateShareDeduction` | `loanProduct.shareDepositPercent` |
| BR-005 | Share deposit interest annually | **[A]** frequency / [UNKNOWN] rate & method | (P2) | `shareDepositInterestRate` |
| BR-006 | EMI by reducing balance | **[A]** / [UNKNOWN] variant | `calculateEmi`, `generateSchedule` | `loanProduct.emiMethod` |
| BR-007 | Top-up settlement incl. interest to date | **[A]** / [UNKNOWN] accrual basis | `calculateAccruedInterest`, `calculateTopupSettlement` | `interestAccrualBasis` |
| BR-008 | Insurance contribution amounts | **[A]** amounts / [UNKNOWN] frequency | `calculateInsuranceDue` | `insurance.*` |
| BR-009 | Department-wise demand sheet | **[A]** / [P] composition | `buildDemandComponents` | `rrfMonthly`, `crdMonthly`, `srdsMonthly`, `insurance.*` |
| BR-010 | Transfer effective next cycle | **[A]** | `departmentForCycle` | — |
| BR-011 | Partial recovery allocation priority | **[A]** / [UNKNOWN] gaps | `allocateRecovery`, `allocateArrears` (counter / reported payments, oldest month first, D-061) | `allocationOrder` (locked) |
| BR-012 | Penal charges | [UNKNOWN] | (inside BR-009) | `loanProduct.penalRatePercent` |
| BR-013 | Loan approved by authorised personnel through stages | **[A][F]** | `loanActionsFor`, `nextLoanStatus` (+ FD `depositActionsFor`/`nextDepositStatus`, demand `demandSheetActionsFor`) | `permissions` |
| BR-014 | Surety rules | [PF] particulars / [P] limit 2 open guarantees (D-055) | `checkSuretyEligibility` | `loanProduct.suretiesRequired`, `maxGuaranteesPerSurety` |
| BR-015 | Deposit / Share capital loan margin | [A] exists / [P] 90% (D-055) | `checkDepositLoanLimit` | `loanProduct.depositMarginPercent` |
| BR-016 | Product limits (amount, tenure) | [P] (D-055) | `checkProductLimits` | `loanProduct.minAmount`, `max*` |
| BR-017 | FD maturity | [F] rates / [UNKNOWN] compounding | `calculateFdMaturity` | `depositScheme.*` |
| BR-018 | Concurrent loans per member | [P] 1 per product, 2 deposit loans (D-055) | `checkConcurrentLoans` | `loanProduct.maxConcurrent` |
| BR-019 | Segregation of duties | [P] | guards | `permissions` |
| BR-020 | Due / Defaulter definition | [P] short in the last 3 cycles in a row (D-055) | `checkDefaulter` | `defaulterCycles` |
| CAP-1 | Repayment capacity | [P] first EMI ≤ 50% of net salary, **warning only** (D-055) | `assessLoanApplication` | `emiToNetSalaryMaxPercent` |
| BR-021 | Insurance eligibility from service period | [A] exists / [UNKNOWN] rule | — | — |

---

## BR-001 Left-over service
- Source: DOR is an entered field [A]. "Left over Service" is listed as a field [A].
- **Proposed calculation [P]:** `leftoverMonths = full months between demoToday and DOR` (floor). Display `X yrs Y mths`. Recomputed on every read, never stored.
- **Proposed check [ASSUMPTION]:** if `retirementAge` is configured (Telangana government retirement age is understood to be 61; confirm, Q-314), warn when DOR ≠ last day of the month in which the member reaches that age. Warn only, never auto-change.

## BR-002 Tenure eligibility [A]
> "Loan approval will be permitted only when the member's remaining service period exceeds the requested loan tenure."
- `eligible = leftoverMonths > tenureMonths` (strictly greater).
- Evaluated at application, at assessment (with the sanctioned tenure) and at sanction (date may have moved).
- UI shows the maximum allowed tenure = `leftoverMonths − 1`, capped by the product max tenure.

## BR-003 Service data source [A]
Service period values in a loan come from Member Master and are read-only in loan forms. Override is UNKNOWN (assume none).

## BR-004 Share deposit deduction [A]
> Ordinary Loan: "10% of the sanctioned loan amount will be deducted and credited to the member's Share Deposit account." Top-up: "consider the existing Share Deposit balance before deducting the required 10%."
```
required  = shareDepositPercent × sanctionedAmount        (Ordinary: 10%)
deduction = max(0, required − existingShareDepositBalance)
```
- Worked example [A]: existing share deposit ₹1,000, new loan ₹20,000 → required ₹2,000 → deduction ₹1,000. **Must be a unit test.**
- Credited to ShareAccount.shareDepositBalance on disbursement.
- Applies to Salary / Education / Deposit loans? → UNKNOWN (Q-304). Placeholder: 0% for non-Ordinary.
- Rounding: nearest rupee [P].

## BR-005 Share deposit interest [A]
"Calculated annually." Rate, balance basis (minimum / average / closing) and posting date are UNKNOWN (Q-305). Prototype shows seeded historical interest entries only. No calculation (P2).

## BR-006 EMI: reducing balance [A]
The agreement says "Reducing Balance (Reducing Principal) method". Two common interpretations give **different numbers** (Q-302):

| Method | Formula | Instalment |
|---|---|---|
| `AMORTIZED` (equated EMI) | `EMI = P·r·(1+r)^n / ((1+r)^n − 1)`, `r = annualRate/1200` | Constant |
| `EQUAL_PRINCIPAL` (fixed principal + interest on reducing principal) | `principal_k = P/n`, `interest_k = outstanding_k × r` | Declining |

- The engine implements both. Default placeholder = `EQUAL_PRINCIPAL` (closest to the literal "Reducing Principal" wording) until Q-302 is answered.
- Rounding [P]: instalment components rounded to the nearest rupee. The final instalment absorbs the rounding difference.

## BR-007 Renewal / Top-up settlement [A]
> "Outstanding interest will be calculated up to the current date before settlement of the existing loan."
```
accruedInterest = outstandingPrincipal × annualRate/100 × days(lastInterestChargedOn → today)/365   [P: actual/365 placeholder, Q-303]
settlement      = outstandingPrincipal + accruedInterest (+ unpaid demanded dues? Q-315)
netDisbursable  = newSanctionedAmount − settlement − shareDeposit deduction (BR-004) − otherDeductions (Q-311)
```
- If `netDisbursable ≤ 0` → block with the message "New amount does not cover settlement".
- On disbursement: old loan → `CLOSED_BY_TOPUP`, schedule rows marked settled.

## BR-008 Insurance contribution [A]
- Amounts configurable. Defaults: **Non-loanee ₹200, Loanee ₹1,000** [A].
- Reflected in the demand sheet [A].
- Loanee definition [P]: member with ≥ 1 loan in `ACTIVE` status at demand generation.
- Frequency UNKNOWN (Q-306). Placeholder: once a year, in the configured collection month (default April).

## BR-009 Demand sheet generation [A department-wise / P composition]
For cycle `YYYY-MM` and department D, include every `ACTIVE` member whose department **effective for that cycle** is D (BR-010). Proposed line heads:

| Head | Amount source | Status |
|---|---|---|
| RRF | `settings.rrf.amount` | Head [A]. Meaning and amount UNKNOWN (Q-301). Placeholder ₹100/month |
| Insurance | BR-008 when the cycle is a collection month | [A] |
| CRD | monthly contribution of the member's active CRD account | Head [A]. Amount rule UNKNOWN. Placeholder ₹500 |
| SRDS | monthly contribution if the member has SRDS | Scheme [A]. Not in the allocation order → UNKNOWN (Q-309) |
| Penal | BR-012 | Placeholder 0 |
| Interest | per active loan, from the schedule row for the cycle | [A] head |
| Principal | per active loan, from the schedule row for the cycle | [A] head |
| Arrears | unpaid components of earlier cycles | UNKNOWN (Q-316). Placeholder: carried forward as separate lines |

Generation is idempotent per (cycle, department) (E-10).

## BR-010 Department transfer [A]
> "The member will automatically appear under the new department in the next Demand Sheet generation cycle."
- Transfer recorded with `effectiveCycle = first cycle whose sheet has not yet been generated for the member's old department` [P interpretation].
- Sheets already generated are never changed.

## BR-011 Partial recovery allocation [A]
> "Where the recovered amount is less than the total demand, the system will automatically allocate the received amount according to the predefined priority sequence."

```
1. RRF
2. Insurance
3. CRD
4. Penal Charges
5. Interest Amount
6. Principal Amount (Education Loan, Salary Loan, Ordinary Loan)
```
Algorithm:
```
remaining = recovered
for component in components sorted by (rank, loanTypeOrder):
    alloc = min(remaining, component.unpaid)
    component.allocated += alloc ; remaining -= alloc
if remaining > 0 → excess handling (Q-309; placeholder: unallocated credit on member)
```
- `loanTypeOrder` within Principal: Education → Salary → Ordinary [A, read as a priority order. Confirm in Q-309].
- Interest across multiple loans: same loan-type order [P, Q-309].
- Deposit/Share Capital loan and SRDS positions: UNKNOWN. Placeholder: Deposit loan after Ordinary. SRDS after CRD.
- Unit test required: the A §3.6 order with a ₹ amount that stops mid-way through Interest.

## BR-012 Penal charges [UNKNOWN]
Trigger, rate and base are UNKNOWN (Q-307). Placeholder: disabled (0%). The head still appears so the allocation order is demonstrable when the seed injects penal amounts.

## BR-013 Approval workflow [A][F]
Approval by authorised personnel [A], via the stage sequence in `10-workflows.md` [F]. Every transition is recorded as a LoanEvent.

## BR-014 Sureties [UNKNOWN]
Placeholders (Q-104): 2 sureties for Ordinary/Salary/Education, 0 for Deposit loans. A surety must be an `ACTIVE` member, not the applicant, with left-over service ≥ loan tenure [P], and on at most 3 active loans as surety [P].

## BR-015 Deposit / Share capital loan
Loan amount ≤ `depositMarginPercent × pledged deposit balance`. Margin UNKNOWN (Q-311). Placeholder 90%.

## BR-016 Product limits [UNKNOWN]
Max amount and max tenure per product come from settings (Q-311). Placeholder values live in `13-mock-data-spec.md` §3 and are marked "placeholder".

## BR-017 FD maturity
Rate picked from the slab matching the tenure [F]. Compounding UNKNOWN (Q-313). Placeholder: quarterly compounding `A = P(1 + r/400)^(4·years)`.

## BR-018 Concurrent loans [UNKNOWN]
Placeholder: one active loan per product type. A second Ordinary loan must be a Top-up.

## BR-019 Segregation of duties [P]
See `03-roles-permissions.md` §3.

## BR-020 Due / Defaulter [UNKNOWN]
Placeholder: *Due* = unpaid amount in the latest posted cycle. *Defaulter* = unpaid in ≥ 3 consecutive posted cycles (Q-310).

## BR-021 Insurance eligibility via service period [A mention / UNKNOWN rule]
The agreement says service period is used for insurance eligibility, but gives no rule. Placeholder: none applied. Q-306.

---

## v0.3: rules from the paper forms [PF] (doc 16)

| ID | Rule | Status | Function | Settings key |
|---|---|---|---|---|
| BR-022 | Ordinary/Education: instalments ≤ 100 | **[PF]** | `checkTenureEligibility` (extended) | `loanProduct.maxInstalments` |
| BR-023 | Salary loan net substantive pay | **[PF]** formula / [UNKNOWN] limit | `calculateSalaryLoanNetPay` | `salaryLoan.limitRule` |
| BR-024 | Surety retiring during the loan | **[PF]** flag / [UNKNOWN] effect | `checkSuretyRetirement` | `surety.retiringPolicy` |
| BR-025 | Net salary (Ordinary/Education) | **[PF]** formula / [UNKNOWN] capacity rule | `calculateNetSalary` | `loan.capacityRule` |
| BR-026 | Membership eligibility | **[PF]** | `checkMembershipEligibility` | — |
| BR-027 | FD payout, joint/minor, acceptance, interest ceases at maturity | **[PF]** | `calculateFdMaturity` (extended) | `depositScheme.payoutOptions` |
| BR-028 | Salary-recovery mandate required. Transfer → new DDO agrees | **[PF]** | mandate guards | — |
| BR-029 | Cash denominations total = amount | **[PF]** | `validateDenominations` | `cash.denominations` |
| BR-030 | Demand sheet certified before sending | **[PF]** | sheet guard | — |
| BR-031 | Sequential Secretary → President sign-off, different users | **[PF] + D-027** | approval guard | `loanProduct.signOffSteps` |
| BR-032 | Share capital on joining = shares × share value; shares 10–100 | **[P] D-053/D-054** (Q-506) | `membershipShareAmount` | `settings.shareValue`, min/max shares |

### BR-022 Maximum instalments [PF F2 item 11]
`tenureMonths ≤ min(100, product.maxTenure, leftoverMonths − 1)`. The "−1" comes from BR-002 (remaining service must *exceed* tenure). The UI shows which limit is binding.

### BR-023 Salary loan net pay [PF F3 item 8]
`netSubstantivePay = substantivePay − Σ compulsoryDeductions − ordinaryLoanDuesThisMonth` (Col 5 − Col 6 − Col 7). Ordinary-loan dues come from the active schedule. **Limit UNKNOWN (Q-502)**. Placeholder: `amount ≤ netPayEarnedToDate`, recovered in full in the next cycle.

### BR-024 Surety retiring during the loan [PF F2 item 9(l)]
`retiresDuringLoan = surety.dor < lastInstalmentDate(projected)`. **Placeholder:** warning shown to the applicant, surety and accountant. Not blocking (Q-504). *Replaces the v0.1 BR-014 placeholder that required surety left-over service ≥ tenure.* The other BR-014 placeholders remain: active member, not the applicant, max 3 active guarantees.

### BR-025 Net salary [PF F2 item 5]
`totalDeductions = govtLoanDeductions + otherLoanDeductions` (society loans excluded, as the form states). `netSalary = grossSalary − totalDeductions`. The UI shows `EMI / netSalary` as information. Blocking rule UNKNOWN (Q-503).

### BR-026 Membership eligibility [PF F1]
Eligible if **all** hold: (1) employed in a Telangana Secretariat department; (2) regular appointment, or approved probationer (service stated); (3) not a member of any other co-operative credit society and no dues payable to one; (4) accepts the bye-laws. Also age ≥ 18 [P]. Duplicate check on mobile / employee ID against members and open applications [P]. Minimum shares, share value and admission fee are UNKNOWN (Q-506) → settings placeholders (1 share × ₹PLACEHOLDER).

### BR-027 Fixed deposit [PF F4]
- Payout frequency ∈ {Monthly, Quarterly, Half-yearly, On maturity}. Periodic payout amount = simple interest for the period [P, Q-313]. On maturity = compounding per Q-313 (placeholder quarterly).
- Interest **ceases from the maturity date** (rule 2). No interest accrues after maturity unless renewed.
- Joint: up to 3 holders [P]. Payment to either/any one or the survivor discharges the society (rules 3–4) → operation mode stored and printed on the FDR.
- Minor: guardian declaration. Majority date = minor's 18th birthday [P].
- Acceptance: Secretary → President (BR-031). FDR No. is issued only after both.
- The society is not bound to give maturity notice (rule 1). The app still sends reminders as a courtesy [P].

### BR-028 Recovery mandate [PF F5 F6]
- Required before membership activation, and before loan disbursement for applicants **and sureties**.
- Must be AGREED by the member's current DDO. After a transfer, the status is `PENDING_NEW_DDO` until the new DDO agrees (warning on new loans, not blocking [P]).
- Covers salary recovery and recovery from gratuity at retirement/death (used by the P2 settlement letter, Q-513).

### BR-029 Cash denominations [PF F4]
`Σ(denomination × count) = amount`. Default denominations 500/200/100/50/20/10 (configurable). Coins are not listed on the form [P: add "coins" row].

### BR-030 Demand certification [PF F6]
A sheet must be `CERTIFIED` (officer name + time) before `SENT_TO_DDO`. Certified sheets are immutable (corrections via a supplementary sheet [P]).

### BR-031 Sequential sign-off [PF + D-027]
Steps come from config (default SECRETARY → PRESIDENT). Each step needs a user with that title. The same user cannot sign two steps. A rejection at any step is terminal for loans and memberships, and triggers a refund for FDs.

### BR-032 Share capital on joining [P, D-053]
Amount due = shares proposed × `settings.shareValue` (placeholder ₹100). Shares must be between 10 and 100 (placeholder; Q-506). Paid either at the counter (cashier receipt → membership starts on receipt) or recovered on the first salary demand (membership starts at activation; share capital shows ₹0 until the demand is recovered). No admission fee in the prototype (unknown, Q-506).

### BR-033 Member app account [P, D-062]
Sign-in with General No. or Employee ID + password. Password rule PW-1 ≥ 8 characters, PW-2 letters and numbers, PW-3 must not contain the member's General No., Employee ID or mobile (values of 4+ characters); strength score 0–4 for the meter (`checkPassword`). Activation needs the Member Master mobile to match; one activation per member. A reset signs out every session; a change signs out the other sessions. In-app notifications always on; SMS / WhatsApp / Email are member preferences (simulated delivery).

### BR-034 Reports and messages [P, D-063]
Report figures come from the posted demand sheets and ledgers. Unpaid = demand − allocated (counter and verified member payments included, D-061). Defaulter (BR-020) = short in the last `settings.defaulterCycles` posted cycles in a row; the report filter can lower or raise it. Messages to members are simulated: SMS ≤ 480 characters, Email needs an email on the profile, every message also lands in the member's in-app notifications. Placeholders `{name} {generalNo} {department} {overdue} {cycle} {dor}`.
