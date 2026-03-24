# Example Patterns — Common Test Scenarios

These are lifted directly from this project's test suite. Use them as starting points.

---

## 1. Authentication flow (login + registration)

**Page Object pattern** — two independent forms on one page, grouped by region:

```typescript
// tests/e2e/pages/LoginPage.ts
constructor(page: Page) {
  super(page);

  // data-qa attributes are the preferred, stable selectors on this site
  this.loginEmailInput    = page.locator('[data-qa="login-email"]');
  this.loginPasswordInput = page.locator('[data-qa="login-password"]');
  this.loginButton        = page.locator('[data-qa="login-button"]');
  this.loginErrorMessage  = page.locator('p', { hasText: 'Your email or password is incorrect!' });

  this.signupNameInput    = page.locator('[data-qa="signup-name"]');
  this.signupEmailInput   = page.locator('[data-qa="signup-email"]');
  this.signupButton       = page.locator('[data-qa="signup-button"]');
  this.signupErrorMessage = page.locator('p', { hasText: 'Email Address already exist!' });

  // Role-based fallback for headings with no data attribute
  this.loginHeading  = page.getByRole('heading', { name: 'Login to your account' });
  this.signupHeading = page.getByRole('heading', { name: 'New User Signup!' });
}
```

**Spec — happy path + error + edge case in one describe block:**

```typescript
test.describe('Login — valid credentials', () => {
  test('logs in with correct email and password', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login(registeredUser.email, registeredUser.password);

    await expect(page).toHaveURL('https://automationexercise.com/');
    await expect(dashboard.loggedInIndicator).toBeVisible();
  });
});

test.describe('Login — invalid credentials', () => {
  test('shows error for wrong password', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login(registeredUser.email, 'WrongPassword!99');

    // Assert the specific error text, not just visibility
    await expect(loginPage.loginErrorMessage).toBeVisible();
    await expect(loginPage.loginErrorMessage).toHaveText('Your email or password is incorrect!');
    await expect(page).toHaveURL(/login/);
  });

  test('shows error for correct email but empty password', async ({ page, registeredUser }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.loginEmailInput.fill(registeredUser.email);
    await loginPage.loginButton.click();

    // Either HTML5 validation keeps user on page, OR server returns error
    const staysOnLogin = page.url().includes('login');
    const showsError   = await loginPage.loginErrorMessage.isVisible();
    expect(staysOnLogin || showsError).toBe(true);
  });
});
```

**Fixture — fresh registered user, cleaned up after every test:**

```typescript
registeredUser: async ({ page }, use) => {
  const user = generateTestUser();

  await registerUser(page, user);
  const dashboard = new DashboardPage(page);
  await dashboard.logout(); // test starts unauthenticated

  await use(user);

  try {
    const isLoggedIn = await dashboard.isLoggedIn();
    if (!isLoggedIn) await loginUser(page, user.email, user.password);
    await dashboard.deleteAccount();
  } catch { /* best-effort cleanup */ }
},
```

---

## 2. Multi-step form / wizard

**Pattern** — each step is its own Page Object; a helper composes steps into reusable flows:

```typescript
// tests/e2e/pages/RegisterPage.ts
async fillAndSubmit(details: RegistrationDetails): Promise<void> {
  await this.passwordInput.fill(details.password);
  await this.firstNameInput.fill(details.firstName);
  // ... more fields
  await this.createAccountButton.click();
}
```

```typescript
// tests/helpers/authHelper.ts
export async function registerUser(page: Page, user: UserCredentials): Promise<void> {
  const loginPage = new LoginPage(page);
  const registerPage = new RegisterPage(page);
  const accountCreatedPage = new AccountCreatedPage(page);

  await loginPage.goto();
  await loginPage.startSignup(user.name, user.email);
  await registerPage.fillAndSubmit({ ...DEFAULT_REGISTRATION_DETAILS, password: user.password });
  await accountCreatedPage.continue();
}
```

**In specs — use the helper, not raw page interactions:**

```typescript
test('registers a new user and shows Account Created confirmation', async ({ page }) => {
  const user = generateTestUser();
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.startSignup(user.name, user.email);

  await expect(registerPage.pageHeading).toBeVisible();
  await registerPage.fillAndSubmit({ ...DEFAULT_REGISTRATION_DETAILS, password: user.password });

  await expect(accountCreatedPage.heading).toBeVisible();
  await expect(page).toHaveURL(/account_created/);

  await accountCreatedPage.continue();
  await expect(dashboard.loggedInIndicator).toBeVisible();

  await dashboard.deleteAccount(); // inline teardown
});
```

---

## 3. Cart / list page

**Pattern** — index-based accessors + aggregate helpers:

