import { defineConfig } from 'vitest/config';

// One test run for every pure-TypeScript workspace (packages + mock API).
// The Admin Console and Member App get their own UI test setups in later milestones.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/mock-api/src/**/*.test.ts'],
    environment: 'node',
    env: { MOCK_LATENCY: '0', MOCK_PERSIST: '0' },
  },
});
