# 05 · Screen Inventory: How Many Things We Build

> Version 0.4 · 2026-10-24 · Accepted MVP (D-036), incl. the membership join flow (D-026) and paper-form digitisation (doc 16)
> Complexity: **S** simple · **M** standard · **L** complex. Columns: **Lean** = loan-lifecycle demo · **MVP** = accepted · **Full** = everything
> Source: A agreement · F flow diagram · PF paper form · P proposal

## 1. Headline count

Three deliverables: **Admin Console** (desktop web, React + Vite), **Member App** (Android, Expo React Native), **Mock API** (shared).

| Build item | Lean | **MVP (accepted)** | Full |
|---|---|---|---|
| Admin Console pages | 14 | **38** | 40 |
| Member App screens | 12 | **29** | 29 |
| **Total screens** | 26 | **67** | 69 |
| Overlays (decision drawers / dialogs with business logic) | 6 | **11** | 11 |
| Dashboard role variants (console) | 3 | **5** (Admin, Accountant, Secretary/President, Cashier, DDO) | 5 |
| Report templates | 0 | **8** | 22 |
| Printables (receipt, sanction letter, defaulter notice, demand sheet, membership form, Ordinary/Education loan form, Salary loan form, FD form + FDR, recovery agreement) | 1 | **9** | 10 (+ gratuity letter) |
| Mock API endpoints (approx.) | ≈ 35 | **≈ 85** | ≈ 95 |
| Domain functions (tested) | 6 | **15** | 15 (+ accounting) |
| Mock entities | 13 | **26** | 30 |
| Settings-driven rules | 6 | **20** | 20 |

## 2. Admin Console (desktop web)

### Auth & system (5)
| ID | Screen | Roles | Src | Cx | Lean | MVP |
|---|---|---|---|---|---|---|
| AU-01 | Staff login (+ demo persona picker) | R1–R5 | F | M | ✓ | ✓ |
| AU-03 | Forgot password / OTP reset | R1–R5 | P | S | | ✓ |
| SYS-01 | No access (403) | R1–R5 | P | S | ✓ | ✓ |
| SYS-02 | Not found (404) | R1–R5 | P | S | ✓ | ✓ |
| SYS-03 | Error / maintenance | R1–R5 | P | S | | ✓ |

### Common (4)
| ID | Screen | Roles | Src | Cx | Lean | MVP |
|---|---|---|---|---|---|---|
| ST-01 | Dashboard (role variants) | R1–R5 | F | L | ✓ | ✓ |
| ST-02 | Work Queue (certify, review, assess, sign-off, disburse, receipts) | R1–R5 | P | M | ✓ | ✓ |
| ST-03 | Notifications + simulated message composer | R1–R5 | F | S | | ✓ |
| ST-04 | My profile & password | R1–R5 | P | S | | P2 |

### Membership & Members (5 pages + 3 overlays)
| ID | Screen | Roles | Src | Cx | Lean | MVP |
|---|---|---|---|---|---|---|
| ST-14 | **Joining: Membership Applications** (pipeline board + table by stage) | R1–R5 | PF D-026 | M | | ✓ |
| ST-15 | **Membership Application detail** (form F1 view, documents, declarations, mandate, stage log, actions) | R1–R5 | PF | L | | ✓ |
| ⧉ ST-16 | DDO Certify drawer (items 1–7 + agree recovery mandate) | R5 | PF | M | | ✓ |
| ⧉ ST-17 | Approval drawer (Secretary → President) + General No. allotment on activation | R3a, R3b, R2 | PF | M | | ✓ |
| ST-10 | Member index | R1–R5 | F | M | ✓ | ✓ |
| ST-11 | Member create / edit (incl. pay profile) | R1, R2 | A F | L | ✓ | ✓ |
| ST-12 | Member profile (Overview · Service · Pay profile · Shares · Deposits · Loans · Surety for · Insurance · Ledger · Documents · Agreements) | R1–R5 | A F PF | L | ✓ | ✓ |
| ⧉ ST-18 | Profile change-request drawer (approve/reject member-requested changes, D-044) | R2, R5 (employment/pay) | SM | S | | ✓ |
| ⧉ ST-13 | Department transfer dialog (incl. "outside Secretariat", flags mandate for the new DDO) | R1, R2 | A PF | S | ✓ | ✓ |

