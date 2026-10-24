# 01 · Product Discovery

> Phase 1 · Version 0.2 · 2026-10-24 · Status: Draft for review (Batch 1 answers applied)
> Sources: **[A]** Agreement (pages 2–5 of 10 provided), **[F]** TGSECCSL Flow Diagram (6 pages, Envizon)

---

## 1. Business context

| Item | Detail | Tag |
|---|---|---|
| Client | The Telangana Secretariat Employees Co-operative Credit Society Ltd. (TGSECCSL) | [A] |
| Service provider | Fusil Solutions Pvt Ltd (Hyderabad) | [A] |
| UX / prototype partner | Envizon | [F] |
| Agreement date | 05 July 2026 | [A] |
| Product | "FUSIL EMPLOYEES SOCIETY ERP": a Cooperative Society Management System | [A] |
| Members | Employees of Telangana Secretariat departments | [A] |
| Contribution and loan recovery model | Department-wise demand sheets. Recoveries are most likely deducted from salary via each department's DDO | [A] demand sheets / [ASSUMPTION] salary deduction via DDO |

**Missing source material:** agreement pages 1 and 6–10 (commercials, payment terms, support, hosting, timelines, likely the technical environment). → Q-006.

## 2. Problems the product must solve

Inferred from what the agreement chooses to specify. Each one is a pain point that the society spelled out in writing.

| # | Problem | Evidence | Tag |
|---|---|---|---|
| P1 | Member records are scattered and service details (DOJ, DOR, leftover service) are not usable for decisions | §3.1 Member Master as "central repository"; service period feeds loan and insurance checks | [A] |
| P2 | Loans may be approved for members who retire before the loan ends | §3.3 "Loan approval permitted only when remaining service exceeds tenure" | [A] |
| P3 | Duplicate share deductions on loan top-ups | §3.4 explicit worked example "avoids duplicate deductions" | [A] |
| P4 | Interest on renewals and top-ups is settled inconsistently | §3.3 "outstanding interest calculated up to current date" | [A] |
| P5 | Partial salary recoveries are allocated inconsistently | §3.6 "uniform and policy-driven allocation" | [A] |
| P6 | Department transfers break demand-sheet routing | §3.6 Department Transfer Handling | [A] |
| P7 | Heavy manual reporting (22 MIS and accounting reports) | §3.7 | [A] |
| P8 | Members cannot see their own loans, deposits or eligibility | §3.1 Member App | [A] |
| P9 | Multi-party loan approval (surety → accountant → DDO → approver → disbursement) is slow and not visible | Flow diagrams | [F] |

The current-state process (registers, Excel, an existing software package?) is **UNKNOWN**. → Q-007

## 3. Users and roles

| ID | Role | Source label | Primary goal | Tag |
|---|---|---|---|---|
| R1 | Super Admin | "Admins, Owners" | Configure the society, oversee everything, run reports | [F] |
| R2 | Loan Accountant | "Account" | Create and edit loans, deposits and payments. Review applications. Generate demand sheets | [F] |
| R3a / R3b | Secretary → President (was "Loan Approver") | "Loan Approver" + form signatures | Sequential sign-off on loans, FDs, membership | [F][PF] D-027 |
| R4 | Cashier / Disbursement Officer | "Loan Disbursement" + FD cashier | Receive cash/transfers, release sanctioned loans | [F][PF] |
| R5 | DDO | "DDO" | Validate applications for their department's employees (Yes/No) | [F]. Identity and scope UNKNOWN (Q-101) |
| R6 | Member | "Members" | Apply for loans, act as surety, view profile, loans, deposits and payments, use calculators | [A][F] |
| — | Surety (capacity of R6) | "Surity Confirmation" | Accept or decline a guarantor request | [F]. Mechanism UNKNOWN (Q-104) |

Full permission matrix: `03-roles-permissions.md`.

## 4. Business objectives (proposed success measures)

| Objective | Prototype proves it by… | Tag |
|---|---|---|
| O1 Every loan decision is rule-checked automatically | Eligibility panel shows pass/fail on service period, share deduction and top-up settlement | [A] → [P] measure |
| O2 End-to-end loan lifecycle visible to all parties | One loan can be clicked through every stage across role personas | [F] → [P] |
| O3 Monthly demand and recovery is department-wise and policy-driven | Generate sheet → enter partial recovery → allocation shown in priority order | [A] → [P] |
| O4 Members can self-serve | Member App: join, profile, loans, deposits, calculators, application, surety inbox | [A][F] |
| O5 Reports on demand | Report catalogue plus working viewers for priority reports | [A] |

## 5. Constraints

| # | Constraint | Tag |
|---|---|---|
| C1 | Prototype uses **mock data only**, but the UI must look and feel finished | User instruction |
| C2 | No application code until the plan is approved | User instruction |
| C3 | Insurance amounts must be configurable | [A] |
| C4 | EMI uses the reducing-balance method | [A]. Exact variant UNKNOWN (Q-302) |
| C5 | Government employee data includes sensitive PII (caste, DOB, nominee) | [A] fields → [P] restricted visibility |
| C6 | Delivery includes cloud hosting, training and support | [A]. Out of prototype scope |
| C7 | Tech stack: staff web React + Vite (D-008). Member app Expo React Native, Android APK (D-019/020/022). Shared mock API (D-021). Branding and language UNKNOWN (Q-008) | Decided / UNKNOWN |

