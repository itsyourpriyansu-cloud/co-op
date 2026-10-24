# 03 · Roles & Permissions

> Version 0.3 · 2026-10-24 · Roles from the flow diagrams [F] and the paper forms [PF]. Action-level permissions are **[P]** (D-016, D-037).
> Platform rule (D-033): R1–R5 use the **Admin Console** (desktop web) only. R6–R7 use the **Member App** (Android) only.

## 1. Roles

| ID | Role | App | Data scope [P] | Responsibilities | Source |
|---|---|---|---|---|---|
| R1 | Super Admin (Admins, Owners) | Admin Console | All | Settings, users, permissions, oversight. Views all stages | F |
| R2 | Accountant | Admin Console | All | Office review of membership & loans, Assessment ("For Office Use"), demand sheets, recoveries, apply on behalf | F |
| R3a | **Secretary** | Admin Console | All | 1st sign-off: loan sanction, FD acceptance, membership approval (Q-511) | PF, D-027 |
| R3b | **President** | Admin Console | All | 2nd (final) sign-off on the same items | PF, D-027 |
| R4 | **Cashier / Disbursement Officer** | Admin Console | All | Cash/transfer receipts with denominations, FD payment receipt, loan disbursement | F, PF (Q-509) |
| R5 | DDO (Asst. Secretary to Govt / Section Officer (Claims)) | Admin Console | **Own department only** | Certify membership items 1–7, certify loan items 1–5, agree salary-recovery mandates, view own department's demand sheets | F, PF |
| R6 | Member | Member App | Own records + loans where they are a surety | Self-service, loan/FD applications, surety confirmations, sign agreements | A, F |
| R7 | Applicant (not yet a member) | Member App (applicant mode) | Own application only | Apply for membership, upload documents, sign declarations, track stage, respond to info requests | PF, D-026 |

A user has one role [P]. A person who is both a member and a staff user (e.g. an accountant who is also a member) has **two separate logins**: a member account in the app and a staff account in the console. The two are never mixed.

## 2. Permission matrix [P]

Legend: **F** full · **V** view · **A** stage action · **—** none · *own* / *dept* scoping

| Module / action | R1 | R2 | R3a Sec | R3b Pres | R4 Cash | R5 DDO | R6 Member | R7 Applicant |
|---|---|---|---|---|---|---|---|---|
| Dashboard | V | V | V | V | V | V *dept* | Home *own* | Tracker *own* |
| Work Queue | V all | A | A | A | A | A *dept* | Surety requests | — |
| **Membership applications** list/view | V | V | V | V | V | V *dept* | — | V *own* |
| Membership: submit / respond to info request | — | — | — | — | — | — | — | **F** *own* |
| Membership: DDO certify (items 1–7) + agree mandate | — | — | — | — | — | **A** *dept* | — | — |
| Membership: office review / return / reject | V | **A** | — | — | — | — | — | — |
| Membership: approve | V | — | **A** (1st) | **A** (2nd) | — | — | — | — |
| Membership: record share payment / allot General No. | V | A | — | — | **A** (receipt) | — | — | — |
| Members: view | V | V | V | V | V | V *dept* | V *own* | — |
| Members: create / edit / transfer | F | F | — | — | — | — | — | — |
| Members: pay profile edit | F | F | — | — | — | Certify *dept* | Propose update *own* | — |
| Caste field | V | V | — | — | — | — | V *own* | V *own* |
| Recovery mandate: sign | — | — | — | — | — | — | **A** *own* | **A** *own* |
| Recovery mandate: agree | — | — | — | — | — | **A** *dept* | — | — |
| Loans: view | V | V | V | V | V | V *dept* | V *own* | — |
| Loans: apply on behalf / self | F | F | — | — | — | — | F *own* | — |
| Surety: confirm particulars + sign / decline | — | — | — | — | — | — | **A** *own* | — |
| Stage: Accountant review | V | **A** | — | — | — | — | — | — |
| Stage: DDO certify (loan items 1–5) | V | A (manual record, Q-102) | — | — | — | **A** *dept* | — | — |
| Stage: Assessment / office use | V | **A** | — | — | — | — | — | — |
| Stage: Sanction | V (override Q-112) | — | **A** (1st) | **A** (2nd) | — | — | — | — |
| Stage: Disbursement | V | — | — | — | **A** | — | — | — |
| Deposits: view | V | V | V | V | V | — | V *own* | — |
| FD: request (app) / open (counter) | F | F | — | — | F | — | F *own* | — |
| FD: record payment (cash + denominations / transfer) | — | — | — | — | **A** | — | — | — |
| FD: accept | V | — | **A** (1st) | **A** (2nd) | — | — | — | — |
| Demand sheets: generate | F | F | — | — | — | — | — | — |
| Demand sheets: certify & send | F | **A** | — | — | — | — | — | — |
| Demand sheets: view | V | V | V | V | V | V *dept* | V *own lines* | — |
| Recovery posting | F | F | — | — | — | — | — | — |
| Receipts: create (cash/bank) | F | F | — | — | **F** | — | — | — |
| Payments/statements: view | V | V | V | V | V | — | V *own* (read-only) | — |
| Payment report: submit (D-043) | — | — | — | — | — | — | **F** *own* | — |
| Payment report: verify / reject | V | A | — | — | **A** | — | — | — |
| Profile: edit contact / request change (D-044) | — | — | — | — | — | — | **F** *own* | — |
| Profile change request: decide | V | **A** | — | — | — | Certify *dept* (employment/pay) | — | — |
| Reports | V | V | V | V | V | — | — | — |
| Settings: edit | **F** | — (Q-108) | — | — | — | — | — | — |
| Settings: view rates | V | V | V | V | V | V | V | V (share value, fees) |
| Users & permissions | F | — | — | — | — | — | — | — |
| Send messages (simulated) | A | A | A | A | A | A | — | — |

## 3. Segregation of duties [P]
- SOD-1 Secretary and President sign-offs must be by two **different** users. A user holding both titles is blocked.
- SOD-2 The Accountant who assessed a loan cannot sanction it (enforced by roles).
- SOD-3 A member cannot be a surety on their own loan.
- SOD-4 The Cashier who records an FD payment cannot accept the FD (enforced by roles).
- SOD-5 Super Admin views every stage but cannot act on any stage unless the override in Q-112 is approved.

## 4. Implementation notes
- The permission map lives on the API (`role → module → actions[]`) and is enforced server-side. ST-62 edits it.
- `GET /me` returns effective permissions. The console's route guards and `<Can action>` checks, and the app's mode (applicant vs member), are driven by it.
- Denied console routes → SYS-01. The app never shows features outside the user's mode.
