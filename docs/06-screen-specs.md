# 06 · Screen Specifications

> Version 0.4 · 2026-10-24 (member screens are now native mobile, D-019)
> One block per screen: **Purpose · Content · Actions · States/Rules · Acceptance ref**.
> Global states (loading, empty, error, permission) from `04-experience-architecture.md` §6 apply to all screens and are not repeated here.
> Field lists marked [A] are contractual. Fields marked [P] are proposed and need approval.

---

## AUTH

### AU-01 Staff Login (web)
- **Content:** Society logo and name. Fields: User ID, password. "Forgot password". **Demo panel** (prototype only): persona cards for R1–R5, one-click sign-in.
- **Rules:** Login method is UNKNOWN (Q-103). The mock accepts any persona. Wrong password state is demonstrable with password `wrong`.
- **AC:** AC-AU-01.

### AU-03 Staff Forgot Password (web)
User ID → OTP (`123456`) → new password → success → login.

---

## STAFF WEB APP

### ST-01 Dashboard
- Role variants per `04` §5. Each tile is clickable and navigates to a filtered list. Month selector (default current). Charts: Recharts, following `12-design-system.md`.

### ST-02 Work Queue
- **Purpose:** One place for "things waiting on me".
- **Content:** Tabs by stage visible to the role (e.g. Accountant: Review · DDO Manual · Assessment). Table: Application No., Member, Dept, Loan type, Amount, Tenure, Stage, Waiting since (days, amber > 3, red > 7 [P]), Action button.
- **Actions:** Open → ST-23 with the relevant panel auto-opened.
- **Rules:** DDO sees only their department (R5 scope).

### ST-03 Notifications & Message Composer
- List of in-app notifications (read/unread, type icon, deep link).
- **Compose (simulated):** Channel (Email / WhatsApp / SMS), recipients (member, department, all defaulters), template picker (ST-63), preview → Send → entry in the notification log with status "Delivered (simulated)".

### ST-10 Member Index
- **Columns:** Member No., Name, Employee ID [P], Department, Designation, Mobile (masked `98XXXXXX21`), DOR, Left-over service (y m), Shares, Active loans, Status (Active / Retired / Resigned / Deceased [P]).
- **Filters:** Department, status, retiring within (3/6/12 months), has active loan. Search. Export CSV (simulated).
- **Actions:** New Member (R1, R2). Row → ST-12.

### ST-11 Member Create / Edit
Sections (vertical stepper on desktop):
1. **Personal [A]:** Member Name*, Father's Name*, DOB*, Caste [A] (restricted, Q-406), Address*, Mobile*, Anniversary Date. [P]: Email, Gender, Photo, Aadhaar (masked), PAN (Q-402).
2. **Employment & Service [A]:** Employee ID [P]*, Department*, Designation*, Date of Joining*, Date of Retirement*, Left-over Service (**read-only, computed**, BR-001).
3. **Nominee [A]:** Nominee Name*, Relation* (Spouse, Son, Daughter, Father, Mother, Other) [P list], Nominee DOB [P].
4. **Shares [A]:** Number of Shares*, share value (from settings, Q-304), Share Capital amount (computed).
5. **Bank details [P]:** for disbursement (Q-402).
6. **Documents [A]:** upload slots for the mandatory documents (Q-403). Placeholder list: Membership application form, ID proof, Service certificate / Pay slip, Photo.
- **Validation:** DOR > DOJ > DOB. Age at joining ≥ 18. Mobile 10 digits starting 6–9. Duplicate Employee ID / mobile check.
- **Edit mode:** changing Department → routed to the Transfer dialog (ST-13). It is not a plain field edit.

### ST-12 Member Profile
- **Header:** photo/initials, name, Member No., department, designation, status chips (Loanee / Non-loanee, Retiring in N months), quick actions (Edit, Transfer, New Loan, Open Deposit, Print profile).
- **Tabs:**
  - *Overview:* key facts, nominee, contact, summary cards (Share capital, Share deposit, Deposits total, Loans outstanding, Insurance status).
  - *Service History [A]:* timeline of events (joined, transfers, designation changes, retirement) (Q-404).
  - *Shares:* number of shares, share capital, Share Deposit balance & credits (from loan deductions), annual interest entries (display only).
  - *Deposits:* CRD, SRDS, FD, Savings accounts → ST-32.
  - *Loans:* all loans with status, outstanding → ST-23. Also "Loans guaranteed as surety".
  - *Insurance:* contribution history from demand sheets, current category (Loanee/Non-loanee).
  - *Ledger:* month-wise demand vs recovered and allocation (Member-wise Ledger report in context).
  - *Documents [A]:* list with type, uploaded on, by. View (in-app preview), Download, Print.

