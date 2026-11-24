# 25 · Mobile design system: Astryx + the TGSECCS seal

> Version 1.2 (built U0–U5; U6 real phones open) · 2026-11-21 · §14 entry boxes and key–value rows (D-143) · Decision **D-138** (Accepted) · Owner: Envizon Studio
> **D-150 (2026-11-24): the Admin Console follows this system too, through `packages/design-tokens` (navy scale, Astryx colours, gold, hero, Figtree); see `docs/18` §10 and the skill's "Admin Console" section.**
> Rules for every new phone screen: the project skill `.claude/skills/tgs-mobile-ui`. As-built differences from the plan: §11.
> Scope: **`apps/member-app` only** (member screens, joining, and the staff screens in the same app). The Admin Console and `packages/design-tokens` are **not touched** until the owner says "update the web apps" (phase W, §10).

---

## 1. Goal in one paragraph

Replace the Blend-mirror look in the phone app with the **Astryx** design system (astryx.atmeta.com: tokens, type scale, spacing, radii, motion rules, component names), dressed in the **seal's navy and gold**. Add micro-interactions and animation that feel native on Android and iPhone. **Do not change any flow:** routes, copy, form fields, validation, API calls, testIDs and accessibility labels all stay as they are. The full phone e2e suite (`journeys-phone`, `states-phone`, `a11y-phone`, `journeys-staff`, `states-staff`, `a11y-staff`) is the safety net and must pass with no edits to the tests.

## 2. What exists today (measured, 2026-11-20)

| Fact | Number | What it means for the plan |
|---|---|---|
| Screens importing `@/theme` | 96 | One file (`src/theme.ts`) feeds every colour, space and radius, so the new tokens go in there |
| Screens importing `@/ui` | 96 | One kit (`src/ui/`, 8 files, ~930 lines) draws every control, so the new look and motion go in there |
| `<Text role=…>` uses | 649 | Role names change by codemod (§6) |
| `space[n]` uses | 559 | Old scale is `space[n] = 2n px`; codemod maps it to the Astryx steps |
| `buttonType=` / `subType=` | 110 / 36 | Blend prop names, renamed to Astryx `variant` |
| `<Alert>` / `<Tag>` / `<StatusTag>` | 135 / 50 / 41 | Renamed to Astryx `Banner` / `Token` / `StatusToken` |
| Raw hex colours in screens | 2 | Almost nothing is hard-coded: a clean base |
| Animation library | none (built-in `Animated` in 2 files) | Motion is new work in the kit |
| Font | Inter (4 weights via `@expo-google-fonts/inter`) | Astryx uses **Figtree** |
| Colour scheme | light only (`app.json` `userInterfaceStyle: light`) | See §9, decision 3 |

The old system is: `src/theme.ts` re-exporting `nativeTheme()` from `@tgs/design-tokens` (Blend palette, Blend radii, Blend shadows), plus a kit whose comments and props copy Blend (`buttonType`, `subType`, `Tag color="purple"`, `AlertType`). **All of that leaves the phone app.**

## 3. Brand colours from the seal

Read from `apps/member-app/assets/logo/tgseccs-logo.svg`:

| Seal part | Hex | Role in the app |
|---|---|---|
| Ring and lettering | **`#003471`** (navy) | **The one accent** (Astryx `accent`): primary buttons, links, focus ring, active tab, selected state, progress fill |
| Lettering shade | `#013B82` | Pressed / hover step of the accent |
| Building, dots, outer ring | **`#D4A547`** (gold) | **Brand highlight, never text on white** (2.26:1, fails AA). Used for: active-tab indicator, the hero card's hairline ring, stage-tracker "done" ring, the seal moments (splash, sign-in). At most **one gold moment per screen** |
| Field | `#FFFFFF` | Surfaces |

Measured contrast (WCAG AA needs 4.5:1 for body text):

| Pair | Ratio | Allowed |
|---|---|---|
| Navy on white / on body grey `#F1F1F1` | 12.14 / 10.75 | Text, icons, fills |
| White on navy | 12.14 | Button labels, hero card text |
| Gold on navy, navy on gold | 5.36 | Gold text **on navy only**; navy text on a gold chip |
| Gold on white | **2.26** | **Never text.** Shapes and lines only |
| Gold-text `#8A6420` on white | 5.35 | When gold must be readable on light (e.g. a "Society" overline) |

