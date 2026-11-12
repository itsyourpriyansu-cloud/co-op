# Azure infrastructure (G3, D-113)

One Bicep template, `main.bicep`, builds one environment. `staging.bicepparam` and `production.bicepparam` set the sizes. Staging holds fictional data only.

| Part | Azure service | Notes |
|---|---|---|
| API | App Service for Containers (Linux, P0v3), Always On, `staging` slot | Always On keeps the daily jobs running. New images start in the slot and are swapped in |
| Database | PostgreSQL Flexible Server, private network only, point-in-time restore | 7 days of backups on staging, 35 on production |
| Console | Static Web Apps (Standard) | `apps/admin-console/public/staticwebapp.config.json` |
| Files | Storage account, `files` container, no shared keys, no public access | `FILE_STORE=azure-blob`; files are already encrypted by the app |
| Secrets | Key Vault (RBAC, purge protection) | `DATABASE-URL` comes from the template; `JWT-SECRET` and `DATA-ENCRYPTION-KEY` are added once by hand |
| Images | Container Registry (Basic), no admin user | Tagged with the git commit |
| Monitoring | Log Analytics, Application Insights, `/health` test every 5 minutes, email alert | |
| Access | One user-assigned identity for the app and its slot | Pulls images, reads secrets, writes blobs. No keys anywhere |

Nothing here needs a password in GitHub: the workflows sign in to Azure with OIDC.

## One-time set-up (owner)

Run these with the Azure CLI as a subscription Owner. Do the steps for `staging` first, then repeat them for `production`. `PREFIX` is 3 to 10 lowercase letters or digits, and it must be unique in Azure because it names the registry, storage account and key vault.

```bash
ENV=staging                      # then production
RG=rg-tgseccsl-$ENV
PREFIX=tgsecc                    # pick your own
az group create -n $RG -l centralindia
```

### 1. Create the resources

```bash
export TGS_PREFIX=$PREFIX
export TGS_ALERT_EMAIL=<who gets the alerts>
export TGS_DB_ADMIN_PASSWORD="$(openssl rand -base64 30 | tr -d '/+=')"
az deployment group create -g $RG -f infra/main.bicep -p infra/$ENV.bicepparam
```

The database password ends up only in Key Vault (`DATABASE-URL`). If PostgreSQL 18 is not offered in the region yet, add `-p dbVersion=17`.

### 2. Add the two app secrets (once, never change them)

```bash
KV=kv-${PREFIX}$([ $ENV = production ] && echo prd || echo stg)
az role assignment create --assignee "$(az ad signed-in-user show --query id -o tsv)" --role "Key Vault Secrets Officer" --scope "$(az keyvault show -n $KV --query id -o tsv)"
az keyvault secret set --vault-name $KV -n JWT-SECRET --value "$(openssl rand -base64 48)"
az keyvault secret set --vault-name $KV -n DATA-ENCRYPTION-KEY --value "$(openssl rand -base64 48)"
```

### 2a. WhatsApp sign-in codes (F-10, before members can sign in)

Members sign in with a code sent by WhatsApp. Until this step is done, production refuses nothing but delivers nothing: the codes are only logged.

1. In Meta Business Manager, add the society's WhatsApp Business number and verify the business.
2. Create two message templates and wait for approval:
   - `society_notice` (category Utility, English): body `{{1}}: {{2}}`. Every society notice goes through it.
   - `login_code` (category Authentication, English): the standard one-time-code body with a copy-code button.
3. Create a system user with the WhatsApp permissions and a permanent token, then:

```bash
az keyvault secret set --vault-name $KV -n WHATSAPP-TOKEN --value "<the permanent token>"
export TGS_WHATSAPP_PHONE_NUMBER_ID=<phone number id from WhatsApp > API setup>
az deployment group create -g $RG -f infra/main.bicep -p infra/$ENV.bicepparam
```

Email needs nothing by hand: the template creates Azure Communication Services with an Azure-managed sender domain (`DoNotReply@<random>.azurecomm.net`). To send from the society's own domain later, add it as a custom domain in the Email Communication Service, verify its DNS records and change `EMAIL_FROM`.

**Keep an offline copy of `DATA-ENCRYPTION-KEY`** (sealed envelope, society safe). Without it, every stored signature, document and authenticator secret is lost. Changing it has the same effect.

### 3. Let GitHub deploy (OIDC)

```bash
REPO=<github-owner>/<repo>
APP_ID=$(az ad app create --display-name "github-tgseccsl-$ENV" --query appId -o tsv)
az ad sp create --id $APP_ID
az ad app federated-credential create --id $APP_ID --parameters "{\"name\":\"$ENV\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"repo:$REPO:environment:$ENV\",\"audiences\":[\"api://AzureADTokenExchange\"]}"
az role assignment create --assignee $APP_ID --role Contributor --scope "$(az group show -n $RG --query id -o tsv)"
az role assignment create --assignee $APP_ID --role AcrPush --scope "$(az acr show -n acr${PREFIX}$([ $ENV = production ] && echo prd || echo stg) --query id -o tsv)"
```

In GitHub, go to Settings → Environments → `staging` / `production` → Variables and add:

| Variable | Value |
|---|---|
| `AZURE_CLIENT_ID` | `$APP_ID` |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `AZURE_RESOURCE_GROUP` | `$RG` |
| `TGS_PREFIX` | `$PREFIX` |

On `production`, also set **Required reviewers** to the people who approve a release.

### 4. First deploy and the first Super Admin

1. Merge to `main`, or run **Deploy** by hand under Actions. The image is built, started in the slot, checked, swapped in, and then the console is published.
2. Give the first Super Admin as temporary app settings. The container's start-up bootstrap (`npm run db:bootstrap`) creates the account only while no active Super Admin exists:
   ```bash
   az webapp config appsettings set -g $RG -n app-tgseccsl-$ENV --settings BOOTSTRAP_ADMIN_USERNAME=<user.id> BOOTSTRAP_ADMIN_NAME="<Full Name>" BOOTSTRAP_ADMIN_PASSWORD="<temporary password>"
   az webapp restart -g $RG -n app-tgseccsl-$ENV
   ```
3. Sign in on the console. You will be asked to set up an authenticator and change the password. Then **remove the three settings**:
   ```bash
   az webapp config appsettings delete -g $RG -n app-tgseccsl-$ENV --setting-names BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
   ```
4. Point the phone builds at the API address (`eas.json`, docs/store-release.md).

## Rollback

The previous version is still in the `staging` slot right after a swap. To go back:

```bash
az webapp deployment slot swap -g $RG -n app-tgseccsl-production --slot staging --target-slot production
```

Migrations only ever add columns and tables, so the older version runs on the newer database.

## Restore drill (every quarter)

```bash
az postgres flexible-server restore -g $RG -n psql-tgseccsl-restore-test --source-server psql-tgseccsl-production --restore-time "<UTC time, e.g. 2027-01-10T09:00:00Z>"
# check row counts and the trial balance, then delete it:
az postgres flexible-server delete -g $RG -n psql-tgseccsl-restore-test --yes
```

Every production deploy also takes an on-demand backup named `pre-deploy-<commit>`.
