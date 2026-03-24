import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * POM for https://automationexercise.com/view_cart
 */
export class CartPage extends BasePage {
  readonly cartRows: Locator;
  readonly proceedToCheckoutButton: Locator;

  // Modal shown when a guest clicks "Proceed to Checkout"
  readonly guestCheckoutModal: Locator;
  readonly guestModalLoginLink: Locator;
  readonly guestModalContinueButton: Locator;

  constructor(page: Page) {
    super(page);

    // Each <tr> in the cart table is one line item
    this.cartRows = page.locator('#cart_info_table tbody tr');

    // The button label is "Proceed To Checkout"
    this.proceedToCheckoutButton = page.locator('a.btn.check_out');

    this.guestCheckoutModal = page.locator('#checkoutModal');
    this.guestModalLoginLink = page.locator('#checkoutModal').getByRole('link', { name: /register.*login/i });
    this.guestModalContinueButton = page.locator('#checkoutModal').getByRole('button', { name: /continue on cart/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/view_cart');
  }

  /** Returns true when the cart table has at least one item row. */
  async hasItems(): Promise<boolean> {
    return (await this.cartRows.count()) > 0;
  }

  /** Returns the number of distinct line items in the cart. */
  async getItemCount(): Promise<number> {
    return this.cartRows.count();
  }

  /**
   * Returns the name of the product in the given row (0-indexed).
   * Reads from the product description cell.
   */
  async getItemName(rowIndex: number): Promise<string> {
    const text = await this.cartRows.nth(rowIndex).locator('.cart_description h4 a').textContent();
    return (text ?? '').trim();
  }

  /** Returns the displayed unit price for the given row (0-indexed). */
  async getItemPrice(rowIndex: number): Promise<string> {
    const text = await this.cartRows.nth(rowIndex).locator('.cart_price p').textContent();
    return (text ?? '').trim();
  }

  /** Returns the quantity value for the given row (0-indexed). */
  async getItemQuantity(rowIndex: number): Promise<string> {
    const text = await this.cartRows.nth(rowIndex).locator('.cart_quantity button').textContent();
    return (text ?? '').trim();
  }

  /** Clicks the delete (×) button for the given row and waits for it to disappear. */
  async removeItem(rowIndex: number): Promise<void> {
    const row = this.cartRows.nth(rowIndex);
    await row.locator('.cart_quantity_delete').click();
    await row.waitFor({ state: 'detached' });
  }

  /**
   * Clicks "Proceed To Checkout".
   * - If the user is logged in this navigates directly to /checkout.
   * - If the user is a guest the login modal appears instead.
   */
  async proceedToCheckout(): Promise<void> {
    await this.proceedToCheckoutButton.click();
  }
}