### ST-13 Department Transfer (dialog)
Fields: New department*, Effective date*, Order reference [P], Remarks. Info box: "Appears under *New Dept* from the *<next cycle month>* demand sheet" (BR-010). Confirm → service history event.

### ST-20 Loans Index
- **Tabs:** All · Ordinary · Education · Salary · Deposit/Share Capital · Top-ups (final tab names after Q-106).
- **Columns:** Loan/Application No., Member, Dept, Type, Amount (applied / sanctioned), Tenure, EMI, Outstanding, Stage/Status chip, Applied on.
- **Filters:** status group (In process, Active, Closed, Rejected), department, date range, amount range.
- **Actions:** New Loan (type picker), New Top-up, Export.

### ST-21 New / Edit Loan Application (staff on behalf)
1. **Member:** search & select → member snapshot card (dept, service period, left-over service, existing loans, share deposit) [A REQ-020].
2. **Loan:** type*, amount*, tenure (months)*, purpose, employment info (from member, read-only) [A]. Education: student name, institution, course [P, Q-311].
3. **Eligibility panel (live):** ✔/✖ remaining service > tenure (BR-002), ✔/✖ within product max amount/tenure (BR-016), ✔/✖ concurrent loan rule (Q-115), indicative EMI, share-deposit deduction preview.
4. **Sureties [A REQ-021]:** add N members. Each card: name, Member No., dept, left-over service, existing surety commitments, eligibility status.
5. **Documents** and **Review** → Submit (creates in `SURETY_PENDING`) or Save draft.

### ST-22 New Top-up Application
Select member → select an active loan (eligible types per Q-110) → **Settlement panel:** outstanding principal, interest accrued from last charged date to today (BR-007), total settlement → New loan amount/tenure → **Share deposit netting panel** (required 10% of new amount, existing balance, additional deduction, BR-004) → **Net disbursable** preview → sureties → submit.

### ST-23 Loan Detail
- **Header:** Application/Loan No., member link, type, amount, status chip, stage stepper (`04` §4).
- **Action bar:** shows only the action allowed for the current role and stage (e.g. "Review application"), which opens the corresponding panel ST-24…28.
- **Sections:** Application details · Eligibility checks (re-run live) · Sureties (status per surety) · Sanction Sheet (after assessment) · Repayment schedule (after disbursement: month, opening, EMI, interest, principal, closing, paid status) · Documents · **Activity timeline** (actor, role, action, remarks, timestamp) · Linked loan (for top-up: settled loan).

### ST-24 Accountant Review panel (side drawer)
Checklist (all required to forward): Member details verified · Documents verified · Sureties confirmed (auto) · System eligibility checks pass (auto). Remarks. Buttons: **Forward to DDO** · **Return to applicant** (reason*) · **Reject** (reason*).

### ST-25 DDO Validation panel
- *DDO mode:* member's employment confirmation, "Recovery can be effected from salary" checkbox, remarks → **Yes, validate** / **No** (reason*).
- *Accountant manual mode [P, Q-102]:* DDO name, designation, validation date, reference no., upload letter → **Record DDO validation**.

### ST-26 Assessment / Sanction Sheet panel
Computed and editable within limits: Sanction amount (≤ applied), tenure (≤ applied, re-validated), rate (from product), EMI, first EMI month [P], share deposit deduction, top-up settlement, other deductions (Q-311), **Net disbursable**. Schedule preview (first 6 rows + "view all"). → **Send for sanction**.

### ST-27 Sanction panel (see v0.3 addendum: two-step Secretary → President)
Read-only Sanction Sheet + member exposure (total outstanding, sureties given) + remarks → **Yes, sanction** / **No, reject** (reason*). Confirmation dialog restates the amount. Generates the Sanction Letter (printable, ST-52).

### ST-28 Disbursement panel
Net amount (read-only), payee: member bank account (masked), mode* (NEFT/RTGS, Cheque, Account transfer), reference no.*, date* (≤ today) → **Confirm disbursement** → loan `ACTIVE`, schedule created, share deposit credited, previous loan closed (top-up). Success summary card.

### ST-30 Deposits Index
Tabs FD · CRD · SRDS · Savings. Columns: Account No., Member, Scheme, Opened on, Amount/Balance, Rate, Maturity date (FD), Maturity value (FD), Status (Active, Matured, Closed).
Filters: maturing within (30/60/90 days), department, status.

