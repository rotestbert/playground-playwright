# playground-playwright

AI-driven Playwright test automation framework covering E2E, API, GraphQL, visual regression, accessibility (WCAG 2.1 AA), and performance (Core Web Vitals + load testing).

## Project Structure

```
playground-playwright/
├── playwright.config.ts         # Multi-project Playwright config
├── vitest.config.ts             # Unit test config (coverage, aliases)
├── tsconfig.json                # Strict TypeScript + path aliases
├── package.json                 # Scripts + deps
├── eslint.config.js             # ESLint + custom test-conventions plugin
├── scripts/
│   ├── seed.ts                  # Seed test data into the environment
│   ├── cleanup.ts               # Remove seeded test data
│   └── update-snapshots.sh      # Regenerate visual regression baselines
├── src/
│   ├── factories/               # Typed data factories (user, product, order, payment)
│   │   ├── index.ts
│   │   ├── adapter.ts
│   │   ├── types.ts
│   │   ├── user.factory.ts
│   │   ├── product.factory.ts
│   │   ├── order.factory.ts
│   │   └── payment.factory.ts
│   ├── services/
│   │   └── payment.service.ts   # Payment business logic
│   └── utils/
│       ├── string.ts            # truncate, toTitleCase, isValidEmail, slugify
│       └── array.ts             # chunk, unique, groupBy, sum
└── tests/
    ├── e2e/                     # Playwright browser tests
    │   ├── fixtures/index.ts    # Custom fixtures (GDPR handler, auth, checkout)
    │   ├── pages/               # Page Object Model classes
    │   │   ├── BasePage.ts
    │   │   ├── HomePage.ts
    │   │   ├── LoginPage.ts
    │   │   ├── RegisterPage.ts
    │   │   ├── AccountCreatedPage.ts
    │   │   ├── DashboardPage.ts
    │   │   ├── ProductsPage.ts
    │   │   ├── CartPage.ts
    │   │   ├── CheckoutPage.ts
    │   │   ├── PaymentPage.ts
    │   │   └── OrderConfirmedPage.ts
    │   ├── example.spec.ts      # Smoke tests
    │   ├── pom.spec.ts          # POM pattern tests
    │   ├── auth.spec.ts         # Auth flows (register, login, logout, security)
    │   └── checkout.spec.ts     # End-to-end checkout + accessibility + responsive
    ├── accessibility/           # WCAG 2.1 AA accessibility tests
    │   └── accessibility.spec.ts
    ├── performance/             # Core Web Vitals + API load tests
    │   ├── page-performance.spec.ts
    │   └── api-load.spec.ts
    ├── visual/                  # Visual regression tests
    │   ├── visual-regression.spec.ts
    │   ├── visual-reset.css
    │   └── __snapshots__/       # Committed PNG baselines (Chromium)
    ├── api/                     # REST API integration tests
    │   ├── account.spec.ts
    │   ├── auth.spec.ts
    │   ├── brands.spec.ts
    │   ├── concurrency.spec.ts
    │   ├── file-upload.spec.ts
    │   ├── login.spec.ts
    │   ├── pagination.spec.ts
    │   ├── products.spec.ts
    │   ├── rate-limiting.spec.ts
    │   ├── search.spec.ts
    │   └── users.spec.ts
    ├── graphql/                 # GraphQL API tests
    │   ├── fixtures/graphql.ts
    │   ├── queries.spec.ts
    │   ├── mutations.spec.ts
    │   ├── subscriptions.spec.ts
    │   ├── validation.spec.ts
    │   └── n-plus-one.spec.ts
    ├── unit/                    # Vitest unit tests
    │   ├── string.test.ts
    │   ├── array.test.ts
    │   └── payment.service.test.ts
    ├── fixtures/                # Shared typed test data
    │   ├── api.ts
    │   ├── auth.ts
    │   └── checkout.ts
    └── helpers/                 # Shared utilities
        ├── apiClient.ts
        ├── authHelper.ts
        ├── checkoutHelper.ts
        ├── a11yHelper.ts        # Accessibility report utilities
        └── perfReporter.ts      # Performance metrics + HTML report generator
```

## NPM Scripts

