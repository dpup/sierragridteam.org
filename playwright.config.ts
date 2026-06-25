import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the a11y + smoke test suites (tests/*.spec.ts).
 * Builds and serves the static site, then runs the checks against it.
 * Deterministic screenshots are a separate script (scripts/screenshots.ts).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && node_modules/.bin/astro preview --port 4321 --host',
        url: 'http://localhost:4321',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
