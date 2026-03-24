import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * POM for https://automationexercise.com/payment_done
 * Shown after a successful payment.
 */
export class OrderConfirmedPage extends BasePage {
  /** "Order Placed!" success heading */
  readonly successHeading: Locator;

  /** Green success paragraph shown below the heading */
  readonly successMessage: Locator;

  readonly downloadInvoiceButton: Locator;
  readonly continueButton: Locator;

  constructor(page: Page) {
    super(page);

    this.successHeading = page.locator('[data-qa="order-placed"]');
    this.successMessage = page.locator('#form > div > div > p');
    this.downloadInvoiceButton = page.locator('[data-qa="download-invoice"]');
    this.continueButton = page.getByRole('link', { name: /continue/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/payment_done');
  }

  async continue(): Promise<void> {
    await this.continueButton.click();
  }
}
