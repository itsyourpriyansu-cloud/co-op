# 19 · Navigation, page patterns and the state contract (as built)

> Version: 1.0 · Last updated: 2026-10-25 · Written from `apps/admin-console/src/config/navigation.ts`, `src/components`, `src/pages/design/StatesTab.tsx` and the Member App screens.
> Journeys and the state rules they come from: `docs/04-experience-architecture.md` §6. Tokens and components: `docs/18`.

## 1. Navigation

### Admin Console

The sidebar is Blend's shell. Its structure is `NAV_GROUPS` in `src/config/navigation.ts`, and each item has a permission:

| Group | Items |
|---|---|
| Work | Dashboard (ST-01), Work Queue (ST-02) |
| Records | Joining (ST-14–17), Members (ST-10–13), Loans (ST-20–28), Deposits (ST-30–33) |
| Money | Demand Sheets (ST-40–43), Payments (ST-44–47) |
| Insight | Reports (ST-50–52) |
| Admin | Settings (ST-60–67), Design System (`demo.control`, Super Admin) |

- An item shows only if the role has its permission (`docs/03`). The DDO sees a short list.
- The top bar has global search (**Ctrl K**: members, loans, deposits, receipts), notifications, the theme toggle (`tgs.console.theme`) and the demo controls.
- Press **/** to collapse or expand the sidebar.
- The shell renders the page's only `<main>` landmark. Pages must not add another one.

### Member App

Expo Router in `apps/member-app/src/app`:

| Area | Screens |
|---|---|
| Signed out | `welcome`, `login`, `activate`, `forgot-password`, `join` + `join/verify` (applicant sign-up with OTP), `offline`, `demo-settings` (long-press the Welcome logo) |
| Applicant `(applicant)/` | `eligibility`, `apply` (the joining wizard, ending in sign with OTP), `tracker` |
| Member `(member)/` tabs | `home`, `loans`, `deposits`, `payments`, `more` |
| Member stacks | `loan/apply`, `loan/[id]`, `deposit/open`, `deposit/[id]`, `payment/report`, `surety` + `surety/[loanId]`, `profile/*`, `rates`, `account/*` (calculators, notifications, help, settings, password) |

An applicant who gets a General No. moves from the tracker to the member tabs on the next refresh.

## 2. Page patterns (console)

| Pattern | Built from | Used by |
|---|---|---|
| **List page** | `PageHeader` + filter bar + Blend `TableV2` inside `ViewState` | Joining, Members, Loans, Deposits, Demand Sheets, Payments, Change requests |
| **Detail page** | `PageHeader` (title, `StatusTag` meta, primary action) + stage tracker + `Panel`s or tabs | Loan, Joining application, Member profile, Deposit, Demand sheet, Receipt |
| **Decision drawer** | `SideDrawer`, opened from the primary action | Forward, certify, sanction, disburse, accept FD, verify payment, transfer |
| **Wizard** | Step list + one section per step, with a sticky footer | New member, Generate demand sheets, Payment entry |
| **Dashboard** | `Panel`s with Blend `StatCardV2` tiles and progress bars | Dashboard |
| **Print twin** | A paper-like page with a Print button, no shell chrome when printed | Sanction letter, FDR, receipts, report forms |

The rules:
- **One `h1` per page:** the `PageHeader` title.
- **The primary action belongs to the stage owner.** Everyone else sees who the record is waiting on.
- **No dropdowns inside drawers.** Blend dropdown menus render under the drawer layer (docs/18 §2). Use `Chips` (radio chips), radio cards or checkboxes.
- **Confirm every irreversible step.** The decision drawer states what will happen and names the next owner. "Post recovery" asks "Yes, post" again.
- **Explain every rule outcome:** `RuleCheckList` shows each check with its `BR-` id.
- **"Act as …" (demo only):** on a record waiting on another role, Super Admin sees an `Act as <owner>` button. It completes the stage as that persona through the same API, so a presenter can walk a record end to end.

### Member App patterns

`Screen` + `Header` give a sticky footer and pull-to-refresh. On top of that:
- `Card`/`Section`/`KeyValue` for summaries;
- `WizardProgress` for multi-step forms (join, loan, FD);
- `StageTracker` for anything waiting on the office;
- signing with OTP (D-031): "Sign & submit" opens an `OtpInput`, demo code 123456.

## 3. The state contract

Every screen designs for the ten states in `VIEW_STATES` (`packages/types/src/scenarios.ts`).

| State | Meaning | Console (`<ViewState>`) | Member App |
|---|---|---|---|
| `loading` | First fetch | Skeleton in the page layout (`table`, `cards`, `detail`, `form`, `stats`) | `Skeleton` blocks |
| `empty` | Nothing exists yet | Illustration, title and an action | `EmptyState` |
| `noResults` | Filters hide everything | "No matches for these filters" + **Clear filters** | Same wording |
| `error` | The request failed | "We couldn't load this" + **Try again** | `Alert` "Couldn't load your …" + **Try again** (or pull down) |
| `offline` | Server can't be reached | "Can't reach the society server" + **Retry** | `offline` screen; drafts kept |
| `noAccess` | The role may not see it | "You don't have access to this" | Not reachable: members see only their own data |
| `partial` | Some parts failed | Warning alert above the content | Alert above the content |
| `submitting` | Saving | Content dimmed, "Saving…" spinner, `aria-busy` | Button `loading` |
| `success` | Just saved | Success notice above the content | Success screen or toast |
| `ready` | Normal | The content | The content |

A list page derives its state from the query:
`isLoading → loading`, `isError → error`, `counts.all = 0 → empty`, `total = 0 → noResults`, otherwise `ready`.

A transient failure must never show `noAccess`. This is tested by `states-console.spec.ts` (a fresh load with failures reaches Retry).

**How it is proved:**
- **State Explorer:** `/design?tab=states&pattern=list&state=error` renders any pattern in any state.
- **The Playwright state specs:**
  - `states-console.spec.ts` turns the demo failure rate up to 1, then checks every list for error + Retry, on reload and after in-app navigation, then the recovery;
  - `states-phone.spec.ts` does the same on the phone;
  - the no-results case is checked on the members search.
- **Seeded data states:** the scenario catalog (`docs/20`).