### ST-31 Open Deposit Account
Member* → scheme* → scheme-specific fields:
- **FD:** amount*, tenure (from slabs)*, rate (auto from slab, read-only), payout (on maturity / periodic, Q-313), maturity date & value (computed), nominee (defaults from member).
- **CRD / SRDS:** monthly contribution amount (rules Q-301), start month. Recovered via the demand sheet (CRD confirmed in the allocation order, SRDS not, Q-309).
- **Savings:** opening balance (Q-312).

### ST-32 Deposit Account Detail
Summary card, ledger (date, particulars, credit, debit, balance), interest postings, maturity info, actions (Print certificate/statement. Close/Renew are shown disabled with "Rules pending" until Q-313).

### ST-40 Demand Sheets Index
Month picker + grid of departments: Members, Demand total, Recovered, Short, Status (Not generated / Generated / Sent to DDO / Recovery posted). Row → ST-42.

### ST-41 Generate Demand Sheet
Month*, departments (all or selected). Preview table per department: members count, totals per component. Warnings: members with incomplete data, already generated departments (E-10). → Generate.

### ST-42 Demand Sheet Detail
Header: Department, DDO, Month, status. Table per member: Member No., Name, Designation, **RRF, Insurance, CRD, SRDS?, Penal, Interest, Principal (per loan type)**, Total demand. Footer totals. Actions: Export (Excel/PDF simulated), Print (ST-52), Send to DDO (simulated), Enter recovery → ST-43.

### ST-43 Recovery Entry & Allocation
Per member: Demand, Recovered amount (input, default = demand), Short/Excess. "Mark all fully recovered". Import file (simulated). Selecting a row shows the **allocation breakdown** in priority order (BR-011) with each head's demand, allocated and unpaid. Summary: total demand, recovered, short count. → **Post recovery** (confirmation) → receipts created, ledgers updated, sheet status "Recovery posted".

### ST-44 Payments / Receipts Index
Columns: Receipt No., Date, Member, Source (Salary recovery / Cash / Bank / Adjustment [P]), Amount, Allocated to (chips), Posted by. Filters: date, source, department.

### ST-45 New Payment / Receipt (see v0.3 addendum: denominations, share capital, FD payment)
Member*, date*, mode*, amount*, reference. Panel: current dues by head → allocation preview (BR-011) → Save → ST-46. Edit allowed only for unposted receipts [P].

### ST-46 Receipt Detail
Receipt with allocation table. Print (ST-52).

### ST-50 Reports Catalogue
Cards grouped: Collections (Dues, Defaulters, Unpaid, Less Collections, Defaulter Notice) · Loans (Loans Ledger) · Deposits & Shares (Maturity, Deposits Ledger, Shares Ledger) · Members (Member Ledger, Retirement, DOB & Anniversary) · Cash & Accounts (Receipts & Payments, Month-wise Receipts, Month-wise Payments, GL, TB, P&L, BS, Day/Cash/Bank Book).

### ST-51 Report Viewer
Report title + description, filter bar (period/month, department, loan type, as-on date), run → table with grouped subtotals and grand total → Download PDF / Excel (simulated: toast + generated file name). Column definitions per report: `13-mock-data-spec.md` §5.

### ST-52 Print Preview
Society letterhead (logo, name, registration no. [UNKNOWN], address). Used for: Receipt, Sanction Letter, Defaulter Notice, Demand Sheet, Member profile.

### ST-60…ST-67 Settings
| Screen | Fields |
|---|---|
| ST-60 General | Society name, registration no., address, logo, financial year start (April [ASSUMPTION]), demand cycle (monthly, generation day, Q-308), retirement age (Q-314), default currency/locale |
| ST-61 Users | Name, user ID, mobile, email, role, department (DDO only), status. Invite/reset password (simulated) |
| ST-62 Permissions | Role × module × action toggles (matrix from `03`) |
| ST-63 Notifications | Event list (application submitted, surety request, stage changes, sanctioned, rejected, disbursed, demand generated, short recovery, maturity due, birthday/anniversary [P]) × channel toggles (In-app, Email, WhatsApp, SMS) + template editor with variables |
| ST-64 Loan Products & Rates | Per type: name, active, interest rate %, max amount, max tenure, sureties required, share deposit %, top-up allowed, penal rate, EMI method (Q-302), effective-from date (rate history) |
| ST-65 Deposit Schemes & Rates | FD slabs (tenure from–to, rate, senior/retiring extra? Q-313). CRD/SRDS: contribution, rate. Savings: rate. Share deposit interest rate (Q-305) |
| ST-66 Insurance & Demand | Non-loanee amount (₹200), Loanee amount (₹1,000), frequency (Q-306), RRF amount (Q-301), allocation priority (display of the A §3.6 order, locked) |
| ST-67 Departments & DDOs | Department name, code, DDO name, DDO designation, contact, linked DDO user |

