import { test as base, type Page } from '@playwright/test';
import { generateTestUser, type UserCredentials } from '../../fixtures/auth.js';
import { registerUser, loginUser } from '../../helpers/authHelper.js';
import { addFirstProductToCart } from '../../helpers/checkoutHelper.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { LoginPage } from '../pages/LoginPage.js';
import type { AddedProduct } from '../../fixtures/checkout.js';

export const test = base.extend<{
  /** Skip-slow-tests flag, readable inside every test. */
  isCi: boolean;

  /**
   * Provides credentials for a freshly registered, then logged-out user.
   *
   * - Before test: a unique account is created via the registration flow.
   * - The session is cleared (logout) so the test starts unauthenticated.
   * - After test: the account is deleted to keep the site clean.
   *
   * Use this fixture for tests that drive the login UI themselves.
   */
  registeredUser: UserCredentials;

  /**
   * Provides a Playwright Page that is already authenticated.
   *
   * - Before test: account created + user is logged in on the home page.
   * - After test: account deleted.
   *
   * Use this fixture when you want to skip the login flow and focus on
   * post-authentication behaviour.
   */
  authenticatedPage: Page;

  /**
   * Provides an authenticated Page that already has one product in the cart.
   *
   * - Before test: account created, user logged in, first product added to cart.
   * - Yields `{ page, product }` so tests can assert on the added product's details.
   * - After test: account deleted (which also clears the cart).
   *
   * Use this fixture for checkout flow tests.
   */
  checkoutReadyPage: { page: Page; product: AddedProduct };
}>({
  isCi: [!!process.env['CI'], { option: true }],

  // Override the built-in `page` fixture to auto-dismiss the GDPR consent overlay
  // (fc-consent-root) that intercepts pointer events on automationexercise.com.
  // Registering here (awaited) ensures the handler is active for both test body
  // and fixture teardown across all tests.
  page: async ({ page }, use) => {
    await page.addLocatorHandler(
      page.locator('.fc-consent-root'),
      async () => {
        await page.locator('.fc-cta-consent').click({ timeout: 5_000 }).catch(() => {});
      },
    );
    await use(page);
  },

  registeredUser: async ({ page }, use) => {
    const user = generateTestUser();

    // Setup
    await registerUser(page, user);
    const dashboard = new DashboardPage(page);
    await dashboard.logout(); // test starts from an unauthenticated state

    await use(user);

    // Teardown — re-login and delete, tolerating tests that left the user
    // in any navigation state
    try {
      const isLoggedIn = await dashboard.isLoggedIn();
      if (!isLoggedIn) {
        await loginUser(page, user.email, user.password);
      }
      await dashboard.deleteAccount();
    } catch {
      // Best-effort cleanup; swallow errors so the test result is not masked
    }
  },

  authenticatedPage: async ({ page }, use) => {
    const user = generateTestUser();

    // Setup — user is logged in after registerUser()
    await registerUser(page, user);

    await use(page);

    // Teardown
    try {
      const dashboard = new DashboardPage(page);
      const isLoggedIn = await dashboard.isLoggedIn();
      if (!isLoggedIn) {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(user.email, user.password);
      }
      await dashboard.deleteAccount();
    } catch {
      // Best-effort cleanup
    }
  },

  checkoutReadyPage: async ({ page }, use) => {
    const user = generateTestUser();

    // Setup — register, log in, then add one product to the cart
    await registerUser(page, user);
    const product = await addFirstProductToCart(page);

    await use({ page, product });

    // Teardown — deleting the account also clears the cart server-side
    try {
      const dashboard = new DashboardPage(page);
      const isLoggedIn = await dashboard.isLoggedIn();
      if (!isLoggedIn) {
        await loginUser(page, user.email, user.password);
      }
      await dashboard.deleteAccount();
    } catch {
      // Best-effort cleanup
    }
  },
});

export { expect } from '@playwright/test';
