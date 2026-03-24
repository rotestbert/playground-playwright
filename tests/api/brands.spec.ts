/**
 * API 3 — GET /api/brandsList  → 200, brands array
 * API 4 — PUT /api/brandsList  → 405, method not supported
 */
import { test, expect } from '@playwright/test';
import { assertBrandSchema, timed, type BrandsListResponse } from '../fixtures/api.js';

// Brands confirmed present in the live response
const KNOWN_BRANDS = ['Polo', 'H&M', 'Madame', 'Biba', 'Babyhug', 'Mast & Harbour'];

test.describe('GET /api/brandsList', () => {
  test('returns HTTP 200 with responseCode 200', async ({ request }) => {
    const response = await request.get('/api/brandsList');
    expect(response.status()).toBe(200);

    const body = await response.json() as BrandsListResponse;
    expect(body.responseCode).toBe(200);
  });

  test('response time is under 500 ms', async ({ request }) => {
    const [, ms] = await timed(() => request.get('/api/brandsList'));
    expect(ms, `Expected < 500 ms, got ${ms} ms`).toBeLessThan(500);
  });

  test('response body contains a non-empty brands array', async ({ request }) => {
    const body = await (await request.get('/api/brandsList')).json() as BrandsListResponse;

    expect(Array.isArray(body.brands)).toBe(true);
    expect(body.brands.length).toBeGreaterThan(0);
  });

  test('every brand matches the expected schema', async ({ request }) => {
    const body = await (await request.get('/api/brandsList')).json() as BrandsListResponse;

    for (const [i, brand] of body.brands.entries()) {
      assertBrandSchema(brand, `brands[${i}]`);
    }
  });

  test('all known brands are present in the response', async ({ request }) => {
    const body = await (await request.get('/api/brandsList')).json() as BrandsListResponse;

    const brandNames = body.brands.map((b) => b.brand);
    for (const known of KNOWN_BRANDS) {
      expect(brandNames, `Expected "${known}" to be in the brands list`).toContain(known);
    }
  });

  test('brand ids are positive integers', async ({ request }) => {
    const body = await (await request.get('/api/brandsList')).json() as BrandsListResponse;

    for (const brand of body.brands) {
      expect(brand.id).toBeGreaterThan(0);
    }
  });

  test('Content-Type header is application/json', async ({ request }) => {
    const response = await request.get('/api/brandsList');
    expect(response.headers()['content-type']).toContain('application/json');
  });
});

test.describe('PUT /api/brandsList', () => {
  test('returns responseCode 405 — method not supported', async ({ request }) => {
    const response = await request.put('/api/brandsList');
    const body = await response.json() as { responseCode: number; message: string };

    expect(body.responseCode).toBe(405);
    expect(body.message).toMatch(/not supported/i);
  });

  test('response time is under 2000 ms', async ({ request }) => {
    const [, ms] = await timed(() => request.put('/api/brandsList'));
    expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
  });
});