---

## MEMBER MOBILE APP (Expo React Native · Android)

Platform rules: bottom tab bar, native header with back, Android hardware back supported, pull-to-refresh on lists, infinite scroll (20 per page), bottom sheets for filters and pickers, sticky bottom CTA on forms, ≥ 48 dp touch targets, keyboard-aware forms, skeleton loaders.

### MA-01 Splash + Login
Splash with society logo → login: Member No. / Employee ID, password, show/hide, "Forgot password", "Activate your account". **Demo panel** (prototype): member persona cards (Lakshmi, Ramaiah, Sravani, Mahesh). Long-press the logo → MA-05. Error states: wrong password, account not activated (CTA → MA-02), server unreachable (→ MA-04).

### MA-02 Account Activation (replaces "Signup", D-009)
- **Steps:** 1. Employee ID + registered mobile → 2. OTP (`123456`, shown in a toast) with a 30 s resend timer → 3. Set password (strength rules) → 4. Success → MB-01.
- **Errors:** Employee ID not found in Member Master ("Contact society office"). Mobile mismatch. Already activated (→ login). Wrong/expired OTP.

### MA-03 Forgot Password
Member No./Employee ID → OTP → new password → success → login.

### MA-04 Offline / Server Unreachable
Illustration, "Can't reach the society server", Retry, and (demo builds) "Change server" → MA-05.

### MA-05 Demo Settings (hidden, prototype only)
Server URL (validated by calling `/health`), Reset demo data (confirm), Demo date (read-only from the server), app version and build.

### MB-01 Home
Greeting + member no. · Pending actions (surety requests, returned applications) · Cards: Share capital & Share deposit · Deposits total · Active loans (outstanding, next EMI) · This month's demand (amount, status) · Quick actions: Apply loan, Calculators, Statements, Help.

### MB-02 My Profile
Read-only [A] fields grouped as in ST-11 (caste hidden by default [P]), left-over service, service history, nominee, documents (view/download). "Request a correction" → Help ticket [P].

### MB-03 My Loans
Segments: In process · Active · Closed · Drafts. Card: type, amount, status chip, outstanding, next EMI.

### MB-04 Loan Details
Status timeline, sanction details, EMI schedule (paid/unpaid), sureties with status, actions by state: Replace surety (if declined), Edit & resubmit (if returned), Withdraw (before sanction), Request top-up (if active and allowed).

### MB-05 Apply for Loan (wizard)
Matches J-01. Progress dots, sticky bottom CTA, the eligibility panel collapses into a summary chip on mobile.

### MB-06 Top-up Request
Matches J-07 with the member-facing settlement explanation in plain language.

### MB-07 Surety Requests
Tabs: Requests · I am surety for. Request detail: applicant, loan type, amount, tenure, EMI, own liability note, declaration → Accept / Decline (reason).

### MB-08 / MB-09 Deposits
List of accounts by scheme with balance. Detail: ledger, maturity value and date (FD), statement download (simulated).

### MB-10 Payments & Statements (read-only, D-010)
Month list: demand, paid, short. Expand → head-wise allocation. Receipts list → receipt view/download.

