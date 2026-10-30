# 11 · Service / API Contracts

> Version 0.10 · 2026-10-29 · `GET /health` also answered by the backend (`service: tgseccsl-backend`, plus `database` status, D-073) · Status: **[P] HTTP contracts served by `apps/mock-api` (D-021)** and consumed by both apps through `packages/api-client`.
> v0.11 · 2026-10-29 · Backend auth endpoints (P1a, D-076): staff login + TOTP, member mobile OTP, refresh/logout, users reset-password/reset-totp, PUT /permissions/:role. Contracts and examples in the backend OpenAPI at `/docs`. `Session` gains optional `refreshToken`, `expiresInSeconds`.
> v0.12 · 2026-10-30 · Backend P2 (D-079): settings, loan products, society, departments, templates and rates served by the backend with the same shapes; new `GET /settings/versions`, `GET /settings/loan-products/:code/versions`; demo reset resets both servers.
> These are **not** the production backend API. Production endpoints must come from the backend owner (Q-005). If Fusil has an existing API, these contracts are adapted to it before M1.

## 1. Conventions

- Base URL: `http://<host>:4000/api/v1`. JSON in and out. `Authorization: Bearer <token>`.
- Each REST endpoint below has a matching typed function in `packages/api-client` (the "Function" column).
- Session context from the token: `{ userId, role, memberId?, departmentId? }`. Scoping is applied server-side (DDO → dept, Member → own).
- Errors: HTTP 400 `VALIDATION_ERROR` · 401 unauthenticated · 403 `FORBIDDEN` · 404 `NOT_FOUND` · 409 `INVALID_TRANSITION` / `ALREADY_EXISTS` / `ALREADY_POSTED` · 422 `RULE_VIOLATION` · 503 `NETWORK` (injected).
- Money is in integer paise. Dates are ISO strings.
- Lists: `ListParams { page=1, pageSize=25, sort?: 'field:asc|desc', q?: string, filters?: Record<string, string|string[]> }` → `Paged<T> { items: T[], page, pageSize, total }`.

### Error model
```ts
type ServiceErrorCode =
  | 'VALIDATION_ERROR'      // fieldErrors: Record<string, string>
  | 'NOT_FOUND'
  | 'FORBIDDEN'             // role/scope denies
  | 'INVALID_TRANSITION'    // workflow state changed or action not allowed in state
  | 'RULE_VIOLATION'        // business rule failed: ruleId e.g. 'BR-002'
  | 'ALREADY_EXISTS'        // e.g. demand sheet for cycle+dept
  | 'ALREADY_POSTED'
  | 'NETWORK'               // simulated failure
interface ServiceError { code: ServiceErrorCode; message: string; fieldErrors?: Record<string,string>; ruleId?: string }
```

## 2. Contracts

The REST column is what the mock API actually serves. For the production backend it is a suggestion only.

