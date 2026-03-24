import { test, expect } from './fixtures/index.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { AccountCreatedPage } from './pages/AccountCreatedPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { generateTestUser, DEFAULT_REGISTRATION_DETAILS, SECURITY_PAYLOADS } from '../fixtures/auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// User Story 1: As a user, I can register with email and password
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Registration', () => {
  test('registers a new user and shows Account Created confirmation', async ({ page }) => {
    const user = generateTestUser();
    const loginPage = new LoginPage(page);
    const registerPage = new RegisterPage(page);
    const accountCreatedPage = new AccountCreatedPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.startSignup(user.name, user.email);

    // Registration details page should load
    await expect(registerPage.pageHeading).toBeVisible();

    await registerPage.fillAndSubmit({
      ...DEFAULT_REGISTRATION_DETAILS,
      password: user.password,
      firstName: 'Test',
      lastName: 'User',
    });

    // Confirmation page
    await expect(accountCreatedPage.heading).toBeVisible();
    await expect(page).toHaveURL(/account_created/);

    await accountCreatedPage.continue();

    // User is logged in after registration
    await expect(dashboard.loggedInIndicator).toBeVisible();
    const username = await dashboard.getLoggedInUsername();
    expect(username).toBe(user.name);

    // Teardown
    await dashboard.deleteAccount();
  });

  test('shows error when registering with an email that already exists', async ({
    page,
    registeredUser,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Attempt to sign up with the already-registered email
    await loginPage.startSignup('Another Name', registeredUser.email);

    await expect(loginPage.signupErrorMessage).toBeVisible();
    await expect(loginPage.signupErrorMessage).toHaveText('Email Address already exist!');
    // Must still be on /login — no navigation occurred
    await expect(page).toHaveURL(/login/);
  });

  test('signup form requires a name', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Leave name blank, fill only email
    await loginPage.signupEmailInput.fill(`empty.name.${Date.now()}@mailtest.dev`);
    await loginPage.signupButton.click();

    // HTML5 required validation prevents navigation — still on /login
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.signupNameInput).toBeFocused();
  });

  test('signup form requires an email', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.signupNameInput.fill('No Email User');
    await loginPage.signupButton.click();

    await expect(page).toHaveURL(/login/);
    await expect(loginPage.signupEmailInput).toBeFocused();
  });

  test('signup form rejects an invalid email format', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.signupNameInput.fill('Bad Email User');
    await loginPage.signupEmailInput.fill('not-an-email');
    await loginPage.signupButton.click();

    // Browser-native email validation blocks submission
    await expect(page).toHaveURL(/login/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User Story 2: As a user, I can log in with valid credentials
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Login — valid credentials', () => {
  test('logs in with correct email and password', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login(registeredUser.email, registeredUser.password);

    // Should reach the home page
    await expect(page).toHaveURL('https://automationexercise.com/');
    await expect(dashboard.loggedInIndicator).toBeVisible();
  });

  test('shows the correct username in the nav after login', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login(registeredUser.email, registeredUser.password);

    const username = await dashboard.getLoggedInUsername();
    expect(username).toBe(registeredUser.name);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User Story 3: As a user, I see an error for invalid credentials
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Login — invalid credentials', () => {
  test('shows error for wrong password', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login(registeredUser.email, 'WrongPassword!99');

    await expect(loginPage.loginErrorMessage).toBeVisible();
    await expect(loginPage.loginErrorMessage).toHaveText(
      'Your email or password is incorrect!',
    );
    // Stays on the login page
    await expect(page).toHaveURL(/login/);
  });

  test('shows error for non-existent email', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('nobody.exists.ever@mailtest.dev', 'AnyPassword123');

    await expect(loginPage.loginErrorMessage).toBeVisible();
    await expect(loginPage.loginErrorMessage).toHaveText(
      'Your email or password is incorrect!',
    );
  });

  test('shows error for correct email but empty password', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.loginEmailInput.fill(registeredUser.email);
    // Leave password empty
    await loginPage.loginButton.click();

    // HTML5 required validation or server-side error — either way, no login
    const staysOnLogin = page.url().includes('login');
    const showsError = await loginPage.loginErrorMessage.isVisible();
    expect(staysOnLogin || showsError).toBe(true);
  });

  test('login form requires an email', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.loginPasswordInput.fill('SomePassword123');
    await loginPage.loginButton.click();

    await expect(page).toHaveURL(/login/);
    await expect(loginPage.loginEmailInput).toBeFocused();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User Story 4: As a user, I can reset my password via email
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Password Reset', () => {
  // automationexercise.com does not implement a forgot-password / reset flow.
  // These tests are marked fixme so they are visible in CI reports as pending
  // work rather than silently missing.

  test.fixme(
    'shows a forgot password link on the login page',
    async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      const forgotLink = page.getByRole('link', { name: /forgot.*password/i });
      await expect(forgotLink).toBeVisible();
    },
  );

  test.fixme(
    'sends a password reset email for a registered address',
    async ({ page, registeredUser }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await page.getByRole('link', { name: /forgot.*password/i }).click();
      await page.getByRole('textbox', { name: /email/i }).fill(registeredUser.email);
      await page.getByRole('button', { name: /send|reset/i }).click();

      await expect(
        page.getByText(/check your email|reset link sent/i),
      ).toBeVisible();
    },
  );

  test.fixme(
    'shows error when requesting reset for an unknown email',
    async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await page.getByRole('link', { name: /forgot.*password/i }).click();
      await page.getByRole('textbox', { name: /email/i }).fill('nobody@mailtest.dev');
      await page.getByRole('button', { name: /send|reset/i }).click();

      await expect(page.getByText(/not found|no account/i)).toBeVisible();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// User Story 5: As a user, I am redirected to dashboard after login
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Post-login redirect', () => {
  test('redirects to the home page after successful login', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login(registeredUser.email, registeredUser.password);

    await expect(page).toHaveURL('https://automationexercise.com/');
  });

  test('shows authenticated navigation after login', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login(registeredUser.email, registeredUser.password);

    // All authenticated nav items must be present
    await expect(dashboard.loggedInIndicator).toBeVisible();
    await expect(dashboard.logoutLink).toBeVisible();
    await expect(dashboard.deleteAccountLink).toBeVisible();
  });

  test('does not redirect to login when already authenticated', async ({ authenticatedPage: page }) => {
    // Navigating to /login while authenticated should not be required;
    // the home page should remain accessible and show authenticated state
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.loggedInIndicator).toBeVisible();
    await expect(page).toHaveURL('https://automationexercise.com/');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Session management
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Session management', () => {
  test('logs out and redirects to the login page', async ({ authenticatedPage: page }) => {
    const dashboard = new DashboardPage(page);

    await dashboard.logout();

    await expect(page).toHaveURL(/login/);
    await expect(dashboard.loggedInIndicator).not.toBeVisible();
  });

  test('cannot access delete-account page after logging out', async ({
    authenticatedPage: page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.logout();

    // Attempting to navigate to /delete_account without a session should
    // redirect to home or login — not delete anything
    await page.goto('/delete_account');
    const url = page.url();
    expect(url).not.toMatch(/account_deleted/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Security edge cases
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Security edge cases', () => {
  test('SQL injection in login email field shows credentials error, not a server error', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(SECURITY_PAYLOADS.sqlInjection, 'password');

    // Must show a normal auth error — not a 500 or database error
    await expect(loginPage.loginErrorMessage).toBeVisible();
    await expect(loginPage.loginErrorMessage).toHaveText(
      'Your email or password is incorrect!',
    );
    await expect(page).not.toHaveURL(/error|500|exception/i);
  });

  test('XSS payload in login email field is not executed', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Attach a listener to catch any unexpected dialog (alert/confirm/prompt)
    let xssDialogTriggered = false;
    page.on('dialog', async (dialog) => {
      xssDialogTriggered = true;
      await dialog.dismiss();
    });

    await loginPage.login(SECURITY_PAYLOADS.xssScript, 'password');

    // Wait a moment for any async script execution
    await page.waitForTimeout(500);

    expect(xssDialogTriggered).toBe(false);
    // Verify the script was not injected into window
    const injected = await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss);
    expect(injected).toBeUndefined();
  });

  test('XSS payload in signup name field is treated as plain text', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    let xssDialogTriggered = false;
    page.on('dialog', async (dialog) => {
      xssDialogTriggered = true;
      await dialog.dismiss();
    });

    await loginPage.startSignup(
      SECURITY_PAYLOADS.xssImg,
      `xss.test.${Date.now()}@mailtest.dev`,
    );

    await page.waitForTimeout(500);

    expect(xssDialogTriggered).toBe(false);
    const injected = await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss);
    expect(injected).toBeUndefined();
  });

  test('excessively long email is handled gracefully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    const longEmail = `${'a'.repeat(200)}@mailtest.dev`;
    await loginPage.login(longEmail, 'password');

    // Should not crash the page — either validation error or auth error
    const hasAuthError = await loginPage.loginErrorMessage.isVisible();
    const stillOnPage = await page.locator('body').isVisible();
    expect(hasAuthError || stillOnPage).toBe(true);
    await expect(page).not.toHaveURL(/error|500/i);
  });

  test('password containing special characters is accepted at login', async ({ page }) => {
    // Tests that the auth system does not incorrectly reject valid special chars
    // This test registers inline so it fully controls the password
    const user = {
      ...generateTestUser(),
      password: "P@$$w0rd!#%^&*()<>?/|{}[]~`",
    };
    const loginPage = new LoginPage(page);
    const registerPage = new RegisterPage(page);
    const accountCreatedPage = new AccountCreatedPage(page);
    const dashboard = new DashboardPage(page);

    // Register with the special-character password
    await loginPage.goto();
    await loginPage.startSignup(user.name, user.email);
    await registerPage.fillAndSubmit({
      ...DEFAULT_REGISTRATION_DETAILS,
      password: user.password,
      firstName: 'Special',
      lastName: 'Chars',
    });
    await accountCreatedPage.continue();
    await dashboard.logout();

    // Now log back in
    await loginPage.goto();
    await loginPage.login(user.email, user.password);

    await expect(dashboard.loggedInIndicator).toBeVisible();

    // Teardown
    await dashboard.deleteAccount();
  });
});
