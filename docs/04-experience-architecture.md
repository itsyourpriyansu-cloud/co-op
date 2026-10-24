# 04 · Experience Architecture

> Phase 2 · Version 0.2 · 2026-10-24 (updated for D-019 separate member mobile app)
> Navigation, journeys, interaction states, errors and alternative paths. Screen IDs are defined in `05-screen-inventory.md`.

## 1. Experience model [D-019, D-021]

Two client apps, one shared mock API:

| App | Users | Layout | Device |
|---|---|---|---|
| **Admin Console** (React + Vite) | R1–R5 | Left sidebar + top bar (search, notifications, profile) + content | Desktop / laptop (≥1280 px). Usable at 1024 |
| **Member App** (Expo React Native, Android APK) | R6 | Native app: header + bottom tab bar (Home, Loans, Deposits, Payments, More) | Android phones (360–412 dp wide) |

Both apps share design tokens, types, the domain engine (for previews) and the mock API, so a hand-off from one app shows up live in the other.

## 2. Navigation per role

### Admin Console sidebar (items appear only when permitted)

| Item | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Joining (membership applications, badge) | ✓ | ✓ | ✓ | ✓ | ✓ (dept) |
| Work Queue (badge = pending count) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Members | ✓ | ✓ | ✓ | ✓ | ✓ (dept) |
| Loans | ✓ | ✓ | ✓ | ✓ | ✓ (dept) |
| Deposits | ✓ | ✓ | ✓ | ✓ | — |
| Demand & Collections → Demand Sheets, Payments | ✓ | ✓ | view | view | Demand Sheets (dept) |
| Reports | ✓ | ✓ | ✓ | ✓ | — |
| Settings | ✓ (edit) | view rates | view rates | view rates | view rates |

Top bar: global member search (name / member no. / employee ID / mobile), Notifications bell (ST-03), "Send message" (Email/WhatsApp simulated composer), profile menu (ST-04, Logout, *Demo: switch persona*).

### Member App

Bottom tabs: **Home** (MB-01) · **Loans** (MB-03) · **Deposits** (MB-08) · **Payments** (MB-10) · **More** (Profile MB-02, Surety Requests MB-07, Calculators MB-11, Notifications MB-12, Help MB-13, Settings MB-14, Logout).

### Sitemap

Admin Console (React Router):
```
/login  /forgot-password
/app
  /dashboard
  /queue
  /members  /members/new  /members/:id  /members/:id/edit
  /loans?type=&status=  /loans/new?type=  /loans/topup/new?from=:loanId  /loans/:id   (stage panels open as ?action=review|ddo|assess|sanction|disburse)
  /deposits?scheme=  /deposits/new?scheme=  /deposits/:id
  /demand-sheets  /demand-sheets/generate  /demand-sheets/:id  /demand-sheets/:id/recovery
  /payments  /payments/new  /payments/:id
  /reports  /reports/:reportKey
  /settings/general|users|permissions|notifications|loan-products|deposit-schemes|insurance-demand|departments
  /notifications  /profile
/403  /404  /error
```

Member App (Expo Router):
```
(auth)/login  (auth)/activate  (auth)/forgot-password  (auth)/demo-settings
(tabs)/home
(tabs)/loans            → loans/[id], loans/apply, loans/topup/[loanId]
(tabs)/deposits         → deposits/[id]
(tabs)/payments         → payments/receipt/[id]
(tabs)/more             → profile, surety, calculators, notifications, help, settings
```

## 3. Key user journeys

Each journey must be demoable end to end with mock data (see `15-test-plan-acceptance.md`).

