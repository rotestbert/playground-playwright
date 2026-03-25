/**
 * Visual Regression Tests
 * =======================
 * Captures screenshots for every app route across three viewports and multiple
 * UI states (full data, loading, empty, error).
 *
 * Baselines are stored in tests/visual/__snapshots__/ and must be committed.
 *
 * Run tests:         npm run test:visual
 * Update baselines:  npm run test:visual:update
 *
 * Threshold: 0.1 % pixel-ratio difference (configured globally in playwright.config.ts).
 *
 * Viewport sizes tested per page:
 *   desktop  1280 × 720
 *   tablet    768 × 1024
 *   mobile    375 × 667
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

// Re-use the project's custom `test` so the GDPR consent-popup locator handler
// and all auth fixtures (authenticatedPage, checkoutReadyPage) are available.
import { test } from '../e2e/fixtures/index.js';
import { proceedToCheckoutFromCart } from '../helpers/checkoutHelper.js';
import { CheckoutPage } from '../e2e/pages/CheckoutPage.js';

// ── Viewport catalogue ───────────────────────────────────────────────────────

const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  tablet:  { width: 768,  height: 1024 },
  mobile:  { width: 375,  height: 667 },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pre-scrolls the page to its bottom and back to the top so that all
 * lazy-loaded images and JS-rendered content are fetched before the
 * screenshot loop begins. Without this, Playwright's full-page scroll
 * during capture can trigger new content loads and produce unstable heights.
 */
async function triggerLazyLoads(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * Injects JavaScript that pauses Bootstrap / owl-carousel / Slick autoplay
 * so the carousel frame is frozen before the screenshot is taken.
 * Safe to call on pages that have no carousel — the selectors simply match nothing.
 */
async function stopCarousels(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Bootstrap 3/4 data-ride carousel
    document.querySelectorAll<HTMLElement>('[data-ride="carousel"]').forEach((el) => {
      el.dataset['interval'] = '0';
      el.classList.remove('slide'); // removes CSS transitions between slides
    });

    // Owl Carousel — call pause() if the jQuery plugin is available
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const $ = (window as any)['jQuery'] ?? (window as any)['$'];
      if ($) {
        $('.owl-carousel').trigger('stop.owl.autoplay');
      }
    } catch {
      // jQuery or owl may not be present — ignore
    }
  });
}

/**
 * Iterates over every viewport, resizes the page, and saves a named snapshot.
 *
 * @param page      - Playwright Page (already on the correct URL).
 * @param baseName  - Snapshot name prefix, e.g. `'home-unauthenticated'`.
 * @param options
 *   mask     - Locators whose bounding boxes are painted over before comparison
 *              (use for dynamic text: usernames, prices, timestamps).
 *   fullPage - Whether to capture the full scrollable page (default: true).
 *              Set to false for pages whose height is intentionally unstable
 *              (loading / error states where resources are blocked).
 */
