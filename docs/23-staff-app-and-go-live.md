# 23 · Staff mobile UI: plan and task tracker

> Version 0.7 · 2026-11-10 · Full screen audit (D-110): §4.2 updated, internal numbers out of the staff copy.
> Version 0.6 · 2026-11-10 · Register layout for the staff screens (D-109): §4.2 updated.
> Version 0.5 · 2026-11-10 · S1–S9 built and tested on Expo web against the backend. §5 ticked means built and tested on web at 412 and 360 px wide. §3, §4.2 and §4.3 describe what was built. Only S10, the real-phone check, is open.
> Version 0.4 · 2026-11-10 · D-107: build and test everything against the backend first, real-phone check last (S10).
> Version 0.3 · 2026-11-10 · S0 started: iOS identifier added, both native bundles build, device walk waiting on the owner.
> Version 0.2 · 2026-11-10 · Status: **Accepted (D-101, D-106)**. No staff screen is built yet.
> v0.2: scope reset by the user (D-106): React Native UI only, inside the existing Expo app, Android and iOS, no new app, package, library or backend change, `v2` branch only, the user commits by hand.
> Read with `docs/05` (screens), `docs/03` (permissions), `docs/19` (states), `apps/member-app/AGENTS.md` (Expo rules).
> Tick a box only when the work is done and checked. The phase's exit test decides when the next phase may start (CLAUDE.md rule 1).

## 1. Goal

Every Admin Console function also works on a phone, for staff, in the React Native app that already exists, on Android and iOS. It looks and behaves like the member screens.

**Rules for this work (D-106)**

| Rule | Meaning |
|---|---|
| React Native only | Changes stay in `apps/member-app` and its tests in `tests/e2e`. `backend/`, `apps/admin-console`, `apps/mock-api` and `packages/*` are not touched |
| Nothing new | No new app, package, library, service or UI kit. Staff screens use the declared stack and the existing kit |
| Repeat the Member App | Same folders, same screen recipes, same wording habits, same states |
| Android and iOS | Both are checked at every phase |
| Git | `v2` branch only. Claude never commits or pushes. The user does that by hand |

## 2. What the code study found

| Finding | Evidence | Consequence |
|---|---|---|
| The API already has every staff call | `packages/api-client` has staff sign-in, members, loans, deposits, demand, receipts, reports, settings | The new screens only need calling it |
| Console screens cannot run on a phone | 65 files import Blend (web only), plus Tailwind and react-router | Screens are rebuilt with the native kit. The console is the reference for content and rules |
| The app already switches by role | `src/app/index.tsx` sends applicants and members to their own areas; each area's `_layout.tsx` guards its role | Staff become a third area, the same way |
| `session`, `api`, `adoptSession`, secure storage work for any user | `src/lib/auth.tsx`, `session.ts`; `api.auth.staffLogin` exists | Staff sign-in is a new screen and a small change, no new plumbing |
| **The app has never run on a real phone, Android or iOS** | BUILD-CHECKLIST M0 and M10; e2e runs on Expo web only | Proved first (S0) |
| iOS is not configured | `app.json` has no `ios.bundleIdentifier` | S0 |
| A repeated receipt could post twice | Client gives up at 15 s; no duplicate guard found in `backend/src/modules/collections` | The backend is out of scope, so the UI guards it (§4.5) |

## 3. Structure

Expo Router route groups do not appear in the URL, so `(staff)/loans` would collide with `(member)/loans`. Staff screens therefore live under a real `staff/` folder.

