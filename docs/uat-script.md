# UAT script: user acceptance testing

> Version 0.1 · 2026-11-12 · G8 (D-118). For society staff testing on **Azure staging** before go-live, with the implementer beside them.
> Staging has demo mode **off**: everyone signs in with their own account (staff: user ID, password, authenticator; members: mobile and WhatsApp code). Use only the fictional members imported for UAT (sample registers in `backend/import/`), never real data.
> Mark each case **P** (pass), **F** (fail, write what happened) or **B** (blocked). A failed case gets a ticket; the case is run again after the fix. Sign-off at the end.

## 0. Before the session (implementer)

- [ ] Staging deployed from the release candidate; `/health` shows `"ok": true`
- [ ] One staff account per role (Super Admin, Accountant, Secretary, President, Cashier, one DDO per test department), each with an authenticator set up
- [ ] Fictional members imported (members, deposits, loans, opening balances) and the reconciliation shows no difference (`npm run db:import -- reconcile ...`)
- [ ] Two test phones (Android and iPhone) with the preview build, and WhatsApp numbers registered for the test members
- [ ] Printer reachable from the console PC

## 1. Sign-in and access (all roles)

| ID | Role | Steps | Expected | Result |
|---|---|---|---|---|
| UAT-01 | Each staff role | Console → user ID + password → authenticator code | Lands on that role's dashboard; menu shows only that role's sections | |
| UAT-02 | Each staff role | Wrong password 5 times | "Too many wrong attempts. Try again after …" (15 minutes) | |
| UAT-03 | Super Admin | Admin → Users → add a user, give a temporary password; that user signs in | Asked to change the password and set up the authenticator | |
| UAT-04 | Member | Phone → Sign in → mobile → WhatsApp code | Code arrives on WhatsApp within a minute; member home opens | |
| UAT-05 | Staff on phone | Phone → Staff sign-in → user ID, password, code | Staff tabs for that role; after 5 minutes in the background the app asks for fingerprint / PIN | |
| UAT-06 | DDO | Open Members, Demand Sheets | Sees only own department's members and sheets | |
| UAT-07 | Cashier | Try to open Settings, Audit Log | Not in the menu; typing the address shows "no access" | |

## 2. Joining (applicant → Accountant → DDO → Secretary → President → Cashier)

| ID | Role | Steps | Expected | Result |
|---|---|---|---|---|
| UAT-10 | Applicant | Phone → Become a member → mobile → code → eligibility → fill all 7 steps → upload photo, ID, appointment order → tick the four agreements (incl. **Privacy notice and consent**) → Sign with OTP | Tracker: "Application received"; the four agreements are required | |
| UAT-11 | Accountant | Joining → the application → check documents → **Send to DDO** | Status DDO certification; DDO is notified | |
| UAT-12 | DDO | Work Queue → certify items 1–7 and agree the salary mandate | Office review; applicant's tracker moves | |
| UAT-13 | Accountant | Office review → **Return for information** with a reason | Applicant sees the reason, corrects, resubmits; it returns to the Accountant | |
| UAT-14 | Accountant → Secretary → President | Recommend → approve → approve (President chooses counter or first demand for the share) | Share payment pending | |
| UAT-15 | Cashier | Record the share payment (cash, denominations must equal the amount) → receipt | Member admitted with a General No.; the app switches to the member home; receipt prints on letterhead | |
| UAT-16 | Accountant | Print form F1 and the agreement F6 | Paper twins show the applicant's data, signature and the privacy notice version on the declarations tab | |

## 3. Loans

| ID | Role | Steps | Expected | Result |
|---|---|---|---|---|
| UAT-20 | Member | Loans → Apply → Ordinary → amount, months, two sureties → Sign with OTP | Eligibility checked live (service left, limits); sureties are asked | |
| UAT-21 | Sureties (2 members) | Home → surety request → Agree & sign with OTP | Loan moves to Accountant review once both sign | |
| UAT-22 | Accountant | Review → DDO certificate → assessment sheet (EMI, share deposit, net payable) | Figures match the society's own calculation on paper | |
| UAT-23 | Secretary, President | Sanction | Sanction letter number given; member notified | |
| UAT-24 | Cashier | Disburse (NEFT reference) | Loan active; schedule shown; ledger: loan head debited, bank credited, share deposit credited | |
| UAT-25 | Accountant | Counter loan from a paper form F2 (office enters on behalf) | Same flow; marked "entered from the paper form" | |
| UAT-26 | Member | Top-up on a running Ordinary loan | Old loan closed by top-up; settlement deducted from the new disbursement | |
| UAT-27 | Accountant | Early closure of a loan at the counter | Closure amount = outstanding + interest to date; receipt; loan closed | |
| UAT-28 | Any | Return / reject at each stage with a reason | Member sees the reason; a rejected loan cannot be acted on | |

