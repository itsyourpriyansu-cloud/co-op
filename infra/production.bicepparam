// Production: the society's live data. About 600 members fit one small instance (docs/23).
using './main.bicep'

param env = 'production'
param prefix = readEnvironmentVariable('TGS_PREFIX', 'tgsecc')
param appSku = 'P0v3'
param dbSku = 'Standard_D2ds_v5'
param dbTier = 'GeneralPurpose'
param dbStorageGb = 64
param dbBackupDays = 35
param dbAdminPassword = readEnvironmentVariable('TGS_DB_ADMIN_PASSWORD')
param alertEmail = readEnvironmentVariable('TGS_ALERT_EMAIL')
param imageTag = readEnvironmentVariable('TGS_IMAGE_TAG', 'initial')
param extraCorsOrigins = readEnvironmentVariable('TGS_EXTRA_CORS', '')
param whatsappPhoneNumberId = readEnvironmentVariable('TGS_WHATSAPP_PHONE_NUMBER_ID', '')