```
apps/member-app/src/
  app/
    index.tsx                    + staff roles go to /staff/home
    welcome.tsx                  + a third, quiet path: "Society staff? Sign in"
    staff-login.tsx              AU-01m, signed-out, like login.tsx
    +not-found.tsx               SYS-02m
    staff/
      _layout.tsx                guard: console roles only, same page permissions as the console router
      no-access.tsx              SYS-01m
      search.tsx
      (tabs)/
        _layout.tsx              copy of (member)/_layout.tsx, tabs chosen by role
        home  queue  members  loans  deposits  payments  joining  demand  reports  more
      joining/[id]/index.tsx     + [action].tsx, one route for all the joining decisions
      member/new.tsx             member/[id]/index, edit, transfer, settlement, waive
      change-requests.tsx        change-request/[id].tsx
      loan/new.tsx               loan/[id]/index.tsx, loan/[id]/action/[action].tsx
      deposit/new.tsx            deposit/[id]/index.tsx, deposit/[id]/[action].tsx
      demand/generate.tsx        demand/[id]/index, [action], recovery
      payment/new.tsx  payment/[id].tsx  payment/verify/[id].tsx
      report/[id].tsx
      settings/index.tsx         settings/[section].tsx, all nine sections in one route file
      account/                   index, notifications, compose, password, question/[id]
  components/
    staff.tsx                    shared staff parts: RecordCard, Row, Expand, Loaded, useAction, ask, MemberPicker, …
    StaffMemberForm.tsx  StaffSanctionSheet.tsx
  lib/
    auth.tsx                     + persona channel for staff demo sign-in, meLoading
    staffLoans.ts  staffMembers.ts  staffJoining.ts  staffDeposits.ts  staffCollections.ts  staffSettings.ts
                                 labels, query keys and pure helpers for each module
  ui/                            unchanged, except the picker placeholder tone and a web-only tabIndex on Screen (both axe)
  theme.ts                       unchanged
```

Labels that live in the console's `joining.ts`, `loans.ts`, `collections.ts` and `members.ts` are copied into the matching `lib/staff*.ts`, because the console is not touched.

Staff are told apart by `channelForRole` from `@tgs/types`. Screen IDs are the console's plus `m` (ST-23 → ST-23m).

## 4. UI specification

The design system is frozen (Blend blue, Inter, Lucide, tokens through `@/theme`).

### 4.1 Screen recipes, taken from the Member App

| Kind of screen | Copy from | Built with |
|---|---|---|
| List | `(member)/loans.tsx` | `Screen` with pull to refresh, `Text pageTitle`, `Segmented`, tappable `Card`, `StatusTag`, `Skeleton`, `Alert` error + Try again, `EmptyState` |
| Detail | `loan/[id].tsx` | `Header` with back, `StageTracker`, `Section` + `Card` + `KeyValue`, `footer` with the primary action |
| Decision | `surety/[loanId].tsx` | Record summary `Card`, what will happen in an `Alert`, `run()` with `busy` and `error`, sticky `footer` `Button`, `done` `Alert` |
| Form | `loan/apply.tsx`, `deposit/open.tsx` | `WizardProgress`, one topic per step, `TextField`, `SelectField`, `DateField`, `Checkbox`, `footer` |
| Index of sections | `(member)/more.tsx` | `Card padded={false}` with rows and chevrons |
| Dashboard | `(member)/home.tsx` | Brand hero `Card`, stat tiles, action cards |
| Sign-in | `login.tsx` | Same layout, demo persona list when the server offers it |

### 4.2 Desktop to phone, using existing parts only

| Desktop | Phone |
|---|---|
| Sidebar | 5 bottom tabs by role, as `(member)/_layout.tsx`. Other sections sit in More |
| Data table | The register (`Stack2` + `RecordCard`): one surface with ruled rows. Name and General No. on the left, amount and `StatusTag` on the right, one caption line saying what it waits on |
| Filters up to 4 values | `Segmented` with counts, as the Loans tab |
| Filters and search on a list | `FilterBar`: search, then a row of compact `SelectField` chips that scrolls sideways, so records stay near the top |
| Summary figures | `TileGrid`: one ruled surface, not separate boxes. Home leads with one figure, what is waiting on you |
| Large lists (members, receipts) | Server paging with a "Load more" `Button` at the end of the `Screen` |
| Decision drawer | Pushed decision screen (§4.1), with `ask()` before anything irreversible (`RNAlert.alert` on phones, `confirm` on web) |
| Detail tabs, up to 4 | `Segmented` |
| Detail tabs, more (Member profile has 11) | Collapsible sections on one screen (`Expand`) |
| Joining pipeline board | `SelectField` of stages with counts + `Card` list |
| Demand and recovery grid | One member per step with `WizardProgress`, totals in the `footer`, draft saved through `saveEntry` |
| Denomination counter | `NumberStepper` per note, total in the `footer` |
| Permissions matrix | `SelectField` for the role, then `Section` per module |
| Report tables | The register (`Stack2` + `RecordCard`) under a `FilterBar`: member name first, General No. below it, the grand total on top, empty lines left out |
| Ctrl+K search | Search icon in the `Header` opens a screen with a `TextField` and `Card` results |
| Snackbar | `Alert` at the top of the screen, as the member screens do |
| CSV download | `Share.share` from React Native with the CSV as text |
| Print | "Print" `Button` opens the console's print page in the phone's browser with `Linking`, where it prints or saves as PDF. Needs one new variable, `EXPO_PUBLIC_CONSOLE_URL`, like `EXPO_PUBLIC_API_URL`. The person signs in to the console in that browser once |

