# 21 · Society answers: impact on the app

> Version 0.2 · 2026-10-29 · Decision D-067. C-1 → D-071, C-2 → D-070.
> Source: the society's answers to the 35 questions in `docs/client-questions.md` (v1.1). Tag for these answers: **[S]** (confirmed by the society in writing).
> This doc lists (1) what has to change in the prototype, (2) where an answer conflicts with the agreement [A] or a paper form [PF], and (3) follow-up questions. **No code has been changed yet.** `docs/09` and `docs/10` are updated rule by rule when each change is built.

## 1. New cross-cutting requirements

| ID | Requirement | From | Effect |
|---|---|---|---|
| REQ-130 | **Versioned master files with an active status.** Loan products, FD rates and minimum, insurance amounts, joining fee, penal %, FD premature penalty %. A change creates a new record that becomes active; the old one is kept read-only. Every loan, FD and demand line stores the master version it used | Q-511, Q-311, Q-313 answers | Settings (ST-60…67) become master tables with "Active" status and history. Data model gains `…Version` entities |
| REQ-131 | **Ledgers (books of account).** Every EMI received, disbursement, share deposit, insurance, FD deposit, FD interest, FD premature penalty and payout posts to a ledger | Q-311, Q-313 answers | Moves Q-401 (accounting module) from P2 towards MVP. At minimum: member sub-ledgers + society general ledger with double entry |
| REQ-132 | **DDO records the actual deduction.** The DDO enters what was actually deducted per member (e.g. loss of pay) in the console, or the Accountant enters it from the DDO's paper statement | Q-502, Q-309 answers | New DDO action on the demand sheet (today only the Accountant enters recoveries) |
| REQ-133 | **Daily penal interest on dues.** Unpaid amount accrues interest for the days it stays unpaid, until the member clears it at the Accounts section | Q-307, Q-309, Q-502 answers | `BR-012` turns on with a per-day rule; rate in the master |
| REQ-134 | **Guarantor liability on default.** One unpaid month = defaulter; the notice goes to the guarantors and the society starts recovering from them | Q-310 answer | Defaulter notice addressed to sureties; surety recovery lines |
| REQ-135 | **Service-level targets:** membership ≤ 48 hours, loan ≤ 4–5 days | Q-514 answer | "Days in stage" warnings on the Work Queue and dashboards |

## 2. Changes to existing behaviour

| # | Area | Today (prototype) | Change to | Rule / screen | Size |
|---|---|---|---|---|---|
| 1 | Shares | 10–100 shares | Any number (min 1, no max). Admission fee field = ₹0 | BR-026, MJ form, ST-11 | S |
| 2 | Membership approval | Secretary **then** President | **No change** (D-070): stays Secretary → President. Add the setting only | D-053, docs/10 §2, ST-16/17 | S |
| 3 | Insurance | Annual, April for everyone | Every **12 months from the member's last renewal**: ₹200 member, ₹1,000 with a loan (master) | BR-008, demand generation | M |
| 4 | Signing | "Sign with OTP" on forms | **No signature step**; a logged-in submit is enough | MJ-04, MB-05, MB-15, MB-07 | S · see follow-up F-01 |
| 5 | OTP channel | SMS (simulated) | **WhatsApp or push notification** (simulated in the demo) | MA-01…03, ST-63 | S |
| 6 | Documents | 4 sample types | **Aadhaar, PAN, Service particulars** | MJ documents step | S |
| 7 | Caste | Mandatory? no · visible to Admin + Accountant | **Mandatory**, visible to all staff | docs/03, ST-12 | S · see F-07 |
| 8 | Loan amount | Member asks within product max | Member asks any amount; **Accountant checks and may suggest a different amount** (counter-offer) and the EMI is recalculated | D-059 (3), ST-26 | M |
| 9 | EMI method | Equal principal, reducing balance | Add **FLAT** beside the existing methods; society picks per product (D-071). Always show remaining balance and remaining months | BR-006 | M |
| 10 | Share deposit | 10% on Ordinary, netted against existing balance | 10% retained at disbursement (member receives 90%) + **insurance deducted** at disbursement. Product list to confirm | BR-004 | S · see F-03 |
| 11 | Loans per type | One per product | **More than one allowed**; app suggests a top-up first | BR-018 | S |
| 12 | Surety limit | 2 open guarantees; retiring = warning | More than one allowed (setting). **Retiring surety must have enough FD** to cover | BR-014, BR-024 | M |
| 13 | FD | No early closure | **Premature withdrawal** with a penalty % from the master, posted to the ledger | BR-017, MB-09, ST-3x | M |
| 14 | Savings account | View + statement at 4% | **Removed** (no savings account) | MB-08, reports | S |
| 15 | Demand sheet date | Generated around the 20th | Must reach DDOs **3–5 days before the 1st** (setting "send by day") | BR-009 | S |
| 16 | Arrears | Carried into next sheet as lines | **Not carried**. Shown as dues; member pays at the counter | BR-010, D-061 | M |
| 17 | Defaulter | 3 cycles in a row | **1 unpaid cycle**; notice to guarantors | BR-020, defaulter report | S |
| 18 | Late payment | No penal charge | **Penal interest per day** (REQ-133) | BR-012 | M |
| 19 | Member login | General No./Employee ID + password | **Mobile number + OTP** (WhatsApp / push). No password | MA-01…03, MB-17, D-062 | M |
| 20 | Messages | SMS / WhatsApp / Email | **WhatsApp + Email** only | MB-14, ST-03 | S |
| 21 | Report a payment | Bank details + optional screenshot | Society **QR code**; no screenshot | MB-18 | S |
| 22 | Salary loan | Max = net pay earned to date | No fixed cap; Accountant decides from service particulars and existing deductions; monthly instalments | D-058 (1) | S |
| 23 | Volumes | ~600 seeded members | Seed ~900 active + some ex-employees | docs/13 | S |