### General

| Command | Description |
|---|---|
| `npm test` | Run unit tests then E2E tests |
| `npm run lint:tests` | Lint all spec and test files |
| `npm run lint:tests:fix` | Auto-fix lint issues |
| `npm run db:seed` | Seed test data into the environment |
| `npm run db:cleanup` | Remove seeded test data |

### Unit Tests (Vitest)

| Command | Description |
|---|---|
| `npm run test:unit` | Run all unit tests once |
| `npm run test:unit:watch` | Run Vitest in watch mode |
| `npm run test:unit:ui` | Open Vitest browser UI |
| `npm run test:unit:coverage` | Run unit tests with v8 coverage report |

### E2E Tests (Playwright — all browsers)

| Command | Description |
|---|---|
| `npm run test:e2e` | Run all E2E tests (Chromium, Firefox, WebKit) |
| `npm run test:e2e:ui` | Open Playwright interactive UI mode |
| `npm run test:e2e:headed` | Run E2E tests with a visible browser |
| `npm run test:e2e:debug` | Run E2E tests with the step debugger |
| `npm run test:e2e:report` | Open the last Playwright HTML report |
| `npm run test:e2e:codegen` | Record new tests via browser |

### Accessibility Tests

| Command | Description |
|---|---|
| `npm run test:a11y` | Run WCAG 2.1 AA audit + keyboard/screen reader/focus tests |
| `npm run test:a11y:ui` | Run accessibility tests in Playwright UI mode |
| `npm run test:a11y:report` | Run tests then open the HTML report |

### Performance Tests

| Command | Description |
|---|---|
| `npm run test:perf` | Run page load + API load tests and generate HTML report |
| `npm run test:perf:pages` | Run Core Web Vitals page tests only |
| `npm run test:perf:api` | Run API load tests only |
| `npm run test:perf:report` | Run tests then open the HTML report |

### Visual Regression Tests

| Command | Description |
|---|---|
| `npm run test:visual` | Run visual regression tests (Chromium only) |
| `npm run test:visual:ui` | Run visual tests in Playwright UI mode |
| `npm run test:visual:update` | Regenerate all baseline PNG snapshots |

### API / GraphQL Tests

| Command | Description |
|---|---|
| `npm run test:api` | Run REST API integration tests |
| `npm run test:graphql` | Run GraphQL tests only |
| `npm run test:graphql:ui` | Run GraphQL tests in Playwright UI mode |

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs **10 jobs** across multiple triggers:

| Trigger | Jobs that run |
|---|---|
| Pull request (always) | Lint, Unit Tests & Coverage |
| Pull request + label `e2e` | + E2E (4 shards), API, Accessibility |
| Push to `main` | All of the above + Visual Regression |
| Nightly schedule (02:00 UTC) | Everything + Performance Tests |
| `workflow_dispatch` | Manual full run (performance optional) |

**Job summary:**

| # | Job | Notes |
|---|---|---|
| 1 | Lint | ESLint with custom test-conventions plugin |
| 2 | Unit Tests & Coverage | 80 % threshold gate; uploads `coverage-report` artifact |
| 3 | E2E Tests | 4 shards × (Chromium + Firefox + WebKit); blob reports merged |
| 4 | Merge E2E Reports | Combines shard blobs into one HTML report |
| 5 | API Tests | Playwright request context; no browser required |
| 6 | Accessibility Tests | WCAG 2.1 AA; uploads `accessibility-report` |
| 7 | Visual Regression | Pixel-diff against committed baselines (push/schedule only) |
| 8 | Performance Tests | Core Web Vitals + load tests; 30-day artifact retention |
| 9 | PR Comment | Upserts a sticky comment with results + coverage breakdown |
| 10 | Slack Notification | Fires when any job fails (`SLACK_WEBHOOK_URL` secret required) |

**Required secrets:**

| Secret | Purpose |
|---|---|
| `SLACK_WEBHOOK_URL` | Incoming Webhook URL for failure alerts |
| `BASE_URL` | Override test target (default: `https://automationexercise.com`) |

## Claude Code Integration

The project ships with Claude Code agents and skills for AI-assisted test development.

### Agents (`.claude/agents/`)