### 4.3 Bottom tabs by role

| Role | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|---|---|---|---|---|---|
| Accountant | Home | Queue | Members | Loans | More |
| Secretary, President | Home | Queue | Loans | Deposits | More |
| Cashier | Home | Queue | Payments | Deposits | More |
| DDO | Home | Queue | Joining | Demand | More |
| Super Admin | Home | Queue | Members | Reports | More |

More lists every other section the role's permissions (`/me`) allow. A tab not on the role's bar is hidden with `tabBarButton: () => null` and `tabBarItemStyle: { display: 'none' }`. Do not use `href: null`: in Expo Router 58 that makes the route unreachable, and opening it from More lands on Home.

The staff guard (`staff/_layout.tsx`) waits for `/me` before it mounts the Stack, then shows SYS-01m in place on a forbidden route. Taking a mounted Stack away resets the route to Home.

### 4.4 Staff sign-in

| Step | Screen behaviour |
|---|---|
| Password | `api.auth.staffLogin`, then `adoptSession` with the result |
| Authenticator code | `OtpInput`, then `api.auth.totpVerify` |
| First enrolment | Button opens `otpauthUrl` through `Linking`. The secret is `selectable` text. `qrDataUrl` in an `Image` for scanning from a second device. Then `api.auth.totpConfirm` |
| Temporary password | Forced new password, `api.auth.changeStaffPassword` |
| Demo | Persona list from `api.demo.personas('console')`, signing in with channel `console` |

### 4.5 Money safety, in the UI

After a receipt or other money POST fails with `NETWORK`, do not offer a plain retry. Show an `Alert`: "We couldn't confirm this was saved. Check Payments before trying again", with a button to that list. The confirm button uses `loading`, as the member screens do.

### 4.6 Definition of done for every screen

- [ ] Built from a §4.1 recipe, with kit parts and tokens only
- [ ] Every applicable state from docs/19 §3: loading, empty, no results, error + Try again, offline, no access, partial, submitting, success, ready
- [ ] Member App wording habits: plain language, "Couldn't load your …", "Waiting on …"
- [ ] Looks right at 360×800 and 412×915 on Expo web. Real Android and iPhone in S10
- [ ] Notch and home indicator clear, keyboard never covers the field or the footer button on either platform
- [ ] Android back and iOS swipe back both work. Long text and large system fonts do not break the layout
- [ ] Money through `formatINR`, dates through `formatDisplayDate`
- [ ] Same permission behaviour as the console. `design:design-critique` and `design:accessibility-review` run for the module. axe clean on web
- [ ] Row in §5 ticked

## 5. Parity matrix

One row for each console screen, drawer, report and printable. Route is the console route in `apps/admin-console/src/app/router.tsx`.

### Auth and system

| Console | Route | Phone | Phase | Done |
|---|---|---|---|---|
| AU-01 Staff login | `login` | AU-01m | S1 | ☑ |
| AU-03 Forgot password | `login` | AU-03m | S1 | ☑ |
| SYS-01 No access | `no-access` | SYS-01m | S1 | ☑ |
| SYS-02 Not found | `*` | SYS-02m | S1 | ☑ |
| SYS-03 Error / maintenance | error element | SYS-03m | S1 | ☑ |
| ST-04 My profile, password, signature | account menu | ST-04m | S1 | ☑ |
| Global search | topbar | Search | S1 | ☑ |

