// G3 (D-113): one environment (staging or production) of the TGSECCSL system on Azure.
// Deploy into an empty resource group:  az deployment group create -g <rg> -f infra/main.bicep -p infra/<env>.bicepparam
// See infra/README.md for the one-time steps (secrets, GitHub OIDC, first Super Admin).

@description('staging or production; used in resource names.')
@allowed(['staging', 'production'])
param env string

@description('Region for everything except the console (Static Web Apps has its own region list).')
param location string = 'centralindia'

@description('Static Web Apps region (it is not offered in every region).')
param consoleLocation string = 'eastasia'

@description('Short unique prefix for globally named resources (registry, storage, key vault). Lowercase letters and digits.')
@minLength(3)
@maxLength(10)
param prefix string

@description('App Service plan size. P0v3 gives deployment slots and Always On.')
param appSku string = 'P0v3'

@description('PostgreSQL compute size.')
param dbSku string = 'Standard_B1ms'

@allowed(['Burstable', 'GeneralPurpose', 'MemoryOptimized'])
param dbTier string = 'Burstable'

@description('PostgreSQL major version. 18 matches development; use 17 if 18 is not offered in the region yet.')
param dbVersion string = '18'

param dbStorageGb int = 32
param dbBackupDays int = 14
param dbAdminUser string = 'tgsadmin'

@secure()
@description('PostgreSQL administrator password. Kept only in Key Vault (DATABASE-URL).')
param dbAdminPassword string

@description('Image tag the app starts with. The deploy workflow sets the real one.')
param imageTag string = 'initial'

@description('Extra allowed origins for the API besides the console (comma-separated), e.g. a custom console domain.')
param extraCorsOrigins string = ''

@description('Email for availability alerts.')
param alertEmail string

@description('WhatsApp Cloud API phone number id (Meta Business). Empty keeps WhatsApp simulated: members cannot receive sign-in codes.')
param whatsappPhoneNumberId string = ''

var name = 'tgseccsl-${env}'
var short = '${prefix}${env == 'production' ? 'prd' : 'stg'}'
var tags = { app: 'tgseccsl', env: env }
var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  // Contributor, scoped to the Communication Services resource only (lets the identity send email).
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c'
}

// ---------- monitoring ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${name}'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 90 }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${name}'
  location: location
  kind: 'web'
  tags: tags
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

// ---------- identity used by the app and its slot (no keys anywhere) ----------
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${name}'
  location: location
  tags: tags
}

// ---------- container registry ----------
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acr${short}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, roles.acrPull)
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull) }
}

// ---------- key vault: DATABASE-URL here; JWT-SECRET and DATA-ENCRYPTION-KEY are added once by hand ----------
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${short}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    // Losing DATA-ENCRYPTION-KEY loses every signature, document and authenticator secret.
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

resource vaultRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identity.id, roles.keyVaultSecretsUser)
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser) }
}

// ---------- file storage (FILE_STORE=azure-blob) ----------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${short}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: env == 'production' ? 'Standard_ZRS' : 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 30 }
    containerDeleteRetentionPolicy: { enabled: true, days: 30 }
  }
}

resource filesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'files'
  properties: { publicAccess: 'None' }
}

resource blobWrite 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, identity.id, roles.storageBlobDataContributor)
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDataContributor) }
}

// ---------- email (G5, D-115): Azure Communication Services, Azure-managed sender domain, data kept in India ----------
resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: 'ecs-${name}'
  location: 'global'
  tags: tags
  properties: { dataLocation: 'India' }
}

resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  tags: tags
  properties: { domainManagement: 'AzureManaged', userEngagementTracking: 'Disabled' }
}

resource communication 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: 'acs-${name}'
  location: 'global'
  tags: tags
  properties: { dataLocation: 'India', linkedDomains: [emailDomain.id] }
}

resource emailSend 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(communication.id, identity.id, roles.contributor)
  scope: communication
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.contributor) }
}

// ---------- private network: the database has no public address ----------
resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: 'vnet-${name}'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.40.0.0/16'] }
    subnets: [
      {
        name: 'app'
        properties: { addressPrefix: '10.40.1.0/24', delegations: [{ name: 'web', properties: { serviceName: 'Microsoft.Web/serverFarms' } }] }
      }
      {
        name: 'db'
        properties: { addressPrefix: '10.40.2.0/24', delegations: [{ name: 'pg', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }] }
      }
    ]
  }
}

resource dbDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${name}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource dbDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dbDns
  name: 'vnet'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}

// ---------- PostgreSQL ----------
resource db 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-${name}'
  location: location
  tags: tags
  sku: { name: dbSku, tier: dbTier }
  properties: {
    version: dbVersion
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: dbStorageGb, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: dbBackupDays, geoRedundantBackup: 'Disabled' }
    network: { delegatedSubnetResourceId: '${vnet.id}/subnets/db', privateDnsZoneArmResourceId: dbDns.id, publicNetworkAccess: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
  dependsOn: [dbDnsLink]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: db
  name: 'tgseccsl'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource databaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'DATABASE-URL'
  properties: { value: 'postgres://${dbAdminUser}:${uriComponent(dbAdminPassword)}@${db.properties.fullyQualifiedDomainName}:5432/${database.name}' }
}

// ---------- console (static site) ----------
resource console 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-${name}'
  location: consoleLocation
  tags: tags
  sku: { name: 'Standard', tier: 'Standard' }
  properties: {}
}

