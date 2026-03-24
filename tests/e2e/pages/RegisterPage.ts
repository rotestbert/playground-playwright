import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';
import type { RegistrationDetails } from '../../fixtures/auth.js';

/**
 * POM for https://automationexercise.com/signup
 * "Enter Account Information" — the second step of the registration flow.
 * Reached after completing the signup form on /login.
 */
export class RegisterPage extends BasePage {
  readonly pageHeading: Locator;

  // Account info
  readonly titleMrRadio: Locator;
  readonly titleMrsRadio: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly dobDaySelect: Locator;
  readonly dobMonthSelect: Locator;
  readonly dobYearSelect: Locator;

  // Address info
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly companyInput: Locator;
  readonly addressInput: Locator;
  readonly countrySelect: Locator;
  readonly stateInput: Locator;
  readonly cityInput: Locator;
  readonly zipcodeInput: Locator;
  readonly mobileNumberInput: Locator;

  readonly createAccountButton: Locator;

  constructor(page: Page) {
    super(page);

    this.pageHeading = page.getByRole('heading', { name: /enter account information/i });

    this.titleMrRadio = page.locator('#id_gender1');
    this.titleMrsRadio = page.locator('#id_gender2');
    this.nameInput = page.locator('[data-qa="name"]');
    this.emailInput = page.locator('[data-qa="email"]');
    this.passwordInput = page.locator('[data-qa="password"]');
    this.dobDaySelect = page.locator('[data-qa="days"]');
    this.dobMonthSelect = page.locator('[data-qa="months"]');
    this.dobYearSelect = page.locator('[data-qa="years"]');

    this.firstNameInput = page.locator('[data-qa="first_name"]');
    this.lastNameInput = page.locator('[data-qa="last_name"]');
    this.companyInput = page.locator('[data-qa="company"]');
    this.addressInput = page.locator('[data-qa="address"]');
    this.countrySelect = page.locator('[data-qa="country"]');
    this.stateInput = page.locator('[data-qa="state"]');
    this.cityInput = page.locator('[data-qa="city"]');
    this.zipcodeInput = page.locator('[data-qa="zipcode"]');
    this.mobileNumberInput = page.locator('[data-qa="mobile_number"]');

    this.createAccountButton = page.locator('[data-qa="create-account"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  /** Fill all required fields and submit the registration form. */
  async fillAndSubmit(details: RegistrationDetails): Promise<void> {
    await this.passwordInput.fill(details.password);
    await this.firstNameInput.fill(details.firstName);
    await this.lastNameInput.fill(details.lastName);
    await this.addressInput.fill(details.address);
    await this.countrySelect.selectOption(details.country);
    await this.stateInput.fill(details.state);
    await this.cityInput.fill(details.city);
    await this.zipcodeInput.fill(details.zipcode);
    await this.mobileNumberInput.fill(details.mobileNumber);
    await this.createAccountButton.click();
  }
}