### Work

| Console | Route | Phone | Phase | Done |
|---|---|---|---|---|
| ST-01 Dashboard, 5 role variants | `dashboard` | ST-01m | S2 | ☑ |
| ST-02 Work Queue | `queue` | ST-02m | S2 | ☑ |
| ST-03 Notifications, composer, member questions | `notifications` | ST-03m | S2 | ☑ |

### Joining and members

| Console | Route | Phone | Phase | Done |
|---|---|---|---|---|
| ST-14 Joining | `joining` | ST-14m | S3 | ☑ |
| ST-15 Application detail | `joining/:id` | ST-15m | S3 | ☑ |
| ST-16 DDO certify drawer | on `joining/:id` | ST-16m | S3 | ☑ |
| ST-17 Approval drawer | on `joining/:id` | ST-17m | S3 | ☑ |
| ST-10 Member index | `members` | ST-10m | S3 | ☑ |
| ST-11 Member create / edit | `members/new`, `members/:id/edit` | ST-11m | S3 | ☑ |
| ST-12 Member profile, 11 tabs | `members/:id` | ST-12m | S3 | ☑ |
| ST-13 Transfer drawer | on `members/:id` | ST-13m | S3 | ☑ |
| ST-18 Change requests | `members/change-requests` | ST-18m | S3 | ☑ |
| Settlement, member leaves (D-098) | `members/:id/settlement` | SETTLE-m | S3 | ☑ |

### Loans

| Console | Route | Phone | Phase | Done |
|---|---|---|---|---|
| ST-20 Loans index | `loans` | ST-20m | S4 | ☑ |
| ST-21 Application on behalf | `loans/new` | ST-21m | S4 | ☑ |
| ST-22 Top-up | `loans/new` (top-up) | ST-22m | S4 | ☑ |
| ST-23 Loan detail | `loans/:id` | ST-23m | S4 | ☑ |
| ST-24 Review drawer | on `loans/:id` | ST-24m | S4 | ☑ |
| ST-25 DDO certify / manual record | on `loans/:id` | ST-25m | S4 | ☑ |
| ST-26 Assessment, office use | on `loans/:id` | ST-26m | S4 | ☑ |
| ST-27 Sanction | on `loans/:id` | ST-27m | S4 | ☑ |
| ST-28 Disbursement | on `loans/:id` | ST-28m | S4 | ☑ |
| Surety recovery (D-097) | on `loans/:id` | SURETY-m | S4 | ☑ |

### Deposits

| Console | Route | Phone | Phase | Done |
|---|---|---|---|---|
| ST-30 Deposits index | `deposits` | ST-30m | S5 | ☑ |
| ST-31 Open at counter | `deposits/new` | ST-31m | S5 | ☑ |
| ST-32 Deposit detail | `deposits/:id` | ST-32m | S5 | ☑ |
| ST-33 Payment + acceptance | on `deposits/:id` | ST-33m | S5 | ☑ |

### Collections

| Console | Route | Phone | Phase | Done |
|---|---|---|---|---|
| ST-40 Demand sheets | `demand-sheets` | ST-40m | S6 | ☑ |
| ST-41 Generate | `demand-sheets/generate` | ST-41m | S6 | ☑ |
| ST-42 Sheet detail, certify and send, deduction entry | `demand-sheets/:id` | ST-42m | S6 | ☑ |
| ST-43 Recovery and allocation | `demand-sheets/:id/recovery` | ST-43m | S6 | ☑ |
| ST-44 Payments, reported tab | `payments` | ST-44m | S6 | ☑ |
| ST-45 New receipt | `payments/new` | ST-45m | S6 | ☑ |
| ST-46 Receipt | `payments/:id` | ST-46m | S6 | ☑ |
| ST-47 Verify reported payment | on `payments` | ST-47m | S6 | ☑ |
| Penal waiver | on member dues | WAIVE-m | S6 | ☑ |