### Loans (4 pages + 5 overlays)
| ID | Screen | Roles | Src | Cx | Lean | MVP |
|---|---|---|---|---|---|---|
| ST-20 | Loans index (type tabs + status) | R1–R5 | F | M | ✓ | ✓ |
| ST-21 | New / edit application on behalf (product-specific form: F2 or F3 layout) | R1, R2 | A F PF | L | ✓ | ✓ |
| ST-22 | New top-up | R1, R2 | A F | M | ✓ | ✓ |
| ST-23 | Loan detail (tabs: Overview · Sureties · Office use · Schedule · Documents · Log) | All staff | F | L | ✓ | ✓ |
| ⧉ ST-24 | Accountant review drawer | R2 | F | M | ✓ | ✓ |
| ⧉ ST-25 | DDO certify drawer (items 1–5) / accountant manual record | R5, R2 | F PF | S | ✓ | ✓ |
| ⧉ ST-26 | Assessment drawer = "For Office Use" (OL/SL balance, interest, dates, surety recoveries, share netting, top-up settlement, net) | R2 | F PF | L | ✓ | ✓ |
| ⧉ ST-27 | Sanction drawer (Secretary → President sign-off block) | R3a, R3b | F PF | S | ✓ | ✓ |
| ⧉ ST-28 | Disbursement drawer | R4 | F | M | ✓ | ✓ |

### Deposits (3 pages + 1 overlay)
| ID | Screen | Roles | Src | Cx | Lean | MVP |
|---|---|---|---|---|---|---|
| ST-30 | Deposits index (FD · CRD · SRDS · Savings · **FD requests**) | R1–R4 | A F | M | | ✓ |
| ST-31 | Open deposit at counter (F4 layout: holders, joint/minor, payout, nominee) | R1, R2, R4 | A PF | M | | ✓ |
| ST-32 | Deposit detail (ledger, maturity, FDR) | R1–R4 | A | M | | ✓ |
| ⧉ ST-33 | FD payment + acceptance drawer (cashier receipt → Secretary → President → FDR No.) | R4, R3a, R3b | PF | M | | ✓ |

### Collections (7)
| ID | Screen | Roles | Src | Cx | MVP |
|---|---|---|---|---|---|
| ST-40 | Demand sheets index | R1–R5 | A | M | ✓ |
| ST-41 | Generate demand sheet | R1, R2 | A | M | ✓ |
| ST-42 | Demand sheet detail (+ **Certify & send to DDO**, BR-030) | R1–R5 | A PF | L | ✓ |
| ST-43 | Recovery entry & allocation | R1, R2 | A | L | ✓ |
| ST-44 | Payments / receipts index | R1–R4 | F | M | ✓ |
| ST-45 | New receipt (cash with **denomination counter** / bank transfer. Heads incl. share capital) | R1, R2, R4 | F PF | M | ✓ |
| ST-46 | Receipt detail | R1–R4 | F | S | ✓ |
| ⧉ ST-47 | Verify member-reported payment drawer (match bank reference → create receipt, or reject with reason, D-043). ST-44 gets a "Reported by members" tab | R4, R2 | SM | S | ✓ |

### Reports & prints (3)
| ID | Screen | Roles | Cx | Lean | MVP |
|---|---|---|---|---|---|
| ST-50 | Reports catalogue | R1–R4 | S | | ✓ |
| ST-51 | Report viewer (8 templates MVP) | R1–R4 | M | | ✓ |
| ST-52 | Print preview (letterhead with Regd. No. P-929) for all 9 printables, incl. the original-layout form twins | R1–R5 | M | ✓ | ✓ |

### Settings (9)
| ID | Screen | Lean | MVP |
|---|---|---|---|
| ST-60 | General (society profile, Regd. No., address, FY, demand cycle, retirement age, share value, admission fee) | | ✓ |
| ST-61 | Users (incl. Secretary/President titles, DDO department) | | ✓ |
| ST-62 | Permissions | | ✓ |
| ST-63 | Notification templates & channels | | ✓ |
| ST-64 | Loan products & rates **+ workflow config** (sureties required, DDO certification, max instalments, sign-offs) | ✓ | ✓ |
| ST-65 | Deposit schemes & rates (FD slabs, payout options) | | ✓ |
| ST-66 | Insurance & demand rules | | ✓ |
| ST-67 | Departments & DDOs (incl. external offices) | | ✓ |
| ST-68 | Audit log | | P2 |

**Admin Console MVP = 5 + 3 + 5 + 4 + 3 + 7 + 3 + 8 = 38 pages** (Full adds ST-04, ST-68 = 40). Overlays: ST-13, 16, 17, 18, 24–28, 33, 47 = **11**.

## 3. Member App (Android)

