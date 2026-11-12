// G4 (D-114): the build-dependent parts of app.json.
// - Plain http (a laptop on the LAN) only in development builds; preview and store builds talk https only.
// - Face ID wording for the staff lock, and the notification icon.
// - The EAS project id from the environment when app.json does not have it yet (needed for push).
import type { ConfigContext, ExpoConfig } from 'expo/config';

// EAS sets EAS_BUILD_PROFILE during a cloud build; a local `expo start` / `expo run` counts as development.
const profile = process.env.EAS_BUILD_PROFILE;
const development = !profile || profile === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'TGSECCSL',
  slug: config.slug ?? 'tgseccsl-member',
  plugins: [
    ...(config.plugins ?? []),
    ['expo-build-properties', { android: { usesCleartextTraffic: development } }],
    ['expo-local-authentication', { faceIDPermission: 'Allow $(PRODUCT_NAME) to use Face ID to unlock the staff screens.' }],
    ['expo-notifications', { icon: './assets/android-icon-monochrome.png', color: '#0561E2', defaultChannel: 'default' }],
  ],
  extra: {
    ...config.extra,
    eas: { ...(config.extra?.eas as object | undefined), ...(process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : {}) },
  },
});
