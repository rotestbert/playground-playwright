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

  /* Retry on CI; also retry once locally to tolerate external-site flakiness
     (the live automationexercise.com site occasionally redirects authenticated
     sessions under parallel load, causing checkout tests to time out). */
  retries: process.env['CI'] ? 2 : 1,

  /* 4 workers for parallel execution */
  workers: 4,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  /* Per-test timeout — increased to 60 s because fixture setup (register + login
     against a live external site) can take 15–25 s before the test body runs. */
  timeout: 60_000,

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

  /* ── Visual regression ──────────────────────────────────────────────────────
   * Global snapshot comparison settings used by toHaveScreenshot().
   * The 0.1 % pixel-ratio threshold is the CI gate; adjust per-assertion for
   * pages with inherently dynamic content (e.g. live prices). */
  expect: {
    toHaveScreenshot: {
      /* Maximum fraction of pixels allowed to differ before a test fails.
         0.001 = 0.1 % — tight enough to catch layout shifts, loose enough to
         tolerate sub-pixel antialiasing differences across OS/GPU combos. */
      maxDiffPixelRatio: 0.001,

      /* Per-pixel colour-distance tolerance (0–1). 0.2 absorbs minor
         antialiasing variations without masking real colour regressions. */
      threshold: 0.2,

      /* Freeze CSS/JS animations so frames are deterministic. */
      animations: 'disabled',

      /* Inject a CSS reset that forces zero animation/transition durations
         for any custom keyframes the global option misses. */
      stylePath: './tests/visual/visual-reset.css',
    },
  },

  /* Store snapshots next to the visual test directory so they are easy to
     review and commit. The {projectName} token keeps chromium/firefox/webkit
     baselines separate if additional browser projects are ever added. */
  snapshotPathTemplate:
    '{testDir}/__snapshots__/{testFileName}/{arg}-{projectName}{ext}',

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

    /**
     * Performance project — Chromium only, single worker, no retries.
     *
     * Measures Core Web Vitals (TTFB, FCP, LCP, CLS, INP) for every page
     * and load-tests each API endpoint at 50 concurrent requests.
     * Writes JSON artefacts + an HTML report with Chart.js charts to
     *   playwright-report/perf-report.html
     *
     * Run:  npm run test:perf
     */
    {
      name: 'performance',
      testDir: './tests/performance',
      /* 2 min per test — load tests (100 concurrent req) + Web Vitals
         collection (page.waitForTimeout calls) can take 90+ seconds. */
      timeout: 120_000,
      /* Never retry — flaky timing numbers skew percentile calculations. */
      retries: 0,
      /* Single worker so concurrent tests don't compete for network/CPU. */
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        /* Fixed viewport for reproducible LCP paint areas. */
        viewport: { width: 1_280, height: 720 },
        /* Disable screenshots/video — not needed for perf data collection. */
        screenshot: 'off',
        video: 'off',
        trace: 'off',
      },
    },

    /**
     * Accessibility project — Chromium only.
     *
     * Uses @axe-core/playwright to audit every page against WCAG 2.1 AA.
     * Also covers keyboard navigation, screen reader compatibility, and focus
     * management. Writes a severity-grouped markdown report to:
     *   playwright-report/a11y-report.md
     *
     * Run:  npm run test:a11y
     */
    {
      name: 'accessibility',
      testDir: './tests/accessibility',
      /* Authenticated fixture setup (register + login) adds 15-25 s before the
         test body; 90 s gives plenty of headroom for axe audits on top. */
      timeout: 90_000,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    /**
     * Visual regression project — Chromium only.
     *
     * Using a single browser guarantees consistent pixel-level baselines.
     * Snapshots live in tests/visual/__snapshots__/ and must be committed.
     *
     * Run:            npm run test:visual
     * Update bases:   npm run test:visual:update
     */
    {
      name: 'visual',
      testDir: './tests/visual',
      snapshotDir: './tests/visual/__snapshots__',
      /* Authenticated fixture setup (register + login + add-to-cart) adds
         15–25 s before the test body; allow 120 s so viewport loops don't OOT. */
      timeout: 120_000,
      use: {
        ...devices['Desktop Chrome'],
        /* Visual tests take their own screenshots — disable the global captures
           so we don't accumulate duplicates in test-results/. */
        screenshot: 'off',
        video: 'off',
        trace: 'off',
      },
    },
  ],
});
