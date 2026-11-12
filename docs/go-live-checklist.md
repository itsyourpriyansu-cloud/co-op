# Go-live: parallel run, cutover and support plan

> Version 0.1 · 2026-11-12 · G8 (D-118). For the society's managing committee, the Accountant and Envizon. Dates are agreed at the readiness meeting; a box is ticked only with the evidence named next to it.

## 1. Readiness (decide go / no-go)

| # | Item | Evidence | ✔ |
|---|---|---|---|
| R1 | Production built from Bicep, first Super Admin created, bootstrap settings removed | `infra/README.md` §1–4 done; screenshot of `/health` | |
| R2 | Secrets in Key Vault; offline sealed copy of `DATA-ENCRYPTION-KEY` in the society safe | Secretary's signed note | |
| R3 | WhatsApp Business number verified, `society_notice` and `login_code` templates approved, `WHATSAPP-TOKEN` set (F-10) | A test member receives a real code | |
| R4 | Email sender works (Azure-managed or the society's domain) | Test email received | |
| R5 | Apps in the stores (internal / TestFlight at least), pointed at production, `minAppVersion` set | Store links; sign-in on an Android and an iPhone (docs/23 S10) | |
| R6 | UAT signed off, no open P1 / P2 | `docs/uat-script.md` sign-off page | |
| R7 | Staff trained, each with an account and authenticator | Attendance sheet; Admin → Users | |
| R8 | Settings confirmed by the committee: rates, slabs, limits, penalties, service targets, holidays, retention (every "placeholder") | Minutes of the committee meeting | |
| R9 | Privacy notice and the app-store texts approved | `/privacy`, `/account-deletion`, `docs/store-release.md` | |
| R10 | Restore drill done on production backups | Runbook §10 entry | |
| R11 | Load test on staging passed | `npm run load-test` output (docs/security-review.md §3) | |
| R12 | Support contacts and hours agreed (§4) | Runbook §9 filled | |

## 2. Parallel run (one full month, recommended)

The old books stay the books of record. The same month is run in both and compared.

1. **Rehearsal import on staging** with the real registers (F-11): members → deposits → loans → opening balances → `reconcile`. Fix register errors until the reconciliation shows no difference and 3900 is nil. Record the counts.
2. **Choose the parallel month** (for example the month before go-live). Import the balances as on the last day of the month before it.
3. During the month, every new application, loan, FD, receipt and voucher is entered in **both** the old system and staging.
4. **Month end in both:** generate the demand, enter the DDO deductions, post recovery.
5. **Compare** (Accountant, with Envizon):
   - [ ] Demand per member and per department equals the old demand
   - [ ] Recovery allocation per member equals the old allocation (head by head)
   - [ ] Interest charged per loan equals the old figure (differences under ₹1 explained by rounding)
   - [ ] Trial balance at month end equals the old trial balance, head by head
   - [ ] Every report the office uses is available and agrees
6. Each difference is either a register error (fix the data), a rule difference (decide with the committee; change the setting) or a defect (ticket). Repeat for a second month if differences remain.

## 3. Cutover

| When | Step | Who | ✔ |
|---|---|---|---|
| T-7 days | Freeze settings; announce the date to members (WhatsApp / notice board) with app links | Secretary | |
| T-3 days | Final release to production (runbook §3); staff sign in once | Envizon | |
| T-1 (evening) | Old system: stop entries; take the closing trial balance and registers as on the cutover date | Accountant | |
| T-1 (night) | Production backup; import members → deposits → loans → opening balances (`npm run db:import-register`, `npm run db:import`) | Envizon | |
| T-1 (night) | `npm run db:import -- reconcile <trial-balance.csv> --as-on <date>` shows **no difference** and 3900 nil; save the output | Envizon + Accountant | |
| T0 (morning) | Smoke test: each role signs in; one member signs in by WhatsApp code; open one loan, one FD, one member; print one receipt | All | |
| T0 | Go / no-go call. **No-go** → keep using the old system, restore the backup, fix, repeat | Secretary, President | |
| T0 | Members told they can sign in; office takes the first counter receipts in the new system | Secretary | |
| First month end | First live demand cycle end to end; compare the trial balance with expectations | Accountant + Envizon | |

**Back-out:** until the first live month end, the old system stays installed and its closing data kept. If a P1 cannot be fixed within a working day, the committee may return to the old system; entries made in the new system meanwhile are re-entered there from its receipts and vouchers (printed).

## 4. Support plan (hypercare and after)

| Period | Cover | Response |
|---|---|---|
| Hypercare: cutover to the end of the second live month end | Envizon on call during office hours (Mon–Sat, 10:00–18:00 IST) and by phone for P1 out of hours; daily check of monitoring (runbook §2); a short daily call in week 1, weekly after | P1 within 1 hour, P2 within 4 office hours, P3 within 2 working days |
| Steady state | As in the support agreement with Fusil Solutions / Envizon | As agreed there |

| Severity | Meaning | Examples |
|---|---|---|
| P1 | The system is down, or money / balances are wrong | Site down; trial balance off; members cannot sign in at all |
| P2 | One function blocked, a workaround exists | One report fails; printing one form fails |
| P3 | Question, cosmetic, wish | Wording, layout, a new report |

**How to raise an issue:** the Accountant (single point of contact) writes to the support channel with: what you did, what you expected, what happened, the member or loan number, a screenshot, and the time. Never send passwords, codes or full Aadhaar / bank numbers.

**Hand-over at the end of hypercare:** open issues list agreed, runbook contacts confirmed, quarterly restore drill and yearly tasks on the society's calendar (runbook §8).
