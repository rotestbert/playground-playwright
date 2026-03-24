# Testing Conventions
## Test Generation Rules
- Always use Page Object Model for E2E tests
- Prefer data-test-id selectors: `[data-testid="login-button"]`
- Fall back to role-based: `getByRole('button', { name: 'Login' })`
- NEVER use CSS class selectors or XPath
- Every test must be independent — no shared state between tests
- Use beforeEach for setup, afterEach for cleanup
## Assertion Standards
- Test behavior, not implementation
- Include both positive and negative test cases
- Always assert specific values, not just truthiness
- Include error message assertions for negative cases
## File Naming
- E2E: `feature-name.spec.ts` (e.g., `checkout-flow.spec.ts`)
- Unit: `module-name.test.ts` (e.g., `payment-service.test.ts`)
- Page Objects: `page-name.page.ts` (e.g., `login.page.ts`)
## Running Tests
- `npm run test:unit` — Vitest unit tests
- `npm run test:e2e` — Playwright E2E (headless)
- `npm run test:e2e:ui` — Playwright with UI mode
- `npm run test:api` — API tests
- `npm run test:coverage` — Coverage report
