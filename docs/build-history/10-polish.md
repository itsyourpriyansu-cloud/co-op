# 10 · M10 Polish: accessibility, states, global search, demo script — done (demo scope)

Scope per D-054: everything in M10 except the signed release APK, physical-device test and hosting, which wait until the user asks.

## Done
- **Accessibility sweep (axe, WCAG 2.2 AA)** over 27 console routes in light and dark mode and 25 Member App screens (members + applicants). Started at hundreds of contrast nodes per page plus label / ARIA issues; ended with **no critical or serious violations** anywhere.
  - Token: `text.tertiary` light = `#666C79` (was gray-500, 4.49:1). `packages/design-tokens/src/semantic.ts`, regenerate with `npm run tokens`.
  - Blend lifts (no palette change): `componentTokens` in `apps/admin-console/src/app/theme.tsx` (TagV2 subtle warning / success / error text, StatCardV2 change colours; light mode only) and scoped CSS at the end of `apps/admin-console/src/index.css` on Blend `data-element` hooks (stat-card title/subtitle, sidebar section labels, `.tgs-datatable` headers via our `Table` wrapper, select placeholders, hint text, upcoming stepper titles, inactive boxed tabs, checkbox labels).
  - `components/Initials.tsx` replaces `AvatarV2` for people shown next to their name (Blend's name-hashed fills failed contrast and depend on `alt`).
  - Shell fix-ups in `ConsoleShell.tsx` (MutationObserver): remove `aria-controls` pointing at tab panels we don't render (most TabsV2 here are filters), make Blend's scrolling main area focusable, put the visible number into the DataTable page-size select's name.
  - Top bar: Demo tag and account button names include their visible text; dashboard "Needs attention" list items keep list semantics; inline links underlined.
  - Member App: `aria-checked` on every radio / checkbox (react-native-web), `onBrandMuted` (#EEF4FE) and `onBrandTile` on blue hero cards (`src/theme.ts`), cards take their accessible name from their visible content (no overriding `accessibilityLabel`).
- **State audit** (`/__demo/failure-rate` = 1): every phone screen shows its error / offline state. The console **did not**: after a reload, a failed `/me` emptied the permission list and every page said "You don't have access". Fixed: `useAuth()` exposes `meError` / `retryMe`, `RequirePermission` shows a loading skeleton, then an error with Retry, and only says "no access" when the permission list really lacks the right. Verified both on reload and with in-app navigation (each page's own error state). No-results checked (members search).
- **Global search** in the top bar (was disabled since M0): `GET /search?q=` in `apps/mock-api/src/insight.ts` (members by name / General No. / Employee ID / mobile, loans and FDs by number, joining applications, receipts; permission- and DDO-scoped), `api.search`, `app/shell/GlobalSearch.tsx` (grouped results, arrows + Enter, Esc, Ctrl/⌘ K). API test in `insight.test.ts`.
- **M3–M5 visual check** (joining detail, members list/profile/form, change requests, loans list/form/detail/letter, deposits): consistent with the later screens; no layout bugs found.
- **Formats**: no raw dates or money outside `formatDisplayDate*` / `formatINR`; one raw status in a demo snackbar made readable.
- **`DEMO-SCRIPT.md`** (repo root, linked from README): setup, personas, OTP/password, 7 acts (~30 min) across both apps, troubleshooting, what is simulated. **Act 3 rehearsed** in the browser: Lakshmi's Education loan on the phone → Sravani and Mahesh sign as sureties on their phones → six "Act as" steps on the console (Accountant → DDO → assessment → Secretary → President → Cashier) → Active on her phone, every step dated and named. The script was corrected on the way (Lakshmi already has an Ordinary loan, so the demo uses Education).
- Dev tooling: `@axe-core/playwright` added as a root devDependency (audit only).

## Verified
- 258 tests · typecheck green · domain coverage 100% · console production build · Android bundle 5.5 MB.
- Regression: the M8 (J-14) and M9 (J-13) headless walkthroughs re-run after the changes — pass, no page errors.
- Demo data reset afterwards.

## Decisions
**D-064** (all of the above). docs/12 §"M10 accessibility pass", docs/15 §5 checklist ticked (APK / device row deferred), docs/14 M10 status.

## Known gaps
- Blend dev warnings (`forwardRef render functions accept exactly two parameters`, unknown `outlineOffset` prop on stepper pages) come from the library, not our code.
- Workflow event times use the real clock while the demo date is fixed (24 Oct 2026), so fresh actions show 25 Oct.
- Not done (D-054): signed APK + TalkBack on a device, hosted demo (Q-010), package ID (Q-011). Playwright e2e suite is run by the user.

## Next
Nothing scheduled. Wait for the user: commit, APK, Azure hosting, e2e run, or changes from the society's answers in `docs/open-questions.md`.
