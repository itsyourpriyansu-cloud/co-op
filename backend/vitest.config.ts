import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Backend tests run against TEST_DATABASE_URL (tgseccsl_test), never the dev database.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./tests/helpers/global-setup.ts'],
    // One database: test files run one after another.
    fileParallelism: false,
    env: { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL ?? '', MOCK_FALLBACK_URL: '' },
  },
});
