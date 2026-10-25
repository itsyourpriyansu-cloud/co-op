# 09 · M9 Dashboards, notifications & reports (ST-01, ST-03, ST-50…52) — done

## Built (console)
- **ST-01 Dashboard, five variants** (`GET /dashboard/role`, built from the same Work Queue so counts always agree; the header "N waiting on you" uses it too):
  - **Super Admin**: unchanged M0 dashboard (KPIs, needs attention, collections trend, pipeline, short collections, retirements).
  - **Accountant**: waiting on you · demand sheets generated this cycle · reported payments · applications this month; queue (oldest first); by stage with oldest days; demand sheet status for the cycle; latest applications.
  - **Secretary / President** ("signer"): awaiting your signature (loans, FDs, memberships) · amount awaiting · signed this month · oldest waiting; signed recently.
  - **Cashier**: awaiting disbursement · disbursed this month · counter receipts today · payments to verify; latest disbursements.
  - **DDO**: pending validations · members in the department · this cycle's demand (sheet status) · last cycle recovered %; the department's 6-cycle recovery bars.
  - Every tile and stage links to the filtered list (`/queue?tab=…`, `/payments?tab=REPORTED`, `/demand-sheets?cycle=…`). The Work Queue now reads `?tab=`.
- **ST-03 Notifications** `/notifications` (topbar bell with a red count = unread + open member questions):
  - **For me**: the staff user's in-app notifications (seeded per persona), unread tint, deep link, Mark all read.
  - **Member questions** (Accountant / Super Admin, `support.reply`): ticket list (open first) + conversation; reply → the member gets "Reply from the society office" on the phone (MB-12, links to Help); Close question.
  - **Sent messages** (`messages.send`): outbox with channel, audience, recipients, "Delivered (simulated)".
  - **Send a message** drawer: channel SMS / WhatsApp / Email (chips, not dropdowns, inside drawers), audience all defaulters / a department / retiring within 3–12 months / one member, template start (ST-63: dues reminder, defaulter notice, FD maturing, short recovery), placeholders, SMS 480-char counter, Preview (recipient count + 3 filled samples) → Send.
- **ST-50 Reports** `/reports`: cards grouped Collections · Loans · Deposits & Shares · Members · Cash & Accounts; 8 live reports + defaulter notice; P2 ledgers and the accounting statements are shown locked with the reason; a "Printable forms & letters" section lists all nine printables and where each is printed from.
- **ST-51 Report viewer** `/reports/:id`: filters in the URL (month, department, loan type, short-in-a-row, retiring within, from–to dates, member search), grouped table with subtotal rows and a grand total, zero amounts muted, first column links to the member / loan / FD, **Download CSV** (rupees, with title, filters and subtotals) and **Print / PDF** (letterhead appears only in print). States: loading, choose a member, no results + clear filters, validation notice (bad date range), error.
  - Reports: Dues list, Defaulters list, Department-wise unpaid, Department-wise less collections (members short, by department), Maturity (by month), Member-wise ledger (cycle × head, running unpaid), Loans ledger (by product), Retirement (loans outstanding, sureties given).
- **ST-52 printables** `/reports/print/*` (picker when no record is given):
  - `defaulter-notice?member=` (defaulters listed first): ref no., address, overdue months table, amount in words, how to pay, Secretary signature, Q-310 placeholder note.
  - `membership?application=|member=` (F1), `loan-form?loan=` (F2 for Ordinary / Education with sureties items 9–10 and DDO certificate; F3 for Salary with office-use block), `fd-form?deposit=` (F4 with the 4 rules and the denomination cash slip; link to the FDR), `agreement?member=&version=A|B` (F5 / F6 with AGREED countersign).
  - Print buttons added: Joining detail → Print form, Loan detail → Print form, Member profile → mandate panel → Print F5 / F6 / F1.

## Key files
- API `apps/mock-api/src/reports.ts` (REPORTS registry + `runReport` builders + `reportOptions`), `apps/mock-api/src/insight.ts` (`roleDashboard`, composer `previewOf`, `defaulterNotice`, routes), `insight.test.ts` (8 tests incl. reconciliation). `workQueue` is now exported from `loan-workflow.ts`. Store gains `messageLog`.
- Permissions `messages.send`, `support.reply` (Super Admin, Accountant) in `packages/types/src/roles.ts`, `apps/mock-api/src/permissions.ts`, ST-61 labels in `settings.ts`.
- Types: `RoleDashboard`, `ReportDef/Column/Result/Options`, `StaffNotifications`, `ComposeInput/Preview`, `OutboxMessage`, `StaffTicketRow`, `DefaulterNotice`.
- Client: `api.dashboard.role`, `api.reports.*`, `api.notifications.*`.
- Console: `pages/dashboard/RoleDashboardView.tsx`, `pages/notifications/NotificationsPage.tsx`, `pages/reports/{ReportsPage,ReportViewerPage,PrintForms}.tsx`, `components/Chips.tsx` (shared radio chips), topbar bell in `app/shell/ConsoleTopbar.tsx`, routes in `app/router.tsx`.
- Seed v12 (`packages/mock-data`): six chronic defaulters (1030, 1062, 1202, 1447, 1569, 1595 short Jul–Sep 2026), staff notifications per persona, templates `defaulter.notice` and `dues.reminder`.

## Decisions
**D-063** (five variants from the Work Queue; unpaid = demand − allocated; defaulter = N cycles in a row with the same allocation; CSV + browser print; accounting/P2 reports locked; DDO has no reports; Super Admin + Accountant send messages and answer questions; simulated delivery with in-app copy; Email skips members without an email; printable twins and the pay-profile fallback; seed v12). BR-034 in docs/09, API in docs/11 §10, seed in docs/13 §7, permissions in docs/03. Q-310 / Q-405 marked as placeholders built.

## Verified
- `npx vitest run` 257 tests · typecheck green · domain coverage 100% · console production build OK.
- **J-13 passed** (API tests): dues total = Σ memberDues arrears; department unpaid = that cycle's sheets; less-collections short = unpaid; loans-ledger outstanding = dashboard loans outstanding; maturity principal = active FDs in range; Mahesh's ledger running unpaid = his arrears; every dashboard variant's stage counts = its Work Queue.
- **Live headless** (console :5180 + phone :8090 + API :4000): five dashboards, catalogue, all 8 reports, CSV download (`dues-2026-10-24.csv`), locked report, defaulter notice for 1447, F1 / F2 / F3 / F4 / F6 twins, composer → 6 defaulters → sent → outbox, reply to Lakshmi's question → visible in her phone notifications. No page errors. Demo data reset afterwards.

## Gaps / TODO
- PDF is the browser's print-to-PDF; no server-side PDF/Excel files (Q-405).
- Dashboards use progress bars, not Recharts charts.
- The topbar search is still disabled (it predates M3; a candidate for M10).
- Disbursed-this-month is ₹0 on the demo date because the seed has no October disbursements; it fills when the cashier disburses.

## Next
M10 Polish & demo: states / a11y pass over every screen, visual check of the M3–M5 screens, topbar search, demo script. APK only when the user asks.
