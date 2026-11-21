---
name: tgs-mobile-ui
description: TGSECCSL phone-app design system (Astryx tokens in the seal's navy and gold, D-138). Load before building or changing any screen, component, style or animation in apps/member-app (member screens, joining, and the staff screens). Not for the Admin Console, which keeps Blend until the owner asks.
---

# TGSECCSL mobile UI (D-138)

Source of truth: `docs/25-mobile-design-system.md`. Tokens: `apps/member-app/src/theme.ts`. Kit: `apps/member-app/src/ui/`. Motion: `src/ui/motion.ts`.

## Hard rules

1. **UI only.** A UI change never alters a route, copy, field, validation, API call, `testID` or accessibility label/role. The phone e2e suite (`npm run e2e:phone`) must pass with no test edits.
2. **Only `@/theme` and `@/ui`.** No raw hex, no `fontSize`/`fontWeight`, no shadows or radii typed by hand in a screen. If a value is missing, add a token to `theme.ts` (and a contrast pair to `theme.test.ts` if it is text).
3. **Never import design from `@tgs/design-tokens`** in the phone app. Allowed: `presentStatus`/`StatusEntity`/`Tone` (status wording shared with the console) and `brand` (society name and registration number).
4. **Lucide icons only**, stroke 1.75 (2.25 when active). No emoji as icons.

## Colour

- **Navy `color.accent` is the only accent**: primary buttons, links, focus, selection, progress, active tab.
- **Colour by 60 / 30 / 10 (D-139):** neutrals 60, navy 30, gold 10. **Gold `color.gold` is never text on a light surface** (2.26:1). Gold marks: hero ring and glow, hero labels (`tone="goldOnAccent"`, navy only), avatar ring, quick-action icons on navy tiles, the tab indicator, the current-stage halo. Readable gold on light is `color.goldText` (on `goldMuted` or white).
- **Glass hero (D-139):** a screen's top summary is `HeroCard` (or `heroSurface` on a pressable `Card` / result panel) with `glassTile` tiles on it. Never a flat `backgroundColor: color.accent` block.
- **Spacing:** `Screen` puts 24 px between blocks, fragments included. Menus are `Card padded={false}` + `ListRow`. List filters are `SegmentedControl hideLabel`; never three buttons side by side that truncate.
- Text: `primary`, `secondary` only (Astryx has no tertiary). On navy: `onAccent`, `onAccentMuted`.
- Status: `color.status.<info|success|warning|error|neutral|approval>.{solid,onSolid,text,tint,border}`. Text goes on `tint`, never on Astryx's own muted. Status colours carry meaning only; don't mix them with the accent for decoration.
- Cards separate by surface step (`background.body` → `background.surface`) plus a hairline `border`. Shadows (`shadow.low|med|high`, RN `boxShadow`) only for things that float: sticky footer, tab bar, raised hero, sheets.

## Type (Figtree, base 16)

`<Text type weight tone>`. Types: `display-1/2/3`, `h1` (page title 28), `h2` (23), `h3` (section 19), `h4` (card title 16/600), `large`, `body` (16), `label` (16/500), `supporting` (13: captions, hints, timestamps), `overline` (11 caps), `amount` (tabular). Emphasis by `weight` (`medium`, `semibold`), never by a new size.

## Spacing, shape

`spacing[0.5|1|1.5|2|3|4|5|6|7|8|10|12]` = 2…48 px (Astryx 4 px grid). Gutter 16, section gap 24.
`radius.inner 8` (inside cards) · `element 12` (buttons, fields) · `container 16` (cards, banners) · `page 28` (sheet tops) · `full`. Add `borderCurve: 'continuous'` to rounded views. Touch targets ≥ 48.

## Components (from `@/ui`)

`Button variant="primary|secondary|ghost|destructive" size icon iconEnd loading fullWidth` · `IconButton` (label required) · `Link` (inline text action; keeps the button role) · `Card` (pass `onPress` for a clickable card, `selected` for selectable) · `Banner status` · `Token status emphasis` · `StatusToken entity status` · `Section` · `MetadataListItem` · `Divider` · `TextField` · `DateField` · `SelectField` (opens `BottomSheet`) · `OtpInput` · `SelectableCard` · `YesNo` · `CheckboxInput` · `SegmentedControl` · `MonthPicker` · `NumberInput` · `Stepper` · `StageTracker` · `Screen` · `Header` · `PageHeader` · `EmptyState` · `Skeleton` (keeps `testID="skeleton"`) · `CountUp` · `tabBarOptions`/`tabIcon`/`tabBarListeners`.
Dense data = rows with dividers inside one card, not a card per row. `Token` for status; no badges except counts.

## Motion (Astryx tokens in `motion`)

- fast 130/175/230 ms (press, toggle, select) · medium 310/410/550 (entrance, sheet, fill) · exit 175 on the accelerating `ease.exit` · `ease.standard` = cubic-bezier(0.24, 1, 0.4, 1).
- **A finger means a spring** (`usePressScale`, `motion.spring`). Everything else is a timing on the native driver (opacity/transform only).
- Hooks: `useMotionMode()` → `'full' | 'fade' | 'none'`; `usePressScale(to)`, `useEnter(index)`, `useToggle(on)`, `useShake(error)`.
- **Reduce Motion → opacity-only, ≤ 200 ms. Expo web → no motion** (tests and axe must never see a half-faded screen).
- Animation never blocks the next tap; no perceptible delay on tab switches or list presses; exits leave the way they came; tabs never slide.
- `Screen` already staggers its blocks in (40 ms, 8 px rise); don't add your own entrance on top.

## Haptics (`haptic`)

`select` on a new choice (segmented, selector, checkbox, tab), `tap` on primary actions, `error` when a field error appears. Nothing on scroll, nothing on static banners.

## Before you finish

`cd apps/member-app && npx tsc --noEmit -p .` · `npx vitest run apps/member-app/src/theme.test.ts` · `npm run e2e:phone` (no test edits) · look at the screen at 360 and 412 px wide.
