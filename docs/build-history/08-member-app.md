# 08 · M8 Member app completion (MA-01…03, MB-01, MB-11…14, MB-17) — done

## Built (phone)
- **MA-01 Sign in** `/login`: General No. or Employee ID + password (Show / Hide), Forgot password link, "First time here?" → activation, clear errors (wrong password, not found, not activated → "Activate now"). Demo panel: tap a fictional member → fills the General No. + demo password `Society@2026` and signs in through the real password check.
- **MA-02 Activate** `/activate`: 3-step wizard. Employee ID / General No. + registered mobile (must match the Member Master) → 6-digit code (demo `123456`, resend after 30 s) → password with the D-062 strength meter → signed in on Home. The demo card fills the first seeded member who has never activated (`GET /__demo/activation-sample`, e.g. 1003 Mallesham Prasad).
- **MA-03 Forgot password** `/forgot-password?login=`: General No. / Employee ID → code → new password → "Password changed" → sign in. Every old session is signed out.
- **MB-17 Change password** `/account/password`: current + new (meter) + confirm; keeps this phone signed in, signs out the others.
- **MB-01 Home** (tab): live `GET /me/home`. Blue snapshot card (savings = deposits + share capital + share deposit; Deposits / Shares / Loans tiles go to their tabs; red "₹X unpaid · Pay or report" strip), "Waiting for you" action cards (surety request, returned loan, unfinished draft, declined surety, FD to pay, unpaid dues), quick actions (Apply loan, Open FD, Calculator, Payments), this month's salary deduction with the sheet status, My loans with the next instalment, next FD maturity, service left. Bell with the unread badge → MB-12.
- **MB-11 Calculators** `/account/calculators`: Loan (product, amount, months capped by *your* service left (BR-002), first/last instalment, total interest, share deposit kept and the amount you'd receive, checks for retirement, the EMI vs net salary cap and a running loan) → "Apply with these numbers" opens MB-05 prefilled (`/loan/apply?product=&amount=&months=`). FD (amount, months with the slab rate, payout) → maturity value / periodic interest and date → Open FD.
- **MB-12 Notifications** `/account/notifications`: newest first, unread tint + dot, "also by SMS, Email" (simulated, from MB-14), tap → marks it read and opens the linked app screen, Mark all read, settings icon.
- **MB-13 Help & support** `/account/help`: Get help (office call / WhatsApp / email / address / hours, FAQ topics with accordions) and My questions (ticket cards with chat bubbles from the office); Ask a question (topic, subject, message → auto-acknowledgement).
- **MB-14 Settings** `/account/settings`: in-app always on; SMS / WhatsApp / Email switches save immediately (Email needs an email on the profile → link to edit profile); language English; Change password.
- **More tab**: every row is now live (Profile, Notifications, Calculators, Rates, Surety, Help, Settings, Change password).

## Key files
- API `apps/mock-api/src/account.ts` (+ `account.test.ts`, 8 tests): member-login, activate/start, forgot/start, otp/verify, password/set, password/check, /me/password, /me/home, /me/notifications (+ read, read-all), /me/preferences, /me/support (+ tickets), /__demo/activation-sample. `homeFor()` builds the snapshot from loans, deposits, share accounts, demand sheets and `memberDues` (collections.ts).
- Store: `credentials` (scrypt hash + salt per member) and `preferences` maps on `Db` (old snapshots get them on load).
- Domain `packages/domain/src/account.ts`: `checkPassword` (PW-1…3 + score 0–4), 100% covered.
- Types: `AccountOtp`, `PasswordToken`, `ActivationSample`, `MemberHome`, `MyNotifications`, `MemberPreferences`, `SupportCenter`, `PasswordCheck`; `SupportTicket` gained `category`, `messages`, `updatedAt`.
- Client: `api.auth.memberLogin / startActivation / startReset / verifyOtp / setPassword / checkPassword`, `api.account.*`, `api.demo.activationSample`.
- Phone: `src/app/login.tsx`, `activate.tsx`, `forgot-password.tsx`, `src/app/account/*` (member-only layout), `(member)/home.tsx`, `(member)/more.tsx`; `src/components/Password.tsx` (PasswordField, PasswordStrength), `src/components/OtpPasswordSteps.tsx` (shared steps 2–3), `src/lib/account.ts` (queries, `appRouteFor`, `stamp`), `src/lib/demo.ts` (demo password); `useAuth().signIn`. `TextField` gained a `suffix` slot; the browser focus outline is off (the box draws the ring).
- Seed v11: support tickets carry a topic and the conversation (office reply 2 h later for answered tickets).

## Decisions
**D-062** (sign-in with General No. / Employee ID + password; password rule; activation needs the Member Master mobile; reset signs out all sessions, change signs out the others; demo password and OTP; channels are member switches with simulated delivery; English only; tickets get an auto-acknowledgement). BR-033 in docs/09. API in docs/11 §9.

## Verified
- `npx vitest run` 249 tests · typecheck green (API, console, app) · domain coverage 100% · Android bundle 5.5 MB.
- **Exit J-14 passed live** (headless, Expo web :8090 + API :4000): wrong password and not-activated errors; 1003 Mallesham Prasad activated (mobile match → OTP → weak password refused by the meter → Garden42!) → Home; signed out and back in with his Employee ID; Mahesh: Home snapshot with ₹19,816 unpaid action, notifications (mark all read), help FAQ + new ticket with auto-reply, WhatsApp switch, both calculators, password change; Lakshmi forgot password → reset → signed in with the new one. No page errors. Demo data reset afterwards.

## Gaps / TODO
- No staff side for tickets yet (the office can't reply from the console); seeded tickets carry replies. Candidate for M9 notifications work.
- Telugu (Q-008) and "Preference Signup" (Q-116) not built.
- Login lock-out after repeated wrong passwords is not simulated.

## Next
M9 Dashboards, notifications & reports: 5 dashboard variants, ST-03 notifications + composer, ST-50…52 reports catalogue / viewer with the 8 reports and 9 printables, CSV export.
