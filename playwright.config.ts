// End-to-end suite (docs/15). Runs against the demo servers; reuses them when they are already up.
//   npm run e2e            everything (console + phone projects)
//   npm run e2e:console    console project only (incl. cross-app and the demo script)
//   npm run e2e:phone      phone project only
//   npx playwright show-report
// URLs come from env so the same suite can point at a hosted demo later (D-054):
//   E2E_CONSOLE_URL (default http://localhost:5180) · E2E_PHONE_URL (8090) · E2E_API_URL (4000)
import { defineConfig, devices } from '@playwright/test';

const CONSOLE_URL = process.env.E2E_CONSOLE_URL ?? 'http://localhost:5180';
const PHONE_URL = process.env.E2E_PHONE_URL ?? 'http://localhost:8090';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const port = (url: string) => new URL(url).port;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  // One shared mock API: tests reset it, so they must not run in parallel.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'console',
      testMatch: /(console-smoke|journeys-console|cross-app|a11y-console|states-console|screens|demo-script)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: CONSOLE_URL, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      testMatch: /(journeys-phone|a11y-phone|states-phone)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: PHONE_URL, viewport: { width: 412, height: 915 }, isMobile: false, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w @tgs/mock-api',
      url: `${API_URL}/health`,
      env: { PORT: port(API_URL), MOCK_PERSIST: '0' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npm run dev -w @tgs/admin-console -- --port ${port(CONSOLE_URL)} --strictPort --open false`,
      url: CONSOLE_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `npx expo start --web --port ${port(PHONE_URL)}`,
      cwd: 'apps/member-app',
      url: PHONE_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
