# Phone app on Astryx in the seal's navy and gold (D-138): built

**Built:** the whole phone app (member, joining and staff screens) restyled on the Astryx design system (astryx.atmeta.com) with the seal's colours: navy `#003471` as the one accent, gold `#D4A547` as a highlight. Figtree at Astryx's scale with base 16, Astryx spacing / radius / motion tokens. Micro-interactions on React Native's built-in Animated (native driver) and `expo-haptics`: press springs, staggered screen entrance, springing bottom sheet, field error shake, OTP digit pop, selection cross-fades, tab-icon bump with a gold indicator, gold halo on the current stage, seal intro on the entry screens, a one-time balance count-up on the home heroes. No flow, copy, route, field, validation, API call, testID or accessibility label changed. The Admin Console and `packages/design-tokens` are untouched.

**Key files:** `apps/member-app/src/theme.ts` (all tokens; no React Native import), `src/theme.test.ts` (32 contrast pairs), `src/ui/motion.ts` (`useMotionMode`, `usePressScale`, `useEnter`, `useToggle`, `useShake`, `haptic`, `ease`), `src/ui/{Text,Button,Token,Surfaces,Fields,Choice,Progress,Layout,TabBar,CountUp,index}.tsx`, `src/components/AppMark.tsx` (`intro`), `src/components/LaunchPoster.tsx`, `src/app/_layout.tsx` (Figtree, `ios_from_right`), `src/app/(member)/_layout.tsx`, `src/app/staff/(tabs)/_layout.tsx`, `src/app/(member)/home.tsx`, `src/app/staff/(tabs)/home.tsx`, `src/app/welcome.tsx`. Skill: `.claude/skills/tgs-mobile-ui/SKILL.md`. Plan and rules: `docs/25-mobile-design-system.md`. Root `vitest.config.ts` now includes `theme.test.ts`.

**API:** none. **Domain:** none.

**Decisions:** D-138.

**Things to know before touching this:**
- Screens import only from `@/theme` and `@/ui`. The kit names are Astryx's: `Button variant`, `IconButton`, `Link`, `Banner status`, `Token status emphasis`, `StatusToken`, `MetadataListItem`, `SelectableCard`, `CheckboxInput`, `SegmentedControl`, `NumberInput`, `Stepper`, `PageHeader`, `BottomSheet`, `CountUp`. Text is `<Text type weight tone>`.
- The move was done by a codemod (renames only). A string-literal diff of all 102 changed screen files against HEAD showed no changed copy, label or testID.
- `StatTile` (staff) keeps the server's tone words (`'danger'`): they come from dashboard data, not from the kit.
- Expo web has no motion on purpose (`useMotionMode() === 'none'`), so e2e and axe never see a half-faded screen. To feel the animations use Expo Go or a dev build.
- Adding `expo-haptics` (native code) means the next APK / iOS build must be fresh; Expo Go already includes it.
- Gold is never text on white (2.26:1). `theme.test.ts` fails if a text colour pair drops under 4.5:1.

**Verified:** see the 2026-11-20 D-138 line in `BUILD-CHECKLIST.md`.

**Gaps / TODO:** U6, the real-phone check (springs, haptics, Figtree rendering, Android `boxShadow`, Figtree tabular figures in amounts). Dark mode later (every screen builds its styles once at load). Phase W (console on the same tokens) only when the owner asks.

**Next:** owner tries the app on a phone; then "update the web apps" starts phase W (`docs/25` §10).