Agents run autonomously on complex, multi-step tasks:

| Agent | Invocation | Description |
|---|---|---|
| `test-reporter` | `claude --agent test-reporter` | Runs the full test suite, identifies flaky/slow tests, reports per-module coverage, writes `test-report.md` |
| `test-fixer` | `claude --agent test-fixer` | Analyzes test failures, fixes stale selectors, bad assertions, and flaky waits, then re-runs to verify |

### Skills (`.claude/skills/`)

Skills are slash commands invoked within a Claude Code session:

| Skill | Invocation | Description |
|---|---|---|
| `playwright-test-gen` | `/playwright-test-gen <target>` | Generates Playwright E2E tests using POM and `data-testid` selectors following project conventions |
| `api-test-gen` | `/api-test-gen <target>` | Generates Playwright request-context API tests from Express/Fastify route handlers |
| `coverage-analyzer` | `/coverage-analyzer [threshold=<pct>]` | Finds files below threshold, generates targeted tests to fill gaps, re-runs and reports improvement |

## Setup

Install dependencies and Playwright browsers:

```bash
npm install
npx playwright install
```

## Configuration

### Playwright (`playwright.config.ts`)

The config defines **8 projects**, each with its own `testDir`, browser, timeout, and worker settings:

| Project | Browser | testDir | Workers | Retries |
|---|---|---|---|---|
| `chromium` | Chromium | `tests/e2e` | 4 | 1 local / 2 CI |
| `firefox` | Firefox | `tests/e2e` | 4 | 1 local / 2 CI |
| `webkit` | WebKit (Safari) | `tests/e2e` | 4 | 1 local / 2 CI |
| `api` | None (request only) | `tests/api` | 4 | 1 local / 2 CI |
| `graphql` | None (request + WS) | `tests/graphql` | 4 | 1 local / 2 CI |
| `performance` | Chromium | `tests/performance` | **1** | **0** |
| `accessibility` | Chromium | `tests/accessibility` | 4 | 1 |
| `visual` | Chromium | `tests/visual` | 4 | 1 |

**Global settings:**
- **Base URL**: `https://automationexercise.com` (override with `BASE_URL` env var)
- **Timeout**: 60 s standard; 90 s for accessibility; 120 s for performance and visual
- **Artifacts on failure**: screenshots, videos, traces (on first retry)
- **GDPR consent**: auto-dismissed via a Playwright locator handler in the custom `page` fixture

### Vitest (`vitest.config.ts`)

- **Test files**: `tests/unit/**/*.test.ts`
- **Coverage**: v8 provider, 80 % threshold on lines/branches/functions/statements
- **Coverage output**: `coverage/` (text, lcov, html)
- **Path aliases**: `@src/*` → `src/*`, `@tests/*` → `tests/*`

## Test Suites

### E2E Tests (`tests/e2e/`)

End-to-end user-journey tests across Chromium, Firefox, and WebKit.

- All page interactions live in `tests/e2e/pages/` as POM classes extending `BasePage`.
- Import `test` and `expect` from `tests/e2e/fixtures/index.ts` — never directly from `@playwright/test`. This ensures GDPR auto-dismiss, `registeredUser`, `authenticatedPage`, and `checkoutReadyPage` fixtures are available.
- `auth.spec.ts` covers registration, login, logout, post-login redirect, session management, and security edge cases (SQL injection, XSS payloads).
- `checkout.spec.ts` covers the full purchase flow, cart edge cases, inline accessibility checks, and responsive layouts at 375×667 px.

### Accessibility Tests (`tests/accessibility/`)

WCAG 2.1 AA compliance suite powered by [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright). Runs on Chromium.

**Test groups:**

| Group | Coverage |
|---|---|
| Automated WCAG 2.1 AA | axe-core audit (wcag2a/aa + wcag21a/aa tags) on all 6 pages |
| Keyboard Navigation | Tab order, Enter/Space activation, cart modal dismiss, payment form flow |
| Screen Reader Compatibility | Landmark regions, heading structure, form labels, alt text, dialog roles, `aria-live` regions |
| Focus Management | Visible focus indicators, focus trap into modals, focus return after close |
| A11y Report Generation | Serial scan of all pages → `playwright-report/a11y-report.md` |

