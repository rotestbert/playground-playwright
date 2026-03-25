/**
 * API 1 — GET  /api/productsList  → 200, products array
 * API 2 — POST /api/productsList  → 405, method not supported
 */
import { test, expect } from '@playwright/test';
import { assertProductSchema, timed, type ProductsListResponse } from '../fixtures/api.js';

test.describe('GET /api/productsList', () => {
  test('returns HTTP 200 with responseCode 200', async ({ request }) => {
    const response = await request.get('/api/productsList');
    expect(response.status()).toBe(200);

    const body = await response.json() as ProductsListResponse;
    expect(body.responseCode).toBe(200);
  });

  test('response time is under 500 ms', async ({ request }) => {
    const [, ms] = await timed(() => request.get('/api/productsList'));
    expect(ms, `Expected < 500 ms, got ${ms} ms`).toBeLessThan(500);
  });

  test('response body contains a non-empty products array', async ({ request }) => {
    const body = await (await request.get('/api/productsList')).json() as ProductsListResponse;

    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);
  });

  test('every product matches the expected schema', async ({ request }) => {
    const body = await (await request.get('/api/productsList')).json() as ProductsListResponse;

    for (const [i, product] of body.products.entries()) {
      assertProductSchema(product, `products[${i}]`);
    }
  });

  test('every product id is a unique positive integer', async ({ request }) => {
    const body = await (await request.get('/api/productsList')).json() as ProductsListResponse;

    const ids = body.products.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    ids.forEach((id) => expect(id).toBeGreaterThan(0));
  });

  test('all prices follow the "Rs. <number>" format', async ({ request }) => {
    const body = await (await request.get('/api/productsList')).json() as ProductsListResponse;

    for (const product of body.products) {
      expect(product.price, `price for "${product.name}"`).toMatch(/^Rs\. \d+/);
    }
  });

  test('contains products across multiple user types (Women, Men, Kids)', async ({ request }) => {
    const body = await (await request.get('/api/productsList')).json() as ProductsListResponse;

    const userTypes = new Set(
      body.products.map((p) => p.category.usertype.usertype),
    );
    expect(userTypes.has('Women')).toBe(true);
    expect(userTypes.has('Men')).toBe(true);
    expect(userTypes.has('Kids')).toBe(true);
  });

  test('Content-Type header is present in the response', async ({ request }) => {
    // The API currently returns text/html content-type even for JSON payloads.
    // This test documents that a content-type header is always present;
    // update to 'application/json' if the API is fixed to set the correct header.
    const response = await request.get('/api/productsList');
    const contentType = response.headers()['content-type'];
    expect(contentType).toBeTruthy();
    // Body must still be parseable as JSON regardless of content-type header
    const body = await response.json();
    expect(body).toHaveProperty('products');
  });
});

test.describe('POST /api/productsList', () => {
  test('returns responseCode 405 — method not supported', async ({ request }) => {
    const response = await request.post('/api/productsList');
    const body = await response.json() as { responseCode: number; message: string };

    expect(body.responseCode).toBe(405);
    expect(body.message).toMatch(/not supported/i);
  });

  test('response time is under 2000 ms', async ({ request }) => {
    const [, ms] = await timed(() => request.post('/api/productsList'));
    expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
  });

  test('405 response body contains a message field', async ({ request }) => {
    const body = await (await request.post('/api/productsList')).json() as { responseCode: number; message: string };

    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });
});
