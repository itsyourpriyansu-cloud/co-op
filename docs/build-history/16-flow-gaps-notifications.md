# G9 flow gaps and notifications: built

**Built:** the gaps left after G1–G8. Receipt cancellation with a guard on ledger reversals (D-119). FD renewal (D-120). Notifications to enterprise standard (D-121): an outbox with retries, signed WhatsApp delivery / read receipts, a failed-send list with Send again, message hours for broadcasts, live console updates, money and mobile-change alerts that cannot be switched off, and nine notices that were missing.

**Key files:** `backend/src/modules/collections/collections.service.ts` (`cancelReceipt`, `cancelBlock`, `unapply`); `ledger/ledger.service.ts` (`REVERSIBLE_SOURCES`); `deposits/deposits.service.ts` (`renew`, `remindMinorsOfAge`); `notifications/notifications.service.ts` (`enqueue`, `sendOne`, `dispatch`, `kick`, `whatsappStatus`, `stream`, `failedDeliveries`, `retryDelivery`, `nextSendTime`), `notifications.realtime.ts` (LISTEN / NOTIFY hub), `notifications.repository.ts` (claim with `SKIP LOCKED`); `integrations/{messaging,whatsapp-cloud,acs-email}.ts` (`retryable`, `providerMessageId`, 10 s timeout); `plugins/jobs.ts` (outbox every 15 s, minor-turns-18 in housekeeping); migration `0034_g9_notification_outbox.sql` (outbox columns, templates, message-hour settings). Console: `ReceiptPage`, `PaymentsPage`, `DepositDetailPage`, `PrintForms`, `NotificationsPage` (status, progress, Not delivered), `app/shell/useLiveNotifications.ts`, Settings → General (message hours). Phone: `staff/payment/[id]`, `staff/(tabs)/payments`, `staff/deposit/[id]/*`, `staff/account/notifications`, `staff/settings/[section]`, member `payments`, `payment/receipt/[id]`, `account/settings` (always-on alerts caption).

**API:** docs/11 "G9 additions". `POST /receipts/:id/cancel`; deposit action `renew`; `GET /notifications/deliveries/failed`, `POST /notifications/deliveries/:id/retry`; `GET /notifications/stream`, `GET /me/notifications/stream` (SSE); `GET` / `POST /webhooks/whatsapp` (public, verify token / signature).

**Domain:** `DepositAction` adds `renew` (MATURED → CLOSED); settings `messageWindowStartHour`, `messageWindowEndHour` with validation.

**Decisions:** D-119, D-120, D-121. BR-051 … BR-053. Open questions closed: Q-004, Q-112, Q-116, Q-405, Q-408, Q-513.

**Things to know before touching this:**
- A notice is sent with `app.notifications.notify(...)` (or `notifyMember`). It queues the WhatsApp / email copies and tries them at once; a fault is retried by the dispatcher. Never call a sender directly except for OTPs.
- A new template needs both the catalog (`packages/mock-data/src/catalog.ts`, for fresh databases and the seed) and a migration that inserts it `ON CONFLICT DO NOTHING` (for databases already running). Without the row, `notify` silently does nothing.
- Broadcast timing uses the real clock in IST, not the demo clock. `DEMO_MODE` skips the message hours so demos and e2e work at night; production forces it off.
- The webhook routes keep the raw body (own content-type parser in their scope) because Meta signs the exact bytes.
- The SSE stream ends every 15 minutes on purpose; the console reconnects with a fresh token. React Native cannot read a streaming body, so phones rely on push.
- Four files were reformatted by Prettier with the repo's `.prettierrc.json` (ConsoleTopbar, NotificationsPage, member `account/settings`, staff `account/notifications`): large diffs there are mostly formatting.

**Verified:** see the 2026-11-13 line in `BUILD-CHECKLIST.md`.

**Gaps / TODO (owner):** put `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Key Vault and set the callback in Meta (`infra/README.md` step 4). Not built: email bounces (Azure Event Grid), replies members send to the society's WhatsApp number, alerts to staff when an admin resets their password.

**Next:** owner items in `docs/go-live-checklist.md` §1.