**Anti-slop locks (from the app-design skill):** one accent (navy), one grey family (Astryx neutrals), one radius scale, no gradients with glow, no emoji as icons, Lucide only.

## 4. Tokens (the new `src/theme.ts`, no `@tgs/design-tokens` import)

### 4.1 Colour: Astryx semantic names, light scheme

| Token | Value | Note |
|---|---|---|
| `background.body` | `#F1F1F1` | Screen canvas (Astryx) |
| `background.surface` | `#FFFFFF` | Cards, sheets, footers |
| `background.muted` | `#F1F1F1` | Inset areas, read-only fields |
| `background.inverted` | `#0A1317` | Rare: dark chips |
| `text.primary` | `#000000` → **`#0A1317`** | Astryx black, softened to the inverted ink so navy stays the loudest colour |
| `text.secondary` | `#474747` | 9.29:1 on white. Also replaces the old `tertiary` (Astryx has two text levels only) |
| `text.disabled` | `#919191` | Disabled only |
| `icon.primary` / `icon.secondary` | `#0A1317` / `#6A6A6A` | |
| `accent` / `accentPressed` / `accentMuted` / `onAccent` | `#003471` / `#013B82` / `#E6EDF7` / `#FFFFFF` | Seal navy replaces Astryx near-black |
| `brand.gold` / `brand.goldText` / `brand.goldMuted` | `#D4A547` / `#8A6420` / `#FBF4E4` | §3 rules |
| `border` / `border.emphasized` | `#00000014` / `#D4D4D4` | Astryx |
| `overlay` / `overlay.pressed` | `#00000080` / `#0000001A` | Sheets, press tint |
| `skeleton` / `track` | `#D4D4D4` / `#CCD3DB` | Astryx |
| Status `info · success · warning · error` solid | `#0074E2 · #198100 · #FFCE2F · #C9303A` | Astryx, for icons and filled chips |
| Status text | `#0067CE · #2A7230 · #836700 · #C0262C` | Success darkened from Astryx `#2F7D33` (4.49 → passes) |
| Status **tint** (chip / banner background) | `#E8F1FD · #EDF6EC · #FDF5DC · #FDECEA` | **Lighter than Astryx's muted** (Astryx's status text on its own muted fails AA: 3.5 to 4.2). All pairs measured ≥ 4.8 |
| `approval` (old "purple") | text `#6B4FB3`, tint `#F1ECFA` | 5.34:1. Kept because `presentStatus()` returns an `approval` tone |
| `money.credit` / `money.debit` | = success text / error text | Same meaning, no new colours |

A `theme.test.ts` (run by root Vitest; the include list gets `apps/member-app/src/theme.test.ts`) asserts every text-on-background pair the kit uses is ≥ 4.5:1. That is the guard against a later colour tweak breaking `a11y-phone`.

### 4.2 Type: Astryx scale with the **mobile base 16** (Astryx's own `scale.base` knob)

Astryx's formula, `round(base × 1.2^step)`, with base 16 instead of the desktop 14. Line heights follow the Astryx rule (≈1.5 under 20 px, ≈1.4 for 20–31, ≈1.25 from 32, snapped to a 4 px grid). Family **Figtree** (`@expo-google-fonts/figtree`, 400/500/600/700).

| Astryx type | Size / line | Weight | Replaces old role (count) |
|---|---|---|---|
| `display-1 / 2 / 3` | 48/56 · 40/48 · 33/40 | 400 · 400 · 600 (tabular) | `display` (9) → `display-2`; `metric` (2) → `display-3` |
| `h1` | 28/36 | 600 | `pageTitle` (32) |
| `h2` | 23/32 | 600 | — |
| `h3` | 19/28 | 600 | `sectionTitle` (11), `metricSm` (2) |
| `h4` | 16/24 | 600 | `cardTitle` (30) |
| `large` | 19/28 | 600 | — |
| `body` | 16/24 | 400 | `body` (104); `bodyStrong` (17) → `body` + `weight="medium"` |
| `label` | 16/24 | 500 | `label` (78) |
| `supporting` | 13/20 | 400 | `caption` (332); `captionStrong` (21) → `supporting` + `weight="medium"` |
| `overline` (app addition) | 11/16, uppercase, +0.6 tracking | 600 | `overline` (6). Astryx `h6` is 10 px, too small for a phone |
| `amount` | 16/24, `tabular-nums` | 600 | `amount` (5) |

