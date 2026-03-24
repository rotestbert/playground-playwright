# playwright-test-gen

Generates Playwright E2E tests following our project conventions, using Page Object Model and data-test-id selectors.

## How to invoke

```
/playwright-test-gen <target>
```

`<target>` can be:
- A page URL or route (e.g. `/products`, `/checkout`)
- A page object file (e.g. `tests/e2e/pages/LoginPage.ts`)
- A feature name (e.g. "search", "password reset")

---

## What this skill does — step by step

### 1. Analyse the target

- If given a URL/route: navigate to it and inspect the DOM for `data-qa`, `data-testid`, roles, and labels.
- If given an existing Page Object: read it and the spec files that import it to understand current coverage.
- If given a feature name: search the codebase for related pages, specs, and helpers.

Identify:
- All interactive elements (inputs, buttons, links, modals)
- Stable selectors in priority order: `data-qa` / `data-testid` → role → text → CSS (last resort, never XPath)
- Existing coverage gaps

### 2. Generate the Page Object class

- Extend `BasePage` (`tests/e2e/pages/BasePage.ts`)
- File name: `<PageName>.page.ts` → place in `tests/e2e/pages/`
- Declare all locators as `readonly` class fields, initialised in the constructor
- Implement `goto()` and any composite action methods (e.g. `login()`, `fillAndSubmit()`)
- See `reference.md` for the canonical template

### 3. Generate the spec file

- File name: `<feature-name>.spec.ts` → place in `tests/e2e/`
- Import from `./fixtures/index.js` (not directly from `@playwright/test`) to get project fixtures
- Structure `test.describe` blocks by **User Story** / scenario group
- Mandatory test groups:
  | Group | Contents |
  |---|---|
  | Happy Path | Every primary success flow |
  | Error States | Invalid input, missing fields, server errors |
  | Edge Cases | Boundary values, empty states, session edge cases |
  | Security (if auth-related) | SQL injection, XSS payloads, long strings |
  | Accessibility | Keyboard navigation, focus order, labels |
  | Responsive | Mobile viewport (`375×667`) for UI-heavy pages |

- Each test must be **fully independent** — no shared mutable state
- Use `beforeEach` for navigation setup, `afterEach` for cleanup only if teardown cannot be done inline
- Assert **specific values**, not just truthiness; include error message text in negative assertions

### 4. Generate fixtures (if needed)

- If the feature needs new test data factories or reusable setup, add them to `tests/fixtures/<domain>.ts`
- If the feature needs new Playwright fixture extensions (`test.extend`), add them to `tests/e2e/fixtures/index.ts`
- Follow the pattern in `tests/e2e/fixtures/index.ts`: setup → `use(value)` → teardown

### 5. Run and fix

```bash
npm run test:e2e -- --grep "<feature>"
```

- Fix any failures before returning — do not leave broken tests
- If a test relies on behaviour the site doesn't implement yet, mark it `test.fixme(...)` with a comment explaining why
- After all tests pass, run `npm run test:e2e` (full suite) to confirm no regressions

---

## Hard rules (from CLAUDE.md)

- **Never** use CSS class selectors or XPath
- **Never** share state between tests
- **Always** use `data-qa` / `data-testid` selectors first; fall back to `getByRole`
- **Always** assert specific values (`.toHaveText('exact text')`, not `.toBeVisible()` alone for content)
- File naming: `feature-name.spec.ts`, `PageName.page.ts`
- Run tests with: `npm run test:e2e`