### Reports (S7)

The screens are ST-50m (catalogue, `reports`) and ST-51m (viewer, `reports/:id`). The catalogue also lists the entries the server marks as not yet available, as the console does.

| Report id | Title | Done |
|---|---|---|
| `dues` | Dues list | ☑ |
| `defaulters` | Defaulters list | ☑ |
| `dept-unpaid` | Department-wise unpaid collections | ☑ |
| `dept-less` | Department-wise less collections | ☑ |
| `defaulter-notice` | Defaulter notice (print) | ☑ |
| `loans-ledger` | Loans ledger | ☑ |
| `maturity` | Maturity report | ☑ |
| `member-ledger` | Member-wise ledger | ☑ |
| `retirement` | Retirement report | ☑ |

### Printables, ST-52m (S7)

| Document | Route opened in the browser | Done |
|---|---|---|
| Defaulter notice | `reports/print/defaulter-notice` | ☑ |
| F1 Membership form | `reports/print/membership` | ☑ |
| F2 / F3 Loan form | `reports/print/loan-form` | ☑ |
| F4 FD form | `reports/print/fd-form` | ☑ |
| F5 / F6 Agreement | `reports/print/agreement` | ☑ |
| F7 / F8 / F9 Bond and receipt | `reports/print/loan-bond` | ☑ |
| F10 FD voucher | `reports/print/fd-voucher` | ☑ |
| Sanction letter | `loans/:id/letter` | ☑ |
| FDR | `deposits/:id/fdr` | ☑ |
| Receipt | `payments/:id` | ☑ |
| Demand sheet | `demand-sheets/:id` | ☑ |
| Report print | `reports/:id` | ☑ |
| Gratuity / settlement letter | `members/:id/settlement` | ☑ |

### Settings (S8)

`settings/:section?` becomes a section list (`settings/index.tsx`), then one screen per section.

| Console | Section | Phone | Done |
|---|---|---|---|
| ST-60 General | `general` | ST-60m | ☑ |
| ST-61 Users | `users` | ST-61m | ☑ |
| ST-62 Permissions | `permissions` | ST-62m | ☑ |
| ST-63 Templates | `templates` | ST-63m | ☑ |
| ST-64 Loan products | `loan-products` | ST-64m | ☑ |
| ST-65 Deposit schemes | `deposits` | ST-65m | ☑ |
| ST-66 Insurance and demand | `insurance-demand` | ST-66m | ☑ |
| ST-67 Departments and DDOs | `departments` | ST-67m | ☑ |
| ST-68 Change history | `history` | ST-68m | ☑ |

### Deliberately not on the phone

| Console | Route | Why |
|---|---|---|
| Design System and scenarios | `design` | A developer and demo tool |
| "Act as …" | various | Demo tool. The app keeps its Demo settings screen |

## 6. Phases and tasks

Order changed by D-107: every screen is built and tested against the real backend first (S0–S9). The real-phone check is the last phase (S10), done by the owner.

### S0 Build baseline
- [x] Add `ios.bundleIdentifier` to `app.json` (`in.tgseccsl.member`)
- [x] Install from the lockfile; `npm run typecheck` for the app is clean; `expo export` builds the iOS and Android bundles (5.5 MB each)
- [x] Backend, database and Expo web running for the tests

**Exit:** the existing phone e2e suite passes against the backend.

### S10 Real-phone check (the owner, last)
- [ ] Create `backend/.env` (it holds the database password), then start the backend
- [ ] Let the phones reach the laptop: the Wi-Fi profile is **Public**, so Windows may block ports 4100 and 8081
- [ ] Open the app on a real Android phone and a real iPhone with Expo Go (§7)
- [ ] Walk every member and staff journey on both. Report the native bugs for fixing

Check these first. They come from reading the code and cannot show up on Expo web:

