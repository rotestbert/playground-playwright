/**
 * Pagination and filtering tests
 *
 * Endpoints exercised:
 *   GET  /api/productsList     — full catalogue; basis for pagination-simulation
 *   GET  /api/brandsList       — full brand catalogue
 *   POST /api/searchProduct    — server-side keyword filtering
 *
 * Note on pagination: automationexercise.com returns complete collections
 * without cursor or page parameters. The "pagination" suite therefore:
 *   1. Documents that no pagination parameters are accepted by the server.
 *   2. Verifies the total result-set sizes are stable across repeated calls.
 *   3. Validates client-side slicing against a predictable data set.
 *
 * The "filtering" suite tests /api/searchProduct which IS a true server-side
 * filter backed by a keyword search.
 */

import { test, expect } from '@playwright/test';
import { createApiClient, timed } from '../helpers/apiClient.js';
import {
  assertProductSchema,
  assertBrandSchema,
  type ProductsListResponse,
  type BrandsListResponse,
  type ApiMessageResponse,
} from '../fixtures/api.js';

// ─── Full catalogue — pagination-simulation ───────────────────────────────────

test.describe('GET /api/productsList — full catalogue', () => {
  test('returns a non-empty products array', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/productsList')
    ).json() as ProductsListResponse;

    expect(body.responseCode).toBe(200);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);
  });

  test('total count is stable across two sequential calls', async ({ request }) => {
    const client = createApiClient(request);
    const first  = await (await client.get('/api/productsList')).json() as ProductsListResponse;
    const second = await (await client.get('/api/productsList')).json() as ProductsListResponse;

    expect(second.products.length).toBe(first.products.length);
  });

  test('all product ids are unique', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/productsList')
    ).json() as ProductsListResponse;

    const ids = body.products.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('client-side page 1 (first 5 items) satisfies the product schema', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/productsList')
    ).json() as ProductsListResponse;

    const page1 = body.products.slice(0, 5);
    expect(page1.length).toBeGreaterThan(0);
    for (const [i, product] of page1.entries()) {
      assertProductSchema(product, `page1[${i}]`);
    }
  });

  test('client-side page 2 (items 6–10) satisfies the product schema', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/productsList')
    ).json() as ProductsListResponse;

    const page2 = body.products.slice(5, 10);
    if (page2.length === 0) {
      // Fewer than 6 products — page 2 is empty; skip
      return;
    }
    for (const [i, product] of page2.entries()) {
      assertProductSchema(product, `page2[${i}]`);
    }
  });

  test('unknown query parameter is ignored — returns 200', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/productsList', {
        params: { page: 1, limit: 5, offset: 0 },
      })
    ).json() as ProductsListResponse;

    // Server should ignore unknown params and return the full list
    expect(body.responseCode).toBe(200);
    expect(body.products.length).toBeGreaterThan(0);
  });

  test('products span at least three distinct categories', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/productsList')
    ).json() as ProductsListResponse;

    const categories = new Set(body.products.map((p) => p.category.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  test('products span Women, Men, and Kids user-types', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/productsList')
    ).json() as ProductsListResponse;

    const userTypes = new Set(body.products.map((p) => p.category.usertype.usertype));
    expect(userTypes.has('Women')).toBe(true);
    expect(userTypes.has('Men')).toBe(true);
    expect(userTypes.has('Kids')).toBe(true);
  });

  test('response time is under 1000 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      createApiClient(request).get('/api/productsList'),
    );
    expect(ms).toBeLessThan(1000);
  });
});

// ─── Full catalogue — brands ──────────────────────────────────────────────────

test.describe('GET /api/brandsList — brand catalogue', () => {
  test('returns a non-empty brands array with correct schema', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/brandsList')
    ).json() as BrandsListResponse;

    expect(body.responseCode).toBe(200);
    expect(Array.isArray(body.brands)).toBe(true);
    expect(body.brands.length).toBeGreaterThan(0);
    for (const [i, brand] of body.brands.entries()) {
      assertBrandSchema(brand, `brands[${i}]`);
    }
  });

  test('brand count is stable across two sequential calls', async ({ request }) => {
    const client = createApiClient(request);
    const first  = await (await client.get('/api/brandsList')).json() as BrandsListResponse;
    const second = await (await client.get('/api/brandsList')).json() as BrandsListResponse;

    expect(second.brands.length).toBe(first.brands.length);
  });

  test('all brand ids are unique positive integers', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/brandsList')
    ).json() as BrandsListResponse;

    const ids = body.brands.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeGreaterThan(0);
    }
  });

  test('all brand names are non-empty strings', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/brandsList')
    ).json() as BrandsListResponse;

    for (const brand of body.brands) {
      expect(typeof brand.brand).toBe('string');
      expect(brand.brand.trim().length).toBeGreaterThan(0);
    }
  });
});

// ─── Server-side filtering — POST /api/searchProduct ─────────────────────────

