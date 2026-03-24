# Page Object Model — Reference Templates

## BasePage (do not modify — extend it)

```typescript
// tests/e2e/pages/BasePage.ts
import { type Page, type Locator } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  abstract goto(): Promise<void>;

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async waitForVisible(locator: Locator): Promise<void> {
    await locator.waitFor({ state: 'visible' });
  }
}
```

---

## Page Object Template

```typescript
// tests/e2e/pages/FeaturePage.ts
import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * POM for <URL or description of the page>
 *
 * Brief description of what this page does.
 */
export class FeaturePage extends BasePage {
  // ── Section heading (group locators by UI region) ──────────────────────────
  readonly pageHeading: Locator;

  // ── Form inputs ────────────────────────────────────────────────────────────
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  // ── Error / feedback states ────────────────────────────────────────────────
  readonly errorMessage: Locator;
  readonly successBanner: Locator;

  constructor(page: Page) {
    super(page);

    // Selector priority:
    //   1. data-qa / data-testid  →  page.locator('[data-qa="..."]')
    //   2. Role-based             →  page.getByRole('button', { name: '...' })
    //   3. Text content           →  page.getByText('...') / page.locator('p', { hasText: '...' })
    //   4. ID / stable attribute  →  page.locator('#id')
    //   NEVER: CSS class selectors, XPath

    this.pageHeading   = page.getByRole('heading', { name: 'Page Heading' });
    this.emailInput    = page.locator('[data-qa="email"]');
    this.passwordInput = page.locator('[data-qa="password"]');
    this.submitButton  = page.locator('[data-qa="submit-button"]');
    this.errorMessage  = page.locator('p', { hasText: 'Error text here' });
    this.successBanner = page.locator('[data-qa="success-banner"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/route');
  }

  /**
   * Composite action: fills the form and submits it.
   * Encapsulate multi-step interactions as named methods.
   */
  async fillAndSubmit(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

---

## Spec File Template

```typescript
// tests/e2e/feature-name.spec.ts
import { test, expect } from './fixtures/index.js';
import { FeaturePage } from './pages/FeaturePage.js';
// Import other pages navigated to as a result of actions on this page

// ─────────────────────────────────────────────────────────────────────────────
// User Story 1: <As a [role], I can [action]>
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Happy Path — <primary flow description>', () => {
  test('completes <action> successfully', async ({ page }) => {
    const featurePage = new FeaturePage(page);

    await featurePage.goto();
    await featurePage.fillAndSubmit('user@example.com', 'Password123');

    await expect(page).toHaveURL(/expected-route/);
    await expect(featurePage.successBanner).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error States
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Error States', () => {
  test('shows error for <invalid condition>', async ({ page }) => {
    const featurePage = new FeaturePage(page);

    await featurePage.goto();
    await featurePage.fillAndSubmit('bad-input', 'wrong');

    await expect(featurePage.errorMessage).toBeVisible();
    await expect(featurePage.errorMessage).toHaveText('Exact error message text');
    await expect(page).toHaveURL(/current-route/); // no navigation on error
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edge Cases', () => {
  test('empty form submission is blocked by validation', async ({ page }) => {
    const featurePage = new FeaturePage(page);

    await featurePage.goto();
    await featurePage.submitButton.click();

    await expect(page).toHaveURL(/current-route/);
    await expect(featurePage.emailInput).toBeFocused();
  });
});
```

---

## Fixtures Template

```typescript
// Addition to tests/e2e/fixtures/index.ts
export const test = base.extend<{
  /**
   * Short description of what this fixture provides.
   *
   * - Before test: setup steps
   * - After test: teardown steps
   */
  myFixture: MyFixtureType;
}>({
  myFixture: async ({ page }, use) => {
    // ── Setup ──────────────────────────────────────────────────────────────
    const data = await setupSomething(page);

    await use(data);

    // ── Teardown ────────────────────────────────────────────────────────────
    try {
      await cleanupSomething(page, data);
    } catch {
      // Best-effort cleanup; swallow errors so the test result is not masked
    }
  },
});
```

---

## Data Factory Template

```typescript
// tests/fixtures/domain.ts

export interface DomainEntity {
  id: string;
  name: string;
  // ...
}

/**
 * Generates a unique entity on every call.
 * Uses Date.now() so concurrent workers never collide.
 */
export function generateEntity(): DomainEntity {
  const id = Date.now();
  return {
    id: `entity-${id}`,
    name: `Test Entity ${id}`,
  };
}

/** Pre-built constants for fixed test data (happy path, invalid, boundary). */
export const VALID_ENTITY: DomainEntity = {
  id: 'valid-001',
  name: 'Valid Name',
};

export const INVALID_ENTITY: DomainEntity = {
  id: '',
  name: '',
};
```
