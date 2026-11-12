# Store release: Google Play and the App Store (G4, D-114)

> Version 0.1 · 2026-11-12 · Owner steps for the first release of the TGSECCSL app (members, and staff screens for console roles). The listing wording and privacy answers below are proposals [P] for the society to approve.

## 1. What is released

| | Value |
|---|---|
| App | One Expo app, `apps/member-app`: members, applicants, and staff screens for console roles (D-101, D-106) |
| Android package / iOS bundle ID | `in.tgseccsl.member` |
| User-visible version | `version` in `apps/member-app/app.json` (raise it for every store release) |
| Build numbers | Kept by EAS (`cli.appVersionSource: remote`, `autoIncrement` on production) |
| API | preview → `https://app-tgseccsl-staging.azurewebsites.net`, production → `https://app-tgseccsl-production.azurewebsites.net` (`eas.json`) |
| Demo tools | Off in preview and production builds (`EXPO_PUBLIC_DEMO_TOOLS=0`): no server switch, no demo reset |
| Plain http | Allowed only in development builds (`app.config.ts`) |

## 2. Accounts the society needs (owner)

1. **Google Play Console**, organisation account, in the society's name. It needs a D-U-N-S number.
2. **Apple Developer Program**, organisation account. It also needs a D-U-N-S number.
3. **Expo account**, with an organisation for the society.
4. One shared mailbox for the store contact, for example the society's office email.

## 3. One-time project set-up

```bash
cd apps/member-app
npx eas-cli@latest login
npx eas-cli@latest init                 # creates the EAS project; put the id in app.json → expo.extra.eas.projectId
npx eas-cli@latest build:version:set     # start the remote build number (1)
# The console address used by the Print buttons on the staff screens:
npx eas-cli@latest env:create --environment preview    --name EXPO_PUBLIC_CONSOLE_URL --value https://<staging console host>
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_CONSOLE_URL --value https://<production console host>
```

**Push credentials.** Run `npx eas-cli@latest credentials`:

- Android: upload a Firebase Cloud Messaging V1 service-account key. Create it from a Firebase project for `in.tgseccsl.member`.
- iOS: let EAS create the APNs key.

On the backend, set `PUSH_PROVIDER=expo` in the App Service settings.

## 4. Builds

| Purpose | Command | Goes to |
|---|---|---|
| Staff and UAT testing on staging | `npx eas-cli@latest build --profile preview --platform android` | An APK link, installed on test phones |
| iPhone testing | `npx eas-cli@latest build --profile production --platform ios`, then `eas submit --platform ios` | TestFlight |
| Store release | `npx eas-cli@latest build --profile production --platform all`, then `npx eas-cli@latest submit --profile production --platform all` | Play internal track, then App Store review |

Before the first production build, do the real-phone check in docs/23 S10 on a preview build.

**Forcing an update.** After a release that must replace older apps (for example a security fix), raise **Settings → General → Mobile app → Oldest version allowed** to the new `version`. Older apps then show only an update screen. Leave it at `0.0.0` otherwise.

## 5. Store listing text [P]

- **Name:** TGSECCSL
- **Short description (80 characters):** Your Secretariat credit society: loans, deposits, shares and dues in one app.
- **Full description:**
  > The official app of The Telangana Secretariat Employees Co-operative Credit Society Ltd. (Regd. No. P-929), for its members and staff.
  >
  > Members can apply to join and follow each step, see their shares, deposits and loans, apply for a loan and ask colleagues to stand surety, request a fixed deposit, report a payment made by the society's QR code, download receipts, and get notices on WhatsApp and in the app.
  >
  > Society staff with a console login can review, approve and record on the go, protected by the phone's fingerprint, face or PIN.
  >
  > Only members of the society and its staff can sign in.
- **Category:** Finance
- **Privacy policy URL:** `https://<console host>/privacy`
- **Account deletion URL** (Google Play): `https://<console host>/account-deletion`
- **Screenshots:** take them on the staging build with the fictional data (CLAUDE.md rule 8). Never use real member data.

## 6. Google Play: Data safety answers [P]

| Question | Answer |
|---|---|
| Does the app collect or share user data? | Collects: yes. Shared with third parties: no. Service providers acting for the society do not count as sharing |
| Encrypted in transit? | Yes |
| Can users ask for deletion? | Yes, in the app (More → Settings → Delete my account) and on `/account-deletion`. Records the law requires are kept |
| Personal info | Name, email, phone number, address, other info (employee ID, department, caste category, nominee). Purpose: app functionality, account management. Required |
| Financial info | Other financial info (shares, deposits, loans, salary deductions). Purpose: app functionality. Required |
| Photos and files | Photos and documents the member uploads (signature, ID proofs). Purpose: app functionality. Optional |
| App activity / device IDs | Push token, sign-in records. Purpose: app functionality, security. Required |
| Location, contacts, health, messages, web history | Not collected |
| Ads | None. **Financial features declaration:** a credit society serving only its members (no consumer lending to the public). Answer the loan questions with that |

## 7. App Store: privacy "nutrition label" [P]

- **Data linked to the user:** Contact info (name, email, phone, address), Financial info, User content (photos and documents), Identifiers (user ID), Usage data limited to sign-in records.
- **Tracking:** none. Third-party advertising: none.
- **Face ID** is used only to unlock the staff screens (`NSFaceIDUsageDescription` comes from `app.config.ts`).

## 8. Reviewer access

Apple and Google need to sign in. Members sign in with a code sent by WhatsApp, which a reviewer cannot receive. So:

1. In production, the Super Admin creates a fictional member: "App Review", no money, any department. Give it an unused 10-digit mobile.
2. Set `STORE_REVIEW_MOBILE=<that mobile>` and `STORE_REVIEW_OTP=<6 digits>` on the App Service. That mobile then signs in with that code, and nothing is sent.
3. In the review notes, give the mobile and the code. Explain that the app is for members of one society.
4. **After approval, remove both settings** and deactivate the member.

Staff screens need a console login with an authenticator, so they are not offered to reviewers. Say so in the notes.

## 9. Release checklist

- [ ] `version` raised in `app.json`; the remote build number is set
- [ ] Preview build checked on real Android and iPhone (docs/23 S10)
- [ ] `EXPO_PUBLIC_CONSOLE_URL` set for the environment; the Print buttons open the console
- [ ] Push received on both platforms (`PUSH_PROVIDER=expo`)
- [ ] Privacy and account-deletion pages open without signing in
- [ ] Reviewer mobile set, then removed after approval
- [ ] Listing text, screenshots, Data safety and privacy label approved by the society
