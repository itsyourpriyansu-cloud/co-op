# 03b · Members module (ST-10…13, ST-18, MB-02, MB-19) — done

## Built
- **Console**
  - ST-10 `/members`: server-side search (name, General No., Employee ID), filters (department, status, retiring within 3/6/12 months, has active loan, mandate pending), paging 25/50/100, KPI cards, CSV export (built in the browser, masked mobiles). DDOs see their department only.
  - ST-11 `/members/new`, `/members/:id/edit`: sections Personal · Address · Employment & service · Nominee · Shares · Pay profile. DOR is suggested from DOB at retirement age, left-over service is live and read-only (BR-001). Edit locks the department (use Transfer) and shares.
  - ST-12 `/members/:id`: header chips (Loanee/Non-loanee, Retires in N mths), tabs Overview · Service history · Loans & sureties · Deposits · Ledger (month-wise demand vs recovered) · Documents · Requests; side panels for the salary-recovery mandate (Agree / "Act as DDO" demo) and At a glance. Banners for an upcoming transfer and a DOR mismatch.
  - ST-13 Transfer drawer: department chips with search (dropdowns render under drawers), effective date, order ref, remarks, and a BR-010 note.
  - ST-18 `/members/change-requests`: cards with filters Waiting on me / All pending / Decided, live 5 s refresh, decision drawer (now vs requested, reason, document, route steps). DDO certifies or declines; the Accountant approves or rejects. "Certify as <DDO>" is a demo button for DDOs without a login.
- **App**
  - MB-02 `/profile` (More → Profile & agreements): hero, My requests with status, Service, Personal, Shares & pay, My agreements (mandate + bye-laws), Service history, Documents. Polls every 5 s, pull to refresh.
  - MB-19 `/profile/edit`: email and present address save directly; a new mobile is confirmed with an OTP (demo `123456`).
  - MB-19 `/profile/request`: pick fields, give values, reason, attach proof (simulated), with a route hint.
  - `/profile/_layout.tsx` and `/rates` now send a lost session back to `/` (previously a 401 left a blank screen).

## Key files
- Domain `packages/domain/src/members.ts` (+ `members.test.ts`): `maskMobile`, `expectedRetirementDate`, `validateMemberInput`, `transferEffectiveCycle` (BR-010), `PROFILE_FIELDS`, `changeRequestRoute` (D-057), `profileFieldValue`, `applyProfileChange`, `validateChangeRequest`, `NOMINEE_RELATIONS`.
- Types: `ServiceEvent`, `RecoveryMandate`, the new `ProfileChangeRequest` (`fields[]`, `route`, `ddoCertified`, `decided*`), `TransferEvent.id/effectiveDate/...`; DTOs `MemberRow`, `MemberList`, `MemberDetail`, `MemberInput`, `TransferInput`, `ChangeRequestRow/List`, `MyProfile`, `ChangeRequestInput`. Permissions `members.edit` (Super Admin, Accountant) and `members.decideChanges` (Accountant).
- API `apps/mock-api/src/members.ts` (+ `members.test.ts`, 10 tests).
- Seed (`SEED_VERSION = 7`): `serviceEvents` (JOINED/TRANSFERRED/RETIRED), `mandates` (2 PENDING_NEW_DDO from next-cycle transfers, in Revenue), 7 change requests (Lakshmi nominee; Finance member designation + pay waiting on Kiran Kumar; others). New templates `profile.approved` / `profile.rejected`.
- Console `apps/admin-console/src/pages/members/*`. App `src/app/profile/*`, `src/lib/profile.ts`.

## API
`GET /members` · `GET /members/:id` (id or General No.) · `POST /members` · `PUT /members/:id` · `POST /members/:id/transfers` · `POST /members/:id/mandate/agree` · `GET /profile-change-requests` · `POST /profile-change-requests/:id/certify` · `POST /profile-change-requests/:id/decision` · member `GET /me/profile` · `PATCH /me/profile/contact` · `POST /me/profile/mobile` + `/mobile/verify` · `GET|POST /me/profile/change-requests`.

## Decisions
D-056 (Q-108 settings rights), **D-057** (Q-121 change-request route; office entry of a paper member creates an AGREED mandate; shares are not edited; transfers re-open the mandate as PENDING_NEW_DDO).

## Verified (2026-10-24)
- `npm run typecheck` green; `npx vitest run` **196 tests** green; domain coverage 100%.
- Browser: ST-10 list (553 active, paging 1–25 of 553), ST-12 profile, **J-11**: Accountant transferred General No. 1003 GAD → Finance ("Moves to the Finance demand sheet from Nov 2026", mandate pending) → Kiran Kumar (DDO) agreed it.
- Live API, cross-app: Lakshmi requests designation change on the phone → Accountant blocked (409) → Kiran certifies → Suresh approves → `/me/profile` shows "Assistant Secretary" and the service-history entry. Demo data reset afterwards.
- J-09 create is covered by the API tests (General No., share account, mandate, JOINED event, duplicate refusal); the console form was typechecked but not clicked through in the browser.

## Gaps / TODO
- Click through ST-11 create in the browser, and MB-02/MB-19 on the phone preview (the user stopped browser automation this session).
- **Windows Expo watcher bug:** adding `src/app/profile/index.tsx` while `expo start` runs writes `/profile/index` into `.expo/types/router.d.ts`, which fails the typecheck. Restart Expo, or regenerate with `node -e "require('@expo/cli/build/src/start/server/type-generation/routes').setupTypedRoutes({typesDirectory: require('path').resolve('.expo/types'), projectRoot: process.cwd(), routerDirectory: require('path').resolve('src/app')})"` in `apps/member-app`.
- Work Queue (ST-02) is M5; the dashboard does not yet list change requests or pending mandates.
- Documents are derived placeholders (no upload or preview). Changing shares (share purchase) is not built.

## Next
M4 Loans core (ST-20…23, F2/F3 forms, eligibility, surety picker) per docs/14.
