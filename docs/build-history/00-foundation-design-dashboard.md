# 00 · M0 foundation, design system, dashboard, logo

## Built
- **Monorepo (npm workspaces, D-038):** `apps/{admin-console, member-app, mock-api}`, `packages/{types, domain, api-client, mock-data, design-tokens}`. Packages ship TS source (D-041).
- **Mock API (Hono):** persona login, `/me`, demo endpoints (`/__demo/reset|clock|failure-rate|personas|scenarios|dataset|sample`), `/dashboard/summary`. Snapshot persistence in `apps/mock-api/.data` (reseeds when `SEED_VERSION` changes).
- **Design system on Juspay Blend** (D-047 planned): tokens in `packages/design-tokens` (foundation mirror of Blend, brand, semantic light/dark, typography roles, layout incl. `layers` z-index scale, status presentation map). Console uses Blend components; the app has its own native kit in `apps/member-app/src/ui` with the same prop contracts.
- **Console:** Blend SidebarV2 shell + topbar (search, demo menu, theme toggle, persona switch), login (AU-01), system pages, **Dashboard ST-01** (KPIs, needs attention, collections, loan pipeline, short collections, retiring soon), **Design System page** (foundations, components, status, all 10 view states, scenario catalog).
- **App:** Expo Router; welcome, login, offline, demo settings; joining flow (see 03a).
- **Logo:** official seal everywhere (D-052), master in `assets/brand/`.

## Key files
- Tokens: `packages/design-tokens/src/*` → `npm run tokens` builds `css/tokens.css`, `css/tailwind.css`.
- Console shell: `apps/admin-console/src/app/shell/*`, routes `src/app/router.tsx`, nav `src/config/navigation.ts`.
- Shared console components: `src/components/{ViewState, StatusTag, Money, PageHeader, Panel, Table, RuleCheckList, SideDrawer, Seal}.tsx`.
- App kit: `apps/member-app/src/ui/*`, theme `src/theme.ts`, storage adapter `src/lib/storage.ts` (web preview uses localStorage).

## Gotchas learned
- Blend `DataTable` is not generic → use `components/Table.tsx`. React-element columns need `isSortable: false`.
- Blend `DrawerV2` parts are **headless vaul primitives** → always use `components/SideDrawer.tsx` (styled, z-index `layers.drawer` = 1100). Blend dropdown menus render *below* the drawer → use chips/radios inside drawers.
- Blend `Checkbox` shows its label from **children**, not the `label` prop.
- Dynamic Tailwind class names don't compile → use literal maps (`lib/typography.ts`).
- RN `TextProps.role` collides with the kit's `role` → `Omit<TextProps,'role'>`.
- PowerShell writes UTF-8 **with BOM** → broke Metro JSON parsing. Write files with the Write tool or Python, never PowerShell `Set-Content`.

## Verified
Typecheck all workspaces, Vitest (domain/seed/API), Android `expo export`, headless screenshots of console and app.

## Next
See 03a, then BUILD-CHECKLIST.
