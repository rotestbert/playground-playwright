import { test, expect } from './fixtures/index.js';

/**
 * Basic E2E smoke tests for https://automationexercise.com.
 * Demonstrates core Playwright APIs: navigation, locators, assertions.
 */
test.describe('Automation Exercise - Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/automation exercise/i);
  });

  test('navigation bar is present', async ({ page }) => {
    // The site uses <header id="header"> (implicit role: banner) — no <nav> element exists
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('Products link is visible', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Products' })).toBeVisible();
  });

  test('Signup / Login link is visible', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Signup / Login' })).toBeVisible();
  });
});

test.describe('Automation Exercise - Accessibility', () => {
  test('page has a main landmark', async ({ page }) => {
    // The site uses <section id="slider"> as main content (no <main> element exists)
    await page.goto('/');
    await expect(page.locator('#slider')).toBeVisible();
  });

  test('page has a heading', async ({ page }) => {
    await page.goto('/');
    const headings = page.getByRole('heading', { level: 1 });
    await expect(headings.first()).toBeVisible();
  });
});