### auth
| Function | REST | Input → Output |
|---|---|---|
| `login` | POST /auth/login | `{ id, password, kind: 'staff'|'member' }` → `Session` |
| `loginAsPersona` (demo) | POST /auth/persona | `personaId` → `Session` |
| `me` | GET /me | → `{ user, role, permissions, member? }` |
| `requestActivationOtp` | POST /auth/activation/otp | `{ employeeId, mobile }` → `{ otpRef }` |
| `completeActivation` | POST /auth/activation | `{ otpRef, otp, password }` → `Session` |
| `requestPasswordReset` / `resetPassword` | POST /auth/password/* | … |
| `logout` | POST /auth/logout | — |

### members
| Function | REST | Input → Output |
|---|---|---|
| `list` | GET /members | `ListParams` (filters: departmentId, status, retiringWithinMonths, hasActiveLoan) → `Paged<MemberSummary>` |
| `get` | GET /members/:id | → `MemberDetail` (incl. derived leftoverServiceMonths, share summary) |
| `create` / `update` | POST / PUT /members/:id | `MemberInput` → `MemberDetail` (VALIDATION_ERROR) |
| `transfer` | POST /members/:id/transfers | `{ toDepartmentId, effectiveDate, orderRef?, remarks? }` → `ServiceEvent` (incl. effectiveCycle) |
| `serviceHistory` | GET /members/:id/service-events | → `ServiceEvent[]` |
| `documents.list/upload/remove` | /members/:id/documents | → `MemberDocument` |
| `ledger` | GET /members/:id/ledger | `{ fromCycle, toCycle }` → `MemberLedgerRow[]` |
| `search` | GET /members/search?q= | → `MemberLookup[]` (for surety and member pickers) |

### loans
| Function | REST | Input → Output |
|---|---|---|
| `list` | GET /loans | filters: type, statusGroup, departmentId, memberId → `Paged<LoanSummary>` |
| `get` | GET /loans/:id | → `LoanDetail` (sureties, events, schedule, sanctionSheet) |
| `checkEligibility` | POST /loans/eligibility | `{ memberId, productId, amount, tenureMonths, parentLoanId? }` → `EligibilityResult { checks: {ruleId, pass, message}[], maxTenureMonths, emiPreview, shareDeduction, topupSettlement? }` |
| `createDraft` / `updateDraft` | POST/PUT /loans | `LoanApplicationInput` → `LoanDetail` |
| `createTopup` | POST /loans/:id/topups | `{ amount, tenureMonths, sureties[] }` → `LoanDetail` |
| `transition` | POST /loans/:id/transitions | `{ action, payload }` (table in `10` §1) → `LoanDetail` (INVALID_TRANSITION, FORBIDDEN, RULE_VIOLATION) |
| `computeSanctionSheet` | POST /loans/:id/sanction-sheet | `{ amount, tenureMonths }` → `SanctionSheet` |
| `schedule` | GET /loans/:id/schedule | → `ScheduleRow[]` |
| `suretyRequests` (member) | GET /me/surety-requests | → `SuretyRequest[]` |
| `respondSurety` | POST /loans/:id/sureties/:sid | `{ accept: boolean, reason? }` → `LoanSurety` |
| `workQueue` | GET /work-queue | `{ stage? }` → `Paged<QueueItem>` (role-scoped) |

### deposits
| Function | REST | Input → Output |
|---|---|---|
| `list` / `get` | GET /deposits(/:id) | filters: scheme, status, maturingWithinDays → |
| `open` | POST /deposits | `DepositOpenInput` → `DepositAccount` |
| `preview` | POST /deposits/preview | `{ schemeId, amount, tenureMonths }` → `{ ratePercent, maturityDate, maturityValue }` |
| `ledger` | GET /deposits/:id/ledger | → `LedgerEntry[]` |

### collections
| Function | REST | Input → Output |
|---|---|---|
| `sheets.list` | GET /demand-sheets | `{ cycle }` → `DemandSheetSummary[]` (incl. NOT_GENERATED rows per dept) |
| `sheets.preview` | POST /demand-sheets/preview | `{ cycle, departmentIds[] }` → `DemandPreview` |
| `sheets.generate` | POST /demand-sheets | `{ cycle, departmentIds[] }` → `DemandSheet[]` (ALREADY_EXISTS) |
| `sheets.get` | GET /demand-sheets/:id | → `DemandSheetDetail` |
| `sheets.markSent` | POST /demand-sheets/:id/sent | → `DemandSheet` |
| `recovery.preview` | POST /demand-sheets/:id/recovery/preview | `{ lines: {memberId, recovered}[] }` → `AllocationPreview[]` |
| `recovery.post` | POST /demand-sheets/:id/recovery | same → `{ receipts: Receipt[] }` (ALREADY_POSTED) |
| `receipts.list/get` | GET /receipts | → |
| `receipts.create` | POST /receipts | `{ memberId, date, source, amount, reference? }` → `Receipt` with allocations |
| `me.statements` (member) | GET /me/statements | → month rows |

### reports
| Function | REST | Input → Output |
|---|---|---|
| `catalogue` | GET /reports | → `ReportDef[] { key, name, group, filters[], phase }` |
| `run` | POST /reports/:key | `filters` → `{ columns, rows, totals }` |
| `export` | POST /reports/:key/export | `{ filters, format: 'csv'|'pdf' }` → `{ fileName, blobUrl }` |

### settings, users, notifications, support
| Function | REST |
|---|---|
| `settings.get` / `settings.update(section, value)` | GET/PUT /settings/:section |
| `loanProducts.list/update`, `depositSchemes.list/update` | /settings/loan-products, /settings/deposit-schemes |
| `departments.list/create/update` | /departments |
| `users.list/create/update` | /users |
| `permissions.get/update` | /settings/permissions |
| `notifications.list/markRead` | /notifications |
| `messages.send` (simulated) | POST /messages `{ channel, recipients, templateKey, variables }` → `NotificationLog[]` |
| `support.list/create/reply` | /support-tickets |
| `demo.health` · `demo.personas` · `demo.reset` · `demo.clock` · `demo.failureRate` | GET /health · GET /__demo/personas · POST /__demo/reset · POST /__demo/clock · POST /__demo/failure-rate |

## 3. Domain function signatures (pure, `packages/domain`)

```ts
calculateLeftoverService(dor: ISODate, today: ISODate): { months: number; label: string }
checkTenureEligibility(leftoverMonths: number, tenureMonths: number): RuleCheck            // BR-002
calculateEmi(p: Paise, annualRate: number, n: number, method: EmiMethod): Paise | Paise[] // BR-006
generateSchedule(p: Paise, annualRate: number, n: number, method: EmiMethod, startCycle: Cycle): ScheduleRow[]
calculateShareDeduction(sanctioned: Paise, percent: number, existingBalance: Paise): { required: Paise; deduction: Paise } // BR-004
calculateAccruedInterest(outstanding: Paise, annualRate: number, from: ISODate, to: ISODate, basis: AccrualBasis): Paise // BR-007
calculateTopupSettlement(loan: ActiveLoan, today: ISODate, settings: Settings): TopupSettlement
calculateInsuranceDue(member: MemberState, cycle: Cycle, settings: Settings): Paise        // BR-008
generateDemandSheet(cycle: Cycle, departmentId: string, state: StoreSnapshot, settings: Settings): DemandSheetDraft // BR-009/010
allocateRecovery(components: DemandComponent[], amount: Paise, order: AllocationOrder): AllocationResult // BR-011
calculateFdMaturity(principal: Paise, annualRate: number, months: number, compounding: Compounding): { maturityValue: Paise; maturityDate: ISODate } // BR-017
```

## 4. v0.3 additions: membership, signatures, FD acceptance

### applicant & membership
| Function | REST | Input → Output |
|---|---|---|
| `applicant.signup` | POST /applicants | `{ fullName, mobile }` → `{ otpRef, demoOtp }` |
| `applicant.verify` | POST /applicants/verify | `{ otpRef, otp }` → `Session` (role APPLICANT) |
| `membership.eligibility` | POST /membership/eligibility | answers → `{ eligible, reasons[] }` (BR-026) |
| `membership.getMine` / `saveDraft` | GET / PUT /membership/applications/me | → `MembershipApplication` (autosave) |
| `membership.uploadDocument` | POST /membership/applications/me/documents | file → `Document` |
| `membership.submit` | POST /membership/applications/me/submit | `{ signature: SignedConsent[] }` → application (SUBMITTED) |
| `membership.list` (staff) | GET /membership/applications | filters stage, departmentId → `Paged<…>` (DDO scoped) |
| `membership.get` | GET /membership/applications/:id | → detail incl. checks |
| `membership.transition` | POST /membership/applications/:id/transitions | `{ action: ddoCertify \| ddoRequestInfo \| officeForward \| officeRequestInfo \| reject \| secretaryApprove \| presidentApprove \| recordSharePayment \| scheduleShareOnDemand, payload }` → application (INVALID_TRANSITION, FORBIDDEN) |
| `membership.respondInfo` | POST /membership/applications/me/info-response | changed fields/docs → application |

### signatures (sign with OTP, D-031)
| Function | REST | Input → Output |
|---|---|---|
| `sign.request` | POST /signatures/request | `{ textKey, entityType, entityId }` → `{ otpRef, text, textVersion, demoOtp }` |
| `sign.confirm` | POST /signatures/confirm | `{ otpRef, otp }` → `SignatureRecord` |

### mandates
| `mandates.get` | GET /members/:id/mandate | → `RecoveryMandate` |
| `mandates.agree` (DDO) | POST /mandates/:id/agree | → mandate (AGREED) |

### loans (updated)
- `transition` actions: `submit, suretySign, suretyDecline, replaceSurety, forward, return, reject, ddoCertify, ddoRecordManual, ddoReturn, ddoDecline, sendForSanction, secretarySign, secretaryReject, presidentSign, presidentReject, sendBack, disburse, withdraw`.
- `GET /loans/:id/office-use` → `OfficeUse` (computed F3-back panel).
- `POST /loans/net-pay-preview` → `{ netSalary, netSubstantivePay }` (BR-023/025).

### deposits (updated)
| `fd.request` | POST /deposits/fd-requests | F4 payload + signature → FD (REQUESTED) |
| `fd.transition` | POST /deposits/:id/transitions | `{ action: recordPayment \| secretaryAccept \| presidentAccept \| reject \| cancel, payload }` |
| `fd.fdr` | GET /deposits/:id/fdr | → printable FDR data |

### receipts (updated)
`receipts.create` accepts `{ mode, denominations?, purpose: DUES | SHARE_CAPITAL | FD_DEPOSIT, linkedEntityId? }` → `VALIDATION_ERROR` if the denominations don't total the amount (BR-029).

### demand (updated)
`POST /demand-sheets/:id/certify` → sheet (CERTIFIED). `markSent` now requires CERTIFIED (BR-030).
## 5. v0.4 additions (doc 17)
| Function | REST | Input → Output |
|---|---|---|
| `paymentReports.create` (member) | POST /me/payment-reports | `{ amount, paidOn, mode, reference, towards, linkedEntityId?, screenshot? }` → `PaymentReport` |
| `paymentReports.listMine` | GET /me/payment-reports | → `PaymentReport[]` |
| `paymentReports.list` (staff) | GET /payment-reports?status= | → `Paged<PaymentReport>` |
| `paymentReports.verify` / `reject` | POST /payment-reports/:id/verify · /reject | `{ remarks? }` → report (+ receipt on verify) |
| `profile.updateContact` | PATCH /me/profile/contact | `{ email?, presentAddress?, photo? }` → member |
| `profile.changeMobile` | POST /me/profile/mobile (OTP via `sign.request` flow) | → member |
| `profile.requestChange` | POST /me/profile/change-requests | `{ fields[], reason, document? }` → `ProfileChangeRequest` |
| `profileRequests.list` / `decide` (staff) | GET /profile-change-requests · POST /profile-change-requests/:id/decision | `{ approve: boolean, remarks? }` |
| `auth.changePassword` | POST /me/password | `{ current, next }` → `{ ok }` |
| `rates.list` | GET /rates | → `{ loanProducts[], fdSlabs[], effectiveFrom }` |

## 6. As built (M3, joining): staff endpoints (D-053)

Served by `apps/mock-api/src/membership.ts`, called through `api.applications.*`. The §4 `transitions` design became one endpoint per action.

| Client call | REST | Notes |
|---|---|---|
| `applications.list()` | GET /membership/applications | `MembershipList`: rows (stage, days in stage, docs, flags, `waitingOnMe`, `waitingOn`), counts, scope. DDO → own department. Drafts hidden |
| `applications.get(id)` | GET /membership/applications/:id | `MembershipDetail`: application + department + `actions` for the caller + checks + share amount + agreements + `demoActAs` |
| `applications.act(id, action, input)` | POST /membership/applications/:id/actions/:action | action ∈ sendToDdo · certify · forward · approve · returnToApplicant · reject · recordSharePayment · activate. 403 wrong role/department, 409 wrong stage, 400 with `fieldErrors` (remarks ≥ 10 chars for return/reject, all 7 items + `mandateAgreed` for certify, `sharePaymentRoute` for President, reference for UPI/cheque) |
| `applications.demoAct(id)` | POST /membership/applications/:id/demo-act | Demo only (`demo.control`): completes the stage as its owner |
| `demo.membership.advance/requestInfo/reject` | POST /__demo/membership/:id/… | Phone tracker demo buttons; same code path as above |

Hosting: the API reads `PORT`, `HOST`, `MOCK_*` and `CORS_ORIGIN` (see `apps/mock-api/.env.example`). The console reads `VITE_API_URL`, the app `EXPO_PUBLIC_API_URL` (D-054).

## Members module as built (M3b, D-057)

| Endpoint | Who | Notes |
|---|---|---|
| `GET /members?q&departmentId&status&retiringWithinMonths&hasActiveLoan&mandatePending&page&pageSize&sort` | staff (`members.view`) | `MemberList` (paged rows + counts + scope). DDO scoped. Mobiles masked |
| `GET /members/:id` | staff | `MemberDetail` (loans, guarantees, deposits, ledger, service events, mandate, documents, change requests, `can`). `:id` may be the General No. Full mobile only for Super Admin / Accountant |
| `POST /members`, `PUT /members/:id` | `members.edit` | `MemberInput`; `VALIDATION_ERROR` with `fieldErrors` (incl. duplicate Employee ID / mobile). PUT refuses department changes |
| `POST /members/:id/transfers` | `members.edit` | `TransferInput` → `MemberDetail` with `upcomingTransfer.effectiveCycle` (BR-010) and mandate `PENDING_NEW_DDO` |
| `POST /members/:id/mandate/agree` | DDO of the department (demo users for DDOs without a login) | BR-028 |
| `GET /profile-change-requests` | staff (DDO: own department, DDO route only) | `ChangeRequestList` with `myAction`, `waitingOn` |
| `POST /profile-change-requests/:id/certify` `{approve, remarks?}` | DDO | Employment / pay route only |
| `POST /profile-change-requests/:id/decision` `{approve, remarks?}` | `members.decideChanges` (Accountant) | 409 until the DDO has certified |
| `GET /me/profile` · `PATCH /me/profile/contact` · `POST /me/profile/mobile` + `/mobile/verify` · `GET|POST /me/profile/change-requests` | member | MB-02 / MB-19 |
| `GET /reference/rates` | any signed-in user | MB-16 (M2) |

## Loans core as built (M4, D-058)

| Endpoint | Who | Notes |
|---|---|---|
| `GET /loans?product&group&departmentId&q&page&pageSize` | staff (`loans.view`) | `LoanList`; member drafts hidden; DDO scoped |
| `GET /loans/:id` | staff | `LoanDetail` (stages, sureties, live checks, preview, role actions) |
| `GET /members/:id/loan-context` | staff | `LoanContext` for ST-21 |
| `POST /loans` `{memberId, …LoanRequestInput, submit}` | `loans.create` | Office entry from the signed paper form, no OTP |
| `GET /members/search?q=` | staff, members | `MemberPick[]`, eligible sureties first |
| `POST /loans/assess`, `POST /loans/surety-preview` | staff, members | Live eligibility for an unsaved form |
| `GET /me/loans`, `GET /me/loans/context`, `GET /me/loans/:id` | member | MB-03 / MB-04 / MB-05 |
| `POST /me/loans`, `PUT /me/loans/:id`, `DELETE /me/loans/:id` | member | Drafts |
| `POST /me/loans/:id/sign/request`, `POST /me/loans/:id/submit {otpRef, otp}` | member | Sign with OTP → `SURETY_PENDING` or `ACCOUNTANT_REVIEW` (D-030) |

## Loan workflow as built (M5, D-059)

| Endpoint | Who | Notes |
|---|---|---|
| `GET /work-queue` | staff | `WorkQueue`: loans, joining, change requests, DDO mandates waiting on the user |
| `GET /loans/:id/sanction-preview?amount&instalments` | staff | `SanctionPreview` (ST-26) |
| `POST /loans/:id/actions/:action` `LoanActionInput` | stage owner (`loanActionsFor`) | forward · returnToMember · reject · ddoCertify · ddoRecordManual · sendForSanction · secretarySign · presidentSign · sendBack · disburse |
| `POST /loans/:id/demo-act` | staff with `demo.control` | Completes the stage as its owner (incl. all pending sureties) |
| `GET /me/surety-requests` | member | `SuretyRequests` (requests, guaranteeing) |
| `POST /me/surety-requests/:loanId/sign/request`, `/accept {otpRef, otp}`, `/decline {reason}` | named surety | J-02 |
| `POST /me/loans/:id/sureties/replace {oldId, newId}` | applicant | While `SURETY_PENDING` |
| `POST /me/loans/:id/withdraw {reason?}` | applicant | Before sanction |

## 8. As built (M7, collections, D-061)

Served by `apps/mock-api/src/collections.ts`, called through `api.demand.*`, `api.receipts.*`, `api.myPayments.*`.

| Client call | REST | Notes |
|---|---|---|
| `demand.overview(cycle?)` | GET /demand | One row per department (status incl. NOT_GENERATED), totals, `canGenerate`, DDO scoped |
| `demand.preview(cycle, ids)` / `generate` | GET /demand/preview · POST /demand/generate | Current or next cycle only; Accountant only |
| `demand.sheet(id)` / `act` / `demoAct` | GET /demand/sheets/:id · POST …/actions/:action · POST …/demo-act | certify → sendToDdo → postRecovery `{ recovered: {memberId: paise} }` (missing = full; more than demand = 400) |
| `receipts.list/get/create` | GET/POST /receipts · GET /receipts/:id | Tabs ALL · SALARY_RECOVERY · COUNTER, search, paging; create = DUES (arrears) or SHARE_CAPITAL; CASH needs matching denominations (BR-029) |
| `receipts.dues(memberId)` | GET /members/:id/dues | Unpaid by month and head (priority order) + first-demand shares |
| `receipts.reports/verify/reject` | GET /payment-reports · POST …/:id/verify · POST …/:id/reject | Verify creates a BANK_TRANSFER receipt linked to the report; reject needs a reason ≥ 10 chars |
| `myPayments.get/receipt/report` | GET /me/payments · GET /me/receipts/:id · POST /me/payments/reports | MB-10 / MB-18 |

## 9. As built (M8, member account, D-062)

Served by `apps/mock-api/src/account.ts`, called through `api.auth.*`, `api.account.*`, `api.demo.activationSample`.

| Client call | REST | Notes |
|---|---|---|
| `auth.memberLogin(login, password)` | POST /auth/member-login | General No. or Employee ID. Errors: fieldErrors.login / .password, 403 inactive, 422 ruleId NOT_ACTIVATED |
| `auth.startActivation(employeeId, mobile)` | POST /auth/activate/start | Mobile must match the Member Master; 422 ALREADY_ACTIVE → AccountOtp `{otpRef, mobileMasked, name, demoOtp}` |
| `auth.startReset(login)` | POST /auth/forgot/start | 422 NOT_ACTIVATED for members who never activated |
| `auth.verifyOtp(otpRef, otp)` | POST /auth/otp/verify | One use; → `{passwordToken}` (10 min) |
| `auth.setPassword(token, password)` | POST /auth/password/set | D-062 rule; activation → `{activated: true, session}`, reset → `{activated: false}`; signs out old sessions |
| `auth.checkPassword(password, login?)` | POST /auth/password/check | Same result as the phone meter |
| `account.changePassword(current, next)` | POST /me/password | Keeps this session, signs out the others → `{signedOutOtherSessions}` |
| `account.home()` | GET /me/home | MB-01 snapshot: member, shares, deposits (+ next maturity), active loans with next due, this month's demand, unpaid, action cards, unread count |
| `account.notifications / readNotification / readAllNotifications` | GET /me/notifications · POST …/:id/read · POST …/read-all | Newest first, `alsoSentVia` from preferences |
| `account.preferences / savePreferences` | GET/PUT /me/preferences | Channels SMS / WHATSAPP / EMAIL; EMAIL needs an email on the profile |
| `account.support / createTicket` | GET /me/support · POST /me/support/tickets | Office contacts, FAQs, the member's tickets with messages; new ticket gets an auto-reply |
| `demo.activationSample()` | GET /__demo/activation-sample | First active member who has not activated (demo card on MA-02) |

## 10. As built (M9, dashboards · notifications · reports, D-063)

Served by `apps/mock-api/src/insight.ts` + `reports.ts`, called through `api.dashboard.role`, `api.reports.*`, `api.notifications.*`.

| Client call | REST | Notes |
|---|---|---|
| `dashboard.role()` | GET /dashboard/role | `RoleDashboard`: variant, tiles, queue by stage (from the Work Queue), oldest items, done this month, demand status (Accountant / DDO), recent list |
| `reports.catalogue()` | GET /reports | 20 report defs (8 MVP tables + defaulter notice + locked P2/accounting) and filter options (cycles, departments, products, defaulterCycles). `reports.view` (not DDO) |
| `reports.run(id, filters)` | GET /reports/:id?cycle&departmentId&minCycles&from&to&memberId&product&withinMonths | `ReportResult`: columns, groups with subtotals, totals, links. Unknown/locked = 404, missing member / bad range = 400 |
| `reports.defaulterNotice(member)` | GET /print/defaulter-notice/:memberIdOrGeneralNo | Unpaid months, total, ref no., text from template `defaulter.notice`, pay-to |
| `notifications.list / count / read / readAll` | GET /notifications · GET /notifications/count · POST …/:id/read · POST …/read-all | The signed-in staff user's in-app notifications; count adds open member questions for `support.reply` |
| `notifications.preview / send / messages` | POST /messages/preview · POST /messages · GET /messages | `messages.send`. Audience MEMBER / DEPARTMENT / DEFAULTERS / RETIRING; send → in-app notification per recipient + `OutboxMessage` (DELIVERED_SIMULATED) |
| `notifications.tickets / reply` | GET /support/tickets · POST /support/tickets/:id/reply `{text, close}` | `support.reply`. Reply → ANSWERED + member notification (link `/account/help`); close → CLOSED; replying to a closed one = 409 |
