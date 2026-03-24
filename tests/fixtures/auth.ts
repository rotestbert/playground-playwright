/**
 * Shared test data for authentication flows.
 * https://automationexercise.com
 */

export interface UserCredentials {
  name: string;
  email: string;
  password: string;
}

export interface RegistrationDetails {
  password: string;
  firstName: string;
  lastName: string;
  address: string;
  country: string;
  state: string;
  city: string;
  zipcode: string;
  mobileNumber: string;
}

/**
 * Generates a unique test user on every call.
 * Uses Date.now() so concurrent workers never collide.
 */
export function generateTestUser(): UserCredentials {
  const id = Date.now();
  return {
    name: `Test User ${id}`,
    email: `testuser.${id}@mailtest.dev`,
    password: 'Test@Password123',
  };
}

/**
 * Default registration detail values used when the specifics don't matter.
 * Override individual fields as needed per test.
 */
export const DEFAULT_REGISTRATION_DETAILS: Omit<RegistrationDetails, 'password'> = {
  firstName: 'Test',
  lastName: 'User',
  address: '123 Automation Street',
  country: 'United States',
  state: 'California',
  city: 'Los Angeles',
  zipcode: '90001',
  mobileNumber: '5551234567',
};

/** Security payloads reused across edge-case tests */
export const SECURITY_PAYLOADS = {
  sqlInjection: "' OR '1'='1' --",
  xssScript: '<script>window.__xss=true</script>',
  xssImg: '<img src=x onerror="window.__xss=true">',
} as const;