async function screenshotViewports(
  page: Page,
  baseName: string,
  options: { mask?: Locator[]; fullPage?: boolean } = {},
): Promise<void> {
  const { mask = [], fullPage = true } = options;
  for (const [viewportName, size] of Object.entries(VIEWPORTS) as [
    string,
    { width: number; height: number },
  ][]) {
    await page.setViewportSize(size);
    await expect(page).toHaveScreenshot(`${baseName}-${viewportName}.png`, {
      fullPage,
      mask,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE  /
// States: full data (unauthenticated), loading (images blocked),
//         error (CSS blocked), full data (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Home Page (/)', () => {
  test('full data – unauthenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Freeze the hero carousel so slides don't shift between screenshots.
    await stopCarousels(page);
    // Use viewport-only capture: the JS-driven carousel causes the full-page
    // height to differ between the two consecutive stability screenshots that
    // Playwright requires, regardless of masking.
    await screenshotViewports(page, 'home-unauthenticated', {
      fullPage: false,
      mask: [page.locator('.carousel-inner, .owl-stage-outer')],
    });
  });

  test('loading – images blocked', async ({ page }) => {
    // Abort image requests so the page renders in a layout-only loading state.
    // Use viewport capture (fullPage: false) because blocking images causes the
    // browser to collapse img elements in unpredictable ways that prevent a
    // stable full-height measurement.
    await page.route('**/*.{jpg,jpeg,png,gif,webp,svg}', (route) => route.abort());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await screenshotViewports(page, 'home-loading', { fullPage: false });
    await page.unrouteAll();
  });

  test('error – stylesheet blocked', async ({ page }) => {
    // Blocking CSS simulates a CDN failure / partial-load error state.
    // Viewport capture only — an unstyled page has an unpredictable scrollHeight.
    await page.route('**/*.css', (route) => route.abort());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await screenshotViewports(page, 'home-error', { fullPage: false });
    await page.unrouteAll();
  });

  test('full data – authenticated', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await triggerLazyLoads(page);
    await stopCarousels(page);
    // Mask the logged-in username and carousel — both differ between test runs.
    await screenshotViewports(page, 'home-authenticated', {
      mask: [
        page.locator('li').filter({ hasText: 'Logged in as' }),
        page.locator('.carousel-inner, .owl-stage-outer'),
      ],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN / SIGNUP PAGE  /login
// States: default (empty forms), error (invalid credentials)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Login / Signup Page (/login)', () => {
  test('default – empty forms', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await screenshotViewports(page, 'login-default');
  });

  test('error – invalid credentials submitted', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Submit wrong credentials to trigger the server-rendered error message.
    await page.locator('[data-qa="login-email"]').fill('no-such-user@visual.test');
    await page.locator('[data-qa="login-password"]').fill('wrong-password-123');
    await page.locator('[data-qa="login-button"]').click();

    // Wait for the inline error paragraph rendered by the server.
    await page
      .locator('p', { hasText: 'Your email or password is incorrect!' })
      .waitFor({ state: 'visible' });

    await screenshotViewports(page, 'login-error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS PAGE  /products
// States: full data (all products loaded), loading (images blocked)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Products Page (/products)', () => {
  test('full data', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await triggerLazyLoads(page);
    await screenshotViewports(page, 'products-full-data');
  });

  test('loading – product images blocked', async ({ page }) => {
    // Viewport capture only — blocked product images cause the grid height to
    // change as Playwright scrolls during full-page capture.
    await page.route('**/*.{jpg,jpeg,png,gif,webp}', (route) => route.abort());
    await page.goto('/products');
    await page.waitForLoadState('domcontentloaded');
    await screenshotViewports(page, 'products-loading', { fullPage: false });
    await page.unrouteAll();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CART PAGE  /view_cart
// States: empty (no items), full data (one product in cart)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cart Page (/view_cart)', () => {
  test('empty – no items', async ({ page }) => {
    await page.goto('/view_cart');
    await page.waitForLoadState('networkidle');
    await screenshotViewports(page, 'cart-empty');
  });

  test('full data – with items', async ({ checkoutReadyPage: { page } }) => {
    await page.goto('/view_cart');
    await page.waitForLoadState('networkidle');
    // Mask price columns — live prices can drift between runs.
    await screenshotViewports(page, 'cart-with-items', {
      mask: [
        page.locator('.cart_price'),
        page.locator('.cart_total_price'),
      ],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT PAGE  /checkout
// States: full data (delivery + billing address + order summary)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Checkout Page (/checkout)', () => {
  test('full data – address and order summary', async ({
    checkoutReadyPage: { page },
  }) => {
    await page.goto('/view_cart');
    await page.waitForLoadState('networkidle');

    await page.locator('a.btn.check_out').click();
    await page.waitForURL('**/checkout');
    await page.waitForLoadState('networkidle');

    // Mask both address blocks — they contain per-run registered-user details.
    await screenshotViewports(page, 'checkout-full-data', {
      mask: [
        page.locator('#address_delivery'),
        page.locator('#address_invoice'),
      ],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT PAGE  /payment
// State: default (empty form ready for card entry)
//
// Note: this test runs serially to avoid a live-site quirk where two sessions
// hitting the checkout→payment endpoint concurrently causes one to be
// redirected to /delete_account.
//
// The "form submitted empty" state is omitted: automationexercise.com silently
// navigates to the order-confirmation page on empty submission (no validation
// message is rendered), so there is no distinct visual error state to baseline.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payment Page (/payment)', () => {
  // Force serial execution so only one checkout session runs at a time on the
  // shared live site.
  test.describe.configure({ mode: 'serial' });

  /**
   * Mirrors the exact navigation used by the project's checkoutHelper so we
   * take the same code path as the passing Happy Path E2E tests:
   *   proceedToCheckoutFromCart → CheckoutPage.placeOrder()
   *
   * Waits for the first payment-form input to appear rather than for the URL,
   * matching the existing test helpers that never assert on intermediate URLs.
   */
  async function navigateToPayment(page: Page): Promise<void> {
    await proceedToCheckoutFromCart(page);
    const checkout = new CheckoutPage(page);
    await checkout.placeOrder();
    // Wait for the payment form's first field — confirms /payment loaded
    // without asserting on the URL (avoids the live-site redirect race).
    await page
      .locator('[data-qa="name-on-card"]')
      .waitFor({ state: 'visible', timeout: 60_000 });
  }

  test('default – empty form', async ({ checkoutReadyPage: { page } }) => {
    await navigateToPayment(page);
    await screenshotViewports(page, 'payment-default');
  });
});
