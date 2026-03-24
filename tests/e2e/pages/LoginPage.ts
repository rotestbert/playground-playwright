import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * POM for https://automationexercise.com/login
 *
 * The page contains two independent forms side-by-side:
 *   - Left:  "Login to your account"
 *   - Right: "New User Signup!"
 */
export class LoginPage extends BasePage {
  // ── Login form ────────────────────────────────────────────────────────────
  readonly loginEmailInput: Locator;
  readonly loginPasswordInput: Locator;
  readonly loginButton: Locator;
  /** Shown when email/password do not match any account */
  readonly loginErrorMessage: Locator;

  // ── Signup form (first step — name + email only) ──────────────────────────
  readonly signupNameInput: Locator;
  readonly signupEmailInput: Locator;
  readonly signupButton: Locator;
  /** Shown when the signup email already belongs to an existing account */
  readonly signupErrorMessage: Locator;

  // ── Page-level ─────────────────────────────────────────────────────────────
  readonly loginHeading: Locator;
  readonly signupHeading: Locator;

  constructor(page: Page) {
    super(page);

    // data-qa attributes are the preferred, stable selectors on this site
    this.loginEmailInput = page.locator('[data-qa="login-email"]');
    this.loginPasswordInput = page.locator('[data-qa="login-password"]');
    this.loginButton = page.locator('[data-qa="login-button"]');
    this.loginErrorMessage = page.locator('p', { hasText: 'Your email or password is incorrect!' });

    this.signupNameInput = page.locator('[data-qa="signup-name"]');
    this.signupEmailInput = page.locator('[data-qa="signup-email"]');
    this.signupButton = page.locator('[data-qa="signup-button"]');
    this.signupErrorMessage = page.locator('p', { hasText: 'Email Address already exist!' });

    this.loginHeading = page.getByRole('heading', { name: 'Login to your account' });
    this.signupHeading = page.getByRole('heading', { name: 'New User Signup!' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  /** Fill and submit the login form. */
  async login(email: string, password: string): Promise<void> {
    await this.loginEmailInput.fill(email);
    await this.loginPasswordInput.fill(password);
    await this.loginButton.click();
  }

  /**
   * Fill the first-step signup form and click Signup.
   * On success, the browser navigates to /signup (registration details).
   */
  async startSignup(name: string, email: string): Promise<void> {
    await this.signupNameInput.fill(name);
    await this.signupEmailInput.fill(email);
    await this.signupButton.click();
  }
}
