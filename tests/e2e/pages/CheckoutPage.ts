import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * POM for https://automationexercise.com/checkout
 *
 * Shows the delivery address, billing address, and an order summary.
 * The user adds an optional comment then clicks "Place Order" to proceed
 * to payment.
 */
export class CheckoutPage extends BasePage {
  readonly pageHeading: Locator;

  // Address blocks
  readonly deliveryAddressBlock: Locator;
  readonly billingAddressBlock: Locator;

  // Delivery first name — used to verify the right account's address loaded
  readonly deliveryFirstName: Locator;

  // Order summary
  readonly orderSummaryRows: Locator;

  // Optional order comment
  readonly commentTextarea: Locator;

  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    super(page);

    this.pageHeading = page.getByRole('heading', { name: /checkout/i });

    this.deliveryAddressBlock = page.locator('#address_delivery');
    this.billingAddressBlock = page.locator('#address_invoice');

    // The delivery name lives inside the address block
    this.deliveryFirstName = page.locator('#address_delivery .address_firstname');

    this.orderSummaryRows = page.locator('#cart_info tbody tr');

    this.commentTextarea = page.locator('textarea.form-control');

    // "Place Order" is an <a> styled as a button
    this.placeOrderButton = page.getByRole('link', { name: /place order/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/checkout');
  }

  /** Returns the number of line items shown in the order summary. */
  async getOrderItemCount(): Promise<number> {
    return this.orderSummaryRows.count();
  }

  /** Optionally fills the comment box then clicks "Place Order". */
  async placeOrder(comment?: string): Promise<void> {
    if (comment) {
      await this.commentTextarea.fill(comment);
    }
    await this.placeOrderButton.click();
  }
}
