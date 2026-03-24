/**
 * Shared types, schema validators, and test-data factories for API tests.
 * https://automationexercise.com/api_list
 *
 * The API always returns HTTP 200 even for logical errors; the true status
 * is carried in the JSON `responseCode` field. Both are asserted in tests.
 */
import { expect } from '@playwright/test';

// ─── Response shape interfaces ────────────────────────────────────────────────

export interface ProductCategory {
  usertype: { usertype: string };
  category: string;
}

export interface Product {
  id: number;
  name: string;
  price: string;   // "Rs. 500"
  brand: string;
  category: ProductCategory;
}

export interface Brand {
  id: number;
  brand: string;
}

export interface ProductsListResponse {
  responseCode: number;
  products: Product[];
}

export interface BrandsListResponse {
  responseCode: number;
  brands: Brand[];
}

/** Generic envelope returned for search / login / account mutation endpoints */
export interface ApiMessageResponse {
  responseCode: number;
  message: string;
}

export interface UserDetailResponse {
  responseCode: number;
  user: {
    id: number;
    name: string;
    email: string;
    title: string;
    birth_day: string;
    birth_month: string;
    birth_year: string;
    first_name: string;
    last_name: string;
    company: string;
    address1: string;
    address2: string;
    country: string;
    state: string;
    city: string;
    zipcode: string;
  };
}

// ─── Schema validators ────────────────────────────────────────────────────────
// Each validator asserts the shape of a single object with a descriptive
// failure message so a broken response body is easy to diagnose.

const VALID_USER_TYPES = ['Women', 'Men', 'Kids'] as const;

export function assertProductSchema(product: unknown, label = 'product'): void {
  expect(product, `${label} must be an object`).toBeTruthy();
  const p = product as Record<string, unknown>;

  expect(typeof p['id'], `${label}.id type`).toBe('number');
  expect(p['id'] as number, `${label}.id must be > 0`).toBeGreaterThan(0);

  expect(typeof p['name'], `${label}.name type`).toBe('string');
  expect((p['name'] as string).length, `${label}.name must be non-empty`).toBeGreaterThan(0);

  expect(typeof p['price'], `${label}.price type`).toBe('string');
  expect(p['price'] as string, `${label}.price must match "Rs. <number>"`).toMatch(/^Rs\. \d+/);

  expect(typeof p['brand'], `${label}.brand type`).toBe('string');
  expect((p['brand'] as string).length, `${label}.brand must be non-empty`).toBeGreaterThan(0);

  const cat = p['category'] as Record<string, unknown>;
  expect(cat, `${label}.category must be an object`).toBeTruthy();
  expect(typeof cat['category'], `${label}.category.category type`).toBe('string');

  const ut = cat['usertype'] as Record<string, unknown>;
  expect(ut, `${label}.category.usertype must be an object`).toBeTruthy();
  expect(
    VALID_USER_TYPES as readonly unknown[],
    `${label}.category.usertype.usertype must be Women | Men | Kids`,
  ).toContain(ut['usertype']);
}

export function assertBrandSchema(brand: unknown, label = 'brand'): void {
  expect(brand, `${label} must be an object`).toBeTruthy();
  const b = brand as Record<string, unknown>;

  expect(typeof b['id'], `${label}.id type`).toBe('number');
  expect(b['id'] as number, `${label}.id must be > 0`).toBeGreaterThan(0);

  expect(typeof b['brand'], `${label}.brand type`).toBe('string');
  expect((b['brand'] as string).length, `${label}.brand must be non-empty`).toBeGreaterThan(0);
}

export function assertUserDetailSchema(user: unknown, label = 'user'): void {
  expect(user, `${label} must be an object`).toBeTruthy();
  const u = user as Record<string, unknown>;

  for (const field of ['id', 'name', 'email', 'first_name', 'last_name'] as const) {
    expect(u[field], `${label}.${field} must be present`).toBeTruthy();
  }
  expect(typeof u['id'], `${label}.id type`).toBe('number');
  expect(typeof u['email'], `${label}.email type`).toBe('string');
  expect(u['email'] as string, `${label}.email must contain @`).toContain('@');
}

// ─── Test-data factories ──────────────────────────────────────────────────────

export interface ApiUserPayload {
  name: string;
  email: string;
  password: string;
  title: string;
  birth_date: string;
  birth_month: string;
  birth_year: string;
  firstname: string;
  lastname: string;
  company: string;
  address1: string;
  address2: string;
  country: string;
  zipcode: string;
  state: string;
  city: string;
  mobile_number: string;
}

/**
 * Generates a unique user payload on every call.
 * Timestamp suffix prevents email collisions across parallel workers.
 */
export function generateApiUser(): ApiUserPayload {
  const id = Date.now();
  return {
    name: `API User ${id}`,
    email: `apiuser.${id}@mailtest.dev`,
    password: 'ApiTest@Password1',
    title: 'Mr',
    birth_date: '15',
    birth_month: 'June',
    birth_year: '1990',
    firstname: 'API',
    lastname: 'User',
    company: 'Test Corp',
    address1: '123 API Street',
    address2: 'Suite 100',
    country: 'United States',
    zipcode: '90001',
    state: 'California',
    city: 'Los Angeles',
    mobile_number: '5551234567',
  };
}

// ─── Timing helper ────────────────────────────────────────────────────────────

/**
 * Returns elapsed milliseconds. Use around a single `request.*` call:
 *
 *   const [response, ms] = await timed(() => request.get('/api/...'));
 *   expect(ms).toBeLessThan(500);
 */
export async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  return [result, Date.now() - start];
}
