import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e configuration for Extriviate.
 *
 * Tests live in client/e2e/.
 *
 * Before running e2e tests, install Playwright browsers once:
 *   npx playwright install --with-deps
 *
 * Run with:
 *   npm run e2e            — headless, all projects
 *   npm run e2e:ui         — interactive Playwright UI
 *   npm run e2e:report     — open last HTML report
 *
 * The webServer config starts `ng serve` automatically. The full stack
 * (server + client) is needed for tests that call the API. Start the
 * server separately in CI or set PLAYWRIGHT_BASE_URL to an already-running
 * instance and set SKIP_WEB_SERVER=1 to bypass auto-start.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Fail CI run immediately when a test is accidentally left with .only
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4200',
    // Capture trace on first retry to assist with debugging failures
    trace: 'on-first-retry',
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Automatically start the Angular dev server when running locally.
  // In CI, start the server externally and point PLAYWRIGHT_BASE_URL at it.
  webServer: process.env['SKIP_WEB_SERVER']
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
