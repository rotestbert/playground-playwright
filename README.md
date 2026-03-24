# playground-playwright

AI driven Playwright Test Automation Project

## Project Structure

```
playground-playwright/
├── playwright.config.ts        # E2E config (Chromium, Firefox, WebKit)
├── vitest.config.ts            # Unit test config (coverage, aliases)
├── tsconfig.json               # Strict TypeScript + path aliases
├── package.json                # Scripts + deps
├── src/
│   └── utils/
│       ├── string.ts           # truncate, toTitleCase, isValidEmail, slugify
│       └── array.ts            # chunk, unique, groupBy, sum
└── tests/
    ├── e2e/                    # Playwright browser tests
    │   ├── fixtures/index.ts   # Custom Playwright fixtures
    │   ├── pages/
    │   │   ├── BasePage.ts     # Abstract POM base class
    │   │   └── HomePage.ts     # Automation Exercise home page object
    │   ├── example.spec.ts     # Basic E2E smoke tests
    │   └── pom.spec.ts         # POM-pattern E2E tests
    ├── unit/                   # Vitest unit tests
    │   ├── string.test.ts      # String utility unit tests
    │   └── array.test.ts       # Array utility unit tests
    ├── api/                    # API-level integration tests
    ├── fixtures/               # Shared test data (JSON, mocks, seeds)
    └── helpers/                # Shared utilities used across test types
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
Files must match `**/*.spec.ts`. These tests run against a real browser and should cover user-facing flows end-to-end.

- Page interactions belong in `tests/e2e/pages/` as Page Object Model classes extending `BasePage`.
- Always import `test` and `expect` from `tests/e2e/fixtures/index.ts`, not directly from `@playwright/test`. This ensures custom fixtures (e.g. `isCi`) are available everywhere.
- One spec file per feature or user journey; keep specs focused and independent.

### `tests/unit/` — Vitest unit tests
Files must match `**/*.test.ts`. These tests cover pure functions and business logic in `src/` with no browser or network involvement.

- Mirror the `src/` folder structure: `src/utils/string.ts` → `tests/unit/string.test.ts`.
- Keep tests fast and side-effect-free. Mock external dependencies at the module boundary.
- Maintain the 80% coverage threshold (lines, branches, functions, statements).

### `tests/api/` — API integration tests
Files must match `**/*.spec.ts` or `**/*.test.ts`. These tests exercise HTTP endpoints directly, without a browser, using `fetch` or a dedicated API client.

- Organise by resource or route: `tests/api/users.spec.ts`, `tests/api/auth.spec.ts`.
- Use the `BASE_URL` env var (defaults to `https://automationexercise.com`) so tests point at the right environment.
- Assert on status codes, response shapes, and error bodies — not on UI state.

### `tests/fixtures/` — Shared test data
Static data shared across test types: JSON payloads, seed objects, mock API responses.

- Export typed constants or factory functions; never import from `src/` production code here.
- Keep data minimal and intention-revealing. Name files after the domain concept they represent (e.g. `users.ts`, `products.json`).

### `tests/helpers/` — Shared utilities
Helper functions and custom assertions reused across `e2e/`, `unit/`, and `api/`.

- Helpers must be pure and have no side effects.
- Do not import Playwright or Vitest APIs here — keep helpers framework-agnostic so they can be used in any test type.
- Example uses: date formatters for assertions, URL builders, response shape validators.

## Best Practices

- **Page Object Model (POM)**: All E2E page interactions are encapsulated in classes under `tests/e2e/pages/`, extending `BasePage`.
- **Custom fixtures**: Shared Playwright setup lives in `tests/e2e/fixtures/index.ts` — import `test` and `expect` from there, not directly from `@playwright/test`.
- **Strict TypeScript**: `strict` mode + `noUncheckedIndexedAccess` enabled.
- **CI-aware config**: Playwright automatically sets `forbidOnly` and increases retries when `CI=true`.
