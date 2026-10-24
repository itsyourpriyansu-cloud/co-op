# 02 · Requirements Register (Traceability)

> Version 0.3 · 2026-10-24
> Every buildable requirement with its source, status and prototype priority.
> Status: **C** confirmed · **P** proposal · **U** unknown/needs answer · **X** conflict
> Priority: **P1** MVP prototype · **P2** later · **OUT** not in prototype

## Member Management

| ID | Requirement | Source | Status | Prio | Screens |
|---|---|---|---|---|---|
| REQ-001 | Member registration captures: Name, Father's Name, DOB, Nominee & Nominee Relation, Caste, Address, Mobile, Designation, Department, Date of Joining, Date of Retirement, Left-over Service, Number of Shares, Anniversary Date, other relevant profile details | A §3.1 | C ("other relevant details" = U, Q-402) | P1 | ST-11, ST-12, MB-02 |
| REQ-002 | Store mandatory registration documents in a secure repository. View, download and print from Member Master | A §3.1 | C (mandatory doc list = U, Q-403) | P1 | ST-12 Documents tab |
| REQ-003 | Maintain complete service history per member | A §3.1 | C (what counts as a history event = U, Q-404) | P1 | ST-12 Service tab |
| REQ-004 | Service period used in loan approval and insurance eligibility | A §3.1 | C loan / U insurance rule (Q-306) | P1 | ST-23, ST-26 |
| REQ-005 | Member mobile app: view profile, deposit and loan details, loan and deposit calculator | A §3.1 | C (platform: separate Expo Android app, D-019) | P1 | MA-01..05, MB-01..MB-14 |
| REQ-006 | Member Index with New / Show for staff roles | F p1,3,4,5,6 | C | P1 | ST-10..12 |

## Deposit Management

| ID | Requirement | Source | Status | Prio | Screens |
|---|---|---|---|---|---|
| REQ-010 | CRD deposit scheme | A §3.2 | C exists / U rules (Q-301) | P1 | ST-30..32 |
| REQ-011 | SRDS deposit scheme | A §3.2 | C exists / U rules (Q-301) | P1 | ST-30..32 |
| REQ-012 | Fixed Deposits; FD List New/Show (Accountant: New/Edit) | A §3.2, F | C | P1 | ST-30..32 |
| REQ-013 | Savings Account | A §3.2 | C exists / U operations (Q-312) | P1 (view + ledger) | ST-30..32 |
| REQ-014 | Fixed Deposit Rates setting | F | C | P1 | ST-65 |
| REQ-015 | FD appears in Approver and Disbursement flows (FD List → Loan Sanction / Disbursement) | F p4,6 | U (meaning, Q-109) | — | — |

## Loan Management

| ID | Requirement | Source | Status | Prio | Screens |
|---|---|---|---|---|---|
| REQ-020 | Application captures member details, department, service period, employment info, guarantor details, loan type, amount, left-over service | A §3.3 | C | P1 | ST-21, MB-05 |
| REQ-021 | Guarantor info shown during application for verification | A §3.3 | C | P1 | ST-21, ST-23, MB-05 |
| REQ-022 | Approval by authorised personnel per predefined society rules | A §3.3 | C (rules = U) | P1 | ST-27 |
| REQ-023 | Approval allowed only if remaining service period **exceeds** requested tenure | A §3.3 | C | P1 | ST-21, ST-23, MB-05 |
| REQ-024 | Service period validation automatic from Member Master | A §3.3 | C | P1 | — |
| REQ-025 | Renewal/top-up: outstanding interest calculated up to current date before settling existing loan | A §3.3 | C (accrual basis U, Q-303) | P1 | ST-22, MB-06 |
| REQ-026 | Ordinary loan: 10% of sanctioned amount deducted and credited to member's Share Deposit | A §3.4 | C | P1 | ST-26, ST-28 |
| REQ-027 | Share Deposit interest calculated annually | A §3.4 | C (rate/method U, Q-305) | P2 (display only P1) | ST-12 |
| REQ-028 | Top-up: existing Share Deposit balance netted before 10% deduction | A §3.4 | C | P1 | ST-22, ST-26 |
| REQ-029 | Loan types: Ordinary, Salary, Education, Deposit/Share Capital | A §3.4 | **X** with F (Ordinary, Educational, Other, Top-up). Q-106 | P1 | ST-20 |
| REQ-030 | EMI by reducing-balance method | A §3.4 | C (variant U, Q-302) | P1 | Calculators, schedules |
| REQ-031 | Member loan flow: New Loan → Loan Requirements → Surety Confirmation → Validation by Accountant → Validation by DDO → Loan Assessment → Loan Sanction → Loan Disbursement | F p2 | C | P1 | MB-05, ST-23..28 |
| REQ-032 | Accountant flow: Loan Review → DDO Manual → Loan Sanction → Loan Disbursement | F p3 | C order / U "DDO Manual" (Q-102) | P1 | ST-24, ST-25 |
| REQ-033 | DDO Validation Yes/No → Loan Approval; No → Member Index | F p5 | C | P1 | ST-25 |
| REQ-034 | Approver Loan Sanction Yes/No → Disbursement | F p4 | C | P1 | ST-27 |
| REQ-035 | Top-up loans have their own New/Show from Ordinary Loans | F p1,3 | C (top-up only for Ordinary? U, Q-110) | P1 | ST-22 |
| REQ-036 | Loan Rates setting | F | C | P1 | ST-64 |