## 4. Deposits

| ID | Role | Steps | Expected | Result |
|---|---|---|---|---|
| UAT-30 | Member | Deposits → Open FD → amount, months, payout → Sign with OTP | Rate comes from the slab; request shown as waiting for payment | |
| UAT-31 | Cashier → Secretary → President | Record payment → accept → accept | FDR number and maturity; FDR prints | |
| UAT-32 | Accountant | FD opened at the counter from paper F4 (joint holder, minor) | Holders and guardian shown on the FDR | |
| UAT-33 | Cashier | Premature withdrawal | Penalty as per the setting; voucher prints; ledger posts | |
| UAT-34 | Super Admin | Settings → Deposits → FD slabs | A new FD uses the new rate; old FDs keep theirs | |

## 5. Month end: demand and recovery

| ID | Role | Steps | Expected | Result |
|---|---|---|---|---|
| UAT-40 | Accountant | Demand Sheets → Generate for the month | One sheet per department; each member's heads (RRF, insurance, CRD, SRDS, share, interest, principal) | |
| UAT-41 | Accountant | Certify → Send to DDO | The DDO sees it in the work queue | |
| UAT-42 | DDO | Enter the deductions (one member short, one nil) → submit | Accountant can review / reject | |
| UAT-43 | Accountant | Enter recovery → post | Allocation follows the order RRF → insurance → CRD → interest → principal; ledger balances; members' Payments tab shows the same split | |
| UAT-44 | Member | Payments → Report a payment (UTR, date) | Shown as reported | |
| UAT-45 | Cashier | Payments → Reported → verify against the bank statement → receipt | Member sees "Nothing unpaid" | |
| UAT-46 | Cashier | Counter receipt for a member's dues (cash with denominations) | Receipt prints; dues reduce | |
| UAT-47 | Accountant | Defaulters (3 months in a row) → defaulter notice to borrower and sureties | Notices print and reach the members' apps / WhatsApp | |
| UAT-48 | Accountant | Recover an overdue loan from its sureties | Equal shares added to the sureties' next demand or paid at the counter | |

## 6. Accounts and reports

| ID | Role | Steps | Expected | Result |
|---|---|---|---|---|
| UAT-50 | Accountant | Accounts → New voucher (payment: rent from bank) | Voucher number; prints; day book and bank book show it | |
| UAT-51 | Accountant | Reports → Trial balance, Profit & loss, Balance sheet for the month | Trial balance agrees; figures match the society's books for the UAT data | |
| UAT-52 | Accountant | Each of the 8 collection / loan / deposit reports → CSV and print | Opens in Excel; prints on letterhead | |
| UAT-53 | Accountant | Year end on a test year: interest on deposits, dividend, close | Next year opens; posting into the closed year is refused | |
| UAT-54 | Super Admin | Audit Log → filter by a user and a day | Every action of the session is there with name and time | |

## 7. Members, messages and settings

| ID | Role | Steps | Expected | Result |
|---|---|---|---|---|
| UAT-60 | Member | Profile → Request a change (address) with a document | Accountant approves; profile updates | |
| UAT-61 | Accountant | Member → transfer to another department | New DDO mandate; next demand goes to the new department | |
| UAT-62 | Accountant | Member leaves (retired) → settlement against gratuity | Settlement statement; one ledger entry; member read-only in the app | |
| UAT-63 | Accountant | Send a message (WhatsApp) to one department | Members receive it; sent log shows "Sent" or "n not delivered" | |
| UAT-64 | Member | More → Help → Ask a question; Accountant replies | Reply arrives in the app | |
| UAT-65 | Super Admin | Settings → Loan products → change a rate | New version saved; calculators show the new EMI; history kept | |
| UAT-66 | Member | Settings → Privacy notice; Delete my account | Notice opens; deletion request reaches the office | |

## 8. Phones and printing

| ID | Steps | Expected | Result |
|---|---|---|---|
| UAT-70 | Repeat UAT-04, 20, 30, 44 on Android and iPhone | Same result; text readable at large font size | |
| UAT-71 | Airplane mode, then back | "You're offline" screen; recovers without signing in again | |
| UAT-72 | Push: approve a member's loan step | Push arrives on the member's phone; tapping opens the loan | |
| UAT-73 | Print every printable (F1, F2/F3, F4 FDR, F6, F7, F8/F9 bonds, F10 voucher, receipt, sanction letter, defaulter notice) | Fits A4; matches the paper form | |

## Sign-off

| Role | Name | Date | Signature | Open issues accepted |
|---|---|---|---|---|
| Secretary | | | | |
| President | | | | |
| Accountant | | | | |
| Envizon | | | | |