Sizes: S = under a day · M = 1–3 days of prototype work.

## 3. Conflicts with higher sources (need a decision)

| ID | Answer | Conflicts with | Why it matters | Proposal |
|---|---|---|---|---|
| C-1 | EMI = interest added to principal, divided equally (flat rate) | **Agreement [A]:** "Reducing Balance (Reducing Principal) method" (BR-006) | A flat rate charges interest on the full amount for the whole term. On ₹1,00,000 at 11% for 60 months: flat EMI ≈ ₹2,583 (total interest ₹55,000); reducing-balance EMI ≈ ₹2,174 (total ≈ ₹30,500). A large difference for members | **Resolved (D-071):** all methods built; the society picks per loan product. Default reducing balance until they choose |
| C-2 | Membership approved by **either** Secretary or President | **Paper form F1 [PF]** has both signatures; D-027 | One signature means less control, but faster (48 h target) | **Resolved (D-070):** two signatures as in the prototype; setting allows 1 |
| C-3 | Caste visible to "all people" | DPDP Act 2023 and the security model (docs/07 §7) | Caste is sensitive personal data | Visible to all **staff** roles, not to other members. Confirm |
| C-4 | CRD = "Co-operative Rural Bank" | The agreement lists CRD as a deposit/fund head collected monthly | A bank name does not fit a monthly deduction head | Record as given; ask once more with the monthly amounts (F-05) |

## 4. Follow-up questions for the society

| ID | Question |
|---|---|
| F-01 | Sureties: without a signature, how does a surety agree? A tap on "I agree" in the app after login is enough? |
| F-02 | Is the share value still ₹100? |
| F-03 | (Checked 2026-10-29. Paper forms: silent. **Agreement §3.4:** 10% only for Ordinary loans, netted against the existing share deposit; other loan types "as per society policies". **§3.5:** insurance is collected through the demand sheet, not at payout. Ask only what remains: (a) 10% on other loan types? (b) insurance at payout or only on the demand sheet?) The 10% share deduction and insurance at disbursement: for **all** loan types (Ordinary, Education, Salary, Deposit), or Ordinary only? If the member already has share deposit, is only the difference deducted (agreement example)? |
| F-04 | Is there a separate Cashier, or does the Accountant also take cash and pay out loans? |
| F-05 | Monthly amounts for CRD, SRDS and RRF, and what each fund is used for. |
| F-06 | Penal interest rate on overdue amounts (% per year), and the FD premature-withdrawal penalty %. |
| F-07 | Caste: visible to all staff only, or also to members? |
| F-08 | Loans on resignation or death: settled from shares/FD, from the guarantors, or from gratuity? |
| F-09 | Which events send WhatsApp / email (e.g. loan sanctioned, EMI due, defaulter notice)? |
| F-10 | Which WhatsApp Business number and email address will the society own? |
| F-11 | Samples still needed: registers or Excel, demand sheet, sanction letter, DDO recovery statement, recovery agreement, back of the membership form. |
| F-12 | Ex-employees (~1,200): do they keep accounts (FDs, loans) that the system must hold? |