## 6. Critical challenges to the current idea (please review)

The operating rules ask me to flag weak or over-scoped points. These are the ones that matter:

1. **The two sources disagree on scope.** The agreement includes CRD, SRDS, Savings, Insurance, Demand Sheets, Document Management, Service History and 22 reports. The flow diagrams cover **none** of these except an "FD List" and "Payments". The agreement lists 4 loan types (Ordinary, Salary, Education, Deposit/Share Capital). The diagrams show Ordinary, Educational and "Other". → Precedence proposal D-003; mapping in Q-106.
2. **Hidden accounting module.** The reports list includes General Ledger, Trial Balance, P&L, Balance Sheet, Day Book, Cash Book and Bank Book. These need full double-entry accounting (chart of accounts, vouchers, period closing). That is a module in its own right and is **not described anywhere** in the scope. → Proposed for P2 (D-013), Q-401.
3. **Open member "Signup" is risky.** Membership in a co-op society is granted by the society, and the agreement places registration in the Member Master. Proposal: members are pre-registered by staff, then **activate** their portal account with Employee ID + mobile OTP. "Preference Signup" has no definition. → D-009, Q-105.
4. **Members editing payments** ("Payment/Index → Edit → New" on the member diagram) would let members alter financial records. Proposal: the member view of payments is read-only. → D-010, Q-107.
5. **Separate index pages per loan type** (Ordinary / Educational / Other / Top-up) multiply screens for no user benefit. Proposal: one Loans index with type tabs. → D-005.
6. **Workflow stages drawn as separate pages** (Loan Review, DDO Manual, Sanction, Disbursement). Proposal: one Loan Detail page with a stage action panel, plus a role-filtered **Work Queue**. Fewer screens, clearer audit trail. → D-006.
7. **The DDO flow is drawn like a member flow** (signup, new loan). A DDO is normally a department officer, not necessarily a society member. → Q-101.
8. **Settings appear in Member, Approver and Disbursement flows** with Loan Rates and FD Rates. These should be read-only views for non-admins. → Q-108.
9. **The "Mobile Application"** in the agreement may imply a native app. I recommended responsive web. **You chose a separate native app** (D-019): Expo React Native, Android APK. Consequence: a shared mock API server is needed so cross-app hand-offs work in demos (D-021).
10. **Email + WhatsApp** buttons on dashboards: no rules exist for what gets sent, when, or to whom. Proposal: simulated notification log and template settings only. → D-012.

## 7. MVP definition (accepted, D-023)

**MVP prototype = the thin vertical slice that proves the agreement's core rules end to end:**

1. Login with demo persona switch (6 roles)
2. Member Master: list, create/edit, profile with service history, shares, documents, department transfer
3. Loans: application (staff and member), eligibility checks, surety confirmation, accountant review, DDO validation, assessment, sanction, disbursement, top-up with share-deposit netting and interest settlement
4. Deposits: FD fully; CRD, SRDS and Savings as accounts with ledgers (scheme rules pending)
5. Demand sheets: generate department-wise, partial recovery with priority allocation, receipts
6. Member mobile app (Android): login/activation, home, profile, loans, apply, top-up, surety inbox, deposits, statements, calculators, notifications, help, settings
7. Reports: catalogue of all 22 plus 8 priority reports fully designed
8. Settings: loan products and rates, deposit schemes and rates, insurance, departments, users and permissions, notification templates

**Out of MVP (P2):** accounting books (GL, TB, P&L, BS, Day/Cash/Bank Book), audit log viewer, Telugu localisation, push notifications, iOS build, real integrations.

**Out of prototype entirely:** backend, real auth, real messaging, hosting, data migration, training.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Business rules unknown (CRD, SRDS, RRF, EMI variant, penal, insurance frequency) | Wrong numbers in the demo damage client trust | Settings-driven engine. Placeholder values are labelled in docs. Batch 3 questions go to the society |
| Prototype mistaken for a working system | Pressure to "just connect it" | Clear "Demo data" badge. Service layer designed for backend swap (07 §4) |
| Fusil may already have a product with its own data model and API | UI may not map onto it | Q-005: confirm before M1 |
| Scope creep from 22 reports and accounting | Timeline | D-013 P2 split |

## 9. Update v0.3: findings from the society's paper forms (doc 16)

- **Paper is the real system today.** The seven forms (Membership, Ordinary/Education loan, Salary loan, FD, two recovery agreements) show the current process: forms go hand to hand between the applicant, sureties, the DDO, the office, the Secretary and the President, with every value re-written by hand. The biggest wins are **pre-filling from Member Master** and **turning "For Office Use" into computed panels**.
- **New capability: digital joining** (D-026). Prospective members apply in the app and track their application through a stage tracker until a General No. is allotted.
- **Roles clarified:** the DDO is the department's Asst. Secretary / Section Officer (Claims), sanction needs the Secretary and the President, and a Cashier receives cash with denominations.
- **Rules confirmed:** max 100 instalments, the salary-loan net-pay formula, FD payout options and joint/minor rules, salary + gratuity recovery authorisation.
- **Risk:** the agreement text on the forms still names the predecessor "Andhra Pradesh Secretariat Staff Co-operative Society". The digital consent text needs legal review (Q-505).
