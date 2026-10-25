# Open Questions

> Version 0.3 · 2026-10-25
> Asked in logical batches. **Batch 1 blocks the build.** Batches 2–4 block only the features listed in "Blocks". Until they are answered, the prototype uses the configurable placeholders in `09`/`13`.
> Owner: **E** = Envizon (you) · **S** = Society (TGSECCSL) · **F** = Fusil Solutions
> Status: Open · Answered (→ D-xxx) · Parked

## Batch 1: Scope & platform (blocks M0)

| ID | Question | Why it matters | Options / proposal | Owner | Blocks | Status |
|---|---|---|---|---|---|---|
| Q-001 | Which scope: **Lean** (23 pages), **MVP** (51 pages + 8 reports), or **Full** (53 pages + 22 reports)? | Sizes the whole plan | Recommend MVP (D-017) | E | all | **Answered: MVP → D-023, recounted in D-036 (63 screens)** |
| Q-002 | Member app: responsive mobile-first web inside the same app, or a separate native/mobile codebase? | Doubles effort if separate | Recommend responsive web (D-004) | E/F | M0, M8 | **Answered: separate app, Expo RN, Android APK → D-019, D-020, D-022** |
| Q-003 | Tech stack approval (or a mandated stack from Fusil?) | Foundation | D-008 | E/F | M0 | **Answered: React + Vite + shadcn → D-008** |
| Q-004 | Reports depth: 8 fully designed + catalogue, or all 22? | Effort in M9 | Recommend 8 (D-013) | E | M9 | Open |
| Q-005 | Who builds the production backend? Does Fusil already have an ERP product with its own data model/API that this UI must match? | If yes, `08`/`11` must align to it before M1 | — | F | M1 | Open |
| Q-006 | Can you share agreement pages 1 and 6–10? | May contain timelines, tech environment, acceptance terms | — | E | — | Open |
| Q-007 | What does the society use today (registers, Excel, software)? Samples of a demand sheet, a loan application form, a sanction letter and a DDO recovery statement? | Realism of mock data, report layouts, import format | — | S | M7, M9 | Open |
| Q-008 | Branding (society logo, colours, registration no.) and language (English only, or Telugu too)? | Design tokens, letterhead, i18n | Placeholder tokens in `12` | S | M0 | **Partly answered:** Regd. No. P-929 and address from the forms. Logo = official seal (D-052). Colours (keep Blend blue or match the seal navy `#012258`) and Telugu still open |
| Q-010 | Where does the shared mock API run during client demos? (a) on the presenter's laptop, with the APK pointed at its Wi-Fi IP, or (b) a small hosted demo server, so the APK works anywhere | The APK cannot reach `localhost`. Hosting has a cost and a hosting choice | Support both: server URL configurable in a hidden demo-settings screen | E | M8, M10 | Open |
| Q-011 | Mobile app identity: app name, Android package ID (e.g. `in.tgseccsl.member`), icon, splash | APK build | Name "TGSECCSL" (`app.json`), package `in.tgseccsl.member` | S/E | M8 | **Partly answered:** icon and splash = society seal (D-052). Package ID still to confirm |
| Q-009 | Purpose and date: is this prototype for client sign-off / demo, or the base for the production frontend? Any deadline? | Code quality bar and sequencing | — | E | plan | Open |

## Batch 2: Roles & workflow (blocks M4, M5, M8)