// ---------- API (container on App Service) ----------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'asp-${name}'
  location: location
  tags: tags
  kind: 'linux'
  sku: { name: appSku }
  properties: { reserved: true }
}

var kvRef = '@Microsoft.KeyVault(VaultName=${vault.name};SecretName='
var cors = join(filter(concat(['https://${console.properties.defaultHostname}'], split(extraCorsOrigins, ',')), o => !empty(trim(o))), ',')
var appSettings = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'WEBSITES_PORT', value: '4100' }
  { name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE', value: 'false' }
  { name: 'TRUST_PROXY', value: 'true' }
  { name: 'DATABASE_SSL', value: 'true' }
  { name: 'DATABASE_URL', value: '${kvRef}DATABASE-URL)' }
  { name: 'JWT_SECRET', value: '${kvRef}JWT-SECRET)' }
  { name: 'DATA_ENCRYPTION_KEY', value: '${kvRef}DATA-ENCRYPTION-KEY)' }
  { name: 'CORS_ORIGIN', value: cors }
  { name: 'FILE_STORE', value: 'azure-blob' }
  { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
  { name: 'AZURE_STORAGE_CONTAINER', value: filesContainer.name }
  { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
  { name: 'EMAIL_PROVIDER', value: 'acs' }
  { name: 'ACS_ENDPOINT', value: 'https://${communication.properties.hostName}' }
  { name: 'EMAIL_FROM', value: 'DoNotReply@${emailDomain.properties.mailFromSenderDomain}' }
  // WhatsApp (F-10): the owner adds WHATSAPP-TOKEN to Key Vault and sets the phone number id; until then codes are simulated.
  { name: 'WHATSAPP_PROVIDER', value: empty(whatsappPhoneNumberId) ? 'simulated' : 'meta' }
  { name: 'WHATSAPP_PHONE_NUMBER_ID', value: whatsappPhoneNumberId }
  { name: 'WHATSAPP_TOKEN', value: empty(whatsappPhoneNumberId) ? '' : '${kvRef}WHATSAPP-TOKEN)' }
  { name: 'PUSH_PROVIDER', value: 'expo' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
]
var siteConfig = {
  linuxFxVersion: 'DOCKER|${registry.properties.loginServer}/tgseccsl-backend:${imageTag}'
  acrUseManagedIdentityCreds: true
  acrUserManagedIdentityID: identity.properties.clientId
  alwaysOn: true
  healthCheckPath: '/health'
  http20Enabled: true
  minTlsVersion: '1.2'
  ftpsState: 'Disabled'
  vnetRouteAllEnabled: true
  appSettings: appSettings
}

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: 'app-${name}'
  location: location
  tags: tags
  kind: 'app,linux,container'
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: identity.id
    virtualNetworkSubnetId: '${vnet.id}/subnets/app'
    siteConfig: siteConfig
  }
  dependsOn: [acrPull, vaultRead, blobWrite, databaseUrl]
}

// New images start here, are checked, then swapped in (deploy.yml); the old one stays for rollback.
resource apiStaging 'Microsoft.Web/sites/slots@2023-12-01' = {
  parent: api
  name: 'staging'
  location: location
  tags: tags
  kind: 'app,linux,container'
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: identity.id
    virtualNetworkSubnetId: '${vnet.id}/subnets/app'
    siteConfig: siteConfig
  }
}

resource apiLogs 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: api
  name: 'logs'
  properties: {
    workspaceId: logs.id
    logs: [{ category: 'AppServiceConsoleLogs', enabled: true }, { category: 'AppServiceHTTPLogs', enabled: true }]
  }
}

// ---------- availability alert on /health ----------
resource alertGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-${name}'
  location: 'global'
  tags: tags
  properties: { groupShortName: 'tgs-${take(env, 4)}', enabled: true, emailReceivers: [{ name: 'owner', emailAddress: alertEmail, useCommonAlertSchema: true }] }
}

resource healthTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: 'health-${name}'
  location: location
  tags: union(tags, { 'hidden-link:${insights.id}': 'Resource' })
  kind: 'standard'
  properties: {
    SyntheticMonitorId: 'health-${name}'
    Name: 'API health'
    Kind: 'standard'
    Enabled: true
    Frequency: 300
    Timeout: 30
    RetryEnabled: true
    Locations: [{ Id: 'apac-sg-sin-azr' }, { Id: 'apac-hk-hkn-azr' }, { Id: 'emea-nl-ams-azr' }]
    Request: { RequestUrl: 'https://${api.properties.defaultHostName}/health', HttpVerb: 'GET' }
    ValidationRules: { ExpectedHttpStatusCode: 200, SSLCheck: true, SSLCertRemainingLifetimeCheck: 14 }
  }
}

resource healthAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-health-${name}'
  location: 'global'
  tags: tags
  properties: {
    severity: 1
    enabled: true
    scopes: [healthTest.id, insights.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: { 'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria', webTestId: healthTest.id, componentId: insights.id, failedLocationCount: 2 }
    actions: [{ actionGroupId: alertGroup.id }]
  }
}

output apiName string = api.name
output apiUrl string = 'https://${api.properties.defaultHostName}'
output apiStagingUrl string = 'https://${apiStaging.properties.defaultHostName}'
output registryName string = registry.name
output registryServer string = registry.properties.loginServer
output consoleName string = console.name
output consoleUrl string = 'https://${console.properties.defaultHostname}'
output keyVaultName string = vault.name
output databaseServer string = db.name
