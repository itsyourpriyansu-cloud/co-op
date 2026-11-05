# 12 · App mark (TG monogram), icon, splash and entry screens

**Built (2026-11-05, D-094).** A minimal letters-only app mark: the T's crossbar flows into the G (variant B "Ligature", picked by the user from three). It is on the launcher icon, Android adaptive + themed icon, splash (white TG on `#0561E2`), member MJ-01 Welcome, MA-01 Sign in, MB Home header, console login (AU-01) and sidebar, and every favicon. The seal stays on prints.

**Key files.** `assets/brand/tgseccsl-mark.svg`, `assets/brand/tgseccsl-mark-tile.svg` (masters) · `apps/member-app/src/components/AppMark.tsx` (SvgXml, inline copy of the tile) · `apps/admin-console/src/components/AppMark.tsx` + `src/assets/app-mark.svg` · `apps/member-app/app.json` (splash + adaptive icon colours) · PNGs in `apps/member-app/assets/` and `apps/admin-console/public/`.

**How the PNGs were made.** A one-off Node script with `@resvg/resvg-js` (outside the repo) rendered every size from the master geometry. To change the mark: edit both master SVGs, the `TILE` string in the member `AppMark.tsx`, copy the tile to the console asset, and re-render.

**Verified.** Typecheck green; console login, sidebar and favicon checked in the browser; member Welcome / Sign in / Home on Expo web; e2e suite (see session log).

**Gaps.** The native splash and adaptive icon have not been checked on a device (no APK until asked, D-054). The member app's auth-loading spinner (`src/app/index.tsx`) still shows on white for a moment after the blue splash. open-design is installed at `C:\Users\priyansu\tools\open-design` but did not produce this mark.