| ID | Question | Proposal | Owner | Blocks | Status |
|---|---|---|---|---|---|
| Q-101 | Who is the DDO: the government department's Drawing & Disbursing Officer (not necessarily a member)? One DDO user per department? Can a DDO also be a member? The diagram gives DDOs signup and loan application flows | DDO = staff user scoped to one department | S | M5 | **Partly answered by forms:** DDO = Asst. Secretary to Govt / Section Officer (Claims) of the department. Certifies membership items 1–7 and loan items 1–5, and agrees salary-recovery mandates. Admin Console user. Still open: one or more per department? |
| Q-102 | What is "DDO Manual" in the Accountant flow? | Accountant records an offline DDO validation (name, ref, letter) | S/F | M5 | **Answered → D-059** |
| Q-103 | Login method per role (password, mobile OTP, Employee ID)? | Staff: user ID + password. Members: Employee ID/Member No. + password, OTP for activation/reset | S/F | M0 | Open |
| Q-104 | Sureties: how many per loan type? Eligibility (active member, service left, max loans guaranteed)? Does the surety confirm in the app, or does staff record a signed form? | Placeholder BR-014. In-app confirmation | S | M4, M5 | **Partly answered (F2):** sureties sign the joint recovery undertaking. The form captures pay, shares, retirement and existing surety obligations. Count and limits still open (Q-504) |
| Q-105 | Should members self-register at all? What is "Preference Signup"? | Activation only (D-009) | E/S | M8 | **Answered: activation only → D-009**. Preference Signup split out to Q-116 |
| Q-106 | Loan types: the agreement lists Ordinary, Salary, Education, Deposit/Share Capital. The diagrams list Ordinary, Educational, Other. Is "Other" = Salary + Deposit/Share Capital? Any more types? | 4 types as tabs + Top-ups | S | M4 | **Partly answered:** Ordinary & Education share one form. Salary loan has its own form. Deposit/Share Capital loan form not seen |
| Q-107 | Member "Payment / Index → Edit → New": what can a member do here? | Read-only statements (D-010) | E | M8 | **Answered → D-043** (view + report a payment, cashier verifies) |
| Q-108 | Settings editing rights: Admin only, or also the Accountant (diagram p3 says "Accountant Only")? Should members see rates? | Admin edits. Others view rates read-only | S | M2 | **Answered → D-056** |
| Q-109 | Why does the FD List lead to Loan Sanction (Approver) and Loan Disbursement (Disbursement)? Does FD opening/closure need approval, or does this represent Deposit loans? | Treat as Deposit/Share Capital loans | E | M6 | **Answered by F4:** FD acceptance needs Secretary + President sign-off (D-027) |
| Q-110 | Top-up allowed only for Ordinary loans, or also Salary/Education? Minimum repaid instalments before a top-up? | Ordinary only | S | M5 | **Answered → D-059** |
| Q-111 | Which events send Email/WhatsApp/SMS, to whom, and with what content? | Event list in ST-63 | S | M5, M9 | Open |
| Q-112 | Can the Super Admin perform or override any stage? | No (view only) | S | M5 | Open |
| Q-113 | Who performs "Loan Assessment" (after DDO validation)? | Accountant | S | M5 | **Answered → D-059** |
| Q-114 | Can the Accountant return or reject? Can a rejected member re-apply immediately? | Return + Reject allowed. Re-apply allowed | S | M5 | **Answered → D-059** |
| Q-116 | What is "Preference Signup" in the Member and DDO diagrams? | Not built until defined | E | — | Open |
| Q-115 | Can a member hold multiple active loans (same type / different types)? | One per type (BR-018) | S | M4 | Open |

## Batch 3: Business rules (blocks correctness of numbers, not the UI)

| ID | Question | Placeholder in prototype | Owner | Status |
|---|---|---|---|---|
| Q-301 | What do **CRD**, **SRDS** and **RRF** stand for, and their rules (monthly amount, interest, maturity, withdrawal, refund on retirement)? | CRD ₹500/m, SRDS ₹300/m, RRF ₹100/m | S | Open |
| Q-302 | EMI method: equated EMI (amortised) or fixed principal + interest on reducing principal? Rounding? | EQUAL_PRINCIPAL | S | Open |
| Q-303 | Interest accrual for top-up/renewal settlement: daily (actual/365) or monthly? From which date? | actual/365 | S | Open |
| Q-304 | Does the 10% share deposit deduction apply to Salary/Education/Deposit loans? What is the share face value? How do "Number of Shares", share capital and "Share Deposit" relate? | Ordinary only. Shares shown separately | S | Open |
| Q-305 | Share deposit interest: rate, balance basis, posting month | Display only | S | Open |
| Q-306 | Insurance: per month or per year? Collection month? What service-period rule decides eligibility? Is it shown as a separate head even for loanees with multiple loans? | Annual, April | S | Open |
| Q-307 | Penal charges: trigger, rate, base | 0% | S | Open |
| Q-308 | Demand cycle: monthly? Generation day? Cut-off for new loans/transfers to enter a cycle? | Monthly, 20th | S | Open |
| Q-309 | Allocation gaps: where do SRDS and Deposit-loan dues sit? Is the order of interest across multiple loans the same as principal (Education → Salary → Ordinary)? What happens to excess recovery? | SRDS after CRD. Deposit loan last. Excess = credit | S | Open |
| Q-310 | Definition of "Due" vs "Defaulter" (how many missed cycles)? Defaulter notice wording? | Defaulter = 3 cycles | S | Open · placeholder built in M9 (3 cycles in a row, notice text in template `defaulter.notice`, D-063) |
| Q-311 | Per loan type: rate, max amount (fixed or multiple of salary?), max tenure, deposit-loan margin, processing fees or other deductions? | `13` §3 table | S | **Partly answered (F2):** Ordinary/Education ≤ 100 instalments. Amounts and rates still open |
| Q-312 | Savings account: how are deposits and withdrawals made (salary recovery? counter?) and how is interest computed? | View + ledger only | S | Open |
| Q-313 | FD: tenure slabs, compounding, payout options, premature closure penalty, auto-renewal, special rates for retirees? | `13` §3 slabs, quarterly | S | **Partly answered (F4):** payout Monthly/Quarterly/Half-yearly/On maturity. Interest ceases at maturity. Joint/minor allowed. Slabs, compounding, premature closure still open |
| Q-314 | Is DOR entered manually or derived (age 61, end of month)? | Entered + warning | S | Open |
| Q-315 | Loan closure on retirement/resignation/death: settlement from deposits, surety liability? Foreclosure allowed? | Not modelled | S | Open |
| Q-316 | Are unpaid dues carried forward into the next demand sheet as arrears? | Yes, as separate lines | S | Open |

