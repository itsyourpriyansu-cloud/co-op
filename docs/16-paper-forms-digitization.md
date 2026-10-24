# 16 · Paper Forms → Digital Flows

> Version 0.1 · 2026-10-24
> Source: 7 photographs of the society's current paper forms, provided 2026-10-24. Tag **[PF]** = confirmed by a paper form.
> Society letterhead [PF]: *The Telangana Secretariat Employees Cooperative Credit Society Limited · Regd. No. P-929 · 2nd Floor, West Ancillary Building, Dr. B.R Ambedkar Telangana Secretariat, Hyderabad-500004.*

## 0. Digitisation principles (D-032)

1. **Never ask for what the system already knows.** Anything held in Member Master (name, DOB, DOR, designation, office, shares, pay profile) is pre-filled and read-only in applications. The member only confirms it.
2. **"For Office Use" blocks become computed panels.** Balances, dates and recoveries are calculated by the system and reviewed by the accountant. Nobody types them.
3. **Every signature becomes a signed digital step:** consent text + "Sign with OTP" + a record of who, when, which device and which version of the text (D-031). Every certificate becomes a role action (DDO *Certify*, Secretary/President *Approve*).
4. **Every form has a printable twin** in the society's original layout, so the office can still file paper while it transitions (ST-53).
5. **Computed columns stay computed** (e.g. "Net substantive pay = Col 5 − Col 6 − Col 7").

---

## F1 · Application for Membership (white form) [PF]

