# Many DDO logins per department, one in charge (D-142): built

**Built:** the Super Admin may add any number of DDO logins to a department in Users (the old one-active-DDO rule from D-133 is gone). Departments & DDOs lists every DDO login of each office and refreshes as soon as Users is saved. Its edit drawer has a **DDO in charge** dropdown; choosing someone also fills the printed DDO name. Only the one in charge gets the DDO tasks: certifications, mandates, profile changes, the demand sheet sent to the DDO, work-queue items and notices. Every DDO login still sees its own department's records. The same is on the phone staff screens.

**Key files:**
- `backend/src/models/masters.model.ts` (`departments.ddo_user_id`) and `backend/src/db/migrations/0038_d142_ddo_in_charge.sql`
- `backend/src/modules/departments/departments.repository.ts` (`ddoInCharge`, `ddoUsers`), plus `departments.service.ts`, `departments.schema.ts` and `departments.controller.ts`
- `backend/src/modules/users/users.service.ts` (rule removed)
- `apps/mock-api/src/store.ts` (`ddoInCharge`), used in `members.ts`, `loans.ts`, `loan-workflow.ts`, `membership.ts`, `collections.ts` and `settings.ts`
- `apps/admin-console/src/pages/settings/DepartmentsSection.tsx`, `UsersSection.tsx` and `src/index.css` (select above drawers)
- `apps/member-app/src/app/staff/settings/[section].tsx`
- `packages/types` (`Department.ddoUserId`)

**API:** `PUT /departments/:id` accepts `ddoUserId` (an active DDO login of that department, or `null` to clear). `GET /departments` returns in `ddoUserId` the login actually in charge.

**Domain:** none.

**Decisions:** D-142 (replaces D-133 point 2). Rule: BR-056.

**Things to know before touching this:**
- Who is in charge is worked out in one place each: `DepartmentsRepository.ddoInCharge()` in the backend and `ddoInCharge()` in the mock API. Every DDO task already went through `departments.ddoLogin()`, so nothing else changed.
- The fallback (longest-standing active login) means deactivating or moving the chosen DDO never leaves the office without one, if another login exists.
- Blend's select menu opened behind `SideDrawer`, so clicks never reached its options. `index.css` lifts it above the drawer while a drawer is open.
- Blend's table keeps rendered cells until its own data changes. The departments table is keyed on the users list so the logins column redraws.

**Verified:**
- Typecheck clean in backend, mock API, console and phone app.
- Unit tests 382 / 382, including a new mock API test for the in-charge rules.
- On the mock API, these flows passed end to end: console (add a second DDO, see both, put them in charge, hand it back) and phone (choose the in-charge, list shows it). Console accessibility suite 71 / 71 passed.
- Backend tests written (`masters.test.ts`, `users.test.ts`) but **not run**: they need `backend/.env`.

**Gaps / TODO:**
- Run the backend tests and `scenarios-backend.spec.ts` with `backend/.env`.
- On the mock API only, the phone staff screens jump to Home after a settings save: the mock lacks `/me/signature`, so the signature check reloads. This happened before D-142 too.

**Next:** owner runs the backend tests locally.
