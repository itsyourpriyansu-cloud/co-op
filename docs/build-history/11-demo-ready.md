# 11 · Demo-ready: demo clock, Playwright suite, screen sizes, production mode, docs — done

Goal: the prototype survives a live demo on any day, and a robot proves it before every presentation. Scope per D-054: still localhost, no APK, no Fusil backend.

## Done
- **Demo clock (D-065).** Every timestamp the mock API writes uses the demo date plus the real time of day (`apps/mock-api/src/clock.ts`). Fresh actions no longer show 25 Oct next to 24 Oct data. The console's "days in stage" uses the demo date. Document uploads are stamped by the server.
- **Playwright suite (`tests/e2e/`, D-066).**
  - **Config** (`playwright.config.ts`):
    - URLs come from `E2E_CONSOLE_URL` / `E2E_PHONE_URL` / `E2E_API_URL`;
    - projects *console* (1440×900) and *phone* (412×915);
    - it reuses running servers or starts them (API with `MOCK_PERSIST=0`, console on 5180, Expo web on 8090).
  - **Shared helpers** (`support.ts`):
    - every test fails on any page error or console error (only Blend's known dev warnings are allowed);
    - persona sign-in through the API;
    - reset and failure-rate control;
    - screenshots go to `test-results/screens/`.
  - **Specs:**
    - `console-smoke`: login, every console route (35) as its natural persona, DDO no-access, dark mode;
    - `journeys-console`: J-03…J-08 loan to disbursement and letter, J-10 month end, J-11 receipts and verifying a reported payment, J-12 FD at the counter, J-13 reports/CSV/notice, composer + reply, Ctrl K search;
    - `journeys-phone`: J-14 sign-in, activation, forgot/change password, tabs, report a payment, calculators (BR-002), help, settings;
    - `cross-app` (AC-X01): Divya joins → General No. on her phone; Sravani's Education loan signed by Lakshmi and Mahesh on their phones → disbursed → Active on hers; FD → FDR number on the phone; Mahesh's short month identical on both apps; console message + reply reach the phone;
    - `a11y-console` / `a11y-phone`: axe WCAG 2.2 AA, no critical or serious findings, every console route in light and dark, every phone screen;
    - `states-console` / `states-phone`: failure rate 1 → each list shows its error with Retry (on reload and after in-app navigation), then recovers; no-results; a fresh load with failures never says "no access";
    - `screens`: 1366×768, 1280×800, and 1280×800 with the sidebar collapsed (no sideways page scroll, no clipped header buttons); print pages; phone at 360×740;
    - `demo-script`: Acts 1–7 of `DEMO-SCRIPT.md` on one reset, through the real UI of both apps.
  - **Scripts:** `e2e:console`, `e2e:phone`, `e2e:demo`.
- **Real bugs the suite found and fixed:**
  - Two `<main>` landmarks (the shell already renders one). `ConsoleShell.tsx` now uses a `div`.
  - Global search was a `searchbox` carrying `aria-expanded`, a critical axe finding on **every** console page; M10's sweep ran before search was enabled. It is now a `combobox` with `aria-autocomplete="list"` (`GlobalSearch.tsx`).
  - Dashboard tiles had a screen-reader name that dropped their visible text. The name now comes from the visible content.
  - Generate demand sheets: department checkboxes had no name. A hidden `<label for>` per row fixes it.
  - Dark mode: Blend fills "attentive" primary tags ("You", "Certify", "Decide") with primary-500 behind white text (3.8:1). Fixed with a scoped CSS darken (`.tgs-tag-attentive`).
  - Paper twins (FDR, sanction letter, letterhead pages such as receipts and printed forms) used `bg-white`, which does not exist because the token theme removes Tailwind's palette. In dark mode the paper was transparent with dark ink. Papers now carry `data-theme="light"`, and the token build emits light variables for any nested light scope (`scripts/build-css.ts`). The notification badge's `text-white` became `text-on-brand`.
  - New receipt: the date defaulted to a hard-coded 2026-10-24. It now uses the demo date.
- **Production mode:**
  - `npm run demo:prod` builds the console and serves it with `vite preview` on **5180**, together with the API;
  - `npm run dev:web` starts the phone preview on 8090;
  - the console port is `CONSOLE_PORT` (default 5180, strict) for dev and preview. Before this, the dev config still said 5173, the user's other project.
- **Real phone over Wi-Fi:** documented in `DEMO-SCRIPT.md` → *Before you start*. It covers the LAN address printed by the API, the firewall rule, `EXPO_PUBLIC_API_URL` or in-app Demo settings, and CORS. **Not verified on a device.**
- **Docs:**
  - `docs/18-design-tokens-and-components.md`, `docs/19-patterns-and-states.md` and `docs/20-scenario-catalog.md` written from the code; 30+ code comments already pointed at them;
  - `docs/client-questions.md`: 35 plain-language questions for the society, each with what the demo does today;
  - `LEARN-THE-APP.md` updated to "as built" (Blend instead of shadcn/NativeWind, the tests that exist, no APK yet);
  - `DEMO-SCRIPT.md` v1.1.

## Verified
RESULTS_PLACEHOLDER

## Decisions
D-065 (demo clock), D-066 (demo-ready gate: port, prod mode, e2e suite as acceptance, a11y fixes).

## Known gaps
- Real phone (Expo Go over Wi-Fi) not tried on a device. Signed APK, TalkBack and Azure hosting wait until asked (D-054).
- Blend dev warnings (`forwardRef render functions…`, unknown `outlineOffset`) come from the library. The suite ignores exactly these two.
- No automated lint for "Tier 2 tokens only" (docs/18 §9). It is enforced by review.

## Next
Wait for the user: APK, Azure hosting, or changes from the society's answers (`docs/client-questions.md`).
