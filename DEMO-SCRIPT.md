# TGSECCSL prototype — demo script (≈ 30 min)

> For whoever presents the prototype to the society (Secretary, President, office staff) or to Fusil.
> Everything is fictional demo data. Nothing is sent by SMS, WhatsApp or email.
> Version 1.0 · 2026-10-25 · M10 (D-064) · Act 3 rehearsed end to end in the browser on 25 Oct 2026

## Before you start (5 min, once)

1. In the repo folder: `npm install` (first time only).
2. Start the API and the Admin Console: `npm run demo`. The console opens on http://localhost:5173 (if another project uses 5173: `npm run dev -w @tgs/admin-console -- --port 5180`).
3. Start the Member App preview: in `apps/member-app`, run `npx expo start --web --port 8090` and open http://localhost:8090 in a narrow window (or the browser's phone mode, about 412 px wide).
4. Put the two windows side by side: **console on the left, phone on the right**.
5. Reset the data: console top bar → amber **Demo** tag → **Reset demo data**. Do this again before every new audience.

| Who | How to sign in |
|---|---|
| Staff (console) | Login page → click a name. Switch later from the avatar menu → **Switch demo persona** |
| Members (phone) | Sign in → **Demo members** → tap a name (password `Society@2026` is filled in for you) |
| Applicants (phone) | Welcome → **Become a member** → *Continue as Divya S* (new) or *Ravi Teja K* (in progress) |
| Any OTP | `123456` |

Staff personas: **Anitha Rao** Super Admin · **Suresh Goud** Accountant · **Padma Reddy** Secretary · **Narasimha Rao** President · **Venkat Naidu** Cashier · **Kiran Kumar** DDO (Finance).
Members: **Lakshmi Devi** 1101 (running loan, top-up example) · **Ramaiah Chary** 1102 (retires in 14 months) · **Sravani M** 1103 (surety request waiting) · **Mahesh Babu P** 1104 (short salary recovery).

> Tip: on any workflow screen the button **Act as …** completes a step as the person who owns it, so you don't have to switch logins for every signature. Use it when time is short; switch persona when you want to show that person's screen.

---

## Act 1 · The office at a glance (3 min) — console

1. Sign in as **Suresh Goud (Accountant)**. The dashboard shows *his* queue, this month's demand sheets, payments members reported and the latest applications. Every tile opens the filtered list.
2. Switch to **Padma Reddy (Secretary)**: the same dashboard now shows what is awaiting her signature, oldest first.
3. Point out the bell (notifications), the search box (try `1104` or `Lakshmi`, or press **Ctrl K**) and the Demo tag (demo date, reset, **Simulate network errors** to show how screens recover).

## Act 2 · Joining the society (5 min) — phone → console → phone

1. Phone: **Welcome → Become a member → Continue as Divya S**. Walk the wizard (personal, address, employment, shares & nominee, documents, declarations) and **Sign with OTP** `123456`. The tracker shows *Department verification*.
2. Console as Suresh: **Joining** → Divya's application → *Print form* shows the paper F1 twin. Then use **Act as …** for each stage: Accountant → DDO certificate (items 1–7 + salary mandate) → office review → Secretary → President (choose share payment) → Cashier.
3. Phone: Divya's tracker moves with every step; at the end she gets her **General No.** and the app switches to the member home.

## Act 3 · A loan from application to money (7 min) — phone ↔ console

1. Phone, sign in as **Ramaiah (1102)** → More → **Calculators**: the months are capped because he retires soon (rule BR-002). Sign out.
2. Phone, sign in as **Lakshmi (1101)** → **Apply loan**. Ordinary is greyed out (she already has one running — the agreement's top-up example lives on her Loans tab). Choose **Education Loan** → pay details are pre-filled → ₹1,50,000 for her daughter's B.Tech (student, institution, course) → sureties: search **Sravani** and **1104** (Mahesh). Eligibility is checked live. **Sign with OTP** → *Confirm & submit*.
3. Phone, sign out → sign in as **Sravani (1103)**: Home shows *"… asked you to be a surety"*. Open it → **Agree & sign with OTP**. Do the same as **Mahesh (1104)**.
4. Console (any staff; Anitha is quickest) → **Loans** → the new application → press **Act as …** six times: Accountant review → DDO certificate on items 1–5 → Accountant assessment (office-use sheet: EMI, share deposit, net payable) → Secretary → President → Cashier disburses. Stop at the assessment to show the sheet, and at the end show **Sanction letter** and **Print form** (F2 twin with the sureties).
5. Phone as Lakshmi: the loan is **Active**, every step dated and named, with the monthly instalment.

## Act 4 · Fixed deposit (3 min) — phone → console → phone

1. Phone as Lakshmi → **Open FD** → amount, period (rate comes from the slab), payout → sign with OTP.
2. Console as **Venkat (Cashier)**: Work Queue → the FD → record **cash with denominations** (the counter must match the amount) → **Act as** Secretary → **Act as** President.
3. Console: **FDR** print. Phone: the FD card shows the FDR number and maturity.

## Act 5 · Month end: demand and recovery (5 min) — console → phone

1. Console as Suresh → **Demand Sheets** → *Generate* the departments still missing for October.
2. Open a sheet → **Certify** → **Send to DDO** (simulated email) → **Enter recovery** → *Import DDO statement* (two members come back short) → watch the **allocation waterfall** (RRF, insurance, CRD, interest, principal) → *Post*.
3. Phone as **Mahesh (1104)** → **Payments**: the short month shows exactly how it was applied, in the same order as the console. He taps **Report a payment** (UPI, UTR).
4. Console as Venkat → **Payments → Reported by members** → *Verify* → a receipt is created. Phone: *Nothing unpaid*.

## Act 6 · Reports, notices and messages (5 min) — console → phone

1. Console as Suresh → **Reports** → **Defaulters list** (six members short three months in a row) → **Download CSV** (opens in Excel) → **Print / PDF** (letterhead).
2. From the catalogue: **Defaulter notice** → pick a defaulter → print.
3. Show **Department-wise less collections**, **Retirement report** and **Member-wise ledger** (pick 1104).
4. Bell → **Send a message** → *All defaulters* → template *Dues reminder* → **Preview** (each member's own amount) → **Send**. The sent log says *Delivered (simulated)*.
5. Bell → **Member questions** → Lakshmi's *FD receipt not received* → reply. Phone as Lakshmi → bell: *Reply from the society office*.

## Act 7 · Settings and the member account (2 min)

1. Console as **Anitha (Super Admin)** → **Settings → Rates**: change the Ordinary loan rate 11% → 13%. Phone → More → **Interest rates** / **Calculators**: the instalment changes. (Change it back.)
2. Phone, signed out → **Sign in → First time here? → Activate**: tap the demo card (General No. 1003), send code `123456`, choose a password — the strength meter refuses one with the General No. in it. He lands on his home screen.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Phone says *Can't reach the society server* | The API is not running (`npm run demo`), or Demo settings on the phone points at the wrong URL |
| Console shows errors with Retry everywhere | Demo tag → if it is red, choose **Stop simulating errors**. Otherwise restart `npm run demo` |
| A step has already been done | Reset demo data (console Demo tag) and start the act again |
| Phone shows old data | Pull down to refresh, or sign out and in |

## What is simulated (say it once, early)
Sign with OTP, SMS / WhatsApp / email, bank transfers and the DDO's import file are all simulated. Rules that the society has not confirmed yet are placeholders and can be changed in **Settings** (they are marked there). The open questions are listed in `docs/open-questions.md`.
