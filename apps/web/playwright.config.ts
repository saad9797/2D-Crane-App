import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end test against the real API and a real PostgreSQL.
 * Precondition: the database is running and migrated (`npm run setup`, then `npm run db:up` or `npm run db:embedded`).
 * The two dev servers are started here unless they are already running.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'npm run dev -w @crane/api', cwd: '../..', url: 'http://localhost:4000/api/v1/health', reuseExistingServer: true, timeout: 120_000 },
    { command: 'npm run dev -w @crane/web', cwd: '../..', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
