# 00 · System Overview: The Clean Structure

> Version 0.3 · 2026-10-24 · Read this before anything else in `docs/`.

## 1. Two apps, one backend, with no overlap

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ADMIN CONSOLE: desktop web (React + Vite)                               │
│  Everyone who WORKS for or WITH the society                              │
│  Super Admin · Accountant · Secretary · President · Cashier/Disbursement │
│  · DDO (department officer, sees own department only)                    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  HTTPS / JSON (same contracts, doc 11)
                      ┌─────────▼──────────┐
                      │  API                │  prototype = mock API (Hono, seeded)
                      │  roles · rules ·    │  production = backend TBD (Q-005)
                      │  workflows · data   │
                      └─────────▲──────────┘
                                │  HTTPS / JSON
┌───────────────────────────────┴──────────────────────────────────────────┐
│  MEMBER APP: Android (Expo React Native)                                 │
│  Everyone who BELONGS to (or wants to join) the society                  │
│  Applicants (join + track) · Members (loans, deposits, surety, payments) │
└──────────────────────────────────────────────────────────────────────────┘
```

**Hard boundaries (D-033):**
- Members and applicants use **only the app**. There is no member website.
- Staff (including DDO, Secretary and President) use **only the Admin Console** on desktop. There are no staff features in the app.
- Neither app holds business rules. The API decides and the apps display. (The apps may preview calculations, but the API's answer wins.)

## 2. Who does what (paper → digital)

| Paper today | Digital owner | Where |
|---|---|---|
| Applicant fills Membership form, takes it to the department for the certificate | Applicant | App → "Become a member" |
| Asst. Secretary to Govt / DDO signs "Certified correct" | DDO | Admin Console → Work Queue → *Certify* |
| Society office checks and files the form | Accountant | Admin Console → Membership Applications |
| Secretary and President sign | Secretary → President | Admin Console → Work Queue → *Approve* (sequential) |
| Cash paid at the counter, cashier seals the receipt | Cashier | Admin Console → Payments (with denominations) |
| Loan form + surety particulars + surety signatures | Member + sureties | App → Apply / Surety requests (particulars auto-filled) |
| DDO certifies items 1–5 of the loan form | DDO | Admin Console → *Certify* |
| "For Office Use" block (balances, dates, recoveries) | System (computed), Accountant reviews | Admin Console → Loan → Assessment |
| Sanction signed by Secretary and President | Secretary → President | Admin Console → *Sanction* (sequential) |
| FD form + cash + FDR issued, "Accepted" by Secretary and President | Member applies, Cashier receives, Sec→Pres accept | App → Open FD · Admin Console → Deposits |
| "Agreement with the Society" (salary-recovery authorisation) | Member signs, DDO agrees | App (during joining) · Admin Console (DDO) |
| Demand list sent to the DDO | Accountant generates and certifies | Admin Console → Demand Sheets |

## 3. Module map

| Module | Admin Console | Member App |
|---|---|---|
| Membership (join pipeline) | Applications pipeline, review, approve, allot General No. | Join, eligibility check, apply, track status |
| Members | Master, profile, service history, documents, transfers, mandates | My profile, my documents, my agreements |
| Loans | Index, apply-on-behalf, workflow panels, top-up | Apply (product-specific), top-up, track, schedule |
| Sureties | Visible on the loan | Surety requests: confirm particulars and sign |
| Deposits | FD/CRD/SRDS/Savings, FD acceptance, FDR | My deposits, open FD request, FDR |
| Collections | Demand sheets, recovery, receipts (cash denominations) | My payments and statements |
| Reports | Catalogue + viewer + prints | — |
| Settings | Products, schemes, rates, workflow config, users, templates | Rates (read-only), preferences |

## 4. Document map
`01` discovery · `02` requirements · `03` roles · `04` journeys · `05` **screen count** · `06` screen specs · `07` architecture · `08` data model · `09` business rules · `10` workflows · `11` API · `12` **design direction & system** · `13` mock data · `14` plan · `15` tests · `16` **paper forms → digital mapping** · `decisions-log` · `open-questions` · `glossary`
