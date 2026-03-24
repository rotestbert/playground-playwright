import { type Page } from '@playwright/test';
import { ProductsPage } from '../e2e/pages/ProductsPage.js';
import { CartPage } from '../e2e/pages/CartPage.js';
import { CheckoutPage } from '../e2e/pages/CheckoutPage.js';
import { PaymentPage } from '../e2e/pages/PaymentPage.js';
import { type CardDetails, type AddedProduct, VALID_CARD } from '../fixtures/checkout.js';

/**
 * Navigates to /products, adds the first listed product to the cart,
 * and dismisses the confirmation modal (stays on the products page).
 *
 * Returns the product name and price so callers can assert on cart contents.
 * Use this in fixtures and beforeEach blocks — not in tests that are
 * specifically testing the products UI.
 */
export async function addFirstProductToCart(page: Page): Promise<AddedProduct> {
  const productsPage = new ProductsPage(page);
  await productsPage.goto();
  return productsPage.addFirstProductToCart();
}

/**
 * Navigates to /view_cart and clicks "Proceed to Checkout".
 * Assumes the user is already logged in; throws if the guest modal appears.
 */
export async function proceedToCheckoutFromCart(page: Page): Promise<void> {
  const cartPage = new CartPage(page);
  await cartPage.goto();
  await cartPage.proceedToCheckout();

  // Guard: if the guest modal appeared, the caller forgot to log in first
  const modal = cartPage.guestCheckoutModal;
  const isModalVisible = await modal.isVisible().catch(() => false);
  if (isModalVisible) {
    throw new Error(
      'checkoutHelper.proceedToCheckoutFromCart: guest login modal appeared. ' +
        'Ensure the page is authenticated before calling this helper.',
    );
  }
}

/**
 * On the /payment page, fills the card form and submits.
 * Defaults to {@link VALID_CARD} when no card is supplied.
 */
export async function fillPaymentAndConfirm(
  page: Page,
  card: CardDetails = VALID_CARD,
): Promise<void> {
  const paymentPage = new PaymentPage(page);
  await paymentPage.fillAndConfirm(card);
}

/**
 * Drives the entire checkout pipeline from an already-authenticated,
 * already-stocked cart through to the order confirmation page.
 *
 * Flow: /view_cart → /checkout → /payment → /payment_done
 *
 * @param card  Card to use for payment. Defaults to {@link VALID_CARD}.
 * @param comment  Optional order comment to add on the checkout page.
 */
export async function completeCheckoutFromCart(
  page: Page,
  card: CardDetails = VALID_CARD,
  comment?: string,
): Promise<void> {
  await proceedToCheckoutFromCart(page);

  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.placeOrder(comment);

  await fillPaymentAndConfirm(page, card);
}

/**
 * Full end-to-end checkout pipeline starting from the products listing.
 * Adds the first available product, then drives through to order confirmation.
 *
 * Flow: /products → /view_cart → /checkout → /payment → /payment_done
 *
 * @returns The product that was added so callers can assert on its details.
 */
export async function completePurchaseFlow(
  page: Page,
  card: CardDetails = VALID_CARD,
  comment?: string,
): Promise<AddedProduct> {
  const product = await addFirstProductToCart(page);
  await completeCheckoutFromCart(page, card, comment);
  return product;
}