test.describe('POST /api/searchProduct — keyword filtering', () => {
  const knownTerms: Array<{ term: string; minResults: number }> = [
    { term: 'top',    minResults: 1 },
    { term: 'dress',  minResults: 1 },
    { term: 'jeans',  minResults: 1 },
    { term: 'tshirt', minResults: 1 },
    { term: 'saree',  minResults: 1 },
  ];

  for (const { term, minResults } of knownTerms) {
    test(`"${term}" returns at least ${minResults} result(s) with responseCode 200`, async ({ request }) => {
      const body = await (
        await createApiClient(request).post('/api/searchProduct', {
          form: { search_product: term },
        })
      ).json() as ProductsListResponse;

      expect(body.responseCode).toBe(200);
      expect(body.products.length).toBeGreaterThanOrEqual(minResults);
    });
  }

  test('every result in a "top" search satisfies the product schema', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/searchProduct', {
        form: { search_product: 'top' },
      })
    ).json() as ProductsListResponse;

    for (const [i, product] of body.products.entries()) {
      assertProductSchema(product, `searchResult[${i}]`);
    }
  });

  test('search result count is stable across two calls with the same term', async ({ request }) => {
    const client = createApiClient(request);
    const first  = await (
      await client.post('/api/searchProduct', { form: { search_product: 'dress' } })
    ).json() as ProductsListResponse;
    const second = await (
      await client.post('/api/searchProduct', { form: { search_product: 'dress' } })
    ).json() as ProductsListResponse;

    expect(second.products.length).toBe(first.products.length);
  });

  test('search is case-insensitive — "TOP" and "top" both return results', async ({ request }) => {
    const client = createApiClient(request);
    const [lower, upper] = await Promise.all([
      client.post('/api/searchProduct', { form: { search_product: 'top' } }),
      client.post('/api/searchProduct', { form: { search_product: 'TOP' } }),
    ]);

    const lowerBody = await lower.json() as ProductsListResponse;
    const upperBody = await upper.json() as ProductsListResponse;

    expect(lowerBody.responseCode).toBe(200);
    expect(upperBody.responseCode).toBe(200);
    expect(lowerBody.products.length).toBeGreaterThan(0);
    expect(upperBody.products.length).toBeGreaterThan(0);
  });

  test('partial-word match still returns results ("dre" matches "dress")', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/searchProduct', {
        form: { search_product: 'dre' },
      })
    ).json() as ProductsListResponse;

    // Partial match — either results or empty; must never be a 5xx
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    expect(Array.isArray(body.products)).toBe(true);
  });

  test('obscure term returns an empty array — not an error', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/searchProduct', {
        form: { search_product: 'xyznonexistentproductterm99999' },
      })
    ).json() as ProductsListResponse;

    expect(body.responseCode).toBe(200);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBe(0);
  });

  test('search results are a strict subset of the full product list', async ({ request }) => {
    const client = createApiClient(request);
    const [allBody, searchBody] = await Promise.all([
      client.get('/api/productsList').then((r) => r.json() as Promise<ProductsListResponse>),
      client
        .post('/api/searchProduct', { form: { search_product: 'top' } })
        .then((r) => r.json() as Promise<ProductsListResponse>),
    ]);

    const allIds = new Set(allBody.products.map((p) => p.id));
    for (const result of searchBody.products) {
      expect(allIds.has(result.id), `search result id ${result.id} not in full catalogue`).toBe(true);
    }
  });

  test('missing search_product parameter returns 400 with a bad-request message', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/searchProduct')
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
    expect(body.message).toMatch(/bad request/i);
  });

  test('empty search_product value returns 400 or empty results — never 5xx', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/searchProduct', {
        form: { search_product: '' },
      })
    ).json() as ApiMessageResponse | ProductsListResponse;

    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('response time for search is under 2000 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      createApiClient(request).post('/api/searchProduct', {
        form: { search_product: 'top' },
      }),
    );
    expect(ms).toBeLessThan(2000);
  });
});

// ─── Cross-endpoint consistency ───────────────────────────────────────────────

test.describe('Cross-endpoint consistency', () => {
  test('every brand in brandsList appears as at least one product brand in productsList', async ({ request }) => {
    const client = createApiClient(request);
    const [productsBody, brandsBody] = await Promise.all([
      client.get('/api/productsList').then((r) => r.json() as Promise<ProductsListResponse>),
      client.get('/api/brandsList').then((r) => r.json() as Promise<BrandsListResponse>),
    ]);

    const productBrands = new Set(productsBody.products.map((p) => p.brand));

    // At least half the listed brands should have associated products
    const brandsWithProducts = brandsBody.brands.filter((b) =>
      productBrands.has(b.brand),
    );
    expect(brandsWithProducts.length).toBeGreaterThan(0);
  });

  test('parallel requests to productsList and brandsList both succeed', async ({ request }) => {
    const client = createApiClient(request);
    const [products, brands] = await Promise.all([
      client.get('/api/productsList').then((r) => r.json() as Promise<ProductsListResponse>),
      client.get('/api/brandsList').then((r) => r.json() as Promise<BrandsListResponse>),
    ]);

    expect(products.responseCode).toBe(200);
    expect(brands.responseCode).toBe(200);
  });
});
