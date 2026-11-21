# Console fields, label–value rows, steppers and sign-in panel (D-144): built

**Built:** the phone fixes of D-143 in the Admin Console, plus a new sign-in panel. (1) A Show / Hide eye on every password field. (2) The authenticator code as six equal, clearly outlined boxes (Blend `OTPInputV2`): typing moves on, Backspace goes back, a paste fills them all. (3) Long values break inside their column; side-by-side rows in narrow panels put the value under its label when it does not fit; amounts never split and always keep a gap from their label. (4) Progress steppers give every stage an equal share and wrap long titles. (5) The sign-in screen's left panel is light and colourful in the console palette (brand blue wash, blue / purple / green / amber glows, four coloured feature tiles) instead of a dark slab. The console stays on Blend.

**Key files:**
- `apps/admin-console/src/components/PasswordInput.tsx` (new)
- `apps/admin-console/src/pages/LoginPage.tsx` (password fields, `CodeInput`, sign-in panel, `Feature`)
- `apps/admin-console/src/index.css` (`dd` wrapping, OTP box edges, stepper, dark sign-in panel)
- Rows: `loans/LoanActionDrawer.tsx`, `LoanDetailPage.tsx`, `LoanClosurePanel.tsx`, `SuretyRecoveryPanel.tsx`, `deposits/DepositDetailPage.tsx`, `collections/NewReceiptPage.tsx`, `RecoveryPage.tsx`, `DemandSheetPage.tsx`, `AccountsPage.tsx`, the two dashboards, `NotificationsPage.tsx`, `ReportViewerPage.tsx`
- Tests: `tests/e2e/states-console.spec.ts` ("sign-in fields · console", runs on the mock by stubbing the sign-in replies), `tests/e2e/auth-backend.spec.ts` (types the code into the six boxes)

**API:** none. **Domain:** none.

**Decisions:** D-144 (follows D-143).

**Things to know before touching this:**
- Blend's `OTPInputV2` keeps its own box state and reports the joined digits. Clearing a middle box does not shift the others.
- The OTP edge rule targets `input[data-element^='otp-input-']` and leaves focus and error to Blend.
- The stepper rule targets `[data-stepper='stepper'] > [data-element='stepper-status']`. If Blend renames these, long stage names will run together again.
- A side-by-side row that should stack when long is `flex flex-wrap justify-between` with no `text-right` on the value: it sits on the right when it fits and drops under the label, left-aligned, when it does not.
- The console theme comes from its own toggle (`data-theme`), so the sign-in panel's dark rule only applies after that toggle.

**Verified:**
- Console typecheck clean.
- New sign-in field tests pass on the mock: eye toggles, six equal boxes, outlined edges, focus moves, paste fills, button enables.
- A sweep of all 38 console pages at 1280 found no touching label / value pairs. Steppers were the only collision and are fixed. The remaining ellipses are intentional in list cards.
- Screenshots checked: sign-in (1440, 1024), code step, joining, loan and demand-sheet steppers.

**Gaps / TODO:** `auth-backend.spec.ts` (real backend) needs `backend/.env`.

**Next:** owner runs the backend e2e.
