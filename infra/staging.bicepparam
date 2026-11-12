// Staging: fictional data only, smaller sizes. Secrets come from the environment at deploy time.
using './main.bicep'

param env = 'staging'
param prefix = readEnvironmentVariable('TGS_PREFIX', 'tgsecc')
param appSku = 'P0v3'
param dbSku = 'Standard_B1ms'
param dbTier = 'Burstable'
param dbBackupDays = 7
param dbAdminPassword = readEnvironmentVariable('TGS_DB_ADMIN_PASSWORD')
param alertEmail = readEnvironmentVariable('TGS_ALERT_EMAIL')
param imageTag = readEnvironmentVariable('TGS_IMAGE_TAG', 'initial')
param whatsappPhoneNumberId = readEnvironmentVariable('TGS_WHATSAPP_PHONE_NUMBER_ID', '')
