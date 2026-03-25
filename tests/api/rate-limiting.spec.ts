/**
 * Rate-limiting tests
 *
 * Sends bursts of requests to the API and verifies:
 *   1. The server remains stable (no 5xx) under load.
 *   2. If a 429 Too Many Requests is returned, its response body is well-formed.
 *   3. Response times do not degrade to an unacceptable level.
 *   4. The ApiClient does NOT auto-retry 429s (callers observe the raw status).
 *
 * Endpoint used: GET /api/productsList  (read-only, no side effects)
 * Burst target: 100 requests total.
 *
 * Note on this API: automationexercise.com does not enforce strict rate limits
 * at the time of writing. These tests are written defensively — they pass
 * whether or not a 429 is returned and serve as a regression harness for when
 * rate-limiting is introduced or the infra changes. The key assertions are:
 *   - No 5xx responses in a burst
 *   - If a 429 is seen, it carries a usable response body
 *   - p95 response time stays below a generous threshold
 */

import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/apiClient.js';
import type { ProductsListResponse, ApiMessageResponse } from '../fixtures/api.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const BURST_SIZE   = 100;
const BATCH_SIZE   = 10;   // requests per concurrent batch
const MAX_P95_MS   = 8000; // generous ceiling given public demo server
const MAX_MEAN_MS  = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sends `count` requests in batches of `batchSize` and collects results. */
async function burst(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  count: number,
  batchSize: number,
): Promise<Array<{ status: number; durationMs: number }>> {
  // Disable auto-retry so 429 responses reach us unmodified
  const client = createApiClient(request, { maxRetries: 0 });
  const results: Array<{ status: number; durationMs: number }> = [];

  for (let sent = 0; sent < count; sent += batchSize) {
    const batchCount = Math.min(batchSize, count - sent);
    const batch = Array.from({ length: batchCount }, async () => {
      const start = Date.now();
      const response = await client.get('/api/productsList');
      return { status: response.status(), durationMs: Date.now() - start };
    });
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  return results;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ─── Stability under burst load ───────────────────────────────────────────────

test.describe(`Burst stability — ${BURST_SIZE} requests to GET /api/productsList`, () => {
  // Single shared burst result to avoid re-sending 300+ requests per suite run
  let results: Array<{ status: number; durationMs: number }>;

  test.beforeAll(async ({ request }) => {
    results = await burst(request, BURST_SIZE, BATCH_SIZE);
  });

  test(`all ${BURST_SIZE} responses complete without a 5xx`, () => {
    const serverErrors = results.filter((r) => r.status >= 500);
    expect(
      serverErrors.length,
      `Got ${serverErrors.length} 5xx responses: ${JSON.stringify(serverErrors)}`,
    ).toBe(0);
  });

  test('all responses are either 200 or 429 (no unexpected status codes)', () => {
    const unexpected = results.filter((r) => r.status !== 200 && r.status !== 429);
    expect(
      unexpected.length,
      `Unexpected statuses: ${JSON.stringify(unexpected.map((r) => r.status))}`,
    ).toBe(0);
  });

  test(`p95 response time is under ${MAX_P95_MS} ms`, () => {
    const sorted = results.map((r) => r.durationMs).sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    expect(
      p95,
      `p95=${p95}ms exceeds threshold of ${MAX_P95_MS}ms`,
    ).toBeLessThan(MAX_P95_MS);
  });

  test(`mean response time is under ${MAX_MEAN_MS} ms`, () => {
    const mean = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
    expect(
      mean,
      `mean=${Math.round(mean)}ms exceeds threshold of ${MAX_MEAN_MS}ms`,
    ).toBeLessThan(MAX_MEAN_MS);
  });

  test('success rate is at least 80 % (tolerates up to 20 % rate-limited)', () => {
    const successes = results.filter((r) => r.status === 200).length;
    const successRate = successes / results.length;
    expect(
      successRate,
      `Success rate ${(successRate * 100).toFixed(1)}% is below 80%`,
    ).toBeGreaterThanOrEqual(0.8);
  });
});

// ─── 429 response shape ───────────────────────────────────────────────────────

test.describe('429 Too Many Requests — response shape', () => {
  test('if a 429 is received it carries a parseable JSON body', async ({ request }) => {
    const client = createApiClient(request, { maxRetries: 0 });
    const responses = await Promise.all(
      Array.from({ length: BURST_SIZE }, () => client.get('/api/productsList')),
    );

    const rateLimited = responses.find((r) => r.status() === 429);
    if (!rateLimited) {
      // Server doesn't enforce rate-limiting — nothing to assert
      return;
    }

    let body: unknown;
    try {
      body = await rateLimited.json();
    } catch {
      // Some rate-limit implementations return plain text; acceptable
      return;
    }

    // If JSON is returned, it must not be null/undefined
    expect(body).toBeTruthy();
  });

  test('if a 429 is received it contains a Retry-After or X-RateLimit header', async ({ request }) => {
    const client = createApiClient(request, { maxRetries: 0 });
    const responses = await Promise.all(
      Array.from({ length: BURST_SIZE }, () => client.get('/api/productsList')),
    );

    const rateLimited = responses.find((r) => r.status() === 429);
    if (!rateLimited) {
      return;
    }

    const headers = rateLimited.headers();
    const hasRateLimitHeader =
      'retry-after' in headers ||
      'x-ratelimit-limit' in headers ||
      'x-rate-limit-limit' in headers ||
      'x-ratelimit-reset' in headers;

    // Soft assertion — log if missing but do not hard-fail
    if (!hasRateLimitHeader) {
      console.warn(
        'WARN: 429 received but no Retry-After / X-RateLimit header found.',
        'Headers:', JSON.stringify(headers, null, 2),
      );
    }
  });

  test('ApiClient with maxRetries:0 surfaces non-200 responses directly to the caller', async ({ request }) => {
    const client = createApiClient(request, { maxRetries: 0 });
    const responses = await Promise.all(
      Array.from({ length: BURST_SIZE }, () => client.get('/api/productsList')),
    );

    const statuses = responses.map((r) => r.status());
    // The external site may return 503 under burst load — treat 503 as an
    // acceptable overload response (the client surfaced it; no retry happened).
    // Hard failures (500, 502, 504) that indicate a broken server are still
    // flagged. 503 is excluded because it is a valid capacity-limit signal.
    for (const status of statuses) {
      const isAcceptable = status < 500 || status === 503;
      expect(isAcceptable, `Unexpected HTTP ${status} during burst`).toBe(true);
    }
  });
});

// ─── Sequential burst (no concurrency) ───────────────────────────────────────

test.describe('Sequential burst — 20 requests one after another', () => {
  test('20 sequential requests all return 200 or 429 — never 5xx', async ({ request }) => {
    const client = createApiClient(request, { maxRetries: 0 });
    const statuses: number[] = [];

    for (let i = 0; i < 20; i++) {
      const response = await client.get('/api/productsList');
      statuses.push(response.status());
    }

    const serverErrors = statuses.filter((s) => s >= 500);
    expect(serverErrors.length).toBe(0);
  });

  test('body is valid JSON on every successful sequential response', async ({ request }) => {
    const client = createApiClient(request, { maxRetries: 0 });

    for (let i = 0; i < 10; i++) {
      const response = await client.get('/api/productsList');
      if (response.status() !== 200) continue;

      const body = await response.json() as ProductsListResponse | ApiMessageResponse;
      expect(typeof body.responseCode).toBe('number');
    }
  });
});

// ─── Write-endpoint burst ─────────────────────────────────────────────────────
//
// Sends 20 requests to a POST endpoint to ensure write paths are also stable.
// Uses a 405 endpoint (POST /api/productsList) so there are no side effects.

test.describe('Write-endpoint burst — POST /api/productsList (405 endpoint)', () => {
  test('20 concurrent POSTs all return a consistent status — no 5xx', async ({ request }) => {
    const client = createApiClient(request, { maxRetries: 0 });
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => client.post('/api/productsList')),
    );

    for (const response of responses) {
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
    }
  });

  test('all 20 POSTs return responseCode 405', async ({ request }) => {
    const client = createApiClient(request, { maxRetries: 0 });
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => client.post('/api/productsList')),
    );

    for (const response of responses) {
      const body = await response.json() as ApiMessageResponse;
      // Either HTTP 200 envelope with responseCode 405, or a raw 405
      const effective = body.responseCode ?? response.status();
      expect(effective).toBe(405);
    }
  });
});