| What to try | Why |
|---|---|
| Type in a field on a form on **Android**: does the keyboard cover the field or the bottom button? | `Screen` applies keyboard avoidance on iOS only (`src/ui/Layout.tsx`) |
| In a wizard on step 3, press **Android back** or **swipe back on iPhone** | Only the on-screen arrow goes back one step. No screen handles the hardware back or the swipe, so the whole wizard may close, while docs/07 §5 says it should ask first |
| Upload a signature PNG on both phones | Native file reading, never run on a device |
| Open a long picker (department) on a phone with on-screen navigation buttons | The last rows of the sheet may sit behind the bar |

**Exit:** every journey works on both phones.

### S1 Staff shell and sign-in
- [x] `staff/_layout.tsx`, `staff/(tabs)/_layout.tsx` with role tabs, `index.tsx` routing, Welcome path
- [x] `staff-login.tsx` and the rest of §4.4
- [x] More screen by permission, search, system screens, ST-04m (reuse `SignatureCard`, `profile/signature.tsx`)
- [x] Add `journeys-staff`, `states-staff`, `a11y-staff` to the `phone` project in `playwright.config.ts`

**Exit:** all 6 staff personas sign in and see only what they may. Members and applicants see no change.

### S2 Work
- [x] All rows of the Work table

**Exit:** queue and dashboard counts equal the console for every role.

### S3 Joining and members
- [x] All rows of the table

**Exit:** a join journey runs from the applicant through every staff step using only the phone.

### S4 Loans
- [x] All rows of the table

**Exit:** a member applies, staff take it through sanction and disbursement on the phone, and the console shows the same result.

### S5 Deposits
- [x] All rows of the table

**Exit:** the FD journey passes on the phone.

### S6 Collections
- [x] All rows of the table, with §4.5

**Exit:** the month-end journey passes on the phone; totals equal the console.

### S7 Reports and prints
- [x] All rows of both tables, CSV through `Share`

**Exit:** every report equals the console for the same filters; every Print button opens the right document.

### S8 Settings
- [x] All rows of the table

**Exit:** an Admin edit made on the phone shows as a new version in the console.

### S9 Parity and polish
- [x] Audit every §5 row against §4.6 at phone sizes on web
- [x] Full `npm run e2e:phone`, `npm run e2e:console`, `npm run typecheck`, `npm test`

**Exit:** the parity matrix is 100% ticked; the existing suites are still green.

## 7. Test environment

Everything already exists. Nothing new is installed on the laptop.

| Check | How | When |
|---|---|---|
| Types | `npm run typecheck` | every change |
| Staff journeys, states, axe | Playwright `phone` project on Expo web (:8090, 412×915), with `phoneAs`, `resetDemo`, `tap` from `tests/e2e/support` | each phase |
| Nothing broke | `npm run e2e:phone`, `npm run e2e:console` | each phase exit |
| Real Android and iPhone | Expo Go on the same Wi-Fi as the laptop | each phase exit |

**Running on real phones:** start the backend (`npm run dev:backend`, demo mode), then in `apps/member-app` run `npx expo start` with `EXPO_PUBLIC_API_URL=http://<laptop-ip>:4100`, and scan the QR code with Expo Go. The app's default of `10.0.2.2` only works on an Android emulator. Demo settings can also change the server address at runtime.

Expo web proves logic and layout. Only the phones prove native behaviour.

**Windows note:** an iOS simulator needs a Mac, so iOS is checked on a real iPhone.

## 8. Later, not part of this work

Done by hand when you decide, and tracked here only so nothing is forgotten.

| Item | Note |
|---|---|
| **Member sign-in on production** | Needs a real WhatsApp sender (F-10), a backend change. Staff sign-in does not depend on it |
| Signed builds | EAS (declared). iOS needs an Apple Developer account. Turn off `usesCleartextTraffic` and fix the stale port 4000 in `eas.json` first |
| Duplicate protection on the server | §4.5 only reduces the risk. A real fix is a backend change |
| Azure hosting | Backend, PostgreSQL and console. The Dockerfile has never been built |
| Data import | Loan and deposit registers wait on F-11 |

## 9. Open choice

| Topic | As planned | Alternative |
|---|---|---|
| Print | Opens the console page in the phone's browser, signing in there once | `expo-print` + `expo-sharing` give a PDF inside the app, but they are new dependencies and need their own templates. Only with your approval |