## Insurance

| ID | Requirement | Source | Status | Prio | Screens |
|---|---|---|---|---|---|
| REQ-040 | Insurance contribution configurable; defaults Non-loanee ₹200, Loanee ₹1,000 | A §3.5 | C (frequency U, Q-306) | P1 | ST-66 |
| REQ-041 | Applicable insurance amount reflected in demand sheet | A §3.5 | C | P1 | ST-42 |

## Demand Sheet & Collections

| ID | Requirement | Source | Status | Prio | Screens |
|---|---|---|---|---|---|
| REQ-050 | Demand sheets generated department-wise | A §3.6 | C (cycle = U, Q-308) | P1 | ST-40..42 |
| REQ-051 | Transferred member appears under new department from the next cycle | A §3.6 | C | P1 | ST-12, ST-41 |
| REQ-052 | Partial recovery auto-allocated: RRF → Insurance → CRD → Penal → Interest → Principal (Education, Salary, Ordinary) | A §3.6 | C (gaps U, Q-309) | P1 | ST-43, ST-45 |
| REQ-053 | Payments index New/Show (Admin), New/Edit/Show (Accountant) | F p1,3 | C | P1 | ST-44..46 |
| REQ-054 | Member "Payment/Index → Edit → New" | F p2 | **X** with D-010 (Q-107) | — | MB-10 read-only |

## Reports

| ID | Requirement | Source | Status | Prio |
|---|---|---|---|---|
| REQ-060 | Dues List | A §3.7 | C | P1 |
| REQ-061 | Defaulters List | A | C (definition of defaulter U, Q-310) | P1 |
| REQ-062 | Department-wise Monthly Unpaid Collections | A | C | P1 |
| REQ-063 | Department-wise Monthly Less Collections | A | C | P1 |
| REQ-064 | Maturity Report | A | C | P1 |
| REQ-065 | Member-wise Ledger | A | C | P1 |
| REQ-066 | Defaulter Notice (printable) | A | C | P1 |
| REQ-067 | Loans Ledger | A | C | P1 |
| REQ-068 | Deposits Ledger | A | C | P2 |
| REQ-069 | Shares Ledger | A | C | P2 |
| REQ-070 | Receipts & Payments consolidated / summary | A | C | P2 |
| REQ-071 | Month-wise Receipts consolidated / summary | A | C | P2 |
| REQ-072 | Month-wise Payments consolidated / summary | A | C | P2 |
| REQ-073 | Retirement Report | A | C | P1 |
| REQ-074 | Member DOB & Anniversary Report | A | C | P2 |
| REQ-075 | General Ledger | A | C (needs accounting module, Q-401) | P2 |
| REQ-076 | Trial Balance | A | C (same) | P2 |
| REQ-077 | Profit & Loss | A | C (same) | P2 |
| REQ-078 | Balance Sheet | A | C (same) | P2 |
| REQ-079 | Day Book | A | C (same) | P2 |
| REQ-080 | Cash Book | A | C (same) | P2 |
| REQ-081 | Bank Book | A | C (same) | P2 |
| REQ-082 | Download Reports | F | C (formats U, Q-405) | P1 |

## Settings, Access, Communication

