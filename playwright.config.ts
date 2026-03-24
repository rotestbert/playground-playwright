import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  /* Run tests in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],

  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,

  /* 4 workers for parallel execution */
  workers: 4,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env['BASE_URL'] ?? 'https://automationexercise.com',

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Output directory for test artifacts */
  outputDir: 'test-results',

  /* Configure projects for major browsers */
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
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /**
     * API project — no browser. Runs tests/api/ specs using Playwright's
     * request context only. testDir override restricts it to API specs so
     * browser projects never accidentally pick up API files and vice-versa.
     */
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: process.env['BASE_URL'] ?? 'https://automationexercise.com',
        extraHTTPHeaders: {
          Accept: 'application/json',
        },
      },
    },
  ],
});
