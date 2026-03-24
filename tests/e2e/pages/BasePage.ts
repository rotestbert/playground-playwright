import { type Page, type Locator } from '@playwright/test';

/**
 * Base Page Object Model class.
 * All page objects should extend this class.
 */
export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to this page's URL */
  abstract goto(): Promise<void>;

  /** Wait for the page to be fully loaded */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /** Get the current page title */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /** Helper: wait for a locator to be visible */
  async waitForVisible(locator: Locator): Promise<void> {
    await locator.waitFor({ state: 'visible' });
  }
}
