# Clean prints, the seal on phone paperwork, phone PDF download, wizard content (D-140, D-141): built

**Built:** (1) Every console print page prints the document alone (no sidebar, topbar or portals) across as many A4 pages as it needs, with no browser header or footer lines. (2) Every phone document (receipt, FDR, sanction letter, schedule, staff office copies) carries the society seal in its letterhead. (3) Phone "Download PDF" no longer fails in Expo Go with `Missing 'READ' permission`. (4) Every member wizard step (loan, FD, joining) opens with progress, the step title and one plain line on what the step is for. The loan form shows "Your instalment" before the bank account, and the applicant tracker's status chip sits under the title. No route, flow, API, field, validation or testID changed.

**Key files:** `apps/admin-console/src/index.css` (one `@media print` block), `apps/member-app/src/lib/sealImage.ts` (192 px seal as a data URI), `src/lib/documents.ts` (`page()` letterhead), `src/components/DocumentActions.tsx` (base64 → `Paths.cache`), `src/ui/Progress.tsx` (`StepHeader`), `src/app/loan/apply.tsx`, `src/app/deposit/open.tsx`, `src/app/(applicant)/apply.tsx`, `src/lib/joining.ts` (step intros), `src/app/(applicant)/tracker.tsx`, `tests/e2e/screens.spec.ts` (print test). Rules: `docs/25` §13, skill `tgs-mobile-ui`.

**API:** none. **Domain:** none.

**Decisions:** D-140, D-141.

**Things to know before touching this:**
- The print CSS reaches Blend's SidebarV2 by structure (`nav[data-sidebar]`, `main[role=main]`, `[data-main-content]`). If Blend changes that markup, the print test in `screens.spec.ts` fails first.
- expo-print renders plain HTML and cannot load bundled assets, so any image in a phone document must be a data URI.
- In Expo Go, expo-print's output folder is not readable by expo-file-system. Take `base64: true` and write the file yourself.

**Verified:** typecheck clean; vitest all passing; the console print test (11 print routes: sidebar hidden, nothing clipped, seal loaded) passes; phone documents checked visually with the seal; every phone screen walked at 412 × 915 (no cut-off text, no sideways scroll, no small targets).

**Gaps / TODO:** on a real phone: Download PDF and Print, and the seal in the shared PDF. Phone e2e on the real backend (needs `backend/.env`).

**Next:** owner tries Download PDF and Print in Expo Go on a phone.
