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

    /**
     * GraphQL project — no browser. Runs tests/graphql/ specs via Playwright's
     * request context (HTTP) and the ws package (WebSocket subscriptions).
     *
     * Required env vars:
     *   GRAPHQL_URL      — HTTP GraphQL endpoint  (default: http://localhost:4000/graphql)
     *   GRAPHQL_WS_URL   — WebSocket endpoint      (default: ws://localhost:4000/graphql)
     *   GQL_USER_TOKEN   — valid USER-role Bearer token
     *   GQL_ADMIN_TOKEN  — valid ADMIN-role Bearer token
     *   GQL_USER_ID      — ID of the user behind GQL_USER_TOKEN
     *   GQL_USER_ORDER_ID— ID of an order owned by that user
     *   GQL_PRODUCT_ID   — ID of any seeded product
     *   GQL_CATEGORY_ID  — ID of any seeded category
     */
    {
      name: 'graphql',
      testDir: './tests/graphql',
      use: {
        baseURL: process.env['GRAPHQL_URL'] ?? 'http://localhost:4000/graphql',
        extraHTTPHeaders: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    },
  ],
});
