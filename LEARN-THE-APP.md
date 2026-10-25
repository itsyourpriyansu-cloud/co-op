# Learn the App: explained simply

> A friendly guide to **what** we're building, **how it flows**, **what tools** we use, and **why the design looks the way it does**.
> No jargon without an explanation. For exact rules, the real source of truth is `docs/`.
> **Status: as built (25 Oct 2026).** Every milestone M0–M10 is built and tested end to end. It is a demo on mock data, running on this computer (localhost). How to present it: `DEMO-SCRIPT.md`.

---

## 1. The story in one minute

Imagine a big office, the **Telangana Secretariat**, full of government employees.
They started a **club** together: the **Co-operative Credit Society**.

- Every month, each member puts a little money into the club's **piggy bank**. It comes straight out of their salary.
- When a member needs money (a wedding, a child's school fees, an emergency), the club **lends** it to them.
- The member pays it back a little every month, again straight from their salary.
- Members can also **park** extra money in the club for a fixed time and earn interest. That's a **Fixed Deposit (FD)**.

Today all of this runs on **paper forms** carried from desk to desk. We're turning that paper into **two apps** that talk to each other.

---

## 2. The characters

| Who | What they do in real life | Where they work in our system |
|---|---|---|
| 🙋 **Applicant** | Wants to join the club | Member App (phone) |
| 👤 **Member** | Saves, borrows, helps friends borrow | Member App (phone) |
| 🤝 **Surety** | A member who promises: "if my friend can't pay, I will" | Member App (phone) |
| 🏢 **DDO** | The officer in each department who pays salaries. Confirms "yes, this person works here and earns this much" | Admin Console (computer) |
| 🧮 **Accountant** | Checks forms, does the maths, makes the monthly salary-deduction list | Admin Console |
| ✍️ **Secretary** | First boss signature | Admin Console |
| ✍️ **President** | Final boss signature | Admin Console |
| 💵 **Cashier** | Takes cash, counts notes, gives out loan money | Admin Console |
| 🛠️ **Super Admin** | Sets the rules (interest rates, limits) and manages users | Admin Console |

**Golden rule:** members only use the **phone app**, and staff only use the **computer console**. Nobody uses both with the same login.

---

## 3. The three pieces (think of a restaurant 🍽️)

```
   📱 Member App            🧠 API (the kitchen)           💻 Admin Console
   (customer's table)  ⇄    checks rules, stores data   ⇄  (the manager's office)
```

- **Member App:** where members place their "orders": apply for a loan, open an FD, join the society.
- **Admin Console:** where staff check, approve and sign those orders.
- **API:** the kitchen in the middle. Both sides send requests to it. It **checks the rules** (for example "is this person retiring before the loan ends?"), **remembers everything**, and answers.

Right now the kitchen is a **pretend kitchen** (a *mock API*) with **toy data**: fake members and fake money. It behaves exactly like the real one will, so the apps can be finished, demoed and tested before the real backend exists. Later we swap the pretend kitchen for a real one, and the apps barely change.

---

## 4. How things flow: little stories

### 🙋 Story 1: Joining the club
1. Divya downloads the app and taps **"Become a member"**.
2. She answers 3 quick questions: *Do you work in the Secretariat? Are you permanent? Are you in another credit society?*
3. She fills the form (name, address, job, shares, nominee), uploads photos of her documents, and **signs with an OTP** (the code sent to her phone acts as her signature).
4. Her app now shows a **progress tracker**, like a parcel delivery app:
   `Received → Department check → Office check → Approval → Pay for shares → Welcome! 🎉`
5. Behind the scenes, her **DDO** confirms her details, the **Accountant** checks everything, and the **Secretary** then the **President** approve.
6. She pays for her shares (at the counter, or from next month's salary), gets her **General No.**, and the app turns into a full member app.

### 💰 Story 2: Borrowing money (Ordinary loan)
1. Lakshmi taps **Apply for loan** and picks the amount and how many months (max **100**).
2. The app instantly checks: *"You retire in 40 months, so the loan must finish before that."* ✅ or ❌
3. She picks **2 friends as sureties**. Their details fill in **automatically**, so no one writes anything twice.
4. Each surety gets a request on their phone, reads the promise, and signs with OTP.
5. On the computer: **Accountant** checks → **DDO** confirms her salary → the Accountant fills the **"For Office Use"** box (the system calculates it) → **Secretary signs** → **President signs** → **Cashier sends the money**.
6. Lakshmi's app now shows her loan and the monthly **EMI** (the instalment).

### ⚡ Story 3: Salary loan (the quick one)
A small, fast loan against this month's salary. **No sureties and no DDO step.** The app works out "salary minus compulsory cuts minus other loan dues" by itself. Then the Secretary and President sign, and the Cashier pays.

### 🏦 Story 4: Fixed Deposit
Member picks an amount, a period and how often to receive interest (monthly / quarterly / half-yearly / at the end). They can add a family member as a joint holder, or open it for a child with a guardian. They pay the cashier (who counts the notes in the app), the Secretary and President accept, and a **digital FD receipt (FDR)** appears in the app.

### 📅 Story 5: Every month (the Demand Sheet)
1. The accountant presses **Generate**. The system makes one list **per department**: "Please cut this much from each person's salary".
2. The accountant **certifies** it and sends it to each department's DDO.
3. The salaries get cut, and the money comes back. The accountant enters how much came in for each person.
4. If someone paid **less** than needed, the money is used in a fixed order, like **filling cups in a line** 🥤🥤🥤:
   `RRF → Insurance → CRD → Penalty → Interest → Loan principal`
   The first cup fills completely before any water reaches the next.

### 🔁 Story 6: Moving to another department
A member is transferred. **This month's list stays the same**, and they appear on the new department's list **from next month**. The new DDO is asked to agree to keep cutting their salary.

---

## 5. Money words, made simple

| Word | Simple meaning |
|---|---|
| **EMI** | The fixed slice you pay back each month |
| **Reducing balance** | Interest is charged only on what you **still owe**, so it shrinks every month |
| **Share capital** | Your "membership stake" in the club |
| **10% share deposit** | When you take an Ordinary loan, 10% is kept aside in your share account. If you already have some there, you only top it up (no double cutting) |
| **Top-up** | Borrow more on an existing loan. The old loan (plus interest until today) is cleared first |
| **Leftover service** | Months until you retire. A loan must finish **before** that |
| **Surety** | A friend who promises to pay if you can't |
| **Insurance** | ₹200 if you have no loan, ₹1,000 if you have one (amounts can be changed) |
| **Placeholder** | A pretend number we use until the society tells us the real one. Always editable in Settings |

---

## 6. The tech stack, explained like toys 🧸

### The house: a *monorepo*
One big house (one project folder) with separate rooms, so everything shares the same rules:
```
apps/admin-console   💻 the office computer app
apps/member-app      📱 the phone app
apps/mock-api        🧠 the pretend kitchen
packages/domain      📐 the rulebook + calculator (EMI, eligibility, the cup-filling order…)
packages/types       🏷️ labels that say what every piece of data looks like
packages/api-client  📮 the postman both apps use to talk to the kitchen
packages/mock-data   🧸 the toy members and toy money
packages/design-tokens 🎨 the shared colour and font box
```
**npm** (it comes free with Node) is the house manager that installs tools for every room. One command, `npm run demo`, switches on the kitchen and the office app together. `npm run dev:app` adds the phone app (in a browser at phone size, or on a real phone with Expo Go).

### Building the screens
| Tool | Like… | What it does |
|---|---|---|
| **React** | LEGO bricks | Build screens from small reusable pieces (a button, a card, a table) |
| **TypeScript** | Labels on every box | Catches mistakes early: "this should be a number, not text!" |
| **Vite** | A super-fast oven | Runs the console app instantly while we build it |
| **Tailwind CSS** | A paint box with numbered colours | Styling with ready-made tokens, so everything matches |
| **Juspay Blend** | A wardrobe of nice ready-made clothes | The design system: buttons, tables, tags, drawers, the sidebar. The console uses it directly. The phone has a small copy of it (`apps/member-app/src/ui`) |
| **Expo + React Native** | The same LEGO, but for phones | Builds the Android app with React skills |
| **Expo Router** | A map of rooms in the phone app | Decides which screen opens when you tap something |
| **Design tokens** | One shared paint box | `packages/design-tokens` gives both apps the same colours, fonts and spacing (`docs/18`) |
| **Lucide icons** | One sticker book for both apps | The same icons on phone and computer |
| **TanStack Query** | A messenger with a good memory | Fetches data from the kitchen and remembers it, so screens feel fast |
| **React Hook Form + Zod** | A form helper + a strict teacher | Handles typing in forms. Zod checks every answer ("mobile must be 10 digits") |

### The pretend kitchen
| Tool | Like… | What it does |
|---|---|---|
| **Node.js** | The electricity | Runs JavaScript on the computer (not just in a browser) |
| **Hono** | A tiny, fast post office | Receives requests ("give me Lakshmi's loans"), checks rules, replies |
| **Seeded mock data** | The same toy set every time | 600 fake members, loans and FDs, identical on every reset, so demos are predictable |

### The robot testers 🤖
| Tool | Tests what |
|---|---|
| **Vitest** | The rulebook maths (e.g. "₹20,000 loan with ₹1,000 already saved → cut only ₹1,000") |
| **Playwright** | Clicks through the console **and** the phone app (its web version, at phone size) like a real person: every journey, the cross-app hand-offs, the whole demo script, accessibility checks (axe), error states and screen sizes (`tests/e2e/`) |
| **Maestro** | Planned for the real Android app once an APK is built. Not used yet |

### The gift box 🎁
An **APK** is the Android app packed into one file you can send to someone's phone and install. **EAS** is Expo's cloud factory that builds it for us. **Not built yet:** for the demo, the phone app runs in a browser at phone size, or on a real phone through the free **Expo Go** app over Wi-Fi (`DEMO-SCRIPT.md`).

### What happens when you tap a button (one trip)
```
Lakshmi taps "Submit loan" 📱
 → the postman (api-client) carries it to the kitchen 🧠
 → the kitchen asks the rulebook (domain): retirement OK? max 100 months? ✅
 → saves it, writes "submitted by Lakshmi at 10:42" in the history
 → the accountant's Work Queue on the computer 💻 now shows it
 → when the accountant acts, Lakshmi's tracker updates on her phone
```

---

## 7. The UX: why it looks and works this way

**UX** = how it *feels* to use. Our goal: **calm, clear, trustworthy, like a good bank app.**

| Choice | Why |
|---|---|
| **Phone: 5 tabs at the bottom** (Home, Loans, Deposits, Payments, More) | Thumbs reach the bottom easily. Android guidance says 3–5 main places |
| **Home shows a "snapshot card"** | The first question is always "what do I have and what do I owe?" |
| **Big buttons (48 dp+)** | Easy for everyone, including older members, to tap |
| **Forms in small steps + save and resume later** | Long forms scare people. Small steps feel easy |
| **Everything pre-filled** | Paper made people write the same details again and again. We never ask twice |
| **Sign with OTP** | Replaces a pen signature. Safe, quick and recorded |
| **Progress trackers** | Like a parcel delivery app, so people stop calling the office to ask "where's my application?" |
| **Computer: side menu + tables + side drawer for decisions** | Staff see the full record **while** approving, not on a separate page |
| **Ctrl+K search** | Find anyone by name or General No. in a second |
| **Every screen has its moods** | Loading (skeleton shapes), Empty (friendly picture + next step), No results (clear filters), Error (what went wrong + Try again), Offline, No access, Success. Ten in all, the same on every screen (`docs/19`) |
| **Colours:** Blend's brand blue | Steady and trustworthy. It is a placeholder until the society shares its own colours (Q-008). Changing it is one setting. Light and dark mode both work |
| **Simple drawings, not stock photos** | Stock smiling strangers feel fake in a members-only club |
| **Accessibility (WCAG 2.2 AA)** | Readable contrast, keyboard use and screen-reader labels, so everyone can use it |

**How we'll know the design works:**
- 9 out of 10 members finish a loan application without help, in under 4 minutes.
- A surety confirms in under 1 minute.
- An ease-of-use score (SUS) of 80+. The average app gets about 68.

---

## 8. How we'll build it (like building a house 🏠)

| Step | House analogy | What gets built |
|---|---|---|
| M0 | Foundation + walls | Project setup, both app shells, login, pretend kitchen, first phone install |
| M1 | Wiring + plumbing | The rulebook maths + toy data |
| M2 | Fuse box | Settings: rates, limits, users, permissions |
| M3 | Front door | Members + joining the society |
| M4–M5 | Main rooms | Loans, from apply → sign → pay out |
| M6 | Safe room | Fixed deposits |
| M7 | Monthly bills | Demand sheets + salary recovery |
| M8 | Furniture | The rest of the phone app |
| M9 | Windows | Dashboards, reports, printable forms |
| M10 | Paint + inspection | Polish, accessibility, testing |
| Demo-ready | Show-home | Demo clock, the full robot test suite, screen sizes, production mode, docs (`docs/build-history/11-demo-ready.md`) |

All of these are **built**. Still to come, only when asked: the Android APK, hosting on Azure, and the real Fusil backend.

Progress is tracked in **`BUILD-CHECKLIST.md`**. Exact details live in **`docs/`**. The questions only the society can answer are in plain words in **`docs/client-questions.md`**.