### J-01 Member applies for an Ordinary Loan [A][F]
1. MB-01 Home → "Apply for loan" → MB-05 step 1 **Loan type** (product cards with rate, max amount, max tenure).
2. Step 2 **Requirements**: amount, tenure (months), purpose. A live **eligibility panel** shows remaining service vs tenure (BR-002), indicative EMI (BR-006) and share deduction preview (BR-004).
3. Step 3 **Sureties**: search members, add N sureties (N from settings, Q-104). Each card shows the surety's name, department and left-over service (REQ-021).
4. Step 4 **Review & declaration** → Submit → success screen with application no. → status `SURETY_PENDING`.
- *Alt:* tenure ≥ remaining service → inline error, Submit disabled, suggestion "Max tenure available: X months".
- *Alt:* member has an active Ordinary loan → banner "You have an active loan — apply for a Top-up instead" → J-07.
- *Alt:* save as draft and leave → draft appears in MB-03 under "Drafts".

### J-02 Surety confirms [F]
1. Surety gets a notification → MB-07 Surety Requests → request card (applicant, amount, tenure, their own liability).
2. Accept (declaration checkbox) / Decline (reason).
- When all sureties accept → `ACCOUNTANT_REVIEW` and the applicant is notified.
- *Alt:* any decline → applicant notified → applicant replaces the surety from MB-04 → back to `SURETY_PENDING`.

### J-03 Accountant review [F]
ST-02 Work Queue (filter "Accountant Review") → ST-23 Loan Detail → ST-24 Review panel: checklist (documents verified, member details current, sureties valid, system eligibility checks all green) → **Forward to DDO** / **Return to applicant** (reason) / **Reject** (reason).

### J-04 DDO validation [F]
- DDO (R5): Work Queue shows only their department → ST-25 panel: confirm employment and salary recovery feasibility → **Yes** (validated) / **No** (reason).
- Accountant "DDO Manual" variant [P interpretation, Q-102]: the accountant records an offline DDO validation by entering the DDO name, date, reference no. and an uploaded letter.

### J-05 Assessment [F] (owner per Q-113, proposed: Accountant)
ST-26 panel shows the system-computed **Sanction Sheet**: approved amount, rate, tenure, EMI and schedule preview, share-deposit deduction (BR-004), top-up settlement (BR-007), insurance impact (BR-008), **net disbursable amount**. Accountant may reduce the amount or tenure (re-validated) → **Send for sanction**.

### J-06 Sanction [F]
Approver: Work Queue → Loan Detail → ST-27: Sanction Sheet (read-only), member exposure, surety summary, history → **Yes, sanction** (remarks) / **No, reject** (reason, mandatory). The member is notified either way (F p4: No → Member Index).

### J-07 Top-up [A][F]
Member (MB-06) or staff (ST-22) selects an active Ordinary loan → enters new loan amount and tenure → system shows: outstanding principal, interest accrued to today (BR-007), existing share deposit, additional share deduction (BR-004), net amount. The application then follows J-02 → J-06. On disbursement the old loan is closed by settlement.

### J-08 Disbursement [F]
Disbursement Officer: Queue → ST-28: net amount, payee bank details, mode (NEFT / Cheque / Transfer), reference no., date → **Confirm disbursement**. Loan → `ACTIVE`. Schedule is generated, share deposit is credited, and for a top-up the previous loan is `CLOSED_BY_TOPUP`. Member is notified.

### J-09 Member onboarding by staff [A][P]
ST-10 → New → ST-11 form (Personal, Employment & Service, Nominee, Shares, Documents) → Save → ST-12 Profile. Member then installs the app and activates their account via MA-02 (Employee ID + mobile OTP).

### J-10 Monthly demand & recovery [A]
1. ST-41 Generate: select month, all/selected departments → preview totals by department → Generate.
2. ST-42 Department sheet: rows per member with columns RRF, Insurance, CRD, (SRDS?), Penal, Interest, Principal per loan, Total → Export / "Send to DDO" (simulated).
3. ST-43 Recovery entry: enter the recovered amount per member (or "Mark all as fully recovered", or a simulated file import) → **allocation preview** per member in priority order (BR-011) → Post → receipts created, ledgers updated. Short recoveries are flagged and feed the Less Collections and Defaulters reports.

### J-11 Department transfer [A]
ST-12 → Transfer → choose new department and effective date → confirmation explains "The member will appear under *New Dept* from the *next* demand sheet (Month YYYY)". The service history logs the event.

