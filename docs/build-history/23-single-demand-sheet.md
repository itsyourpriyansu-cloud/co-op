# One demand sheet for all departments in single-DDO mode (D-147): built

**Built:** when the Super Admin's DDO setup is **One DDO for all departments** (D-145), Generate makes **one** demand sheet for the month instead of one per department. The Accountant still works with it department by department. With **A DDO for each department**, nothing changes: one sheet per department, as before.

What single mode does:
- **Generate (ST-41, console and phone):** the preview still lists every department with its members, heads and total. There are no department checkboxes; the button reads "Generate one sheet for all departments". The sheet is `ds-<cycle>-all` with `departmentId = 'ALL'`, holding every department that has no sheet of its own for the month.
- **Index (ST-40):** one row per department, showing that department's members, demand, recovered and short. Every row opens the one sheet ("on the one sheet for all departments"). Totals add up to the sheet; "Waiting on you" counts the sheet once.
- **Sheet (ST-42) and print:** the title is "All departments · <month>", addressed to the one DDO ("DDO for all departments"). Members are listed department by department; each department has a heading (members, the office's printed DDO name and designation) and a subtotal row, then the grand total. The CSV adds a Department column and subtotal lines. The phone screen has a "By department" card and the department on each member; the phone PDF prints the same grouping.
- **Steps:** certify, send to the one DDO (one notice), deduction entry by that DDO or from paper, post. One ledger entry for the sheet ("Salary recovery <month>, All departments"), one receipt per member as before.
- **Supplements:** "Add missing members" on the all-departments sheet makes an all-departments supplement.
- **Reports:** the collection-rate report splits the sheet into a row per department. Department-wise less collections and the member history use each line's own department.
- **Switching modes mid-month:** a department counts as generated when it has its own month sheet or the month has the all-departments sheet. So nothing is demanded twice in either direction; departments that already had their own sheet keep it.

**Also fixed (found while testing):** posting a sheet re-saved every loan, deposit and share touched so far after each member, so the time grew with the square of the sheet size (553 members: about 5 minutes). Posting now saves them once at the end, in the same transaction: about 8 s.

**Key files:**
- `packages/types`: `ALL_DEPARTMENTS`, `DemandLine.departmentId`, `DemandLineView.departmentId`, `DemandSheetDetail.byDepartment` (`DemandDepartmentPart`), `DemandSheetRow.allDepartments`, `DemandPreview.singleSheet`
- `backend/src/models/collections.model.ts` and migration `0040_d147_single_demand_sheet.sql` (drops the department key on `demand_sheets`, adds `demand_lines.department_id`)
- `backend/src/db/seed/collections.seed.ts` (truncates `demand_sheets` itself, since the departments truncate no longer reaches it)
- `backend/src/modules/collections/collections.service.ts` (`covered`, `allDepartmentLines`, `allDepartments`, overview / preview / generate / wantedLines / detail / send / post), `collections.repository.ts`
- `backend/src/modules/insight`, `loans/loan-workflow.service.ts` (first deduction month), `reports`
- Console: `GenerateDemandPage`, `DemandSheetsPage`, `DemandSheetPage`, `RecoveryPage`
- Phone: `staff/demand/generate.tsx`, `staff/(tabs)/demand.tsx`, `staff/demand/[id]/index.tsx`, `staff/demand/[id]/recovery.tsx`, `lib/staffDocuments.ts`

**Also fixed:** the D-145 DDO setup (console and phone) pre-selects the first DDO login even when the users list arrives after the Admin chose "One DDO for all departments" (the D-145 e2e test failed on this race).

**Decisions:** D-147. Rules: BR-009, BR-056.

**Verified:**
- Typecheck clean: backend, console, phone app, mock API, domain.
- E2E (`tests/e2e/scenarios-backend.spec.ts`, "one demand sheet for all departments (D-147)"): console Generate in single mode (no department choice, one button), index rows per department opening the one sheet, the sheet titled All departments with a subtotal per department, certify, send to the one DDO, import statement and post; the phone staff list and sheet with "By department". With J-10, S6, D-142, D-145 and supplementary journeys: 14 / 14. Phone screens looked at at 360 and 412 px.
- Backend: new `single-sheet.test.ts` (generate one sheet even when departments are picked, per-department index rows adding up to the sheet, the one DDO opens it, certify → send → post with subtotals adding up, switching back makes nothing twice). Collections, reports, insight, loans, masters, members and demo suites: 20 files, 90 / 90, run on a separate local test database (`tgseccsl_test_d147`).

**Gaps / TODO:**
- The mock API (prototype demo) still makes one sheet per department in either mode.
- If the Admin switches back to a DDO per department while an all-departments sheet is still open, that sheet has no DDO in charge: the Accountant finishes it from the paper sheet.
