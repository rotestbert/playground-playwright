import { test, expect } from './fixtures/index.js';
import { HomePage } from './pages/HomePage.js';

/**
 * E2E tests for https://automationexercise.com using the Page Object Model pattern.
 * POMs encapsulate page interactions, making tests more readable and maintainable.
 */
test.describe('Automation Exercise - Page Object Model', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('home page loads with correct title', async () => {
    const title = await homePage.getTitle();
    expect(title).toMatch(/automation exercise/i);
  });

  test('navigation bar is present', async () => {
    await expect(homePage.navBar).toBeVisible();
  });

  test('Products link is visible', async () => {
    await expect(homePage.productsLink).toBeVisible();
  });

  test('clicking Products navigates to products page', async ({ page }) => {
    await homePage.clickProducts();
    await expect(page).toHaveURL(/.*products/i);
  });

  test('Signup / Login link is visible', async () => {
    await expect(homePage.signupLoginLink).toBeVisible();
  });

  test('clicking Signup / Login navigates to login page', async ({ page }) => {
    await homePage.clickSignupLogin();
    await expect(page).toHaveURL(/.*login/i);
  });
});