### J-12 Open FD [A][F]
ST-30 FD tab → New → member, amount, tenure → rate auto-picked from slabs (ST-65) → maturity preview → Save → ST-32.

### J-13 Reports [A][F]
ST-50 catalogue (grouped: Collections, Loans, Deposits & Shares, Members, Accounting) → ST-51 viewer with filters (period, department, loan type) → table with totals → Download PDF / Excel (simulated file generation).

### J-14 Member self-service [A]
MB-01 Home: share capital, deposit total, active loans with outstanding and next EMI, this month's demand, pending actions (surety requests) → calculators → statements.

## 4. Loan stage visibility (what each party sees)

Every Loan Detail page and member loan view shows a **status timeline** (stepper): Submitted → Surety → Accountant Review → DDO Validation → Assessment → Sanction → Disbursed. Each completed step shows actor, role, timestamp and remarks. Members see the stage name and date but not internal remarks [P].

## 5. Dashboards per role [P]

| Role | Widgets |
|---|---|
| R1 Admin | KPI tiles (members, active loans, outstanding, deposits, this month's collection %) · pipeline by stage · monthly collections trend · department-wise less-collection top 10 · retirements in next 6 months |
| R2 Accountant | My queue counts (review, DDO manual, assessment) · demand sheet status for the current month · recoveries pending posting · recent applications |
| R3a Secretary / R3b President | Awaiting my signature (loans, FDs, memberships), each with count and amount · signed this month · oldest pending |
| R4 Disbursement | Awaiting disbursement (count, amount) · disbursed this month · list |
| R5 DDO | My department: pending validations · members count · current month's demand vs recovered |
| R6 Member | (MB-01) as in J-14 |

## 6. Global interaction states (every screen)

| State | Pattern |
|---|---|
| Loading | Skeletons matching the layout (tables: 8 skeleton rows). Never a blank page |
| Empty (no data yet) | Illustration + one-line explanation + primary action (e.g. "No loans yet · Apply for a loan") |
| No results (filters) | "No matches for these filters" + Clear filters |
| Error (service failure) | Inline error card with Retry. Forms keep the user's input |
| No permission | SYS-01 page, or a disabled action with a tooltip explaining why |
| Not found | SYS-02 |
| Submitting | Button spinner + disabled. Prevent double submit |
| Success | Toast + navigate or update in place. Financial postings also show a confirmation summary |
| Destructive or irreversible (sanction, disburse, post recovery, reject) | Confirmation dialog that restates amounts and the consequence |
| Validation | Inline per field on blur + summary at top on submit. Money fields are formatted live |
| Stale data (another persona changed it) | "This loan was updated by X — reload" banner [P] |
| Demo mode | Persistent small "Demo data" badge. Web profile menu / mobile MA-05 → Reset demo data (resets the shared server) |
| Offline (mobile) | MA-04 full-screen state when the server is unreachable. Inline banner for transient failures |

## 7. Error & alternative paths catalogue

| ID | Situation | Behaviour |
|---|---|---|
| E-01 | Tenure ≥ remaining service | Block, show max allowed tenure (BR-002) |
| E-02 | Member missing DOR or DOJ | Block application: "Service details incomplete — contact society office" (staff see "Complete member profile" link) |
| E-03 | Surety ineligible (self, retired, over the surety limit, Q-104) | Cannot add, with the reason shown |
| E-04 | Surety declines | Applicant must replace. Loan stays `SURETY_PENDING` |
| E-05 | Accountant returns application | Status `RETURNED`. Member edits and resubmits. Sureties re-confirm only if the amount went up [P] |
| E-06 | DDO says No / Approver says No | `REJECTED` (terminal). Member can start a new application [P] |
| E-07 | Member withdraws before sanction | `WITHDRAWN` (terminal) |
| E-08 | Top-up requested on a loan not `ACTIVE` | Option hidden. Deep link shows an explanation |
| E-09 | Recovery amount > demand | Warn. Excess handling per Q-309 (placeholder: hold as unallocated credit) |
| E-10 | Demand sheet already generated for month+dept | Generate disabled. Offer "View" or "Regenerate (draft only)" |
| E-11 | Posting recovery on a sheet already posted | Block |
| E-12 | Member transferred after the sheet is generated | Stays on the old department's current sheet. Moves next cycle (BR-010) |
| E-13 | Session expired (simulated) | Redirect to login with return URL |
| E-14 | Mock service random failure (demo toggle) | Error state + Retry (proves the error UI) |

## 8. Update v0.3: paper-form journeys

> The columns R1–R5 in the §2 sidebar table now read: R1 Admin, R2 Accountant, R3 Secretary/President, R4 Cashier/Disbursement, R5 DDO. J-06 is now a **two-step sign-off**: the Secretary signs, then the President (D-027). Both see the same drawer, and the President also sees the Secretary's remarks.

### J-15 Join the society (applicant, D-026)
1. Install the app → **MJ-01 Welcome** → "Become a member".
2. **MJ-02** mobile + OTP + name → **MJ-03** eligibility (3 yes/no questions with "why we ask"). A "No" shows a polite explanation and the office contact, and stops.
3. **MJ-04** wizard (save and resume any time): Personal → Address (present/permanent, "same as") → Employment (department picker, designation, regular appointment date or approved-probationer service) → Shares & Nominee (shares × share value = amount, nominee) → Documents (camera/file) → Declarations (bye-laws key points + full text, no other society) & **Salary Recovery Agreement** (full text) → Review → **Sign with OTP**.
4. **MJ-05 tracker:** ① Received ② Department verification ③ Office review ④ Approval (1 of 2 signatures) ⑤ Share payment ⑥ Welcome + General No. Each change sends a push-style in-app notification [P].
- *Alt:* DDO/office requests info → tracker shows "Action needed" with a deep link to the exact field/document → resubmit.
- *Alt:* rejected → reason + office contact. The applicant can re-apply after correction [P].
- Staff side: DDO certifies in ST-16 → Accountant reviews ST-15 → Secretary/President approve in ST-17 → Cashier records the share payment (ST-45), or the accountant marks "deduct from first salary" → system allots the General No.

### J-16 Open an FD from the app (D-028)
MB-08 → "Open FD" → **MB-15**: amount (+ words) → period (slab picker shows the rate) → payout (Monthly / Quarterly / Half-yearly / On maturity) → holders (only me / add joint holder / for a minor + guardian) → nominee → FD rules (4, verbatim) → Sign with OTP → REQUESTED with payment instructions (pay at the counter, or transfer to the society account with a reference). Cashier records the payment (ST-33/ST-45 with denominations) → Secretary accepts → President accepts → FDR appears in MB-09 (shareable PDF).

### J-17 Salary loan (F3)
MB-05 → Salary loan → pay details: substantive pay (pre-filled), compulsory deductions (Insurance, GPF, Income Tax, other), Ordinary-loan dues (auto) → **net substantive pay computed live** → net pay earned up to date → amount (limit hint, Q-502) → purpose → authorise recovery (Sign with OTP) → submit. No sureties, no DDO step (D-030). Accountant reviews the **office-use panel** (OL/SL balance, interest, total, dates, surety recoveries) → Secretary → President → Cashier disburses.

### J-18 Surety signs (F2 items 9–12)
Notification → MB-07 request → loan summary + "Your particulars as they will appear on the application" (auto-filled: pay, shares, retirement-during-loan flag, existing guarantees) → "Details correct" / "Request correction" → read the joint recovery undertaking → Sign with OTP. Under 1 minute (target `12` §9).

### J-19 DDO certifies (F1/F2 certificates)
DDO console Queue (own department only): membership applications (items 1–7) and loan applications (items 1–5). ST-16/ST-25 drawer shows each item with ✓ / "needs correction" toggles, plus the recovery agreement → **Certify** (records name, designation, department, time = digital seal) or **Return** with a reason.