**Report:** After running, `playwright-report/a11y-report.md` is written with violations grouped into **Critical / Serious / Moderate / Minor** sections, each with a description, affected element count, HTML snippet, and axe-core reference link.

**Helpers (`tests/helpers/a11yHelper.ts`):**
- `toViolationEntries()` — converts raw axe results into typed `ViolationEntry` records
- `formatViolations()` — formats violations as readable text for test failure messages
- `groupBySeverity()` — buckets violations by impact level
- `generateMarkdownReport()` — writes the final severity-grouped report

### Performance Tests (`tests/performance/`)

Runs on Chromium with **1 worker and 0 retries** to keep measurements free from parallelism noise.

#### Page Load Performance (`page-performance.spec.ts`)

Collects Core Web Vitals for every page using the browser's Performance API and `PerformanceObserver` with `buffered: true`:

| Metric | Threshold | Source |
|---|---|---|
| TTFB (Time to First Byte) | < 200 ms | `PerformanceNavigationTiming.responseStart` |
| FCP (First Contentful Paint) | < 1 500 ms | `paint` PerformanceObserver |
| LCP (Largest Contentful Paint) | < 2 500 ms | `largest-contentful-paint` observer (finalised via scroll) |
| CLS (Cumulative Layout Shift) | < 0.1 | `layout-shift` observer (accumulated, hadRecentInput filtered) |
| INP (Interaction to Next Paint) | < 200 ms | `event` observer after simulated click |

Pages tested: Home, Login, Products (public) and Cart, Checkout, Payment (via auth fixtures). Additional user-flow tests check CLS stability across the login redirect, add-to-cart modal, and full checkout funnel.

#### API Load Performance (`api-load.spec.ts`)

| Endpoint | Method | Concurrency | Threshold |
|---|---|---|---|
| `/api/productsList` | GET | 50 | p95 < 500 ms, p99 < 1 000 ms |
| `/api/brandsList` | GET | 50 | p95 < 500 ms, p99 < 1 000 ms |
| `/api/searchProduct` | POST | 50 | p95 < 2 000 ms, p99 < 3 000 ms |
| `/api/verifyLogin` | POST | 50 | p95 < 2 000 ms, p99 < 3 000 ms |
| `/api/productsList` | GET | 100 (spike) | p95 < 1 000 ms |

**Memory / degradation detection:** Each endpoint is also exercised across 5 rolling batches of 20 requests. The p95 of the first batch is compared with the last — a > 50 % increase is flagged as degraded (indicating server-side resource pressure). Node.js RSS growth > 50 MB is flagged as a potential test-runner memory leak.

**Helpers (`tests/helpers/perfReporter.ts`):**
- `computePercentiles()` — nearest-rank p50 / p95 / p99 from raw duration arrays
- `savePageMetrics()` / `saveApiMetrics()` — serialise results to `playwright-report/*.json`
- `generatePerfReport()` — reads both JSON files and writes `playwright-report/perf-report.html`

#### HTML Performance Report

`playwright-report/perf-report.html` is generated automatically at the end of each run. It contains:

1. **Summary cards** — pages tested, pass counts, API endpoints, leak flags
2. **Core Web Vitals table** — per-page TTFB/FCP/LCP/CLS/INP with green/amber/red PASS/FAIL badges
3. **TTFB / FCP / LCP chart** — grouped bar chart with dashed threshold lines (Chart.js)
4. **CLS / INP dual-axis chart** — layout shift score (left) + interaction latency (right)
5. **API percentiles table** — per-endpoint p50 / p95 / p99 with threshold badges and error-rate column
6. **API response time chart** — grouped p50 / p95 / p99 bars
7. **Error rate chart** — per-endpoint bar chart (green / amber / red)
8. **Memory analysis table** — RSS before/after/delta, p95 trend, degradation and leak flags

### Visual Regression Tests (`tests/visual/`)

Pixel-level screenshot comparison using Playwright's `toHaveScreenshot()`. Runs on Chromium only to ensure deterministic baselines.

