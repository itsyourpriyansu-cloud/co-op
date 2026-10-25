# 01 · M1 Domain engine + seed + store — done

## Built
- `packages/domain` is the single source of business rules (pure functions, no I/O). New in M1:
  - `eligibility.ts`: `checkProductLimits` (BR-016), `checkConcurrentLoans` (BR-018), `checkDepositLoanLimit` (BR-015), `checkSuretyEligibility` (BR-014), **`assessLoanApplication`** (one call → checks, max instalments, max amount, EMI preview, net salary, share deduction, net disbursable; used by phone preview, console review and API).
  - `workflows.ts`: state machines with owners and actions — loans (`LOAN_STAGE_OWNER`, `loanActionsFor`, `nextLoanStatus`, `PRIMARY_LOAN_ACTION`), FDs (`DEPOSIT_STAGE_OWNER`, `depositActionsFor`, `nextDepositStatus`, `PRIMARY_DEPOSIT_ACTION`), demand sheets (`demandSheetActionsFor`, `nextDemandSheetStatus`).
  - `demand.ts`: `buildDemandComponents` (BR-009), `departmentForCycle` (BR-010), `checkDefaulter` (BR-020), `fdRateFor` (BR-017 slabs).
  - Existing: money/dates, `checkTenureEligibility`, `generateSchedule`, `calculateEmi`, `calculateShareDeduction`, `calculateTopupSettlement`, `allocateRecovery`, `calculateInsuranceDue`, `validateDenominations`, `calculateFdMaturity`, membership workflow.
- Settings gained configurable placeholders: `LoanProduct.{minAmount, maxConcurrent, depositMarginPercent, penalRatePercent}`, `SocietySettings.{minShares, maxShares, admissionFee, maxGuaranteesPerSurety, emiToNetSalaryMaxPercent, penalGraceDays}`.
- Seed: sureties respect the 2-open-guarantee limit; `SEED_VERSION = 5` (the API reseeds automatically).

## Key files
`packages/domain/src/{eligibility,workflows,demand}.ts` + tests `{eligibility,workflows,demand,coverage}.test.ts`; `packages/mock-data/src/{catalog,generate}.ts`, `dataset.test.ts`.

## Decisions
D-055 (all placeholder values above). Docs updated: 09 table (function names, statuses), 14 status.

## Verified
`npm run test:domain-coverage` → 100% statements / branches / functions / lines (76 tests). `npx vitest run` → 161 tests. `npm run typecheck` green.

## Gaps / TODO
- Share-deposit interest (BR-005), penal interest (BR-012) and insurance eligibility from service (BR-021) remain P2 / unknown.

## Next
M2 Settings (ST-60…67, MB-16 rates) — make every placeholder above editable.
