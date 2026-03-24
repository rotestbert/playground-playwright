import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * Page Object Model for the Automation Exercise home page.
 * https://automationexercise.com
 */
export class HomePage extends BasePage {
  readonly navBar: Locator;
  readonly logo: Locator;
  readonly productsLink: Locator;
  readonly signupLoginLink: Locator;
  readonly cartLink: Locator;

  constructor(page: Page) {
    super(page);
    this.navBar = page.getByRole('navigation');
    this.logo = page.locator('#header .logo');
    this.productsLink = page.getByRole('link', { name: 'Products' });
    this.signupLoginLink = page.getByRole('link', { name: 'Signup / Login' });
    this.cartLink = page.getByRole('link', { name: 'Cart' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async clickProducts(): Promise<void> {
    await this.productsLink.click();
  }

  async clickSignupLogin(): Promise<void> {
    await this.signupLoginLink.click();
  }
}
