# Staff mobile UI: plan

**Built:** nothing in code. `docs/23-staff-app-and-go-live.md` is the plan and the tracker.

**Key files:** `docs/23` (§3 structure, §4 UI rules, §5 parity matrix, §6 phases, §7 test environment).

**API:** no change. The backend is out of scope (D-106).

**Domain:** no change.

**Decisions:** D-101 staff on the phone; D-106 inside the existing Expo app under `src/app/staff/`, Android and iOS, nothing new, React Native only, `v2` branch, the user commits. D-102, D-104 and D-105 superseded the same day.

**Verified:** every screen ID in docs/05 §2 and every route in `apps/admin-console/src/app/router.tsx` appears in the docs/23 matrix (scripted check).

**Gaps / TODO:** the app has never run on a real phone. Printing opens the console in the phone's browser. A repeated receipt is only guarded in the UI. Member sign-in on production waits on F-10.

**Next:** S0 Real-device baseline.
