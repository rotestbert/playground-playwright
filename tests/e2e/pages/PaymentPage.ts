import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';
import type { CardDetails } from '../../fixtures/checkout.js';

/**
 * POM for https://automationexercise.com/payment
 *
 * All inputs use [data-qa] attributes — the stable selectors on this site.
 */
export class PaymentPage extends BasePage {
  readonly pageHeading: Locator;

  readonly nameOnCardInput: Locator;
  readonly cardNumberInput: Locator;
  readonly cvcInput: Locator;
  readonly expiryMonthInput: Locator;
  readonly expiryYearInput: Locator;
  readonly payButton: Locator;

  constructor(page: Page) {
    super(page);

    this.pageHeading = page.getByRole('heading', { name: /payment/i });

    this.nameOnCardInput = page.locator('[data-qa="name-on-card"]');
    this.cardNumberInput = page.locator('[data-qa="card-number"]');
    this.cvcInput = page.locator('[data-qa="cvc"]');
    this.expiryMonthInput = page.locator('[data-qa="expiry-month"]');
    this.expiryYearInput = page.locator('[data-qa="expiry-year"]');
    this.payButton = page.locator('[data-qa="pay-button"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/payment');
  }

  /** Fills every card field from a {@link CardDetails} object. */
  async fillCardDetails(card: CardDetails): Promise<void> {
    await this.nameOnCardInput.fill(card.nameOnCard);
    await this.cardNumberInput.fill(card.cardNumber);
    await this.cvcInput.fill(card.cvc);
    await this.expiryMonthInput.fill(card.expiryMonth);
    await this.expiryYearInput.fill(card.expiryYear);
  }

  /** Clicks "Pay and Confirm Order" without filling any fields. */
  async submitEmpty(): Promise<void> {
    await this.payButton.click();
  }

  /** Fills all fields and submits. */
  async fillAndConfirm(card: CardDetails): Promise<void> {
    await this.fillCardDetails(card);
    await this.payButton.click();
  }

  /**
   * Returns the tab order of the five card inputs as an array of
   * [data-qa] values — used by accessibility tests to assert correct focus order.
   */
  async getTabOrder(): Promise<string[]> {
    const inputs = [
      this.nameOnCardInput,
      this.cardNumberInput,
      this.cvcInput,
      this.expiryMonthInput,
      this.expiryYearInput,
    ];
    const order: string[] = [];
    for (const input of inputs) {
      const qa = await input.getAttribute('data-qa');
      if (qa) order.push(qa);
    }
    return order;
  }
}
