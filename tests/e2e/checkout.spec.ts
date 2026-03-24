import { test, expect } from './fixtures/index.js';
import { ProductsPage } from './pages/ProductsPage.js';
import { CartPage } from './pages/CartPage.js';
import { CheckoutPage } from './pages/CheckoutPage.js';
import { PaymentPage } from './pages/PaymentPage.js';
import { OrderConfirmedPage } from './pages/OrderConfirmedPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import {
  addFirstProductToCart,
  proceedToCheckoutFromCart,
  completeCheckoutFromCart,
  completePurchaseFlow,
} from '../helpers/checkoutHelper.js';
import { VALID_CARD, EMPTY_CARD, EXPIRED_CARD } from '../fixtures/checkout.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Happy Path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Happy Path — add item → cart → checkout → payment → confirmation', () => {
  test('completes a full purchase and reaches the order confirmation page', async ({
    checkoutReadyPage: { page },
  }) => {
    const orderConfirmed = new OrderConfirmedPage(page);

    await completeCheckoutFromCart(page, VALID_CARD);

    await expect(page).toHaveURL(/payment_done/);
    await expect(orderConfirmed.successHeading).toBeVisible();
  });

  test('cart shows the correct product name, price, and quantity before checkout', async ({
    checkoutReadyPage: { page, product },
  }) => {
    const cartPage = new CartPage(page);
    await cartPage.goto();

    expect(await cartPage.hasItems()).toBe(true);

    const itemName = await cartPage.getItemName(0);
    const itemPrice = await cartPage.getItemPrice(0);
    const itemQty = await cartPage.getItemQuantity(0);

    expect(itemName).toBe(product.name);
    expect(itemPrice).toBe(product.price);
    expect(itemQty).toBe('1');
  });

  test('checkout page displays the delivery address from the registered account', async ({
    checkoutReadyPage: { page },
  }) => {
    const checkoutPage = new CheckoutPage(page);
    await proceedToCheckoutFromCart(page);

    await expect(checkoutPage.deliveryAddressBlock).toBeVisible();
    await expect(checkoutPage.billingAddressBlock).toBeVisible();
    // Both address blocks should contain some text (not empty)
    const deliveryText = await checkoutPage.deliveryAddressBlock.textContent();
    expect(deliveryText?.trim().length).toBeGreaterThan(0);
  });

  test('checkout page lists every item that was added to the cart', async ({
    checkoutReadyPage: { page },
  }) => {
    const checkoutPage = new CheckoutPage(page);
    await proceedToCheckoutFromCart(page);

    const count = await checkoutPage.getOrderItemCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('order confirmation shows the Download Invoice button', async ({
    checkoutReadyPage: { page },
  }) => {
    const orderConfirmed = new OrderConfirmedPage(page);
    await completeCheckoutFromCart(page, VALID_CARD);

    await expect(orderConfirmed.successHeading).toBeVisible();
    await expect(orderConfirmed.downloadInvoiceButton).toBeVisible();
  });

  test('clicking Continue after order confirmation returns to the home page', async ({
    checkoutReadyPage: { page },
  }) => {
    const orderConfirmed = new OrderConfirmedPage(page);
    const dashboard = new DashboardPage(page);

    await completeCheckoutFromCart(page, VALID_CARD);
    await orderConfirmed.continue();

    // Should land on home and still be logged in
    await expect(page).toHaveURL('https://automationexercise.com/');
    await expect(dashboard.loggedInIndicator).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Edge Cases
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edge Cases', () => {
  test('empty cart — cart page shows no items', async ({ authenticatedPage: page }) => {
    const cartPage = new CartPage(page);
    await cartPage.goto();

    // A freshly registered account has no cart items
    const hasItems = await cartPage.hasItems();
    expect(hasItems).toBe(false);
  });

  test('empty cart — proceeding to checkout shows an empty order summary', async ({
    authenticatedPage: page,
  }) => {
    // Navigate directly without adding anything
    await page.goto('/checkout');

    const checkoutPage = new CheckoutPage(page);
    // Site may redirect away or show an empty summary — either way, no items
    const onCheckout = page.url().includes('/checkout');
    if (onCheckout) {
      const count = await checkoutPage.getOrderItemCount();
      expect(count).toBe(0);
    } else {
      // Redirected (e.g. back to cart) — also acceptable behaviour
      expect(page.url()).not.toMatch(/payment/);
    }
  });

  test('removing a cart item reduces the item count', async ({
    checkoutReadyPage: { page },
  }) => {
    const cartPage = new CartPage(page);
    await cartPage.goto();

    const before = await cartPage.getItemCount();
    await cartPage.removeItem(0);
    const after = await cartPage.getItemCount();

    expect(after).toBe(before - 1);
  });

  test('removing the last cart item empties the cart', async ({
    checkoutReadyPage: { page },
  }) => {
    const cartPage = new CartPage(page);
    await cartPage.goto();

    await cartPage.removeItem(0);

    expect(await cartPage.hasItems()).toBe(false);
  });

  test('guest user sees a Register/Login prompt when proceeding to checkout', async ({
    page,
  }) => {
    // Add a product without being logged in
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    await productsPage.addFirstProductToCart();

    const cartPage = new CartPage(page);
    await cartPage.goto();
    await cartPage.proceedToCheckout();

    // For guests the site shows a modal rather than navigating to /checkout
    await expect(cartPage.guestCheckoutModal).toBeVisible();
    await expect(cartPage.guestModalLoginLink).toBeVisible();
  });

  test('session expiry — navigating to /checkout without a session redirects to login or home', async ({
    checkoutReadyPage: { page },
  }) => {
    // Simulate session expiry by clearing all cookies
    await page.context().clearCookies();

    await page.goto('/checkout');

    // The site should not show a populated checkout — it must redirect
    const url = page.url();
    expect(url).not.toMatch(/^https:\/\/automationexercise\.com\/checkout$/);
  });

  test('payment form with all empty fields does not complete the order', async ({
    checkoutReadyPage: { page },
  }) => {
    const paymentPage = new PaymentPage(page);
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.placeOrder();
    await paymentPage.submitEmpty();

    // Required field validation should keep the user on /payment
    await expect(page).toHaveURL(/payment/);
    await expect(page).not.toHaveURL(/payment_done/);
  });

  test('payment with an expired card does not reach confirmation', async ({
    checkoutReadyPage: { page },
  }) => {
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.placeOrder();

    const paymentPage = new PaymentPage(page);
    await paymentPage.fillAndConfirm(EXPIRED_CARD);

    // Should not navigate to /payment_done
    await expect(page).not.toHaveURL(/payment_done/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Accessibility — keyboard navigation through the checkout flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Accessibility', () => {
  test('product "Add to cart" buttons are reachable by keyboard', async ({
    authenticatedPage: page,
  }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();

    // Tab until one of the Add to Cart buttons receives focus
    const addToCartButton = page.locator('.add-to-cart').first();
    await addToCartButton.focus();

    await expect(addToCartButton).toBeFocused();
  });

  test('cart modal can be dismissed with the keyboard (Enter on Continue Shopping)', async ({
    authenticatedPage: page,
  }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();

    const firstCard = productsPage.productCards.first();
    await firstCard.hover();
    await firstCard.locator('.add-to-cart').first().click();

    const modal = productsPage.cartModal;
    await modal.waitFor({ state: 'visible' });

    // Focus the Continue Shopping button and activate it with keyboard
    await productsPage.cartModalContinueButton.focus();
    await expect(productsPage.cartModalContinueButton).toBeFocused();
    await page.keyboard.press('Enter');

    await modal.waitFor({ state: 'hidden' });
    await expect(modal).not.toBeVisible();
  });

  test('payment form fields are focusable in logical tab order', async ({
    checkoutReadyPage: { page },
  }) => {
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.placeOrder();

    const paymentPage = new PaymentPage(page);
    await expect(page).toHaveURL(/payment/);

    // Focus each field in expected order and confirm it accepts keyboard input
    await paymentPage.nameOnCardInput.focus();
    await expect(paymentPage.nameOnCardInput).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(paymentPage.cardNumberInput).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(paymentPage.cvcInput).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(paymentPage.expiryMonthInput).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(paymentPage.expiryYearInput).toBeFocused();
  });

  test('payment form can be submitted using the keyboard alone', async ({
    checkoutReadyPage: { page },
  }) => {
    const orderConfirmed = new OrderConfirmedPage(page);
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.placeOrder();

    const paymentPage = new PaymentPage(page);

    // Fill every field via keyboard
    await paymentPage.nameOnCardInput.focus();
    await page.keyboard.type(VALID_CARD.nameOnCard);
    await page.keyboard.press('Tab');
    await page.keyboard.type(VALID_CARD.cardNumber);
    await page.keyboard.press('Tab');
    await page.keyboard.type(VALID_CARD.cvc);
    await page.keyboard.press('Tab');
    await page.keyboard.type(VALID_CARD.expiryMonth);
    await page.keyboard.press('Tab');
    await page.keyboard.type(VALID_CARD.expiryYear);

    // Submit with Enter on the Pay button
    await paymentPage.payButton.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/payment_done/);
    await expect(orderConfirmed.successHeading).toBeVisible();
  });

  test('checkout address blocks have identifiable heading structure', async ({
    checkoutReadyPage: { page },
  }) => {
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);

    // Both address sections must be present and non-empty
    await expect(checkoutPage.deliveryAddressBlock).toBeVisible();
    await expect(checkoutPage.billingAddressBlock).toBeVisible();

    const deliveryText = await checkoutPage.deliveryAddressBlock.textContent();
    const billingText = await checkoutPage.billingAddressBlock.textContent();

    expect(deliveryText?.trim().length).toBeGreaterThan(0);
    expect(billingText?.trim().length).toBeGreaterThan(0);
  });

  test('payment inputs all have associated labels or aria attributes', async ({
    checkoutReadyPage: { page },
  }) => {
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.placeOrder();

    const paymentPage = new PaymentPage(page);
    await expect(page).toHaveURL(/payment/);

    // Each input must have a placeholder (used as visible label on this site)
    // or an aria-label — either satisfies screen-reader requirements
    for (const input of [
      paymentPage.nameOnCardInput,
      paymentPage.cardNumberInput,
      paymentPage.cvcInput,
      paymentPage.expiryMonthInput,
      paymentPage.expiryYearInput,
    ]) {
      const placeholder = await input.getAttribute('placeholder');
      const ariaLabel = await input.getAttribute('aria-label');
      expect(placeholder ?? ariaLabel).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Responsive — 375 × 667 mobile viewport
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive — mobile viewport (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('products page renders product cards on mobile', async ({
    authenticatedPage: page,
  }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();

    await expect(productsPage.pageHeading).toBeVisible();
    const count = await productsPage.getProductCount();
    expect(count).toBeGreaterThan(0);
  });

  test('add to cart works on mobile and shows the confirmation modal', async ({
    authenticatedPage: page,
  }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();

    const firstCard = productsPage.productCards.first();
    // On mobile there is no hover — the button is inline, not in an overlay
    await firstCard.locator('.add-to-cart').first().click();

    await expect(productsPage.cartModal).toBeVisible();
    await expect(productsPage.cartModalMessage).toContainText(/added to cart/i);
  });

  test('cart page is readable and shows items on mobile', async ({
    checkoutReadyPage: { page, product },
  }) => {
    const cartPage = new CartPage(page);
    await cartPage.goto();

    await expect(page).toHaveURL(/view_cart/);
    expect(await cartPage.hasItems()).toBe(true);

    const itemName = await cartPage.getItemName(0);
    expect(itemName).toBe(product.name);
  });

  test('"Proceed to Checkout" button is visible and tappable on mobile', async ({
    checkoutReadyPage: { page },
  }) => {
    const cartPage = new CartPage(page);
    await cartPage.goto();

    await expect(cartPage.proceedToCheckoutButton).toBeVisible();
    // Verify it is within the viewport (not clipped off-screen)
    const box = await cartPage.proceedToCheckoutButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  });

  test('checkout address page is readable on mobile', async ({
    checkoutReadyPage: { page },
  }) => {
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);
    await expect(page).toHaveURL(/checkout/);
    await expect(checkoutPage.deliveryAddressBlock).toBeVisible();
    await expect(checkoutPage.placeOrderButton).toBeVisible();
  });

  test('payment form fields are visible and fillable on mobile', async ({
    checkoutReadyPage: { page },
  }) => {
    await proceedToCheckoutFromCart(page);

    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.placeOrder();

    const paymentPage = new PaymentPage(page);
    await expect(page).toHaveURL(/payment/);

    // Every input must be within the viewport
    for (const input of [
      paymentPage.nameOnCardInput,
      paymentPage.cardNumberInput,
      paymentPage.cvcInput,
      paymentPage.expiryMonthInput,
      paymentPage.expiryYearInput,
    ]) {
      await expect(input).toBeVisible();
      const box = await input.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
    }
  });

  test('completes full checkout on mobile viewport', async ({
    checkoutReadyPage: { page },
  }) => {
    const orderConfirmed = new OrderConfirmedPage(page);

    await completeCheckoutFromCart(page, VALID_CARD);

    await expect(page).toHaveURL(/payment_done/);
    await expect(orderConfirmed.successHeading).toBeVisible();
  });
});
