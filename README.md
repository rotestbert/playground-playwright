# playground-playwright

AI driven Playwright Test Automation Project

## Project Structure

```
playground-playwright/
├── playwright.config.ts        # E2E config (Chromium, Firefox, WebKit, GraphQL)
├── vitest.config.ts            # Unit test config (coverage, aliases)
├── tsconfig.json               # Strict TypeScript + path aliases
├── package.json                # Scripts + deps
├── scripts/
│   ├── seed.ts                 # Seed test data into the environment
│   └── cleanup.ts              # Remove seeded test data
├── src/
│   ├── factories/              # Typed data factories (user, product, order, payment)
│   │   ├── index.ts
│   │   ├── adapter.ts
│   │   ├── types.ts
│   │   ├── user.factory.ts
│   │   ├── product.factory.ts
│   │   ├── order.factory.ts
│   │   └── payment.factory.ts
│   ├── services/
│   │   └── payment.service.ts  # Payment business logic
│   └── utils/
│       ├── string.ts           # truncate, toTitleCase, isValidEmail, slugify
│       └── array.ts            # chunk, unique, groupBy, sum
└── tests/
    ├── e2e/                    # Playwright browser tests
    │   ├── fixtures/index.ts   # Custom Playwright fixtures
    │   ├── pages/
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
    │   ├── example.spec.ts     # Smoke tests
    │   ├── pom.spec.ts         # POM pattern tests
    │   ├── auth.spec.ts        # Auth flows (register, login, logout)
    │   └── checkout.spec.ts    # End-to-end checkout flow
    ├── api/                    # REST API integration tests
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
    ├── graphql/                # GraphQL API tests
    │   ├── fixtures/graphql.ts
    │   ├── queries.spec.ts
    │   ├── mutations.spec.ts
    │   ├── subscriptions.spec.ts
    │   ├── validation.spec.ts
    │   └── n-plus-one.spec.ts
    ├── unit/                   # Vitest unit tests
    │   ├── string.test.ts
    │   ├── array.test.ts
    │   └── payment.service.test.ts
    ├── fixtures/               # Shared typed test data
    │   ├── api.ts
    │   ├── auth.ts
    │   └── checkout.ts
    └── helpers/                # Shared framework-agnostic utilities
        ├── apiClient.ts
        ├── authHelper.ts
        └── checkoutHelper.ts
```

## NPM Scripts

| Command | Description |
|---|---|
| `npm test` | Run unit tests, then E2E tests |
| `npm run test:unit` | Run all unit tests once (Vitest) |
| `npm run test:unit:watch` | Run Vitest in watch mode |
| `npm run test:unit:ui` | Open Vitest browser UI |
| `npm run test:unit:coverage` | Run unit tests with v8 coverage report |
| `npm run test:e2e` | Run all E2E tests (all browsers) |
| `npm run test:e2e:ui` | Open Playwright interactive UI mode |
| `npm run test:e2e:headed` | Run E2E tests with visible browser |
| `npm run test:e2e:debug` | Run E2E tests with step debugger |
| `npm run test:e2e:report` | Open last Playwright HTML report |
| `npm run test:e2e:codegen` | Record new tests via browser |
| `npm run test:graphql` | Run GraphQL tests only |
| `npm run test:graphql:ui` | Run GraphQL tests in Playwright UI mode |
| `npm run db:seed` | Seed test data into the environment |
| `npm run db:cleanup` | Remove seeded test data |

## Setup

Install dependencies and Playwright browsers:

```bash
npm install
npx playwright install
```

## Configuration

### Playwright (`playwright.config.ts`)

- **Base URL**: `https://automationexercise.com` (override with `BASE_URL` env var)
- **Browsers**: Chromium, Firefox, WebKit
- **Projects**: Separate `graphql` project for GraphQL test suite
- **Workers**: 4 (parallel execution)
- **Retries**: 2 on CI, 0 locally
- **Artifacts**: Screenshots and videos captured on failure; HTML report written to `playwright-report/`

### Vitest (`vitest.config.ts`)

- **Test files**: `tests/unit/**/*.test.ts`
- **Coverage**: v8 provider, 80% threshold on lines/branches/functions/statements
- **Coverage output**: `coverage/` (text, lcov, html)
- **Path aliases**: `@src/*` → `src/*`, `@tests/*` → `tests/*`

## Test Directory Conventions

### `tests/e2e/` — Playwright browser tests
Files must match `**/*.spec.ts`. These tests run against a real browser and cover user-facing flows end-to-end.

- Page interactions belong in `tests/e2e/pages/` as Page Object Model classes extending `BasePage`.
- Always import `test` and `expect` from `tests/e2e/fixtures/index.ts`, not directly from `@playwright/test`. This ensures custom fixtures (e.g. `isCi`) are available everywhere.
- One spec file per feature or user journey; keep specs focused and independent.

### `tests/api/` — REST API integration tests
Files must match `**/*.spec.ts`. These tests exercise HTTP endpoints directly without a browser.

- Organise by resource: `users.spec.ts`, `auth.spec.ts`, `products.spec.ts`, etc.
- Use the `BASE_URL` env var (defaults to `https://automationexercise.com`).
- Assert on status codes, response shapes, and error bodies — not UI state.

### `tests/graphql/` — GraphQL API tests
Files must match `**/*.spec.ts`. These tests run under the dedicated `graphql` Playwright project.

- Cover queries, mutations, subscriptions, validation errors, and N+1 performance.
- Shared GraphQL client fixture lives in `tests/graphql/fixtures/graphql.ts`.

### `tests/unit/` — Vitest unit tests
Files must match `**/*.test.ts`. These tests cover pure functions and business logic in `src/` with no browser or network involvement.

- Mirror the `src/` folder structure: `src/services/payment.service.ts` → `tests/unit/payment.service.test.ts`.
- Keep tests fast and side-effect-free. Mock external dependencies at the module boundary.
- Maintain the 80% coverage threshold (lines, branches, functions, statements).

### `tests/fixtures/` — Shared test data
Typed constants and factory-backed data shared across test types.

- Export typed constants or factory functions; keep data minimal and intention-revealing.
- Name files after the domain concept they represent (`auth.ts`, `checkout.ts`, `api.ts`).

### `tests/helpers/` — Shared utilities
Helper functions reused across `e2e/`, `unit/`, and `api/`.

- Helpers must be pure and have no side effects.
- Do not import Playwright or Vitest APIs here — keep helpers framework-agnostic.

### `src/factories/` — Data factories
Typed factory functions for generating test entities (users, products, orders, payments).

- Built with `@faker-js/faker` for realistic randomised data.
- Use factories in fixtures and seed scripts to keep test data consistent and maintainable.

### `scripts/` — Data management scripts
- `db:seed` — populate the environment with baseline test data before a test run.
- `db:cleanup` — tear down seeded data after a test run.

## Best Practices

- **Page Object Model (POM)**: All E2E page interactions are encapsulated in classes under `tests/e2e/pages/`, extending `BasePage`.
- **Custom fixtures**: Shared Playwright setup lives in `tests/e2e/fixtures/index.ts` — import `test` and `expect` from there, not directly from `@playwright/test`.
- **Factory system**: Use `src/factories/` to generate typed test data rather than hard-coding values inline.
- **Strict TypeScript**: `strict` mode + `noUncheckedIndexedAccess` enabled.
- **CI-aware config**: Playwright automatically sets `forbidOnly` and increases retries when `CI=true`.
