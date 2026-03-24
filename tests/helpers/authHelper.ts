import { type Page } from '@playwright/test';
import { LoginPage } from '../e2e/pages/LoginPage.js';
import { RegisterPage } from '../e2e/pages/RegisterPage.js';
import { AccountCreatedPage } from '../e2e/pages/AccountCreatedPage.js';
import { type UserCredentials, DEFAULT_REGISTRATION_DETAILS } from '../fixtures/auth.js';

/**
 * Programmatically registers a new user and lands on the home page logged in.
 *
 * Flow:  /login → signup form → /signup → registration form → /account_created → /
 *
 * Use this in fixtures and beforeEach hooks — not in tests that are
 * specifically testing the registration UI.
 */
export async function registerUser(page: Page, user: UserCredentials): Promise<void> {
  const loginPage = new LoginPage(page);
  const registerPage = new RegisterPage(page);
  const accountCreatedPage = new AccountCreatedPage(page);

  await loginPage.goto();
  await loginPage.startSignup(user.name, user.email);

  // Split name into first/last; fall back gracefully for single-word names
  const [firstName = user.name, lastName = 'User'] = user.name.split(' ');

  await registerPage.fillAndSubmit({
    ...DEFAULT_REGISTRATION_DETAILS,
    password: user.password,
    firstName,
    lastName,
  });

  await accountCreatedPage.continue();
  // User is now logged in on the home page (/)
}

/**
 * Logs in an existing user and lands on the home page.
 * Assumes the user account already exists.
 */
export async function loginUser(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(email, password);
}
