# 12 · Design Direction & Design System

> Version 0.3 · 2026-10-24 · Status: **Proposed (D-034)**. Tokens live in `packages/design-tokens` → Tailwind preset (web) + NativeWind preset (app).
> Research basis: platform guidelines (Material 3, WCAG 2.2), Google's HEART metrics framework, and fintech/banking UX practice. Sources are listed in §10. Points marked *(practice)* come from industry articles, not standards.

---

## 1. Design direction: "Calm institutional fintech"

| Attribute | What it means here | Why |
|---|---|---|
| **Trustworthy** | Quiet colours, no gimmicks, the society's name and Regd. No. visible, every money action confirmed with a receipt | Members hand over salary-deduction authority. The UI must feel as solid as a bank |
| **Clear** | One primary action per screen, plain-language labels ("Money you'll receive" not "Net disbursable") on the member side | Many members are first-time app users for financial tasks |
| **Efficient** | Dense, keyboard-friendly tables for staff. Pre-filled forms everywhere | Staff process hundreds of rows a month. Paper re-entry is the main pain (doc 16) |
| **Familiar** | Mirrors the paper forms' order and wording, so office staff recognise them | Lowers training cost. The agreement includes training |
| **Modern** | Generous whitespace, 8–12 px radius, soft elevation, subtle motion, illustrations instead of stock photos | Feels current without chasing trends |

**Not this:** glassmorphism, neon gradients, crypto-style dark UIs, playful mascots, stock photos of smiling strangers.

## 2. Layout

### 2.1 Admin Console (desktop, ≥1280 px, usable at 1024)

```
┌────────────┬───────────────────────────────────────────────────────────────┐
│ ◉ TGSECCSL │  🔍 Search members, loans, General No…  (Ctrl+K)    🔔  👤 ▾ │ ← top bar 56px
│            ├───────────────────────────────────────────────────────────────┤
│ ▣ Dashboard│  Loans › LN-2026-00123                                        │ ← breadcrumb
│ ✉ Queue  12│  Ordinary Loan · Lakshmi Devi        [Awaiting Secretary] [⋯] │ ← page header + status + primary action
│ 👥 Members │  ●──●──●──●──◐──○──○  stage stepper                           │
│ ⊕ Joining 5│  ┌──────────── main 8 cols ───────────┐ ┌── side 4 cols ────┐ │
│ ₹ Loans    │  │ Tabs: Overview · Sureties · Office │ │ Member snapshot   │ │
│ 🏦 Deposits │  │ use · Schedule · Documents · Log   │ │ Eligibility ✓✓⚠   │ │
│ ⇅ Collect. │  │                                     │ │ Activity timeline │ │
│ 📊 Reports  │  └─────────────────────────────────────┘ └───────────────────┘ │
│ ⚙ Settings │                                    ┌─ Action drawer 480px ──┐│ ← stage panels slide in
│ «collapse  │                                    │ Sanction (Secretary)   ││
└────────────┴────────────────────────────────────┴────────────────────────┘
  sidebar 248px / 72px collapsed
```
- **Navigation:** left sidebar grouped by job (*Work*: Dashboard, Queue · *Records*: Members, Joining, Loans, Deposits · *Money*: Collections · *Insight*: Reports · *Admin*: Settings), with count badges on the Queue and Joining items. The global **command palette (Ctrl+K)** finds members by name, General No., mobile, or loan/FDR number.
- **List → Detail → Drawer:** lists open details. Decisions (certify, sanction, disburse, accept) happen in a right **drawer**, so the record stays visible behind it. This is the decision-in-context pattern.
- **Tables** *(practice)*: the most important column on the left (name + General No.), right-aligned tabular numbers, sticky header, bulk actions, saved filters, density toggle (comfortable 52 px / compact 40 px rows), totals row on money tables.
- **Dashboard:** one KPI row (4 tiles) → "Needs your action" list → charts. The role decides the content (doc 04 §5).
- **Grid:** 12 columns, 24 px gutters, content max-width 1440 px.

### 2.2 Member App (Android)

```
┌──────────────────────────────┐
│ Good morning, Lakshmi    🔔 │
│ General No. 4512             │
│ ┌──────────────────────────┐ │
│ │  My Society Snapshot     │ │ ← hero card (brand teal)
│ │  Share capital ₹12,000   │ │
│ │  Deposits    ₹1,85,000   │ │
│ │  Loan due    ₹48,200     │ │
│ └──────────────────────────┘ │
│ ⚠ 1 surety request waiting  →│ ← pending-action card (only when present)
│ ┌────┐┌────┐┌────┐┌────┐     │
│ │Loan││ FD ││Calc││Stmt│     │ ← quick actions (4)
│ └────┘└────┘└────┘└────┘     │
│ This month's deduction ₹6,450│
│ Next EMI 31 Oct · Ordinary   │
├──────────────────────────────┤
│ 🏠Home ₹Loans 🏦Deposits ⇅Pay ☰More │ ← bottom bar: 5 destinations
└──────────────────────────────┘
```
- **Bottom navigation bar with 5 equal destinations:** Home · Loans · Deposits · Payments · More. Material 3 recommends 3–5 destinations of equal importance, so we use the maximum and push low-frequency items (profile, surety history, calculators, help, settings) into *More*. Common actions should be at most 1–2 taps away *(practice)*: Apply loan, Open FD and Surety requests are reachable from Home.
- **Applicant mode** (before membership) shows **no bottom bar**, only the application and its stage tracker. The full app unlocks when the General No. is allotted.
- **Forms:** one topic per step, a progress indicator, a sticky bottom CTA, **save and resume later**, key terms shown up front rather than hidden behind a link *(practice: progressive onboarding and resume-later raise activation)*.
- **Money detail:** stacked rows with expandable breakdowns instead of tables.