### Entry, auth & system (6)
| ID | Screen | Src | Cx | Lean | MVP |
|---|---|---|---|---|---|
| MJ-01 | **Welcome**: "I'm a member → Log in / Activate" · "Become a member → Apply" | P D-026 | S | | ✓ |
| MA-01 | Member login (+ demo persona picker) | F | M | ✓ | ✓ |
| MA-02 | Account activation for existing members (General No./Employee ID + mobile OTP) | D-009 | M | | ✓ |
| MA-03 | Forgot password | P | S | | ✓ |
| MA-04 | Offline / server unreachable | P | S | ✓ | ✓ |
| MA-05 | Hidden demo settings | P | S | ✓ | ✓ |

### Joining: applicant mode (4)
| ID | Screen | Src | Cx | MVP |
|---|---|---|---|---|
| MJ-02 | Applicant sign-up (mobile + OTP + name) | P | S | ✓ |
| MJ-03 | Eligibility check (Secretariat dept? Regular / approved probationer? Not in another credit society?) | PF BR-026 | S | ✓ |
| MJ-04 | Membership application wizard (Personal · Address · Employment · Shares & Nominee · Documents · Declarations & Recovery agreement · Review & Sign with OTP) | PF F1 F6 | L | ✓ |
| MJ-05 | **Application stage tracker** (stages, dates, info requests, share payment instructions, "Welcome, General No. X" → member mode) | D-026 | M | ✓ |

### Member mode (15)
| ID | Screen | Src | Cx | Lean | MVP |
|---|---|---|---|---|---|
| MB-01 | Home | A F | M | ✓ | ✓ |
| MB-02 | Profile (+ pay profile, documents, **my agreements**, pending change requests) | A PF | M | ✓ | ✓ |
| MB-19 | **Edit profile**: contact details direct (mobile via OTP) + "Request a change" for certified fields (D-044) | SM | M | | ✓ |
| MB-03 | My loans | F | S | ✓ | ✓ |
| MB-04 | Loan details (stage tracker, schedule, sureties) | F | M | ✓ | ✓ |
| MB-05 | Apply for loan (product-specific: F2 Ordinary/Education with sureties, F3 Salary loan) | F PF | L | ✓ | ✓ |
| MB-06 | Top-up request | A F | M | ✓ | ✓ |
| MB-07 | Surety requests (auto-filled particulars + undertaking + Sign with OTP) | F PF | M | ✓ | ✓ |
| MB-08 | My deposits | A | S | | ✓ |
| MB-09 | Deposit details + FDR + **"Take a loan against this FD"** (D-045) | A PF SM | S | | ✓ |
| MB-15 | **Open FD request** (F4: amount, period, payout, joint/minor, nominee, rules, sign) | PF | M | | ✓ |
| MB-10 | Payments & statements (read-only) + reported payments with status | F SM | M | | ✓ |
| MB-18 | **Report a payment** (amount, date, mode, reference, screenshot → cashier verifies, D-043) | SM | S | | ✓ |
| MB-11 | Calculators | A | M | ✓ | ✓ |
| MB-12 | Notifications | F | S | ✓ | ✓ |
| MB-13 | Help & support | F | S | | ✓ |
| MB-14 | Settings / Notifications (channel preferences) | F SM | S | | ✓ |
| MB-16 | **Interest rates** (loan products + FD slabs, read-only) | SM | S | | ✓ |
| MB-17 | **Change password** | SM | S | | ✓ |

**Member App MVP = 6 + 4 + 19 = 29 screens.** (Member mode 15 + MB-16, 17, 18, 19)

## 4. Traceability: sources → screens

| Source | Screens |
|---|---|
| F1 Membership form | MJ-02..05, ST-14..17, ST-52 print |
| F2 Ordinary/Education loan form | MB-05, MB-07, ST-21, ST-23..27, ST-52 print |
| F3 Salary loan form | MB-05 (salary variant), ST-21, ST-26 (office use), ST-27, ST-52 print |
| F4 FD form | MB-15, MB-09, ST-30, ST-31, ST-33, ST-45, ST-52 FDR print |
| Member sitemap [SM] (doc 17) | MB-01…MB-19. More tab = "Settings / Index" |
| F5/F6 Agreements | MJ-04 (sign), ST-16 (agree), ST-12/MB-02 Agreements tab, ST-13 (transfer), ST-52 print |
| Flow-diagram nodes | Loans list → ST-20 · Loan Review → ST-24 · DDO / DDO Manual → ST-25 · Assessment → ST-26 · Sanction/Approval → ST-27 · Disbursement → ST-28 · FD List → ST-30 · Payments → ST-44..46 · Member Index → ST-10..12 · Reports → ST-50..52 · Settings → ST-60..67 · Signup → MJ-01/MA-02 · Preference Signup → unresolved (Q-116) |
| Agreement-only items | CRD/SRDS/Savings (ST-30..32), Insurance (ST-66), Demand (ST-40..43), Calculators (MB-11), Reports (ST-51) |
