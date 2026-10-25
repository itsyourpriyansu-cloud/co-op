# 02 · M2 Settings & masters (ST-60…68, MB-16) — done

## Built
- **Console `/settings/:section`** (one page, section list left): General ST-60 (society profile, shares, service, retirement age) · Loan products ST-64 (rate, min/max, instalments, sureties, share deposit %, EMI method, workflow flags) · Deposit schemes ST-65 (FD slabs, CRD/SRDS/Savings rates) · Insurance & demand ST-66 · Departments & DDOs ST-67 (incl. external offices) · Users ST-61 (create, deactivate) · Permissions ST-62 (read-only matrix) · Notification templates ST-63 (placeholder check) · Change history ST-68. Non-admins see a "View only" banner. Placeholder values carry a tag until someone confirms them.
- **App MB-16 Interest rates** (`apps/member-app/src/app/rates.tsx`, from More → Interest rates): loan products, FD slabs, other deposit rates, **EMI estimate** (product + amount + months, `calculateEmi` preview). Re-reads on focus and pull-to-refresh. `Screen` gained optional `refreshing` / `onRefresh`.

## Key files
- API: `apps/mock-api/src/settings.ts` (`registerSettings`, `ratesReference`), tests `settings.test.ts` (8).
- Domain: `packages/domain/src/settings.ts` (`validateLoanProduct`, `validateFdSlabs`, `validateSocietySettings`) + tests.
- Console: `apps/admin-console/src/pages/settings/*` (`shared.tsx` → `useSettingsSave` invalidates `settings` + `rates`), form kit `src/components/Form.tsx`.

## API
`GET /settings` · `PUT /settings/society|values` · `PUT /settings/loan-products/:code` · `GET|POST /departments`, `PUT /departments/:id` · `GET|POST /users`, `PUT /users/:id` · `GET /permissions` · `GET /notification-templates`, `PUT /notification-templates/:key` · `GET /reference/rates` (any signed-in user). Every change writes an audit entry.

## Decisions
D-056: Q-108 answered by own judgment: only the Super Admin edits settings; every staff role views them; members see rates read-only on MB-16.

## Verified
- API test "Super Admin changes the Ordinary rate → members see it on the rate card".
- Live exit test (2026-10-24): Ordinary rate 11% → 13% as Super Admin → phone MB-16 EMI for ₹1,00,000 / 60 months went ₹2,584 → ₹2,750 after refresh. Rate set back to 11%.

## Gaps / TODO
- Full calculators (MB-11) are M8; MB-16 has a simple estimate only.
- Templates are edited but not yet sent anywhere (notifications module).

## Next
M3 Members module (see 03b).
