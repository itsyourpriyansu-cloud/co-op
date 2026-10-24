# 11 · Service / API Contracts

> Version 0.3 · 2026-10-24 · Status: **[P] HTTP contracts served by `apps/mock-api` (D-021)** and consumed by both apps through `packages/api-client`.
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