`Text` gets Astryx's `type` and `weight` props. `allowFontScaling` stays on; controls grow with large text instead of clipping.
**Check during S1:** Figtree's `tnum` support on Android. If it is missing, amounts in tables keep right alignment and `amount` falls back to the system font's tabular figures.

### 4.3 Spacing: Astryx `--spacing-N` (4 px steps with half steps)

`spacing = { 0:0, 0.5:2, 1:4, 1.5:6, 2:8, 3:12, 4:16, 5:20, 6:24, 7:28, 8:32, 10:40, 12:48 }`

Codemod map from the old `space[n]` (= 2n px): `1→0.5 · 2→1 · 3→1.5 · 4→2 · 5→2` (10 px is not on the Astryx grid; it snaps down to 8) `· 6→3 · 8→4 · 10→5 · 12→6 · 16→8`. Screen gutter is 16 (`spacing[4]`); the gap between sections is 24 (`spacing[6]`).

### 4.4 Radius: Astryx shape tokens

`inner 8` (chips inside cards, OTP boxes) · `element 12` (buttons, fields, segmented) · `container 16` (cards, banners) · `page 28` (bottom-sheet top corners; Astryx `page` is 32, eased to 28 for a phone) · `full 9999` (tokens, avatars, the tab indicator). Every rounded view also sets `borderCurve: 'continuous'` (iOS squircle; ignored on Android).
Map: `radius.sm→inner · control→element · card→container · sheet→page · pill→full`.

### 4.5 Elevation: separate by surface step first, shadow second (Astryx)

Cards: white on `#F1F1F1` body with a 1 px `border`, **no shadow**. Shadows only for things that float, written as RN `boxShadow` (supported in RN 0.88 on both platforms):
`low  0 1px 2px #0000000F` (sticky footer, tab bar) · `med  0 4px 12px #0000001A` (raised hero card) · `high 0 12px 32px #00000026` (bottom sheet, dialog).

### 4.6 Motion: Astryx tokens, ported to RN

| Token | Value | Used for |
|---|---|---|
| `duration.fast` (min / base / max) | 130 / 175 / 230 ms | Press, toggle, colour change, chip select |
| `duration.medium` | 310 / 410 / 550 ms | Screen content entrance, sheet open, expand |
| `duration.exit` | 175 ms | Anything leaving |
| `ease.standard` = `ease.entrance` = `ease.move` | `Easing.bezier(0.24, 1, 0.4, 1)` | Decelerating arrivals and state changes |
| `ease.exit` | `Easing.bezier(0.3, 0, 0.6, 0.6)` | Accelerating departures |
| `spring.press` | `{ stiffness: 400, damping: 30, mass: 1 }` | Anything a finger touches (a spring starts from the live value) |
| Reduced motion | opacity-only cross-fade ≤ 200 ms; values update at once | `AccessibilityInfo.isReduceMotionEnabled()` + `reduceMotionChanged`, read once in a `useReducedMotion()` hook |

Rules (Astryx + the app-design skill): **animation never blocks the next tap**; high-frequency things (tab switch, list press) get no perceptible delay; exits match entrance direction; contextual UI grows from its trigger; spinner and skeleton loops are not tempo-scaled.

## 5. Components: old kit → Astryx names (same files in `src/ui/`)