- Baselines live in `tests/visual/__snapshots__/` and are committed to version control.
- Threshold: 0.1 % pixel ratio, 0.2 colour-distance tolerance (absorbs sub-pixel antialiasing).
- Animations and transitions are frozen via `visual-reset.css`.
- Update baselines with `npm run test:visual:update`.

### API Tests (`tests/api/`)

REST endpoint integration tests using Playwright's `request` fixture — no browser required.

- Organised by resource: `products.spec.ts`, `brands.spec.ts`, `users.spec.ts`, etc.
- Covers status codes, response schemas, pagination, concurrency, rate limiting, and file upload.
- Uses `generateApiUser()` from `tests/fixtures/api.ts` to create unique test accounts.

### GraphQL Tests (`tests/graphql/`)

Runs under the dedicated `graphql` Playwright project. Requires environment variables:

```
GRAPHQL_URL       # HTTP GraphQL endpoint  (default: http://localhost:4000/graphql)
GRAPHQL_WS_URL    # WebSocket endpoint     (default: ws://localhost:4000/graphql)
GQL_USER_TOKEN    # Valid USER-role Bearer token
GQL_ADMIN_TOKEN   # Valid ADMIN-role Bearer token
GQL_USER_ID       # ID of the user behind GQL_USER_TOKEN
GQL_USER_ORDER_ID # ID of an order owned by that user
GQL_PRODUCT_ID    # ID of any seeded product
GQL_CATEGORY_ID   # ID of any seeded category
```

Covers queries, mutations, real-time subscriptions (via `ws`), validation errors, and N+1 query detection.

### Unit Tests (`tests/unit/`)

Vitest tests for pure functions and business logic in `src/`. No browser or network.

- Mirror the `src/` folder structure.
- Coverage threshold: 80 % on lines, branches, functions, and statements.

## Conventions

### Selectors (in order of preference)

1. `[data-testid="…"]` or `[data-qa="…"]` — stable, intent-revealing
2. `getByRole('button', { name: '…' })` — accessible and robust
3. `getByText('…')` / `getByLabel('…')` — user-visible text
4. **Never** CSS class selectors or XPath

### Test Independence

Every test must be fully self-contained. Use `beforeEach` for setup and `afterEach` / fixture teardown for cleanup. No shared mutable state between tests.

### Assertions

- Test behaviour, not implementation details.
- Always assert specific values, not just truthiness (`expect(x).toBe(42)` not `expect(x).toBeTruthy()`).
- Include both positive and negative test cases.
- Include error message assertions for failure paths.

### File Naming

| Test type | Convention | Example |
|---|---|---|
| E2E | `feature-name.spec.ts` | `checkout-flow.spec.ts` |
| Accessibility | `feature-name.spec.ts` | `accessibility.spec.ts` |
| Performance | `concern-type.spec.ts` | `page-performance.spec.ts` |
| Unit | `module-name.test.ts` | `payment.service.test.ts` |
| Page Objects | `PageName.ts` | `LoginPage.ts` |

### Custom Fixtures (`tests/e2e/fixtures/index.ts`)

Always import `test` from the custom fixtures file — never from `@playwright/test` directly:

```typescript
// ✅ correct
import { test, expect } from '../fixtures/index.js';

// ❌ wrong — bypasses GDPR handler and custom fixtures
import { test, expect } from '@playwright/test';
```

Available fixtures:

| Fixture | Type | Description |
|---|---|---|
| `page` | `Page` | Standard page with GDPR consent auto-dismissed |
| `isCi` | `boolean` | `true` when `CI` env var is set |
| `registeredUser` | `UserCredentials` | Fresh account created + logged out; deleted in teardown |
| `authenticatedPage` | `Page` | Fresh account created + logged in on home page |
| `checkoutReadyPage` | `{ page, product }` | Authenticated page with one product already in the cart |

### TypeScript

- Strict mode + `noUncheckedIndexedAccess` enabled — all array/object access must be null-safe.
- Use `.js` extensions in all ESM imports (e.g. `import { foo } from './foo.js'`).
- `as` type assertions are allowed inside `page.evaluate()` for browser DOM types.
- CI fails the build if `test.only` is left in any file (`forbidOnly: true`).