### MB-11 Calculators
- **Loan EMI:** loan type (pre-fills rate), amount, tenure → EMI, total interest, total payable, schedule (expandable), "Eligible max tenure for you: X months" (uses the member's left-over service).
- **Deposit:** FD amount + tenure → rate (slab), maturity value. CRD/SRDS: monthly amount × months → maturity (only if rules confirmed, Q-301. Otherwise hidden).

### MB-12 Notifications · MB-13 Help & Support · MB-14 Settings
- MB-12: list with deep links.
- MB-13: FAQ accordion, society office contact (phone, email, address, hours), WhatsApp link (simulated), "Raise a query" form (subject, message) → ticket list with status.
- MB-14: notification preferences per channel, language (English. Telugu = Q-008), change password, view Loan & FD rates (read-only), logout.

## SYSTEM

SYS-01 No access (explains the required role, back to dashboard) · SYS-02 Not found · SYS-03 Error (retry, go home).

---

## v0.3 ADDENDUM: paper-form screens (doc 16 is the field-level source of truth)

### ST-14 Joining: Membership Applications
- **Views:** Pipeline board (columns = Received · Department verification · Office review · Awaiting Secretary · Awaiting President · Share payment · Active this month) and a table view (toggle).
- **Card/row:** applicant name, department, designation, submitted date, days in stage (amber > 5, red > 10 [P]), document completeness ring, flags (possible duplicate, ineligible answer).
- **Filters:** department, stage, submitted range. DDOs see only their department.
- **Bulk [P]:** Secretary/President can multi-select "Approve" (each still recorded individually).

### ST-15 Membership Application detail
Header (name, stage stepper, primary action for the role) · Tabs: **Application** (F1 layout: items 1–9 with DDO-certified ticks) · **Documents** (preview, zoom, download) · **Declarations & Agreement** (signed text version, OTP timestamp, device) · **Checks** (duplicate mobile/employee ID, existing member, eligibility answers) · **Log** (every action). Actions by role: Request info (field-level), Reject (reason), Forward/Approve, Record share payment, Print F1 twin.

### ST-16 DDO Certify drawer (membership)
Items 1–7 each with ✓ / ✎ needs correction (comment). The recovery agreement summary + "AGREED" checkbox. **Certify** = digital seal {DDO name, designation, department, time}. Return to applicant needs at least one flagged item or a comment.

### ST-17 Approval drawer (membership)
Summary card (applicant, department, shares, DDO certificate, office remarks) → sign-off block showing ① Secretary (name, time, remarks) ② President. Buttons: **Approve** / **Reject** (reason). The President cannot be the same user as the Secretary (SOD-1). After the final approval: choose the share payment route (counter receipt now / first demand), then the system allots the **General No.** and shows a confirmation with the new number.

### ST-21 / MB-05 product-specific application forms
- **Ordinary / Education (F2):** Step "About you" (read-only Member Master card + editable **pay details**: scale & pay, total service in officiating post, gross salary, Govt loan deductions, other loan deductions → computed total and net) → "Loan" (amount + words, purpose, education details, security type, additional shares) → "Sureties" (picker → auto-filled particulars cards, ⚠ retiring-during-loan flag, existing guarantees list) → "Repayment" (instalments ≤ 100 and ≤ remaining service − 1, EMI preview) → "Authorise & sign" (clause 12 text, Sign with OTP).
- **Salary (F3):** "Pay this month" (substantive pay, itemised compulsory deductions, auto Ordinary-loan dues → **net substantive pay**, net pay earned up to date) → "Loan" (amount, purpose) → "Authorise & sign".

### ST-26 Assessment = "For Office Use" (all products)
Computed and read-only, with drill-down links: OL balance, SL balance, interest to date, total loans balance, OL taken on, SL taken on, surety recoveries, share netting (BR-004), top-up settlement (BR-007), **net disbursable**. The accountant can adjust the sanction amount/tenure within limits (re-validated). Remarks.

### ST-27 Sanction (two-step)
Sign-off block: ① Secretary → ② President, each with name, time and remarks. The Secretary's view: Sign / Reject. The President's view: Sign / Reject / Send back to assessment. The sanction letter generates after ②.

### ST-33 FD payment & acceptance drawer
Step 1 (Cashier): mode Cash → **DenominationCounter** (500/200/100/50/20/10 × count = auto total, must equal the amount) or Transfer (ref, date) → receipt. Step 2: Secretary accept. Step 3: President accept → Account No. + **FDR No.** issued → FDR print (ST-52).

### ST-31 Open deposit at counter (F4 layout)
Primary holder (member picker) → amount + words → period → rate (auto) → payout frequency → joint holders (0–2: name, father/husband name, occupation, address, phone) + operation mode / or minor (name, DOB → majority date, guardian, relation) → nominee → rules (4) → payment step (ST-33).

### ST-42 Demand sheet: Certify & send
New header action **Certify** (accountant, BR-030: "certified correct" stamp with name and time) before **Send to DDO** is enabled.

### ST-45 Receipt (updated)
Modes: Cash (denomination counter required) · Bank transfer (reference) · Adjustment. Purpose: Dues (auto allocation) · Share capital (new member) · FD deposit (links to the FD request). Printable receipt carries the cashier's name and a "seal" stamp.

### MJ-01 Welcome
Society logo, name, Regd. No. Two large choices: **"I'm a member"** (→ MA-01 login / MA-02 activate) and **"Become a member"** (→ MJ-02). Footer: office address and hours.

### MJ-02 Applicant sign-up
Full name, mobile → OTP → creates the applicant account. Resume: if an application exists, go straight to MJ-05/MJ-04.

### MJ-03 Eligibility check
Three questions (BR-026): employed in a Telangana Secretariat department? regular appointment or approved probationer? currently a member of another co-operative credit society with dues? Each has a "Why we ask" tooltip. Ineligible → friendly stop screen with the office contact.

### MJ-04 Membership application wizard
7 steps (see J-15). Progress bar, autosave on every field, sticky CTA, inline validation, document capture with an edge-detection hint [P], review page with an "Edit" link per section, **Sign with OTP** sheet showing the full declaration text and a "Download as PDF" link.

### MJ-05 Application stage tracker
Vertical stage tracker (6 stages, dates, current-stage explainer, typical time per stage once known (Q-514)). An "Action needed" card when INFO_REQUESTED. Share-payment instructions at stage 5. Celebration screen at ACTIVE with the **General No.** and "Continue to your account" → MB-01.

### MB-02 Profile (updated)
New sections: **Pay profile** (last DDO-certified values + "Request update") and **My agreements** (recovery agreement, declarations: signed date, DDO agreed date, view/download).

### MB-07 Surety requests (updated)
Particulars card (F2 columns a–l) + existing guarantees (item 10) + undertaking (item 12) + Sign with OTP. "Request correction" sends a note to the office.

### MB-15 Open FD request
Steps: Amount → Period & payout → Holders (me / joint / minor) → Nominee → Rules & sign → Submitted (payment instructions + status). Status chips: Requested · Payment received · Awaiting acceptance · Active.
---

## v0.4 ADDENDUM: Member sitemap (doc 17)

### More tab = "Settings / Index" [SM]
Sections: **Account**: Profile (MB-02), Edit profile (MB-19), Change password (MB-17). **Money**: Interest rates (MB-16), Calculators (MB-11), Surety requests (MB-07). **App**: Notifications (MB-12), Notification settings (MB-14), Help & support (MB-13). Sign out. No General/Permissions items (D-033).

### MB-16 Interest rates
Two sections: Loan products (name, rate % p.a., max amount, max instalments) and FD rates (tenure slab → rate, payout options). "Effective from" date. Read-only. Links to the calculators with the rate pre-filled.

### MB-17 Change password
Current password → new password (strength meter, rules) → confirm → success toast, other sessions signed out [P].

### MB-18 Report a payment (D-043)
Fields: amount* (+ words), paid on* (≤ today), mode* (Bank transfer / UPI / Cheque deposit), reference no.* (UTR/cheque no.), towards (Dues · Share capital · FD request link), screenshot (optional, Q-120). Shows the society's account details (settings). Submit → status **Reported** → **Verified** (receipt created, allocation per BR-011) or **Rejected** (reason). Listed in MB-10 with its status chip.

### MB-19 Edit profile (D-044)
- **Edit directly:** email, present address, photo. Mobile changes via an OTP to the new number.
- **Request a change** (form: field, new value, reason, supporting document): name, father's name, DOB, department, designation, DOJ/DOR, nominee, pay profile. Pending requests show on MB-02 with status. Approved changes write to Member Master with an audit entry.

### MB-09 Deposit details: Loan against FD (D-045)
Action **"Take a loan against this FD"** (only ACTIVE FDs not already pledged): shows the maximum = margin % × FD balance (BR-015) → opens MB-05 with the Deposit/Share Capital loan, the amount capped, and the security = this FD. While the loan is active, the FD is marked **Pledged** (no premature closure).

### MB-04 Loan tracker labels [SM + D-027]
Submitted → Surety confirmation → Validation by Accountant → Validation by DDO → Loan assessment → **Sanction (Secretary ✓ · President ✓)** → Disbursement. Steps skipped for a product (D-030) are hidden, not shown as done.

### ST-18 Profile change-request drawer
Current vs requested value side by side, reason, document preview → Approve (writes the master, audit) / Reject (reason). Employment and pay fields route to the member's DDO to certify first (Q-121).

### ST-47 Verify reported payment drawer
Reported details + screenshot → cashier searches the bank statement reference (manual in the prototype) → **Verify** (creates a receipt in ST-45 with the same allocation preview) / **Reject** (reason, member notified).
