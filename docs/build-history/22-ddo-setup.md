# DDO setup: one DDO for all departments, or one per department (D-145): built

**Built:** Departments & DDOs (console and phone staff screens) opens with a **DDO setup** panel. The Super Admin picks **A DDO for each department** (default, the D-142 behaviour) or **One DDO for all departments**, and in single mode chooses the DDO login from a dropdown of every active DDO login (the first one is pre-selected). Save / Discard appear once something changes. In single mode the departments table shows that DDO in charge of every office with an "All departments" tag, and the edit drawer hides the per-department in-charge choice.

What single mode does:
- Every DDO task of every department goes to that one login: membership and loan certification, mandates, profile changes, the demand sheet sent to the DDO, work-queue items and stage notices.
- That login sees every department's records. Other DDO logins keep their own department's view and get no tasks.
- Printed DDO name and designation per office stay as entered (column "DDO on printed forms").

**Key files:**
- `packages/types/src/entities.ts` (`SocietySettings.ddoMode`, `singleDdoUserId`)
- `packages/domain/src/permissions.ts` (`inDepartmentScope`), used in `membership.ts`, `workflows.ts`
- `backend/src/modules/departments/departments.repository.ts` (`ddoInCharge(single)`, `allDdoUsers`) and `departments.service.ts` (`singleDdo`, `checkDdoSetup`)
- `backend/src/plugins/auth.ts` (drops the single DDO's department on each request)
- `backend/src/modules/masters/masters.{schema,service}.ts` (settings keys, validation)
- `backend/src/modules/notifications/notifications.service.ts` (`notifyStage`: only the single DDO)
- Backend scope checks now call `inDepartmentScope`: collections, documents, insight, joining, loans, members, profile-changes, settlements, `common/guards`
- `apps/mock-api/src/store.ts` (`singleDdo`, `ddoInCharge`), `app.ts` (session), `settings.ts`, and the same scope checks
- `apps/admin-console/src/pages/settings/DepartmentsSection.tsx`, `pages/DashboardPage.tsx` (scope label)
- `apps/member-app/src/app/staff/settings/[section].tsx`, `app/staff/(tabs)/home.tsx` (scope label)

**API:** `PUT /settings/values` accepts `ddoMode` (`PER_DEPARTMENT` / `SINGLE`) and `singleDdoUserId`. Errors: `singleDdoUserId` "Choose an active DDO login."; `ddoMode` "Add a DDO login in Users first…" when there is none. `GET /departments` returns the single DDO as `ddoUserId` of every department in single mode.

**Domain:** `inDepartmentScope(user, departmentId)`: a DDO with a department is limited to it; a DDO without one (the single DDO's session) and other roles pass.

**Decisions:** D-145. Rule: BR-056.

**Things to know before touching this:**
- The JWT keeps the DDO's own department; `plugins/auth.ts` removes it per request when that user is the single DDO. So switching modes takes effect on the next request, and no token holds a wider scope than the current setting.
- A DDO login still needs a department in Users. This keeps switching back safe: no login is ever left without a scope.
- New DDO scope checks must use `inDepartmentScope`, not `user.departmentId === …`, or the single DDO sees nothing.
- No migration: the setting lives in the versioned settings JSON; unset means per department.

**Verified:**
- Typecheck clean in backend, mock API, console and phone app.
- Domain 188 / 188, mock API 79 / 79 (new tests for the scope helper and the DDO setup rules).
- On a fresh mock API: `scenarios-backend.spec.ts` "Admin switches to one DDO for all departments and back (D-145)" and the D-142 test both pass in the console; the phone screen was checked by screenshot (choose, save, list shows "All departments").
- Backend test written (`masters.test.ts`) but **not run**: needs `backend/.env`.

**Gaps / TODO:**
- Run the backend tests and the e2e suite on the backend with `backend/.env`.
- On the mock API only, the phone jumps to Home after a settings save (mock lacks `/me/signature`, known since D-142).

**Next:** owner runs the backend tests locally.
