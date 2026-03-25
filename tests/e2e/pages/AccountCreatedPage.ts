import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * POM for https://automationexercise.com/account_created
 * Displayed after successful registration.
 */
export class AccountCreatedPage extends BasePage {
  readonly heading: Locator;
  readonly successMessage: Locator;
  readonly continueButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /account created/i });
    this.successMessage = page.getByText('Congratulations!', { exact: false });
    this.continueButton = page.locator('[data-qa="continue-button"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/account_created');
  }

  /** Click Continue to proceed to the home page as a logged-in user. */
  async continue(): Promise<void> {
    await this.continueButton.scrollIntoViewIfNeeded();
    await this.continueButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.continueButton.click();
  }
}