| ID | Requirement | Source | Status | Prio | Screens |
|---|---|---|---|---|---|
| REQ-090 | Settings: General, Permissions, Notifications, Loan Rates, Fixed Deposit Rates | F all pages | C | P1 | ST-60..65 |
| REQ-091 | Settings are Admin-only (Super Admin flow) / "Accountant Only" (Accountant flow) | F p1,3 | **X** (who edits what, Q-108) | P1 | — |
| REQ-092 | Login for all roles | F | C (method U, Q-103) | P1 | AU-01 |
| REQ-093 | Member Signup and "Preference Signup" | F p2,5 | Resolved: activation only (D-009). Preference Signup U (Q-116) | P1 (as activation) | MA-02 |
| REQ-094 | Email and WhatsApp actions from dashboard/menu | F p2,4,5,6 | C (content and triggers U, Q-111) | P1 simulated | ST-63, ST-03, MB-12 |
| REQ-095 | Help / Support for members | F p2,5 | C (channel U) | P1 | MB-13 |
| REQ-096 | Reports accessible to Super Admin, Accountant, Approver, Disbursement | F | C | P1 | ST-50 |

## Agreement items outside the prototype

| ID | Requirement | Source | Prio |
|---|---|---|---|
| REQ-900 | Deployment support, user training | A §3 | OUT |
| REQ-901 | Secure cloud hosting infrastructure | A §3 | OUT |
| REQ-902 | Post-deployment assistance | A §3 | OUT |

## Proposals added by architecture (not in either source)

| ID | Proposal | Why | Decision |
|---|---|---|---|
| REQ-P01 | Work Queue page per role | Replaces separate stage index pages | D-006 |
| REQ-P02 | Departments & DDO master | Demand sheets and DDO scoping need it | D-015 |
| REQ-P03 | Audit trail on loan timeline (who/when/what) | Accountability in multi-stage approval | D-006 |
| REQ-P04 | Notification log (simulated) | Make Email/WhatsApp visible without integration | D-012 |
| REQ-P05 | Demo persona login + shared mock API demo controls | Walk one loan through all roles across both apps | D-021 |
| REQ-P06 | Audit log viewer | Compliance | P2 |

## Paper forms (PF, added v0.3, see doc 16)

| ID | Requirement | Source | Status | Prio | Screens |
|---|---|---|---|---|---|
| REQ-100 | Prospective members apply for membership digitally (F1 fields), with eligibility check, documents, declarations | PF F1, D-026 | C | P1 | MJ-01..05 |
| REQ-101 | DDO certifies membership items 1–7 | PF F1 | C | P1 | ST-16 |
| REQ-102 | Membership approval Secretary → President, share payment (counter or first demand), General No. allotment | PF, D-027, D-029 | C (approvers Q-511) | P1 | ST-14, ST-15, ST-17 |
| REQ-103 | Applicant tracks the application by stage | D-026 | C | P1 | MJ-05 |
| REQ-104 | Ordinary/Education application captures pay details (scale, gross, deductions, net), shares, security, ≤ 100 instalments | PF F2 | C | P1 | MB-05, ST-21 |
| REQ-105 | Surety particulars auto-filled (pay, shares, retirement during loan, existing guarantees). Surety signs the joint undertaking | PF F2 | C | P1 | MB-07, ST-23 |
| REQ-106 | DDO certifies loan items 1–5 | PF F2 | C | P1 | ST-25 |
| REQ-107 | Salary loan application (F3) with computed net substantive pay, and an office-use panel (OL/SL balances, interest, dates, surety recoveries) | PF F3 | C (rules Q-502) | P1 | MB-05, ST-21, ST-26 |
| REQ-108 | Loan sanction by Secretary then President | PF F2 F3, D-027 | C | P1 | ST-27 |
| REQ-109 | FD application (F4): payout frequency, joint holders, minor/guardian, nominee, rules acceptance | PF F4, D-028 | C | P1 | MB-15, ST-31 |
| REQ-110 | FD payment by cash (denominations) or transfer. Acceptance Secretary → President. Account No. + FDR No. issued | PF F4 | C | P1 | ST-33, ST-45, MB-09 |
| REQ-111 | Salary-recovery authorisation (F5/F6) signed by the member and agreed by the DDO. Covers borrower + surety and gratuity recovery | PF F5 F6 | C (legal text Q-505) | P1 | MJ-04, ST-16, ST-12 |
| REQ-112 | Transfer out of the Secretariat: the new pay officer receives the agreement and the demand | PF F6 | C (Q-512) | P1 (flag) / P2 (letters) | ST-13 |
| REQ-113 | Demand sheet certified by a society officer before sending | PF F6 | C | P1 | ST-42 |
| REQ-114 | Printable twins of every form in the original layout + letterhead (Regd. No. P-929) | P (D-032) | P | P1 | ST-52 |
| REQ-115 | Gratuity recovery request letter at retirement/death | PF F5 F6 | U (Q-513) | P2 | — |
