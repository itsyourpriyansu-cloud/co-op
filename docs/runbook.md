# Runbook: running TGSECCSL in production

> Version 0.2 · 2026-11-13 · G9: failed sends, WhatsApp receipts, wrong counter receipts (D-119, D-121).
> Version 0.1 · 2026-11-12 · G8 (D-118). For the person on call (Envizon support, then the society's IT contact). Commands assume `bash`, the Azure CLI signed in, and these variables:
>
> ```bash
> ENV=production; RG=rg-tgseccsl-$ENV; APP=app-tgseccsl-$ENV; DB=psql-tgseccsl-$ENV
> KV=kv-${PREFIX}prd   # PREFIX as chosen in infra/README.md §1
> ```
>
> One-time set-up is in `infra/README.md`; phone releases in `docs/store-release.md`.

## 1. What runs where

| Part | Where | Health |
|---|---|---|
| API (Fastify, one container) | App Service `$APP`, slot `staging` holds the previous version after a release | `https://$APP.azurewebsites.net/health` → `"ok": true` |
| Database | PostgreSQL Flexible Server `$DB`, private network, 14-day point-in-time restore | via the API health (`database.ok`) |
| Files (signatures, documents) | Storage account, container `files`, encrypted by the app | opening a document in the console |
| Console | Static Web Apps | the sign-in page loads |
| Member and staff app | Google Play / App Store; talks to the API | sign-in on a phone |
| Secrets | Key Vault `$KV`: `DATABASE-URL`, `JWT-SECRET`, `DATA-ENCRYPTION-KEY`, `WHATSAPP-TOKEN` | — |
| Messages | WhatsApp Cloud API (sign-in codes, notices), Azure Communication Services (email), Expo (push) | Console → Notifications → Sent shows "n not delivered" |
| Daily jobs | Inside the API: FD maturity (after the configured hour), housekeeping (FD reminders, expired sessions, closed applications per DPDP) | log lines "Daily housekeeping ran" |

## 2. Monitoring and alerts

- **Availability test** pings `/health` every 5 minutes from three regions; two failures email the action group (`TGS_ALERT_EMAIL`).
- **App Insights** (`appi-tgseccsl-$ENV`): Failures (5xx), Performance (p95 per route; G7 baseline ≤ 0.6 s), Live metrics.
- **Logs:** `az webapp log tail -g $RG -n $APP`, or Log Analytics:
  ```kusto
  AppServiceConsoleLogs | where TimeGenerated > ago(1h) | where ResultDescription has_any ("\"level\":50", "\"level\":60") | project TimeGenerated, ResultDescription
  ```
- Check once a day during hypercare, weekly after: alerts mailbox, 5xx count, "one-time code not sent" and "Daily housekeeping failed" log lines, disk / CPU on the database blade.

## 3. Release (deploy)

1. Merge to `main`. GitHub Actions → **Deploy** runs CI, deploys to staging, smoke-tests `/health`, then waits for a **production approval**.
2. Before approving: check staging (console sign-in, one member sign-in on a phone pointed at staging).
3. Approve. The workflow takes an on-demand backup `pre-deploy-<commit>`, starts the new image in the `staging` slot, checks `/health`, swaps it in, checks again, and publishes the console.
4. Migrations run at container start and only add (expand-only), so the previous version still runs on the new database.

A phone release is separate (`docs/store-release.md`). If an old app version must stop working, raise **Settings → General → Mobile app → Oldest version allowed**.

## 4. Rollback

```bash
az webapp deployment slot swap -g $RG -n $APP --slot staging --target-slot production
curl -fsS https://$APP.azurewebsites.net/health
```

The console: redeploy the previous commit with **Deploy → Run workflow** on that commit. A migration is never rolled back; fix forward.

## 5. Backup and restore

- Azure keeps point-in-time backups for 14 days, plus `pre-deploy-<commit>` before every release.
- **Restore** (to a new server; then point the app at it):
  ```bash
  az postgres flexible-server restore -g $RG -n $DB-restored --source-server $DB --restore-time "<UTC, e.g. 2027-01-10T09:00:00Z>"
  # put the new server's address into Key Vault DATABASE-URL, then:
  az webapp restart -g $RG -n $APP
  ```
- **Drill every quarter** (`infra/README.md` → Restore drill): restore to a test server, compare the trial balance (Reports → Trial balance on a copy, or `npm run db:restore-drill` locally against a dump), delete it. Record the time taken in §10.
- Files in Blob Storage have soft delete for 30 days (blobs and the container); undelete from the storage blade. Files erased on purpose (DPDP, §1) are also recoverable for those 30 days.

## 6. Secrets and key rotation

| Secret | How to change | Effect |
|---|---|---|
| `JWT-SECRET` | `az keyvault secret set --vault-name $KV -n JWT-SECRET --value "$(openssl rand -base64 48)"`, then `az webapp restart -g $RG -n $APP` | Everyone signs in again |
| Database password | `az postgres flexible-server update -g $RG -n $DB --admin-password '<new>'`, update `DATABASE-URL` in Key Vault, restart | Brief outage during restart |
| `WHATSAPP-TOKEN` | New permanent token in Meta Business, `az keyvault secret set ... -n WHATSAPP-TOKEN`, restart | None |
| `DATA-ENCRYPTION-KEY` | **Only if it may have leaked.** See below | Planned downtime (minutes) |

**Rotating `DATA-ENCRYPTION-KEY`** (re-encrypts authenticator secrets and every stored file):
1. Announce downtime. Stop the app: `az webapp stop -g $RG -n $APP`.
2. Take a backup: `az postgres flexible-server backup create -g $RG -n $DB --backup-name pre-rotate`.
3. From a machine that can reach the database (Azure Cloud Shell in the VNet, or a temporary jump box) with the repo checked out:
   ```bash
   cd backend
   DATABASE_URL="$(az keyvault secret show --vault-name $KV -n DATABASE-URL --query value -o tsv)" DATABASE_SSL=true \
   DATA_ENCRYPTION_KEY="$(az keyvault secret show --vault-name $KV -n DATA-ENCRYPTION-KEY --query value -o tsv)" \
   NEW_DATA_ENCRYPTION_KEY="$(openssl rand -base64 48 | tee /dev/tty)" \
   FILE_STORE=azure-blob AZURE_STORAGE_ACCOUNT=<account> npm run db:rotate-key
   ```
   It is safe to run again if it stops halfway (anything already on the new key is skipped).
4. Store the new key: `az keyvault secret set --vault-name $KV -n DATA-ENCRYPTION-KEY --value '<new key>'`, and replace the sealed offline copy.
5. Start the app: `az webapp start -g $RG -n $APP`. Open a signed form and a document to check.

## 7. Incidents

| Symptom | First checks | Fix |
|---|---|---|
| Health alert / site down | `az webapp show -g $RG -n $APP --query state`; log tail; App Insights Failures | Restart (`az webapp restart`); if it started after a release, roll back (§4) |
| `database.ok: false` in health | Database blade: state, CPU, storage, connections | Restart the server from the blade; if storage is full, raise `dbStorageGb` in Bicep and redeploy |
| Members do not get sign-in codes | Log "one-time code not sent", WhatsApp Manager → message status, token expiry, template status | Renew `WHATSAPP-TOKEN`; re-approve a paused template; members can be helped at the office meanwhile |
| Emails not arriving | Console → Notifications → Sent; ACS → Insights | Check the sender domain; Azure-managed domains have a daily limit, move to the society's domain |
| Messages stuck at "Sending…" or many "Not delivered" | Console → Notifications → Sent messages (Not delivered list shows the provider's reason); log "message not delivered" / "outbox dispatch failed" | A wrong number or email: correct it on the member, then Send again. Token or template problem: fix as for codes above, then Send again. The outbox retries faults by itself for about 40 minutes |
| Sent messages never show Delivered / Read | Meta app → WhatsApp → Configuration: callback URL and `messages` subscription; log for 401 on `/webhooks/whatsapp` | Callback must be `https://<api>/api/v1/webhooks/whatsapp`; `WHATSAPP-APP-SECRET` must be the app's current secret |
| Push not arriving | Log "push not accepted" | Usually a phone setting; Expo access token if `EXPO_ACCESS_TOKEN` is set |
| A document will not open ("Blob read failed") | Storage firewall, identity role on the account | Re-run the Bicep deployment to restore the role |
| Trial balance does not balance | Reports → Trial balance | Should never happen (every entry balances); stop postings, export the journals, contact Envizon |
| Wrong posting by staff | Accounts → the voucher / Ledger → journal | Vouchers and manual journals: reverse on the Ledger page and post the right one. A wrong counter receipt: another officer cancels it the same day from the receipt (Cancel receipt), then a new receipt is taken; later than that, a correcting voucher. Business entries cannot be reversed from the Ledger page. Never edit the database |
| Suspected account misuse | Audit Log filtered by user | Admin → Users → deactivate; reset password and authenticator; rotate `JWT-SECRET` to end every session |
| Data breach suspected | Contain first (deactivate, rotate secrets) | The society informs the Data Protection Board and affected people as the DPDP rules require; keep the audit export |

**Severity and response** (support plan in `docs/go-live-checklist.md` §4): P1 system down or money wrong, P2 one function blocked, P3 question or cosmetic.

## 8. Routine tasks

| When | Task |
|---|---|
| Daily (hypercare), weekly after | §2 checks |
| Monthly | Demand cycle works end to end; Notifications → Sent has no unexpected failures; `npm audit` on `main` |
| Quarterly | Restore drill (§5); review staff users and roles (Admin → Users); review Audit Log for unusual access |
| Yearly | Year-end close (Accounts → Year end); renew the Apple developer account; review settings marked "placeholder" with the society |

## 9. Contacts

| Role | Who | How |
|---|---|---|
| On call (first line) | Envizon support | to be filled at go-live |
| Society IT contact | to be named by the society | |
| Society approver for releases | Secretary or President | GitHub production reviewer |
| Azure subscription owner | the society | |

## 10. Drill and incident log

| Date | What | Time taken | Notes |
|---|---|---|---|
| | | | |
