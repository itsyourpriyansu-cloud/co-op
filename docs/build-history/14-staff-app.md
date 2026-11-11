# Staff mobile UI: built

**Built:** every console function as a phone screen in the existing Expo app, under `src/app/staff/` (phases S1–S8, `docs/23` §5 lists each screen). Staff sign-in AU-01m, role tabs, no access, not found, search, ST-01m…ST-04m, joining ST-14m…ST-17m, members ST-10m…ST-13m, ST-18m, settlement, loans ST-20m…ST-28m, surety recovery, deposits ST-30m…ST-33m, collections ST-40m…ST-47m, penal waiver, reports ST-50m, ST-51m, prints ST-52m, settings ST-60m…ST-68m.

**Key files:** `apps/member-app/src/app/staff/` (45 route files), `src/app/staff-login.tsx`, `src/components/staff.tsx` (shared staff parts), `StaffMemberForm.tsx`, `StaffSanctionSheet.tsx`, `src/lib/staff*.ts` (labels, query keys, pure helpers). Tests: `tests/e2e/{journeys,states,a11y}-staff.spec.ts`, `STAFF_SCREENS` in `tests/e2e/routes.ts`.

**API:** no change. Everything goes through `@tgs/api-client` to the existing backend (D-106).

**Domain:** no change. Previews call `packages/domain`; the server's result is authoritative.

**Decisions:** D-106 scope, D-107 phones last, D-108 as built (one `[action]` route per module, one settings route, sections on the member screen, no access in place).

**Things to know before touching this:**
- Hide a tab with `tabBarButton: () => null` and `tabBarItemStyle: { display: 'none' }`. `href: null` makes the route unreachable in Expo Router 58.
- The staff guard waits for `/me` before mounting the Stack. Taking a mounted Stack away resets the route to Home.
- Default dates come from `useTodayDate()`, which respects the demo clock. Pass `key={today}` to `DateField`.
- `tests/e2e` `resetDemo` allows 90 s. A reset that overruns collides with the next one (`role_permissions` insert error, demo route only).

**Kit changes that reach the Member App:** the picker placeholder tone moved from `disabled` to `tertiary` for contrast, and the `Screen` scroller has a web-only `tabIndex` so a long read-only list can be scrolled by keyboard.

**Verified (Expo web at 412×915 and 360×800, against the real backend, on `tgseccsl_dev` in a throw-away PostgreSQL):** staff journeys 14/14, states 10/10, axe and nothing cut off 48/48; member phone 41/41; console 154/154; backend 143; root 307; typecheck green.

**Gaps / TODO:**
- Nothing has run on a real phone yet (S10). Android keyboard, hardware and swipe back in wizards, signature upload and long pickers are the risks listed in `docs/23` §6.
- Print opens the console page in the phone's browser and needs a console sign-in there.
- A repeated receipt is guarded in the UI only (`docs/23` §4.5). A real fix is a backend change.
- Every report's row count is compared with the server. Print links were checked against the console router, and one is clicked in a test.
- `design:design-critique` and `design:accessibility-review` were not run per module (`docs/23` §4.6). Instead axe ran on all 48 screens and all 48 were reviewed by eye at 412 px.

**Register layout (D-109):** `RecordCard` is now a ruled row inside `Stack2`; `FilterBar` holds search and compact `SelectField` chips; `TileGrid` is one ruled surface; `Card` and `theme.textStyle` changed (no card shadow, tabular amounts), which also reaches the Member App. Direction: a society register, blue ink on ledger paper.

**Next:** S10, the real-phone check, by the owner.

**Screen audit (D-110):** all 63 staff screens were captured full length and read one by one. Fixed: `Loaded page` gives a record page its header and back arrow while loading or on an error; `plain()` strips rule numbers from server text; `Expand flush` lets a list of expanding rows sit in the register; the report viewer, cash slip, generate demand, recovery entry, FD bands and change history were tightened. Two `Fields.tsx` fixes matter on any narrow field: `minWidth: 0` on the input keeps a unit visible, and the web-only `outlineStyle: 'none'` removes a second focus ring.