```typescript
// tests/e2e/pages/CartPage.ts
async getItemName(index: number): Promise<string> {
  return this.cartItems.nth(index).locator('[data-qa="product-name"]').innerText();
}

async getItemCount(): Promise<number> {
  return this.cartItems.count();
}

async hasItems(): Promise<boolean> {
  return (await this.cartItems.count()) > 0;
}

async removeItem(index: number): Promise<void> {
  await this.cartItems.nth(index).locator('[data-qa="remove-item"]').click();
}
```

**Spec — edge cases for empty and populated states:**

```typescript
test('empty cart shows no items', async ({ authenticatedPage: page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  expect(await cartPage.hasItems()).toBe(false);
});

test('removing a cart item reduces the item count', async ({ checkoutReadyPage: { page } }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const before = await cartPage.getItemCount();
  await cartPage.removeItem(0);

  expect(await cartPage.getItemCount()).toBe(before - 1);
});
```

---

## 4. Payment / sensitive form

**Pattern** — named card data constants in fixtures, submit method for each scenario:

```typescript
// tests/fixtures/checkout.ts
export const VALID_CARD: CardDetails   = { nameOnCard: 'Test User', cardNumber: '4111111111111111', cvc: '123', expiryMonth: '12', expiryYear: '2028' };
export const EXPIRED_CARD: CardDetails = { nameOnCard: 'Expired',   cardNumber: '4111111111111111', cvc: '123', expiryMonth: '01', expiryYear: '2020' };
export const EMPTY_CARD: CardDetails   = { nameOnCard: '',          cardNumber: '',                 cvc: '',    expiryMonth: '',   expiryYear: ''     };
```

```typescript
test('payment with an expired card does not reach confirmation', async ({ checkoutReadyPage: { page } }) => {
  await proceedToCheckoutFromCart(page);
  await new CheckoutPage(page).placeOrder();
  await new PaymentPage(page).fillAndConfirm(EXPIRED_CARD);

  await expect(page).not.toHaveURL(/payment_done/);
});

test('payment form with all empty fields does not complete the order', async ({ checkoutReadyPage: { page } }) => {
  await proceedToCheckoutFromCart(page);
  await new CheckoutPage(page).placeOrder();
  await new PaymentPage(page).submitEmpty();

  await expect(page).toHaveURL(/payment/);
  await expect(page).not.toHaveURL(/payment_done/);
});
```

---

## 5. Security edge cases

```typescript
test('SQL injection in email field shows credentials error, not a server error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(SECURITY_PAYLOADS.sqlInjection, 'password');

  await expect(loginPage.loginErrorMessage).toBeVisible();
  await expect(loginPage.loginErrorMessage).toHaveText('Your email or password is incorrect!');
  await expect(page).not.toHaveURL(/error|500|exception/i);
});

test('XSS payload in input field is not executed', async ({ page }) => {
  let xssDialogTriggered = false;
  page.on('dialog', async (dialog) => { xssDialogTriggered = true; await dialog.dismiss(); });

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(SECURITY_PAYLOADS.xssScript, 'password');

  await page.waitForTimeout(500);

  expect(xssDialogTriggered).toBe(false);
  const injected = await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss);
  expect(injected).toBeUndefined();
});
```

---

## 6. Accessibility

```typescript
test('form fields are focusable in logical tab order', async ({ checkoutReadyPage: { page } }) => {
  const paymentPage = new PaymentPage(page);

  await paymentPage.nameOnCardInput.focus();
  await expect(paymentPage.nameOnCardInput).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(paymentPage.cardNumberInput).toBeFocused();
  // ... continue through all fields
});

test('modal can be dismissed with the keyboard', async ({ authenticatedPage: page }) => {
  // ... trigger modal
  await modalContinueButton.focus();
  await expect(modalContinueButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(modal).not.toBeVisible();
});
```

---

## 7. Responsive / mobile viewport

```typescript
test.describe('Responsive — mobile viewport (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('key button is visible and tappable on mobile', async ({ authenticatedPage: page }) => {
    const cartPage = new CartPage(page);
    await cartPage.goto();

    await expect(cartPage.proceedToCheckoutButton).toBeVisible();
    const box = await cartPage.proceedToCheckoutButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  });
});
```

---

## 8. Unimplemented features

Mark with `test.fixme` — visible in CI reports as pending work, not silent gaps:

```typescript
test.fixme('shows a forgot password link on the login page', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();

  const forgotLink = page.getByRole('link', { name: /forgot.*password/i });
  await expect(forgotLink).toBeVisible();
  // automationexercise.com does not implement a forgot-password flow yet
});
```

---

## Selector decision tree

```
Does the element have data-qa or data-testid?
  YES → page.locator('[data-qa="..."]')           ← always prefer
  NO  → Is there a semantic role + accessible name?
          YES → page.getByRole('button', { name: '...' })
          NO  → Is there visible text?
                  YES → page.getByText('...') or page.locator('tag', { hasText: '...' })
                  NO  → Use a stable ID or unique attribute
                        page.locator('#stable-id')
                        NEVER: CSS class (.some-class), XPath (//div)
```