## 3. Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `primary` | #0F5E6E deep teal | #5FB4C4 | Primary actions, active nav, member hero card |
| `primary-subtle` | #E6F2F4 | #12333A | Selected rows, info backgrounds |
| `accent` | #C8902E muted gold | #E2B35C | Highlights: savings/deposits, success moments (sparingly) |
| `bg` | #F7F8FA | #0E1215 | App background |
| `surface` | #FFFFFF | #161B1F | Cards, tables, sheets |
| `border` | #E3E6EA | #2A3137 | Dividers |
| `text` / `text-muted` | #14181C / #5B6670 | #E8ECEF / #9AA5AE | |
| `success` | #1E7F4F | #4CC28A | Paid, active, check passed |
| `warning` | #B7791F | #E3B04B | Returned, short recovery, surety retiring |
| `danger` | #B42318 | #F07068 | Rejected, defaulter, failed check |
| `info` | #2563A8 | #6BA3E0 | In-process stages |

Rationale: teal signals stability and finance without copying the red/blue of government portals, and gold nods to savings and dividends. **All placeholders until the society shares its brand (Q-008).** Every text pair must have ≥ 4.5:1 contrast. Colour is never the only signal: chips always carry text and an icon.
Dark mode: Admin Console supports it (long working sessions). The app starts light-only for the MVP [P].

## 4. Typography

| Use | Web | App |
|---|---|---|
| Family | **Inter** (variable) | Inter (bundled via expo-font) |
| Numbers | `font-variant-numeric: tabular-nums` everywhere money appears | `fontVariant: ['tabular-nums']` |
| Scale | 12 · 14 (body) · 16 · 18 · 20 · 24 · 30 | 13 · 16 (body) · 18 · 20 · 24 · 30 sp |
| Weights | 400 body, 500 labels, 600 headings/amounts | same |
| Telugu (if Q-008 = yes) | Noto Sans Telugu as a fallback in the font stack | same |

## 5. Iconography: Lucide on both platforms

- **Library:** Lucide (`lucide-react` for the web, the default in shadcn/ui; `lucide-react-native` for the app). It is the **same icon set on both platforms**, so one mental model.
- **Style:** outline, stroke 1.75, sizes 16 (inline), 20 (nav/buttons), 24 (app tabs, empty states). Filled/tinted backgrounds only for the active tab state.
- **Rules:** always pair nav icons with text labels. Never use an icon alone for money actions.

| Concept | Lucide icon [verify names on lucide.dev at build time] |
|---|---|
| Dashboard | `layout-dashboard` |
| Work Queue | `inbox` |
| Members | `users` |
| Joining / membership applications | `user-plus` |
| Loans | `hand-coins` |
| Deposits / FD | `piggy-bank` |
| Collections / demand sheets | `file-spreadsheet` |
| Payments / receipts | `receipt-indian-rupee` |
| Reports | `chart-column` |
| Settings | `settings` |
| Surety | `handshake` |
| DDO certify | `stamp` |
| Sanction / approve | `badge-check` |
| Disburse | `banknote` |
| Transfer | `arrow-left-right` |
| Retirement | `calendar-clock` |
| Documents | `file-text` |
| Calculator | `calculator` |
| Notifications | `bell` |
| Help | `life-buoy` |
| Sign with OTP | `pen-line` + `shield-check` |

## 6. Imagery

| Type | Use | Guidance |
|---|---|---|
| **Spot illustrations** (flat, 2-tone: teal + gold on neutral) | Empty states, onboarding, success screens (application submitted, General No. allotted, loan disbursed), MA-04 offline | One consistent set, recoloured to the tokens. Source from an open-licensed set that allows recolouring, or commission it (verify the licence) |
| **Data as imagery** | Dashboards, the member snapshot card, allocation waterfall | Charts follow `dataviz` rules: muted series, one highlight colour |
| **Society identity** | Login/splash, letterhead, FDR, prints | Society logo (Q-008) + name + Regd. No. P-929 |
| **Document thumbnails** | Member documents, uploaded proofs | Real file previews, not generic icons |
| **Avoid** | Stock photos of people, the Secretariat building photo (rights unclear), 3D clip-art | Feels inauthentic in a members-only institution |

## 7. Components

