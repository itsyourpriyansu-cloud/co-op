# 03a · Joining the society (MJ-01…05, ST-14…17) — done

## Built
- **App (applicant):** MJ-01 welcome → MJ-02 sign-up (name + mobile → OTP `123456`) → MJ-03 eligibility (BR-026) → MJ-04 7-step application wizard with autosave + Sign with OTP → MJ-05 tracker (stages, info request, share payment, welcome with General No. → member mode). Tracker polls every 5 s.
- **Console:** ST-14 Joining board/table (stage columns, waiting-on-you, age chips amber >5 d / red >10 d, flags, search, department filter, live 5 s refresh); ST-15 application detail (F1 items 1–7 with DDO ticks, documents, declarations + OTP signature, checks, activity timeline, sign-offs, next step); drawers: intake (Send to DDO), **ST-16 DDO certify** (per item Correct/Fix → flagged items turn into a return; mandate AGREED), recommend, **ST-17 Secretary → President** (President picks share route), cashier share receipt (cash/UPI/cheque), activate (first demand), return, reject. "Act as <owner>" demo button when the stage belongs to someone without a login (other departments' DDOs).

## Key files
- Domain: `packages/domain/src/membership.ts` (`MEMBERSHIP_STAGE_OWNER`, `membershipActionsFor`, `nextMembershipStatus`, `primaryMembershipAction`, `membershipShareAmount`).
- API: `apps/mock-api/src/joining.ts` (applicant side + phone demo controls), `membership.ts` (staff side, `applyMembershipAction`, `activate`, `demoAct`), `joining-reference.ts` (documents, agreement texts). Tests: `joining.test.ts`, `membership.test.ts`.
- Console: `apps/admin-console/src/pages/joining/{JoiningPage, JoiningDetailPage, ActionDrawer, joining}.tsx`.
- App: `apps/member-app/src/app/{welcome, join/*, (applicant)/*}.tsx`, `src/lib/joining.ts`.
- Seed: every seeded application has a full F1 form, documents, signature and real stage-owner sign-offs (`enrichApplication` in `packages/mock-data/src/generate.ts`, own RNG stream). `SEED_VERSION = 4`.

## API
`GET /membership/applications` · `GET /membership/applications/:id` · `POST /membership/applications/:id/actions/:action` · `POST /membership/applications/:id/demo-act` · applicant: `/joining/*`, `/membership/me*` · phone demo: `/__demo/membership/:id/{advance,request-info,reject}`. Details in docs/11 §6.

## Decisions
D-052 (seal logo), **D-053** (staff workflow, Accountant intake, return goes back to the returning stage), **D-054** (demo-only, Azure later, own judgment), BR-032 (share capital = shares × ₹100, 10–100 shares).

## Verified
19 API tests incl. full role chain, wrong role 403, wrong stage 409, validation 400. Headless browser: full chain Accountant → DDO → Accountant → Secretary → President → Cashier (General No. allotted), and console certify → phone tracker moves within 5 s.

## Gaps / TODO
- Documents are simulated (no preview). Withdrawal of an application not built.
- Notifications on stage changes are not created yet (do it with the notifications module).

## Next
Members module (ST-10…13, ST-18, MB-02, MB-19) completes M3.