### Field mapping
| # | Paper field | Digital field | Captured by | Notes |
|---|---|---|---|---|
| 1 | Name in full (block letters) | `fullName` (auto-uppercased on print) | Applicant | |
| 2 | Father's Name | `fatherName` | Applicant | |
| 3 | Date of Birth | `dob` | Applicant | Age validation (18+) |
| 4a | Present Address | `presentAddress` | Applicant | Structured: line1, line2, city, district, PIN |
| 4b | Permanent Address | `permanentAddress` | Applicant | "Same as present" toggle |
| 4c | Mobile Number | `mobile` | Verified by OTP at sign-up | |
| 5 | Designation | `designation` | Applicant (select + other) | DDO certifies |
| 6 | Office in which employed | `departmentId` + `section` | Applicant (department picker) | Drives the DDO routing |
| 7a | Date of regular appointment in the Secretariat Department | `regularAppointmentDate` | Applicant | DDO certifies |
| 7b | If approved probationer, total service in the Secretariat Department | `employmentType: REGULAR \| APPROVED_PROBATIONER`, `probationServiceMonths` | Applicant | Eligibility (BR-026) |
| 8 | No. of shares proposed to be taken | `sharesProposed` | Applicant | Min shares / share value: Q-506 |
| 9 | Nominee: name + permanent address, in the event of death | `nominee {name, relation, address, dob?}` | Applicant | Relation added [P] (matches the agreement's Member Master) |
| Decl (a) | I accept the Bye-laws of the society as binding upon me | `declarations.byelawsAccepted` + link to bye-laws PDF | Applicant (sign with OTP) | Show the key points up front, not behind a link |
| Decl (b) | Not a member of any other co-op credit society, no dues payable | `declarations.noOtherSocietyMembership` | Applicant (sign with OTP) | |
| Cert | "Certified that the information against items 1 to 7 is correct" signed by Asst. Secretary to Government, Department | `ddoCertification {by, at, remarks}` | **DDO** | Field-by-field confirm, or Return with a reason |
| P.T.O. | Back side not provided | — | — | Q-506 |

Also captured during joining [P]: photo, ID proof, appointment order / service certificate (Q-403) and the **Salary Recovery Authorisation** (F6) signed by the applicant.

### Flow: "Join the society" (stage tracker, D-026)
```
App: Welcome → Become a member → mobile OTP → Eligibility check (3 questions)
   → Application wizard (Personal · Address · Employment · Shares & Nominee · Documents · Declarations & Authorisation · Review)
   → Sign with OTP → SUBMITTED ("You're in the queue")
Admin: DDO certifies (items 1–7 + agrees recovery authorisation)  → Office review (Accountant)
   → Secretary approves → President approves → APPROVED: share payment pending
   → share paid at the counter OR scheduled on the first demand sheet (D-029)
   → ACTIVE: General No. allotted, member record created, app switches to member mode
```
The applicant sees each stage with a date, what's happening, and any action needed ("Re-upload appointment order"). There is no queue position number (D-026).

---

## F2 · Ordinary Loan / Education Loan Application (green form, 2 sides) [PF]

### Applicant section
| # | Paper field | Digital source |
|---|---|---|
| 1a | Name (block letters) & address, mobile | Member Master (read-only) |
| 1b | Genl. No. | Member Master `generalNo` (Q-501) |
| 2 | Date of Birth | Member Master |
| 3 | Date of retirement | Member Master → drives BR-002 |
| 4a | Office in which employed | Member Master |
| 4b | Designation | Member Master |
| 4b(i) | Scale of Pay & Pay | **Pay profile** (new, DDO-certified) |
| 4b(ii) | Total service in the officiating post | Pay profile |
| 5a | Gross salary p.m. | Applicant enters/updates → DDO certifies |
| 5b | Deductions towards Govt. loans | Applicant → DDO certifies |
| 5c | Deductions towards other loans excluding Society's loan | Applicant → DDO certifies |
| 5d | Total deductions | **Computed** = 5b + 5c |
| 5e | Net salary | **Computed** = 5a − 5d |
| 6a | No. of shares held | Share account (read-only) |
| 6b | Value of paid-up share capital | Share account (read-only) |
| 6c | No. of additional shares proposed | Applicant (Q-508) |
| 7a | Amount of loan required (figures + words) | Applicant. Words generated automatically (Indian numbering) |
| 7b | Purpose of loan | Applicant (select + free text). Education: student, institution, course [P] |
| 8 | Nature and description of security tendered | `security.type: SURETY \| DEPOSIT_PLEDGE \| OTHER` + description (Q-507) |
| 11 | No. of monthly instalments (not exceeding 100) | Applicant. **Max 100** (BR-022) ∩ BR-002 ∩ product max |

### Surety section (items 9–10): fully auto-filled
| Paper column | Digital source |
|---|---|
| (a) Name, (b) General No., (c) Office, (d) DOB, (f) Designation officiating, (g) Total service in officiating post | Surety's Member Master + pay profile |
| (e)/(i) Substantive pay, (h) Officiating pay | Surety's pay profile |
| (j) Shares held, (k) Additional shares proposed | Share account / surety enters (Q-508) |
| (l) Likely to retire during the loan? Exact date | **Computed**: DOR < projected last instalment month → ⚠ flag with date (BR-024) |
| Item 10: other loans this surety already guarantees (Name, General No., Designation, Department, Loan, Borrower, Outstanding) | **Computed** from existing LoanSurety records. The paper made the applicant write this; the system lists it |

### Declarations & certificate
| Paper | Digital |
|---|---|
| Item 12: joint authorisation (applicant + sureties) for the DDO / future pay officers to recover from salaries; on transfer, the new pay officer recovers per the society's demand; on deputation, sureties will inform the society of the applicant's address | Clause text shown in full. **Applicant signs at submit. Each surety signs on accepting** (sign with OTP) |
| Certificate: "particulars from item 1 to 5 are true & correct", Asst. Secy. (DDO) / Section Officer (Claims), Department, Seal | **DDO Certify** action on items 1–5 (per-item confirm, edit request or return). Seal → department name + DDO name + timestamp stamp on the print |
| For Office Use (front, blank) | Assessment panel (BR-007, BR-004, balances), same as the Salary Loan office-use block |

### Flow
Apply (app) → Sureties confirm particulars and sign (app) → Accountant review → DDO certify items 1–5 → Assessment (office use) → **Secretary sanction → President sanction** (D-027) → Disbursement.

---

## F3 · Application for Salary Loan (white slip, 2 sides) [PF]

| # | Paper field | Digital source |
|---|---|---|
| 1 | Name | Member Master |
| 2 | General Number | Member Master |
| 3 | Office in which employed | Member Master |
| 4 | Designation | Member Master |
| 5 | Substantive Pay | Pay profile (applicant confirms) |
| 6 | Compulsory deductions from pay: Insurance, G.P.F., Income Tax, other | Applicant enters an itemised list |
| 7 | Payments due in respect of Ordinary loans taken by the applicant | **Computed** from the active Ordinary loan's monthly demand |
| 8 | Net substantive pay for the month (Col 5 − Col 6 & 7) | **Computed** (BR-023) |
| 9 | Net pay earned up to date | Applicant enters (likely the salary earned so far this month, Q-502) |
| 10 | Amount of loan required | Applicant. Limit rule UNKNOWN (Q-502). Placeholder ≤ net pay earned up to date |
| 11 | Purpose (mention clearly) | Applicant |
| Decl | "I hereby authorise the pay Disbursing Officer to have the above loan recovered from my salary" | Sign with OTP |

**For Office Use (back) → computed Assessment panel:**
| Paper | System |
|---|---|
| OL Balance Rs. | Outstanding principal of active Ordinary loan(s) |
| SL Balance Rs. | Outstanding of active Salary loan(s) |
| Interest if any Rs. | Accrued interest to today (BR-007) |
| Total Loans Balance Rs. | Sum |
| OL Taken on / SL Taken on | Disbursement dates of those loans |
| Surety Recoveries | Amounts this member currently owes as surety for others' defaults (Q-504). Placeholder: sum of surety-recovery demand components |
| Sanctioned Rs. | Sanction amount (Secretary → President) |

**Flow (D-030, product workflow config):** Apply (app) → Accountant review & office-use panel → Secretary sanction → President sanction → Disbursement. **No sureties and no DDO certificate on this form.** Confirm in Q-502.

---

## F4 · Application for Fixed Deposit (green form) [PF]

| # | Paper field | Digital field | Notes |
|---|---|---|---|
| 1 | Name of depositor in full | Primary holder = member (D-028) | From Member Master |
| 2 | Father's / Husband's name | Member Master. For joint holders: entered | |
| 3 | Profession or occupation | Members: designation. Joint holders: entered | |
| 4 | Address, phone | Member Master. Joint holders: entered | |
| 5 | Amount of deposit (figures + words) | `principal` + auto words | Min amount Q-313 |
| 6 | Period of deposit (years …) | `tenureMonths` (picker by slab) | |
| 7 | Rate of interest p.a. | **Auto** from slab (ST-65) | Read-only |
| 8 | Interest payable: Monthly / Quarterly / Half-yearly / On maturity | `payoutFrequency` | [PF] confirms 4 options |
| 9 | Nominee name, address & relationship | Defaults to member's nominee, editable | |
| Joint | Deposit by two persons / three or more | `holders[]` (max 3 [P]) + `operationMode: EITHER_OR_SURVIVOR \| ANY_ONE_OR_SURVIVOR` | Rules 3–4 |
| Minor | Declaration by guardian: age today, majority date | `minor {name, dob, guardianName, guardianRelation}` → majority date computed (18th birthday) | |
| Decl | "Agree to abide by the rules…" + 4 rules | Rules shown in full + sign with OTP | |
| Office | Account No., F.D.R. No. | Generated on acceptance | FDR = digital deposit receipt in the app + printable |
| Office | ACCEPTED: Secretary, President | Secretary accept → President accept (D-027) | |
| Cash slip | Denominations 500/200/100/50/20/10, "Received cash from Sri … towards deposit", cashier signature & seal | **Cashier receipt** with a denomination counter that auto-totals and must equal the amount (BR-029) | Or bank transfer reference |

**Rules relating to FD [PF], kept verbatim in the app and on the FDR:** (1) the society is not bound to give notice of maturity; (2) interest ceases from the date fixed for repayment; (3) payment to either/survivor (2 persons) or any one/survivor (3+) completely discharges the society; (4) renewal in the name of either/survivor or any one has the same effect.
UX note: rule 1 is a legal disclaimer. The app still sends maturity reminders as a courtesy [P].

**Flow:** Member: App → Open FD (or staff at counter, ST-31) → `REQUESTED` → payment received (cashier: cash with denominations / transfer) → `PAYMENT_RECEIVED` → Secretary accepts → President accepts → `ACTIVE`, FDR No. issued, FDR visible in the app.

---

## F5 · Agreement with the Society: Version A (to the Secretary) [PF]
Member authorises recovery from monthly salary of loan instalments and other sums due **as borrower or as surety**, and recovery of unpaid sums at retirement or earlier death **from gratuity**.
⚠ The printed form is addressed to "The Andhra Pradesh Secretariat Staff Co-operative Society Ltd." (legacy name). The digital text must be legally reviewed and updated (Q-505).

## F6 · Agreement with the Society: Version B (to the Asst./Deputy Secretary, i.e. the pay disbursing officer) [PF]
Member authorises the current and future pay disbursing officers to recover, on the society's demand, loan instalments, **thrift deposit** and other sums. A society officer's certified demand is conclusive evidence of liability. Recovery cannot be suspended at the member's request. Unpaid sums at retirement/death come from gratuity. On transfer out of the Secretariat, a copy of the agreement goes to the new pay officer, who recovers per the demand list. Countersigned **"AGREED"** by the Asst./Deputy Secretary to Govt of the Department.

### Digital model: `RecoveryMandate` (one per member, versioned)
- Signed by the member during joining (or by existing members at first app login if none is on file [P]), with sign-with-OTP.
- **AGREED** by the member's DDO in the Admin Console (part of the DDO certification step).
- Visible in the member profile ("My agreements"). The printable twin uses the original layout.
- On a department transfer, the system flags the mandate for the new DDO to agree (BR-028), and the next demand sheet goes to the new DDO.
- Feeds a future "Retirement / death settlement" letter requesting recovery from gratuity (P2, Q-513).

---

## Rules discovered from the forms (added to `09`)
| ID | Rule | Source |
|---|---|---|
| BR-022 | Ordinary/Education repayment ≤ **100** monthly instalments | F2 item 11 |
| BR-023 | Salary loan: net substantive pay = substantive pay − compulsory deductions − Ordinary loan dues | F3 item 8 |
| BR-024 | Flag a surety whose DOR falls before the loan's last instalment | F2 item 9(l) |
| BR-025 | Ordinary loan: net salary = gross − (Govt loan deductions + other non-society loan deductions) | F2 item 5 |
| BR-026 | Membership eligibility: Secretariat Department employee, regular appointment or approved probationer, not a member of another co-op credit society with dues, accepts the bye-laws | F1 |
| BR-027 | FD: payout options, joint/survivor discharge, minor via guardian, interest ceases at maturity, Secretary + President acceptance | F4 |
| BR-028 | A salary recovery authorisation (borrower and surety) is required. Gratuity recovery at exit. Transfer → new DDO agrees | F5, F6 |
| BR-029 | Cash receipts record denominations (500/200/100/50/20/10), and the total must equal the amount | F4 |
| BR-030 | Demand sheets are certified by a society officer before being sent to the DDO (conclusive evidence of liability) | F6 |
| BR-031 | Sanction / FD acceptance / membership approval: Secretary then President (sequential) | F1? F2 F3 F4 + D-027 |

## What the forms do NOT tell us (added to open questions, Batch 5)
General No. meaning (Q-501) · Salary loan limits and repayment (Q-502) · Repayment-capacity rule (Q-503) · Surety disqualification and limits (Q-504) · Legal text and e-sign acceptability (Q-505) · Back sides of the membership/loan forms, min shares, share value, admission fee (Q-506) · Security types (Q-507) · Additional shares with loans (Q-508) · Cashier vs disbursement role (Q-509) · Activation timing when shares are paid by salary deduction (Q-510) · Membership approvers (Q-511) · Deputation recoveries (Q-512) · Gratuity settlement letters (Q-513).