**Admin Console (≈ 50):** StaffShell, Sidebar, TopBar, CommandPalette, PageHeader, Breadcrumbs, Tabs, SectionCard, Drawer, Dialog, Stepper, DataTable (sort, filter, paginate, bulk, density, totals, saved views), KpiTile, StatusChip, StageStepper, Timeline, MoneyText, AmountInWords, DescriptionList, EmptyState, ErrorState, Skeleton, ChartCard, form fields (Text, Money, Number, Date, Select, Combobox/MemberPicker, FileUpload, CheckList, RadioCards), DenominationCounter, **domain composites:** MemberSnapshotCard, EligibilityPanel, SuretyParticularsCard (auto-filled F2 columns), OfficeUsePanel (F3 back), SanctionSheet, SignOffBlock (Secretary → President), CertifyChecklist (DDO), ScheduleTable, SettlementPanel, ShareNettingPanel, AllocationBreakdown, DemandGrid, ReceiptView, FdrView, PrintLayout (letterhead), PersonaSwitcher, DemoBadge.

**Member App (≈ 35):** TabBar, ScreenHeader, HeroSnapshotCard, QuickActionGrid, PendingActionCard, Card, ListItem, SectionList, BottomSheet, StickyCTA, WizardProgress, StageTracker (joining + loans), MoneyText, AmountInWords, StatusChip, Timeline, TextField, MoneyInput, NumberStepper, DatePicker, SelectSheet, MemberPicker, OTPInput, **SignWithOtpSheet**, DocumentUploader (camera + file), DocumentRow, EligibilityPanel (compact), SuretyRequestCard, ScheduleList, AllocationBreakdown, CalculatorCard, FdrCard, Toast, Skeleton, EmptyState, OfflineScreen.

## 8. Interaction & accessibility standards

| Standard | Admin Console | Member App |
|---|---|---|
| Accessibility level | **WCAG 2.2 AA** | WCAG 2.2 AA principles + Android accessibility |
| Target size | ≥ 24×24 CSS px (WCAG 2.2 SC 2.5.8). We use 32 px for buttons and 40 px rows | **≥ 48×48 dp** (Android guidance) |
| Keyboard | Fully keyboard-operable, visible focus, Ctrl+K, `J/K` row navigation [P] | — |
| Screen reader | Labelled controls, `aria-live` for eligibility and toasts | `accessibilityLabel`/`Role`, TalkBack pass on key journeys |
| Text scaling | Browser zoom 200% without loss | System font scale up to 130% |
| Motion | 150–200 ms ease-out. Respects reduced motion | Same, using the native driver |
| Feedback | Toast 4 s for success. Persistent banners for blocking issues. Confirm dialogs restate amounts | Snackbar. Haptic tick on sign-with-OTP success |
| Trust cues | "Certified by DDO · 12 Oct 2026" badges, sign-off blocks with names and times, masked PII | Same, plus the last-login time on Home |

## 9. UX success metrics (HEART, adapted)

Google's HEART framework covers Happiness, Engagement, Adoption, Retention and Task success, with goals → signals → metrics per category. Targets below are **proposed**. Baselines from today's paper process are unknown (Q-514).

| Category | Goal | Metric | Target (prototype usability test / pilot) |
|---|---|---|---|
| **Task success** | Members apply without help | Unassisted completion rate: membership application / loan application / surety confirm | ≥ 90% / ≥ 90% / ≥ 95% |
| | Fast tasks | Median time on task: loan application · membership application · surety confirm · DDO certify · accountant review | ≤ 4 min · ≤ 8 min · ≤ 1 min · ≤ 1 min · ≤ 3 min |
| | Few errors | Validation errors per submission | ≤ 1 |
| **Happiness** | Easy to use | SUS score (68 is the commonly cited average) · SEQ per task | SUS ≥ 80 · SEQ ≥ 6/7 |
| **Adoption** | Members move to the app | % active members activated within 90 days of launch | ≥ 60% [P] |
| **Engagement** | Self-service replaces office visits | Monthly active members · calculator uses before applying | Tracked (no target until pilot) |
| **Retention** | Habitual use | Members returning in 2 consecutive months | Tracked |
| **Operations** (society-specific) | Faster approvals | Median days from submit to disbursement · applications returned for missing info | Baseline needed (Q-514). Target −50% vs paper |

**Validation plan:** M10 moderated usability test with 5 members + 3 staff (accountant, DDO, Secretary) on the demo script tasks, measuring the task-success, time, SEQ and SUS metrics above.

## 10. Research sources
- Material 3 / Android navigation bar (3–5 destinations): developer.android.com Compose navigation-bar guide; Kotlin Material3 `NavigationBar` API reference
- WCAG 2.2 SC 2.5.8 Target Size (Minimum), 24×24 CSS px: DAISY Knowledge Base, Deque axe rule docs
- HEART framework (Rodden, Hutchinson & Fu, Google, 2010): Lyssna, The Fountain Institute, Product Compass summaries
- Lucide for React Native (same set as shadcn's lucide-react): lucide.dev docs
- Banking/fintech app practice (bottom nav, progressive onboarding, resume later, terms up front): Meniga, ProCreator, Entropik articles
- Enterprise data tables (key column left, alignment, bulk actions): Pencil & Paper table UX analysis, Stephanie Walter's resource list, NN/g "Data Tables: Four Major User Tasks" (cited via secondary sources)
