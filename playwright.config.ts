// E2E + visual smoke tests for the Admin Console (docs/15). Boots the mock API and the console itself.
//   npm run e2e            run headless
//   npx playwright show-report
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'console-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npm run start -w @tgs/mock-api',
      url: 'http://localhost:4000/health',
      env: { PORT: '4000', MOCK_LATENCY: '0', MOCK_PERSIST: '0' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @tgs/admin-console -- --port 5173 --strictPort --open false',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
