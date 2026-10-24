# 17 · Member Sitemap Review (Envizon "TGSECCSL Application Sitemap", Members)

> Version 0.1 · 2026-10-24 · Source tag **[SM]** = this sitemap (newer than the 6-page flow diagram [F], member page).
> Purpose: check that the Member App plan (docs 04/05/06/10) and the M0 code match the latest sitemap, and list gaps both ways.

## 1. Verdict

**We are on the same track.** Every sitemap node maps to a planned screen, and the app's 5-tab structure (Home · Loans · Deposits · Payments · More) is the same information architecture: the sitemap's "Settings / Index" is our **More** tab.
Differences fall into three groups:
- **A.** Things the sitemap adds that we should adopt (3).
- **B.** Things the agreement or paper forms require that the sitemap is missing (9). We keep them.
- **C.** Conflicts or unclear points to decide (6).

## 2. Node-by-node mapping

| Sitemap node | Our screen | Status |
|---|---|---|
| Login | MA-01 (+ MJ-01 Welcome before it) | ✅ |
| Dashboard | MB-01 Home | ✅ |
| Loans → List of Loans | MB-03 My loans | ✅ |
| New Loan → Ordinary / Educational / Other Loan | MB-05 step 1 (loan type) | ✅ "Other" = Q-106 |
| Loan Requirements | MB-05 step 2 | ✅ |
| Surety Confirmation | MB-05 sureties step (applicant) + MB-07 (surety's side) | ✅ (sitemap shows only the applicant side, see B2) |
| Validation by Accountant → Validation by DDO → Loan Assessment → Loan Sanction → Loan Disbursement | **MB-04 stage tracker** (read-only). The actions happen in the Admin Console (ST-24 … ST-28) | ✅ same order as doc 10. Drawn as pages, but for a member they are tracker stages |
| Loan Details | MB-04 | ✅ |
| Topup Loan → Loan Requirements | MB-06 | ✅ |
| Fixed Deposits → List of Fixed Deposits | MB-08 (FD tab) | ✅ ours also shows CRD/SRDS/Savings (B4) |
| New FD | MB-15 | ✅ |
| FD list → "Loan Details" → Loan Requirements | **Loan against FD (Deposit loan)** from MB-09 | ⚠ adopt (A1). Label looks wrong (C4) |
| Payment / Index | MB-10 | ✅ |
| Payment → Edit → New | — | ❌ conflicts with D-010 read-only (C1) |
| Email → WhatsApp | MB-13 contact options (+ notification channels) | ⚠ purpose unclear (C5) |
| Settings / Index | **More** tab | ✅ |
| Interest Rates Index | inside MB-14 | ⚠ promote to its own screen (A2) |
| Help / Support | MB-13 | ✅ |
| Profile Settings / Edit | MB-02 (view + "request correction") | ⚠ conflict on editing (C2) |
| Settings / Notification | MB-14 | ✅ |
| Change Password | inside MB-14 | ⚠ promote to its own screen (A3) |
| Settings list: General, Permissions, Notifications, Loan Rates, FD Rates | Member sees Notifications + rates only | ❌ General/Permissions are admin items (C3) |

## 3. A: adopt from the sitemap
| # | Change | Where |
|---|---|---|
| A1 | **"Take a loan against this FD"** action on FD details → MB-05 with Deposit/Share Capital loan pre-selected and the FD pledged as security (BR-015, F2 item 8 "security tendered") | MB-09, MB-05 |
| A2 | **Interest Rates** as its own screen: loan rates per product + FD slab rates (read-only) | new **MB-16** |
| A3 | **Change Password** as its own screen | new **MB-17** |

## 4. B: required elsewhere, missing in the sitemap (we keep them)
| # | Missing in sitemap | Required by | Our screen |
|---|---|---|---|
| B1 | **Become a member** (join flow + stage tracker) and **account activation / forgot password**. The sitemap starts at Login, so it never says how a member gets credentials | User request (D-026), PF F1 | MJ-01…05, MA-02, MA-03 |
| B2 | **Surety requests inbox**: the person *asked* to be a surety needs a place to confirm. The sitemap only shows the applicant's side | F2 items 9–12 | MB-07 |
| B3 | **Salary loan** form (no sureties, no DDO step) | PF F3, D-030 | MB-05 salary variant |
| B4 | **CRD, SRDS, Savings** balances | Agreement §3.2 ("check deposit details") | MB-08 |
| B5 | **Loan & deposit calculators** | Agreement §3.1 | MB-11 |
| B6 | **Notifications inbox** (the sitemap has notification *settings* only) | Flow diagrams (Email/WhatsApp), usability | MB-12 |
| B7 | **Profile, documents & signed agreements** view | Agreement §3.1, PF F5/F6 | MB-02 |
| B8 | **Two-step sanction** (Secretary → President) in the tracker | PF forms, D-027 | MB-04 tracker labels |
| B9 | **FD status after request** (payment → acceptance → FDR) | PF F4 | MB-09 / MB-15 status |

## 5. C: conflicts and unclear points (need your decision)
| # | Issue | Our recommendation | Question |
|---|---|---|---|
| C1 | Payment → **Edit → New**: members creating or editing payments would let them alter financial records | Read-only statements + receipts (D-010). "New" could mean **"I paid at the bank, here's my reference"** for staff to verify | Q-107 |
| C2 | **Profile Settings / Edit**: member master data is DDO-certified and staff-owned (doc 16) | Members edit **contact details only** (mobile via OTP, email, present address, photo). Changes to name, DOB, department, designation, nominee or pay go through **"Request a change"**, which staff approve | Q-117 |
| C3 | Settings list shows **General, Permissions** for members | Member settings = Notifications, Change password, Interest rates (view). General/Permissions are console-only (D-033) | Q-108 |
| C4 | FD branch node is labelled **"Loan Details"** | Read it as **"FD Details" → "Loan against FD"** (A1) | Q-118 |
| C5 | **Email → WhatsApp** off the Dashboard: contact the society? share statements? receive alerts? | Treat as "Contact society" (email / WhatsApp chat link) in Help, and as notification channels in settings | Q-119 |
| C6 | Every loan type goes through Surety + DDO in the sitemap | Per-product stages (D-030): Salary loan skips both (F3) | Q-502 |

## 6. Copy fixes (sitemap typos → UI text)
Ineterest → **Interest** · Eductional → **Education** · Surity → **Surety** · Assesment → **Assessment** · Santion → **Sanction** · Deposites → **Deposits** · Whatsup → **WhatsApp**.

## 7. Impact on scope
Member App: 25 → **27 screens** (+MB-16 Interest rates, +MB-17 Change password). Total MVP: 63 → **65 screens** (D-042). No change to the Admin Console. M0 code needs no changes: these screens belong to M8 (rates, password) and M6 (loan against FD).
## 8. Decisions taken (2026-10-24)
| Issue | Decision |
|---|---|
| C1 Payments | **View + report a payment** (D-043): statements and receipts stay read-only. Members can report "I paid at the bank" with a reference and a screenshot; the cashier verifies it before it counts. New MB-18 + ST-47 |
| C2 Profile | **Contact edit + request the rest** (D-044): email, present address and photo edited directly, mobile changed via OTP. Name, DOB, department, designation, nominee and pay go through "Request a change", approved by staff. New MB-19 + ST-18 |
| C4 FD branch | **Loan against FD** (D-045): FD details get "Take a loan against this FD" |
| C3, C5, C6 | C3 → member settings exclude General/Permissions (D-033). C5 still open (Q-119). C6 per-product stages (D-030) |

**Final impact:** Member App 25 → **29** screens (+MB-16 rates, MB-17 password, MB-18 report payment, MB-19 edit profile). Console overlays 9 → **11** (+ST-18 change-request drawer, ST-47 verify-payment drawer). **Total MVP 67 screens.**