## Batch 4: Data, compliance, reports

| ID | Question | Proposal | Owner | Status |
|---|---|---|---|---|
| Q-401 | Is a full accounting module (chart of accounts, vouchers, periods) in scope? Who defines the chart of accounts? | P2 (D-013) | S/F | Open |
| Q-402 | "Other relevant profile details": Employee ID, email, photo, Aadhaar, PAN, bank account, basic pay? | As listed in `08` [P] | S | Open |
| Q-403 | List of mandatory registration documents | 4 placeholder types | S | Open |
| Q-404 | Which events make up "service history" (transfers, promotions, deputation, leave)? | Event list in `08` | S | Open |
| Q-405 | Report formats (PDF/Excel), letterhead, signatures, any statutory formats? | CSV + print-PDF | S | Open · built as CSV + browser print on the letterhead (D-063) |
| Q-406 | Why is Caste captured, which categories, and who may see it? | Restricted to Admin/Accountant | S | Open |
| Q-407 | Real volumes: members, departments, loans per year, staff users | `13` §1 | S | Open |
| Q-408 | Data retention and audit requirements (co-op audit, DPDP) | Hand over to backend | S/F | Open |
## Batch 5: From the paper forms (2026-10-24)

| ID | Question | Placeholder / proposal | Owner | Blocks | Status |
|---|---|---|---|---|---|
| Q-501 | Is "General Number" the society's membership number or the Government employee number? Is it the member's primary ID? | Society membership no. = primary ID, shown everywhere as "General No." | S | M3 | Open |
| Q-502 | Salary loan: maximum amount (≤ net pay earned up to date?), repayment (single deduction from next salary or instalments?), interest, how often, and confirm no sureties and no DDO certificate | ≤ net pay earned up to date. Recovered next cycle. No sureties or DDO | S | M4, M5 | Open |
| Q-503 | Ordinary/Education: is there a repayment-capacity rule (e.g. minimum take-home after EMI)? | Show the ratio only, no block | S | M4 | Open |
| Q-504 | Does a surety retiring during the loan disqualify them or only warn? Max loans one person may guarantee? What are "Surety recoveries" on the Salary Loan form? | Warn only. Max 3. Surety recoveries = dues recovered from them for defaulted borrowers | S | M4 | Open |
| Q-505 | Agreement text still names "Andhra Pradesh Secretariat Staff Co-operative Society". Can the digital version use the current name, and is "Sign with OTP" legally acceptable (or wet signature / Aadhaar eSign needed)? | Updated name, OTP sign, legal review | S | M3, M8 | Open |
| Q-506 | Please share the back sides (P.T.O.) of the Membership and Ordinary loan forms. Minimum shares, share face value, admission/entrance fee? | Not built until seen | S/E | M3 | Open |
| Q-507 | "Nature and description of security tendered": which types are allowed (surety, FD pledge, shares, other)? | Surety · Deposit pledge · Other (text) | S | M4 | Open |
| Q-508 | "Additional shares proposed" on loan forms: is buying extra shares required with a loan? How does it relate to the 10% share deposit? | Optional field, no rule | S | M4 | Open |
| Q-509 | Is the Cashier the same person/role as the Loan Disbursement officer? Denominations needed for all cash receipts? | One role "Cashier / Disbursement". Yes | S | M2 | Open |
| Q-510 | If share capital is paid by salary deduction, does membership become active at approval or after the first recovery? | Active at approval, share dues on the next demand | S | M8 | Open |
| Q-511 | Is membership approved by Secretary then President (like loans), or by a managing-committee resolution? | Secretary → President | S | M3 | Open |
| Q-512 | Deputation / transfer outside the Secretariat: how are recoveries handled (external pay officer)? | Department master supports "External office" with an address. Demand letter printed | S | M7 | Open |
| Q-513 | Retirement/death: should the system generate the gratuity recovery request to the department? | P2 printable letter | S | P2 | Open |
| Q-514 | Current baselines: average days from loan application to disbursement, and membership application to approval, on paper | Needed for UX targets (`12` §9) | S | M10 | Open |
## Batch 6: From the Member sitemap review (doc 17)

| ID | Question | Proposal | Owner | Blocks | Status |
|---|---|---|---|---|---|
| Q-117 | Which profile fields can a member edit directly? | Contact edit + request the rest | E | M3 | **Answered → D-044** |
| Q-118 | FD branch "Loan Details → Loan Requirements": loan against FD? | Yes | E | M6 | **Answered → D-045** |
| Q-119 | Dashboard → Email → WhatsApp: what is it for (contact the society, share statements, alerts)? | "Contact society" in Help + notification channels in settings | E | M8 | Open |
| Q-120 | Reported payments: which bank account/UPI details does the society publish for members? Is a screenshot mandatory? | Society account details in settings. Screenshot optional, reference mandatory | S | M7 | Open |
| Q-121 | Profile change requests: who approves (Accountant? DDO for employment fields?) | Accountant approves contact/nominee. DDO certifies employment/pay changes | S | M3 | **Answered → D-057** |
