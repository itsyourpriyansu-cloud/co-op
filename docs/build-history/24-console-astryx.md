# Console on the phone's design system, dark navy rail (D-150): built

**Built:** the Admin Console now wears the phone's look (D-138, `docs/25`): the seal's navy as the one accent, gold as the highlight, Figtree, Astryx neutrals and status colours, 12 / 16 px corners, and cards without shadows. The left navigation is a dark navy rail with a gold glow and a gold marker on the current page. The dashboards' top figures sit on a glass navy hero, as on the phone home. The sign-in panel stays light, with navy tiles and gold icons. Blend components are still used and follow the navy scale. No route, API, field, copy or test hook changed.

**Key files:**
- `packages/design-tokens/src/brand.ts` (navy `primaryScale`, `gold`, `hero`, Figtree), `semantic.ts` (Astryx colours, light and dark), `layout.ts` (radius, elevation, motion), `scripts/build-css.ts` (gold, hero and `brand-solid` outputs), `src/foundation.test.ts` (contrast test)
- `apps/admin-console/src/main.tsx` (Figtree), `src/index.css` (navy rail, `.tgs-hero`, `.tgs-glass`), `src/components/Hero.tsx` (new: `HeroCard`, `GlassStat`)
- `src/pages/DashboardPage.tsx`, `src/pages/dashboard/RoleDashboardView.tsx` (hero), `src/pages/LoginPage.tsx` (tiles, glows)
- Skill `tgs-mobile-ui` (both copies): new "Admin Console" section

**API:** none. **Domain:** none.

**Decisions:** D-150 (supersedes "console keeps Blend's look", D-138).

**Things to know before touching this:**
- Colours change only in `packages/design-tokens`, then `npm run tokens`. The contrast test fails if a text pair drops below 4.5:1 in either theme.
- Blend fills primary buttons from step 500 of `primaryScale`, so the seal navy sits there.
- The rail is styled from `index.css` through Blend's data attributes (`nav[data-sidebar]`, `data-element='sidebar-sub-section'`, `data-status='selected'`). Inside it, the text roles are redefined to on-navy values, so anything placed there adapts.
- `.tgs-hero` and `.tgs-glass` are unlayered CSS and win over Tailwind utilities; put hover and colour rules for them in `index.css`.
- Blend's own tags, alerts and progress bars still use Blend's status palettes (same meanings, slightly different shades).
- Inter (`@fontsource-variable/inter`) was removed; Figtree comes from `@fontsource-variable/figtree`.

**Verified:** token tests 16/16 (WCAG AA pairs in both themes, dark Blend scale), console typecheck clean, axe 71/71 on every console route in light and dark, dark dashboard and loans looked at 1440 px. Run Vitest from `C:\…` (upper-case drive): from `c:\…` Windows loads two copies of Vitest and every suite fails with "failed to find the runner".

**Gaps / TODO:** real-browser check by the owner; Blend status palettes not re-mapped.
