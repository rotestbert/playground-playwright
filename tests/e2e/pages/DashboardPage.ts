import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * POM for the home page (https://automationexercise.com) when a user is logged in.
 * The "dashboard" in this app is the same URL as the home page — the nav bar
 * changes to reflect the authenticated state.
 */
export class DashboardPage extends BasePage {
  /**
   * The "Logged in as <name>" nav item.
   * Presence of this element is the canonical check for authenticated state.
   */
  readonly loggedInIndicator: Locator;

  readonly logoutLink: Locator;
  readonly deleteAccountLink: Locator;

  constructor(page: Page) {
    super(page);
    // The site renders the username inside an <a> tag with no href (just "#")
    this.loggedInIndicator = page.locator('a', { hasText: 'Logged in as' });
    this.logoutLink = page.getByRole('link', { name: 'Logout' });
    this.deleteAccountLink = page.getByRole('link', { name: 'Delete Account' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /** Returns true if the "Logged in as" indicator is currently visible. */
  async isLoggedIn(): Promise<boolean> {
    return this.loggedInIndicator.isVisible();
  }

  /**
   * Extracts the username from "Logged in as <name>".
   * Trims whitespace and removes the leading icon text if present.
   */
  async getLoggedInUsername(): Promise<string> {
    const text = (await this.loggedInIndicator.textContent()) ?? '';
    return text.replace(/logged in as/i, '').trim();
  }

  async logout(): Promise<void> {
    await this.logoutLink.click();
  }

  /**
   * Navigate to /delete_account and confirm deletion.
   * Use this only for test teardown — it permanently removes the account.
   */
  async deleteAccount(): Promise<void> {
    // Navigate directly rather than clicking the nav link so teardown is not
    // blocked by any consent overlay that might intercept the click.
    await this.page.goto('/delete_account');
    await this.page.locator('[data-qa="continue-button"]').click();
  }
}
