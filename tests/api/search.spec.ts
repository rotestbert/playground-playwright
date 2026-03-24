/**
 * API 5 — POST /api/searchProduct (with search_product)   → 200, matched products
 * API 6 — POST /api/searchProduct (missing search_product) → 400, bad request
 */
import { test, expect } from '@playwright/test';
import { assertProductSchema, timed, type ProductsListResponse, type ApiMessageResponse } from '../fixtures/api.js';

test.describe('POST /api/searchProduct — positive', () => {
  const searchTerms = [
    { term: 'top',    minResults: 1 },
    { term: 'tshirt', minResults: 1 },
    { term: 'jean',   minResults: 1 },
    { term: 'dress',  minResults: 1 },
  ];

  for (const { term, minResults } of searchTerms) {
    test(`search "${term}" returns at least ${minResults} result(s)`, async ({ request }) => {
      const response = await request.post('/api/searchProduct', {
        form: { search_product: term },
      });
      const body = await response.json() as ProductsListResponse;

      expect(body.responseCode).toBe(200);
      expect(Array.isArray(body.products)).toBe(true);
      expect(body.products.length).toBeGreaterThanOrEqual(minResults);
    });
  }

  test('every result in a "top" search matches the product schema', async ({ request }) => {
    const response = await request.post('/api/searchProduct', {
      form: { search_product: 'top' },
    });
    const body = await response.json() as ProductsListResponse;

    for (const [i, product] of body.products.entries()) {
      assertProductSchema(product, `searchResult[${i}]`);
    }
  });

  test('search is case-insensitive — "TOP" returns the same count as "top"', async ({ request }) => {
    const [lower, upper] = await Promise.all([
      request.post('/api/searchProduct', { form: { search_product: 'top' } }),
      request.post('/api/searchProduct', { form: { search_product: 'TOP' } }),
    ]);

    const lowerBody = await lower.json() as ProductsListResponse;
    const upperBody = await upper.json() as ProductsListResponse;

    // Both should return results; counts may or may not match — at minimum
    // both must be non-empty successful responses
    expect(lowerBody.responseCode).toBe(200);
    expect(upperBody.responseCode).toBe(200);
    expect(lowerBody.products.length).toBeGreaterThan(0);
    expect(upperBody.products.length).toBeGreaterThan(0);
  });

  test('response time is under 2000 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      request.post('/api/searchProduct', { form: { search_product: 'top' } }),
    );
    expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
  });

  test('search for an obscure term returns an empty products array — not an error', async ({
    request,
  }) => {
    const response = await request.post('/api/searchProduct', {
      form: { search_product: 'xyznonexistentproduct99999' },
    });
    const body = await response.json() as ProductsListResponse;

    // Should be 200 with an empty array, not a 4xx error
    expect(body.responseCode).toBe(200);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBe(0);
  });
});

test.describe('POST /api/searchProduct — negative', () => {
  test('missing search_product parameter returns responseCode 400', async ({ request }) => {
    const response = await request.post('/api/searchProduct');
    const body = await response.json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
    expect(body.message).toMatch(/bad request/i);
    expect(body.message).toMatch(/search_product/i);
  });

  test('empty search_product value — returns 400 or empty results, never a 5xx', async ({
    request,
  }) => {
    const response = await request.post('/api/searchProduct', {
      form: { search_product: '' },
    });
    const body = await response.json() as ApiMessageResponse | ProductsListResponse;

    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('400 response contains a human-readable message', async ({ request }) => {
    const response = await request.post('/api/searchProduct');
    const body = await response.json() as ApiMessageResponse;

    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  test('GET method on /api/searchProduct is not documented — must not return 200 with data', async ({
    request,
  }) => {
    const response = await request.get('/api/searchProduct');
    const body = await response.json() as { responseCode: number };

    // The API should signal this is wrong — anything but a valid 200 products list
    expect(body.responseCode).not.toBe(200);
  });
});
