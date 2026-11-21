# Phone app UX audit: glass hero, gold 60 / 30 / 10, spacing (D-139): built

**Built:** an audit of the owner's phone screenshots and a phone-size walk of 12 member screens, then fixes. A real-phone spacing bug fixed at its root; a CRED-like glass hero (navy gradient, gold glow and ring, frosted tiles) on every top summary; gold widened to the 10 % of a 60 / 30 / 10 split; clearer home and profile structure; a proper segmented track for list filters. No route, flow, API, field, validation or testID changed.

**Key files:** `apps/member-app/src/ui/Layout.tsx` (`Enter` keeps the 24 px gap), `src/ui/Surfaces.tsx` (`HeroCard`, `heroSurface`, `glassTile`, `ListRow`), `src/ui/Choice.tsx` (`SegmentedControl` track + `hideLabel`, month grid), `src/ui/Text.tsx` (`goldOnAccent`), `src/theme.ts` (`color.hero.*`), `src/theme.test.ts` (38 pairs), screens `(member)/home.tsx`, `profile/index.tsx`, `(member)/more.tsx`, `(member)/deposits.tsx`, `(member)/loans.tsx`, `(member)/payments.tsx`, `account/help.tsx`, `account/calculators.tsx`, `(applicant)/tracker.tsx`, `staff/(tabs)/home.tsx`, `components/staff.tsx` (`Row` = the kit's `ListRow`). Rules: `docs/25` §12, skill `tgs-mobile-ui`.

**API:** none. **Domain:** none.

**Decisions:** D-139.

**Things to know before touching this:**
- Expo web runs with no motion, so the entrance wrapper (and its old missing gap) only exists on a phone. Check spacing on Expo Go, not only on the web preview.
- Gradients use React Native 0.88's `backgroundImage` (linear and radial); no `expo-linear-gradient` or `expo-blur`.
- `tone="gold"` is the dark readable gold for light surfaces; `tone="goldOnAccent"` is the bright seal gold for navy only.
- The grey floating gear in Expo Go screenshots is Expo Go's own developer button.

**Verified:** typecheck clean; `theme.test.ts` 38 / 38; phone e2e on the mock API 95 passed, 18 failed, all staff tests and all the known baseline (8 journeys that fail the same at HEAD, 10 staff states needing `/me/signature`, which the mock API lacks); every member journey, state and axe check passed. Screens checked at 412 × 915.

**Gaps / TODO:** the real-phone check (glass and `boxShadow` on Android, the gap fix in motion). Phone e2e on the real backend (needs `backend/.env`).

**Next:** owner tries it in Expo Go on a phone.