| Today (Blend mirror) | Becomes (Astryx) | Prop changes | Motion / micro-interaction |
|---|---|---|---|
| `Button buttonType=primary\|secondary\|danger\|success subType=default\|iconOnly\|inline` | `Button variant="primary\|secondary\|ghost\|destructive"` + `IconButton` + `Link` | `buttonType`→`variant` (`danger`→`destructive`, `success`→`primary`, Astryx has no success button); `subType="inline"`→`<Link>`; `subType="iconOnly"`→`<IconButton>`; `leftSlot/rightSlot`→`icon/iconEnd`; `text` stays as `label`. Heights `sm 40 · md 48 · lg 56` (touch targets beat Astryx's desktop 28–36) | Press: spring scale to 0.97 + pressed tint; loading: label cross-fades to spinner, width locked so nothing jumps; light haptic on primary press |
| `Card onPress selected` | `Card`, `ClickableCard`, `SelectableCard` | Split by intent (Astryx) | Clickable: scale 0.98 spring + `overlay.pressed`; selectable: border colour animates to navy over `fast`, check mark scales in |
| `Alert type=primary\|success\|warning\|error\|neutral\|purple` | `Banner status="info\|success\|warning\|error\|neutral\|approval"` | `type`→`status`, `purple`→`approval`, `primary`→`info` | Fades and rises 8 px on mount (`medium-min`), one time only |
| `Tag color type size` | `Token` (status chips) · `Badge` (counts only, Astryx rule) | `color`→`status`; `type="attentive"`→`emphasis="strong"` | Static; a colour change cross-fades over `fast` |
| `StatusTag entity status` | `StatusToken` | Same props. Still uses `presentStatus()` from `@tgs/design-tokens/status` (§7) | A small `StatusDot` before the label: pulses softly for "waiting" tones, solid otherwise (reduced motion → solid) |
| `Section title description right` | `Section` | Unchanged | — |
| `KeyValue label value emphasis` | `MetadataListItem` (the codemod renames all 325 call sites) | `emphasis` unchanged | — |
| `Divider` | `Divider` | — | — |
| `Text role tone` | `Text type weight tone` | §4.2 map; `tone="tertiary"`→`secondary` | — |
| `TextField`, `DateField`, `SelectField`, `OtpInput` | `TextInput`, `DateInput`, `Selector`, `OtpInput` (Astryx `Field` frame: label, control, `FieldStatus`) | Names only; props unchanged | Focus: border animates to navy + 2 px focus ring (Astryx focus token); error: one 6 px horizontal shake (3 cycles, 300 ms) when the error first appears + error haptic; OTP: each box pops (scale 1.06 → 1) as a digit lands, caret blinks |
| `SelectField` modal list | `Selector` opening a **bottom sheet** | — | Sheet rises with `spring` from the bottom, overlay fades in `medium-min`; closes down with `exit`; selection tick haptic |
| `ChoiceCard`, `YesNo`, `Checkbox`, `Segmented`, `MonthPicker`, `NumberStepper` | `SelectableCard`, `RadioList` (yes/no), `CheckboxInput`, `SegmentedControl`, `SegmentedControl` (months), `NumberInput` | Names only | Segmented: the selected pill **slides** between options (`fast`, `ease.move`) + selection haptic; checkbox: check draws in (scale + opacity); stepper: number ticks with a 4 px vertical slide, haptic at min / max |
| `WizardProgress` | `Stepper` | — | Fill animates width (`medium`); the step count cross-fades |
| `StageTracker` | `Stepper orientation="vertical"` | — | Done steps show a gold ring; the current step's dot breathes; line fills down on mount |
| `Screen`, `Header`, `Hero`, `EmptyState`, `Skeleton` | `Screen` (Astryx `Layout`), `Header` (`LayoutHeader`), `PageHeader`, `EmptyState`, `Skeleton` | Names only | Screen: children enter with a staggered fade + 8 px rise (first 6 blocks, 40 ms apart, `medium-min`); Header: title fades in as the page title scrolls under it; Empty: icon scales in; Skeleton: Astryx `skeleton` colour, opacity pulse (keeps `testID="skeleton"`) |
| Tab bar (`(member)/_layout.tsx`, `staff/(tabs)`) | `MobileNav` styling on Expo Router `Tabs` | — | Active icon springs 1 → 1.12 → 1; a **gold pill indicator** slides under the active tab; selection haptic; **no slide between tabs** (tabs are peers) |
| Stack transitions (`_layout.tsx`) | Native stack | `animation: 'ios_from_right'` on both platforms, so the push feels the same on Android and iPhone | Native |
| Splash + `LaunchPoster` + `welcome` / `login` | Seal moment | — | Seal scales 0.92 → 1 with the gold ring tracing in; poster fades out with `exit` |
| Home hero card (navy) | `Card` on `accent` with a gold hairline ring | — | Balance counts up once on first show (`medium`, accessibilityLabel always the final value, reduced motion → none) |

**Haptics are punctuation, not noise:** selection tick (segmented, selector, tab, checkbox), light impact (primary button), error notification (field error shake). Nothing fires on scroll or on static banners.

## 6. Codemod: how 96 screens move without hand-editing flows

One Node script in the scratchpad (not committed), run once, then `npm run typecheck`:

1. `role="caption"`→`type="supporting"` …, per the §4.2 table; `role="bodyStrong"`→`type="body" weight="semibold"`, and so on.
2. `tone="tertiary"`→`tone="secondary"`.
3. `space[n]`→`spacing[m]` per §4.3; `radius.card`→`radius.container`, per §4.4.
4. `color.brand.solid`→`color.accent` · `color.bg.canvas`→`color.background.body` · `color.bg.surface`→`color.background.surface` · `color.text.tertiary`→`color.text.secondary` · `color.status.X.fg/bg/solid/border`→`color.status.X.text/tint/solid/border` · `color.border.subtle|default`→`color.border` · `color.border.strong`→`color.borderEmphasized` (full list generated from the 30 keys in use).
5. `buttonType=`→`variant=` (+ value map); `subType="inline"` buttons → `<Link>`; `subType="iconOnly"` → `<IconButton>`; `<Alert type=`→`<Banner status=`; `<Tag color=`→`<Token status=`; `<StatusTag`→`<StatusToken`; `<KeyValue`→`<MetadataListItem`; field and choice names per §5.
6. `welcome.tsx`'s `brand` import → a local `APP_NAME` constant in `theme.ts`.

The script only renames tokens and props. It never touches strings, handlers, routes, `testID`s or `accessibilityLabel`s; a `git diff --stat` plus a grep for changed string literals proves that.

## 7. What gets removed from the phone app

- `@tgs/design-tokens` imports everywhere **except** `presentStatus` / `StatusEntity` (status *wording* shared with the console; it is language, not design). The package stays in `package.json` for that one function.
- `FONT_BY_WEIGHT` (Inter), `onBrandMuted`, `onBrandTile`, `nativeTheme` and every Blend comment / prop name in `src/ui`.
- `@expo-google-fonts/inter` from `apps/member-app/package.json` (the console keeps its own Inter).

Nothing is deleted from `packages/design-tokens`; the console still uses all of it.

## 8. Phases (each ends with its exit test; no phase starts before the last one passes)

| Phase | Work | Exit test |
|---|---|---|
| **U0 · Skill** | Write the project skill `.claude/skills/tgs-mobile-ui/SKILL.md`: §3–§5 as rules (tokens, gold rules, component names, motion table, haptics, reduced motion, "never change flows"), so every later session builds screens the same way. Record **D-138** in `docs/decisions-log.md`, then update `CLAUDE.md` §2 / §6 (font row: app = Figtree) and `docs/12` / `docs/18` (mobile now points here) | Skill loads; docs bumped |
| **U1 · Tokens** | New `src/theme.ts` (§4), `theme.test.ts` contrast guard, Figtree in `_layout.tsx`, `useReducedMotion()`, motion helpers (`usePressScale`, `useEnter`, `haptic`) in `src/ui/motion.ts` | `npm test` green (contrast) · app boots on Expo web |
| **U2 · Kit** | Rebuild the 8 `src/ui` files to the Astryx names and motion in §5, with the old exports temporarily re-exported under their old names so the app still compiles | `npm run typecheck` green · every kit control checked on Expo web at 360 × 800 |
| **U3 · Codemod** | Run §6, delete the temporary old-name exports, remove Inter | typecheck green · `git diff` shows no changed string literal, testID or label |
| **U4 · Screens polish** | Pass over the screens the kit cannot reach: home hero, tab bars, welcome / login / splash seal moment, tracker, receipt / FDR views, staff dashboard. Kill leftover one-off styles (34 files have local `StyleSheet.create`; each is checked against the tokens) | Visual pass on all 5 member tabs, joining, loan apply, FD open, payment receipt, and 5 staff screens, at 360 px and 412 px |
| **U5 · Motion and a11y pass** | Full-motion pass per flow (the app-design skill's simulator loop), reduced-motion pass, large-text pass (200 %), TalkBack / VoiceOver labels unchanged | `npm run e2e:phone` + the staff phone specs **all green with no test edits** · `a11y-phone` / `a11y-staff` axe clean |
| **U6 · Real devices** | Android (Expo Go / dev build) and iPhone: 60 fps on press and sheet, haptics feel, Figtree rendering, `boxShadow` on Android | Owner sign-off. Then `BUILD-CHECKLIST.md` Resume here + build-history entry |

## 9. Decisions (confirmed by the owner 2026-11-20: all four as recommended)

1. **Animation engine: built-in `Animated` with the native driver, plus `expo-haptics`** (one small Expo package) vs. **Reanimated 4**. Everything in §5 is opacity, transform or colour, which the native driver runs on the UI thread. Reanimated is only needed for gesture-driven motion (drag-to-dismiss sheets), which no flow needs. *Recommend built-in + expo-haptics.* Either one needs a new APK / iOS build (native code); Expo web still works.
2. **Font: Figtree** (Astryx's family) vs. keep Inter. *Recommend Figtree*: it is the Astryx look and a JS-only font package (no native rebuild of its own).
3. **Dark mode: later.** Astryx defines dark values, but all 96 screens build their styles once at load with light colours. Dark mode means moving every `StyleSheet.create` into a theme hook, which is a separate step after this one. *Recommend light now* (§4 keeps Astryx names so dark slots in cleanly).
4. **Type base 16** (Astryx's own knob) vs. Astryx's desktop 14. *Recommend 16*: phone body text under 16 hurts reading. Expect some text to wrap onto two lines; U4 checks it.

## 10. Phase W (later, only when the owner asks)

Port the same tokens into `packages/design-tokens` (a new `astryx` brand next to Blend), then switch the Admin Console's Tailwind / CSS variables and the staff-console look. Not planned in detail until asked.

## 11. As built (2026-11-20)

| Step | Result |
|---|---|
| U0 | Skill `.claude/skills/tgs-mobile-ui`; D-138; CLAUDE.md, docs/12, docs/18 point here |
| U1 | `src/theme.ts` (no design-tokens import), `src/theme.test.ts` (32 contrast pairs, all ≥ 4.5:1, in root Vitest), `src/ui/motion.ts`, Figtree in `_layout.tsx`; `expo-haptics` and `@expo-google-fonts/figtree` added, `@expo-google-fonts/inter` removed from the app |
| U2 | Kit rebuilt: `Text`, `Button` (+ `IconButton`, `Link`), `Token` (was `Tag`), `Surfaces`, `Fields` (+ `BottomSheet`), `Choice`, `Progress`, `Layout`, new `TabBar` and `CountUp` |
| U3 | Codemod over 102 screen files; typecheck clean; a string-literal diff against HEAD shows **0 changed copy, label or testID** |
| U4 | Member home hero (gold hairline, raised, count-up, quick-action springs), staff home hero (same), seal intro on Welcome / Sign in / Staff sign in, welcome path cards spring, launch poster fades on the exit curve, both tab bars on the shared animated tab icon |
| U5 | Phone e2e suite: result in the BUILD-CHECKLIST session log |
| U6 | **Open:** real Android and iPhone check (feel of springs and haptics, Figtree rendering, `boxShadow` on Android, Figtree tabular figures) |

Differences from the plan, kept smaller on purpose:
- **`Card` is not split** into ClickableCard / SelectableCard: one `Card` turns clickable with `onPress` and selectable with `selected` (splitting 196 call sites with nested closing tags gave no user benefit). `SelectableCard` is the radio card (was `ChoiceCard`).
- **Field names stay `TextField` / `DateField` / `SelectField`**: Astryx's `TextInput` would clash with React Native's.
- **Selection cross-fades** (a layer plus a press spring) instead of a sliding pill, because option rows wrap onto two lines; the **tab indicator scales in per tab** instead of sliding across the bar.
- **No header title-on-scroll** and **no pulsing status dot** (a list of pulsing dots is noise); `StatusToken` shows a static dot.
- **`brand`** (society name, registration number) is still read from `@tgs/design-tokens`: identity data, not design.
- **Gold**: one moment in a screen's content plus the tab indicator (widened to the 10 % of 60 / 30 / 10 by D-139, §12).
- **Section titles carry no heading role** (unchanged from before), so screen-reader semantics stay exactly as they were.

## 12. UX audit and glass hero (D-139, 2026-11-21)

Audit of the owner's phone screenshots plus a phone-size walk of 12 member screens on Expo web (ux-audit skill, visual polish sweep).

| Finding | Cause | Fix |
|---|---|---|
| Cards and sections touch on a real phone (home, profile, payments, help) | `Screen`'s entrance wrapper held a whole fragment of blocks without the screen's 24 px gap; web has no wrapper, so tests missed it | `Enter` wrapper repeats `gap: spacing[6]` (`ui/Layout.tsx`) |
| Profile: "Edit conta…", "Request a…", "My signat…" cut off | Three buttons in one row | Menu list (`ListRow` with hints) |
| "Show" label above every list filter; filters looked like three loose buttons; long labels cut off | Form-style `SegmentedControl` reused as a filter | One track with a white thumb, labels size to fit and wrap, `hideLabel` (label kept for screen readers) |
| Home: quick actions and the salary card float between sections | No section titles | "Quick actions" and "This month" sections |
| Home hero sub-line "1 FD + CRD, SR…" cut off | One-line limit | Two lines |
| Flat navy summary blocks, little gold | — | Glass hero + 60 / 30 / 10 gold (below) |
| Floating grey gear on every screen | **Expo Go's developer button**, not the app | Nothing to fix; absent from the APK |

**Glass hero:** `HeroCard`, `heroSurface`, `glassTile` (`ui/Surfaces.tsx`); tokens `color.hero.{solid, gradient, glow, ring, glass, glassBorder, glassEdge}`. Navy gradient `#063B76 → #003471 → #001F45` at 155°, a gold radial glow from the top-right, 1 px gold ring at 55 %, `shadow.high`, radius `page`. Tiles: white 8 % over the gradient, white 16 % border, a 1 px inner top highlight. No blur package: the gradient behind the tiles gives the frosted read, and `expo-blur` would add native code. Contrast for the gradient start and the glass tile is in `theme.test.ts` (38 pairs).

**60 / 30 / 10:** neutrals (`background.body`, `surface`) 60, navy 30, gold 10. Gold: hero ring + glow + label (`tone="goldOnAccent"`), profile initials ring, quick-action icons (gold on navy gradient tiles), this-month icon (`goldText` on `goldMuted`), tab indicator, stage halo. Never gold text on light.

## 13. Prints and wizard content (D-140, D-141, 2026-11-21)

- **Phone documents** carry the seal in the letterhead (`lib/sealImage.ts`, a 192 px PNG data URI: expo-print cannot load bundled assets). **Download PDF** writes the base64 PDF into `Paths.cache` instead of moving expo-print's file (Expo Go refuses to read that one).
- **Wizards:** a step starts with `StepHeader` (progress, title, one line on what the step is for). Results that react to inputs sit right under those inputs (loan: "Your instalment" under amount and months). A summary on a review step has a section title. A list of periods on a card is a range ("12 to 100 months"); the step that picks one lists them all, in an even three-column grid.

## 14. Entry boxes and key–value rows (D-143, 2026-11-21)

- **OTP boxes** each get the same measured width (the row width less the gaps, divided by six); `flex` alone let Android draw the first box wider. Empty boxes use `color.borderInput` (#888888, at least 3:1 on body and surface, WCAG 1.4.11), filled boxes `text.secondary`, the active box a 2 px navy border with no padding change.
- **Passwords:** every `TextField` with `secureTextEntry` has an eye button ("Show password" / "Hide password", 44 pt target) so a typo can be seen before signing in. Nothing to add on a screen.
- **`MetadataListItem`:** short values stay label left, value right. A value longer than 24 characters, or a label and value together longer than 48, goes **under** its label, left-aligned and full width (`stacksValue()`). Bank accounts, sign-off lines and notes no longer squeeze into a narrow right-aligned column.
