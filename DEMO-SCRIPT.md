# TGSECCSL prototype — demo script (≈ 30 min)

> For whoever presents the prototype to the society (Secretary, President, office staff) or to Fusil.
> Everything is fictional demo data. Nothing is sent by SMS, WhatsApp or email.
> Version 1.1 · 2026-10-25 · Demo-ready (D-065, D-066) · The whole script is played by `tests/e2e/demo-script.spec.ts` (`npm run e2e:demo`)

## Before you start (5 min, once)

1. In the repo folder: `npm install` (first time only).
2. Start the API and the Admin Console. Pick one:
   - **Production mode (recommended for presenting):** `npm run demo:prod`. It builds the console (about a minute), then serves the built version at http://localhost:5180 with the API on :4000. It is faster and quieter than dev mode. Run it again after any code change.
   - **Dev mode (while changing code):** `npm run demo`. Same addresses, and it reloads on every save.
   The console always uses port **5180** (`CONSOLE_PORT` to change it). Port 5173 is left free for other projects.
3. Start the Member App preview: `npm run dev:web` (Expo web on http://localhost:8090). Open it in a narrow window, or in the browser's phone mode at about 412 px wide.
4. Put the two windows side by side: **console on the left, phone on the right**.
5. Reset the data: console top bar → amber **Demo** tag → **Reset demo data**. Do this again before every new audience.
   You can also reset from a terminal:
   ```bash
   curl -X POST http://localhost:4000/api/v1/__demo/reset
   ```
6. Optional check (about 3 min, it resets the data at the end): `npm run e2e:demo` plays this whole script in a robot browser and fails if any step breaks. Run it with the servers above already running.

### On a real Android phone (optional, no APK needed)

The phone and the laptop must be on the **same Wi-Fi**.

1. **Find the laptop's address.** `npm run demo` prints it, for example `For the phone (same Wi-Fi), use: http://192.168.1.20:4000`. The API already listens on every network card (`HOST=0.0.0.0`).
2. **Let the phone through the Windows firewall (once).** When Windows asks whether Node.js may use the network, allow **Private networks**. Or, in an administrator PowerShell, open ports 4000 (API) and 8081 (the app bundler):
   ```bash
   netsh advfirewall firewall add rule name="TGSECCSL demo" dir=in action=allow protocol=TCP localport=4000,8081 profile=private
   ```
   The Wi-Fi network must be set to *Private* in Windows.
3. **Start the app for Expo Go.** In `apps/member-app` (PowerShell):
   ```bash
   $env:EXPO_PUBLIC_API_URL="http://192.168.1.20:4000"; npx expo start
   ```
   Then scan the QR code with the **Expo Go** app. It must support SDK 58.
4. **Or set the server inside the app.** Long-press the logo on the Welcome screen → **Demo settings** → *Server address* → **Test & save**.
5. **CORS** does not matter for the phone app; it only applies to browsers. If the console is opened from another computer, `CORS_ORIGIN` on the API can list allowed origins. By default any origin is allowed.

> Not verified: this path has not been tried on a physical phone yet (no device was available on 25 Oct 2026). The browser preview (step 3) is the tested path. Try the phone route once at the venue before the audience arrives.

| Who | How to sign in |
|---|---|
| Staff (console) | Login page → click a name. Switch later from the avatar menu → **Switch demo persona** |
| Members (phone) | Sign in → **Demo members** → tap a name. Or type a member's registered mobile → **Send code** → `123456` (D-078: no member passwords) |
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

1. Phone: **Welcome → Become a member → Continue as Divya S**. Walk the wizard (personal, address, employment, shares & nominee, documents, declarations) and **Sign & submit** with OTP `123456`. The tracker shows *Application received · In the queue*.
2. Console as Suresh: **Joining** → Divya's application. *Print form* shows the paper F1 twin. Then:
   - **His own steps use his own buttons:** **Send to DDO** (the drawer lists the checks) → *Send to Kiran Kumar*. Later, **Recommend** → *Recommend*.
   - **The other stages use Act as …:** the DDO certificate (items 1–7 + salary mandate), Secretary, President (chooses the share payment), Cashier.
   - It ends at *Member · General No. …*.
3. Phone: Divya's tracker moves with every step; at the end she gets her **General No.** and the app switches to the member home.

## Act 3 · A loan from application to money (7 min) — phone ↔ console

1. Phone, sign in as **Ramaiah (1102)** → More → **Calculators**: the months are capped because he retires soon (rule BR-002). Sign out.
2. Phone, sign in as **Lakshmi (1101)** → **Apply loan**. Ordinary is greyed out (she already has one running — the agreement's top-up example lives on her Loans tab). Choose **Education Loan** → pay details are pre-filled → ₹1,50,000 for her daughter's B.Tech (student, institution, course) → sureties: search **Sravani** and **1104** (Mahesh). Eligibility is checked live. **Sign with OTP** → *Confirm & submit*.
3. Phone, sign out → sign in as **Sravani (1103)**: Home → *Waiting for you* shows the surety request (*"… asked you to be a surety"*, or *"2 surety requests"* because she already had one waiting). Open it → pick **Lakshmi Devi** if a list shows → **Agree & sign with OTP** → *Confirm & sign*. Do the same as **Mahesh (1104)**.
4. Console (any staff; Anitha is quickest) → **Loans** → the new application → press **Act as …** six times: Accountant review → DDO certificate on items 1–5 → Accountant assessment (office-use sheet: EMI, share deposit, net payable) → Secretary → President → Cashier disburses. Stop at the assessment to show the sheet, and at the end show **Sanction letter** and **Print form** (F2 twin with the sureties).
5. Phone as Lakshmi: the loan is **Active**, every step dated and named, with the monthly instalment.

## Act 4 · Fixed deposit (3 min) — phone → console → phone

1. Phone as Lakshmi → **Open FD** → amount, period (rate comes from the slab), payout → sign with OTP.
2. Console as **Venkat (Cashier)**: **Deposits → FD requests** → Lakshmi's request → **Record payment** → **cash with denominations** (the counter must match the amount) → **Act as** Secretary → **Act as** President.
3. Console: **FDR** print. Phone: the FD card shows the FDR number and maturity.

## Act 5 · Month end: demand and recovery (5 min) — console → phone

1. Console as Suresh → **Demand Sheets** → *Generate* the departments still missing for October.
2. Open a sheet → **Certify** → **Send to DDO** (simulated email) → **Enter recovery** → *Import DDO statement* (two members come back short) → watch the **allocation waterfall** (RRF, insurance, CRD, interest, principal) → *Post*.
3. Phone as **Mahesh (1104)** → **Payments**: the short month shows exactly how it was applied, in the same order as the console. He taps **Report a payment**: the amount is filled in; enter the date paid (the demo date, `24/10/2026`) and a UTR → **Send for verification**. It shows on his Payments tab as reported.
4. Console as Venkat → **Payments → Reported by members** → *Verify* → tick *I found this credit in the society's bank statement* → **Verify & create receipt**. A receipt is created. Phone: *Nothing unpaid*.

## Act 6 · Reports, notices and messages (5 min) — console → phone

1. Console as Suresh → **Reports** → **Defaulters list** (six members short three months in a row) → **Download CSV** (opens in Excel) → **Print / PDF** (letterhead).
2. From the catalogue: **Defaulter notice** → pick a defaulter → print.
3. Show **Department-wise less collections**, **Retirement report** and **Member-wise ledger** (pick 1104).
4. Bell → **Send a message** → *All defaulters* → template *Dues reminder* → **Preview** (each member's own amount) → **Send**. The sent log says *Delivered (simulated)*.
5. Bell → **Member questions** → Lakshmi's *FD receipt not received* → reply. Phone as Lakshmi → bell: *Reply from the society office*.

## Act 7 · Settings and the member account (2 min)

1. Console as **Anitha (Super Admin)** → **Settings → Loan products** → Ordinary Loan → **Edit** → *Interest rate* 13 → **Save product** (the drawer previews the new EMI). Phone → More → **Interest rates** / **Calculators**: the instalment changes. (Change it back.)
2. Phone, signed out → **Sign in**: type the mobile of a member who has never used the app (Demo tag → dataset sample, or `GET /api/v1/__demo/activation-sample`) → **Send code** → `123456`. No password and no activation step: he lands on his home screen (D-067, D-078).

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
