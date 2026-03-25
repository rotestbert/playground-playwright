/**
 * API load performance tests
 *
 * Each endpoint is hammered with CONCURRENCY simultaneous requests.
 * Percentiles (p50 / p95 / p99) are computed from the raw durations.
 *
 * Thresholds:
 *   Read  endpoints — p95 < 500 ms,  p99 < 1 000 ms
 *   Write endpoints — p95 < 2 000 ms, p99 < 3 000 ms
 *
 * Memory / degradation check:
 *   Runs 5 rolling batches of BATCH_SIZE requests, compares p95 of the
 *   first batch against the last.  A >50 % slowdown is flagged as
 *   "degraded" (indicative of server-side memory pressure or connection
 *   pool exhaustion).  Node.js RSS is also captured before and after to
 *   surface test-process leaks.
 *
 * Runs:  npm run test:perf
 */

import { test, expect } from '@playwright/test';
import {
  computePercentiles,
  saveApiMetrics,
  generatePerfReport,
  API_THRESHOLDS,
  type ApiLoadMetrics,
  type MemoryMetrics,
} from '../helpers/perfReporter.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONCURRENCY = 50;
const LEAK_BATCHES = 5;
const LEAK_BATCH_SIZE = 20;

// ── Load-test helper ──────────────────────────────────────────────────────────

interface SampleResult {
  duration: number;
  status: number;
  ok: boolean;
}

/**
 * Fires `concurrency` simultaneous requests to `path`.
 * Returns an `ApiLoadMetrics` record ready for assertions and reporting.
 */
async function runLoadTest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any,
  method: 'GET' | 'POST',
  path: string,
  formBody?: Record<string, string>,
  concurrency: number = CONCURRENCY,
): Promise<ApiLoadMetrics> {
  const samples = await Promise.allSettled<SampleResult>(
    Array.from({ length: concurrency }, async (): Promise<SampleResult> => {
      const start = performance.now();
      try {
        const res =
          method === 'POST'
            ? await request.post(path, { form: formBody ?? {} })
            : await request.get(path);
        return { duration: performance.now() - start, status: res.status() as number, ok: res.ok() as boolean };
      } catch {
        return { duration: performance.now() - start, status: 0, ok: false };
      }
    }),
  );

  const durations: number[] = [];
  let successCount = 0;

  for (const s of samples) {
    if (s.status === 'fulfilled') {
      durations.push(s.value.duration);
      if (s.value.ok) successCount++;
    }
  }

  const pct = computePercentiles(durations);

  return {
    endpoint: path,
    method,
    concurrency,
    totalRequests: concurrency,
    successCount,
    failureRate: (concurrency - successCount) / concurrency,
    ...pct,
    timestamp: new Date().toISOString(),
  };
}

// ── Memory / degradation helper ───────────────────────────────────────────────

/**
 * Runs `LEAK_BATCHES` sequential batches of `LEAK_BATCH_SIZE` requests each.
 * Captures Node.js RSS before/after and compares p95 of the first vs last batch.
 */
async function runDegradationCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any,
  method: 'GET' | 'POST',
  path: string,
  formBody?: Record<string, string>,
): Promise<MemoryMetrics> {
  const rssBefore = process.memoryUsage().rss;
  const heapBefore = process.memoryUsage().heapUsed;

  const batchP95s: number[] = [];

  for (let i = 0; i < LEAK_BATCHES; i++) {
    const batchDurations: number[] = [];
    await Promise.allSettled(
      Array.from({ length: LEAK_BATCH_SIZE }, async () => {
        const start = performance.now();
        try {
          if (method === 'POST') await request.post(path, { form: formBody ?? {} });
          else await request.get(path);
        } catch { /* ignore individual failures */ }
        batchDurations.push(performance.now() - start);
      }),
    );
    batchP95s.push(computePercentiles(batchDurations).p95);
  }

  const rssAfter = process.memoryUsage().rss;
  const heapAfter = process.memoryUsage().heapUsed;
  const delta = rssAfter - rssBefore;

  const p95Early = batchP95s[0] ?? 0;
  const p95Late = batchP95s[batchP95s.length - 1] ?? 0;
  const degraded = p95Early > 0 && p95Late / p95Early > 1.5; // >50% slower
  const leaked = delta > 50 * 1_048_576; // >50 MB RSS growth

  return {
    endpoint: path,
    rssBefore,
    rssAfter,
    heapUsedBefore: heapBefore,
    heapUsedAfter: heapAfter,
    delta,
    leaked,
    requestCount: LEAK_BATCHES * LEAK_BATCH_SIZE,
    p95Early,
    p95Late,
    degraded,
    timestamp: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('API Load Performance', () => {
  test.describe.configure({ mode: 'serial' });

  const apiMetrics: ApiLoadMetrics[] = [];
  const memMetrics: MemoryMetrics[] = [];

  test.afterAll(() => {
    saveApiMetrics(apiMetrics, memMetrics);
    generatePerfReport();
    console.log(`\n📊 Performance report: playwright-report/perf-report.html`);

    const readFails = apiMetrics
      .filter((m) => m.method === 'GET' && m.p95 > API_THRESHOLDS.reads.p95)
      .map((m) => `  ${m.endpoint}: p95=${m.p95}ms (threshold: ${API_THRESHOLDS.reads.p95}ms)`);
    const writeFails = apiMetrics
      .filter((m) => m.method === 'POST' && m.p95 > API_THRESHOLDS.writes.p95)
      .map((m) => `  ${m.endpoint}: p95=${m.p95}ms (threshold: ${API_THRESHOLDS.writes.p95}ms)`);
    if (readFails.length) console.log('  ⚠ Read p95 failures:\n' + readFails.join('\n'));
    if (writeFails.length) console.log('  ⚠ Write p95 failures:\n' + writeFails.join('\n'));
  });

  // ── Read endpoints — p95 < 500 ms ──────────────────────────────────────

  test.describe('Read Endpoints — p95 < 500 ms', () => {
    test(`GET /api/productsList — ${CONCURRENCY} concurrent requests`, async ({ request }) => {
      const result = await runLoadTest(request, 'GET', '/api/productsList');
      apiMetrics.push(result);

      console.log(
        `  productsList — p50:${result.p50}ms  p95:${result.p95}ms  p99:${result.p99}ms  errors:${(result.failureRate * 100).toFixed(1)}%`,
      );

      expect(
        result.failureRate,
        `Error rate ${(result.failureRate * 100).toFixed(1)}% exceeds 10% — possible rate limiting at ${CONCURRENCY} concurrent requests`,
      ).toBeLessThan(0.1);

      expect(
        result.p95,
        `p95 ${result.p95}ms exceeds read threshold ${API_THRESHOLDS.reads.p95}ms for GET /api/productsList`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.reads.p95);

      expect(
        result.p99,
        `p99 ${result.p99}ms exceeds read p99 threshold ${API_THRESHOLDS.reads.p99}ms for GET /api/productsList`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.reads.p99);
    });

    test(`GET /api/brandsList — ${CONCURRENCY} concurrent requests`, async ({ request }) => {
      const result = await runLoadTest(request, 'GET', '/api/brandsList');
      apiMetrics.push(result);

      console.log(
        `  brandsList — p50:${result.p50}ms  p95:${result.p95}ms  p99:${result.p99}ms  errors:${(result.failureRate * 100).toFixed(1)}%`,
      );

      expect(
        result.failureRate,
        `Error rate ${(result.failureRate * 100).toFixed(1)}% exceeds 10%`,
      ).toBeLessThan(0.1);

      expect(
        result.p95,
        `p95 ${result.p95}ms exceeds read threshold ${API_THRESHOLDS.reads.p95}ms for GET /api/brandsList`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.reads.p95);

      expect(
        result.p99,
        `p99 ${result.p99}ms exceeds read p99 threshold ${API_THRESHOLDS.reads.p99}ms for GET /api/brandsList`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.reads.p99);
    });
  });

  // ── Write / search endpoints — p95 < 2 000 ms ──────────────────────────

  test.describe('Write / Search Endpoints — p95 < 2 000 ms', () => {
    test(`POST /api/searchProduct — ${CONCURRENCY} concurrent requests`, async ({ request }) => {
      const result = await runLoadTest(
        request,
        'POST',
        '/api/searchProduct',
        { search_product: 'dress' }, // safe term — returns a real result set
      );
      apiMetrics.push(result);

      console.log(
        `  searchProduct — p50:${result.p50}ms  p95:${result.p95}ms  p99:${result.p99}ms  errors:${(result.failureRate * 100).toFixed(1)}%`,
      );

      expect(
        result.failureRate,
        `Error rate ${(result.failureRate * 100).toFixed(1)}% exceeds 10%`,
      ).toBeLessThan(0.1);

      expect(
        result.p95,
        `p95 ${result.p95}ms exceeds write threshold ${API_THRESHOLDS.writes.p95}ms for POST /api/searchProduct`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.writes.p95);

      expect(
        result.p99,
        `p99 ${result.p99}ms exceeds write p99 threshold ${API_THRESHOLDS.writes.p99}ms for POST /api/searchProduct`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.writes.p99);
    });

    test(`POST /api/verifyLogin — ${CONCURRENCY} concurrent requests`, async ({ request }) => {
      // Uses deliberately invalid credentials — the API returns responseCode 404
      // with a "User not found" message (HTTP 200). Safe to call at volume.
      const result = await runLoadTest(
        request,
        'POST',
        '/api/verifyLogin',
        { email: 'loadtest@perf.invalid', password: 'LoadTest123' },
      );
      apiMetrics.push(result);

      console.log(
        `  verifyLogin — p50:${result.p50}ms  p95:${result.p95}ms  p99:${result.p99}ms  errors:${(result.failureRate * 100).toFixed(1)}%`,
      );

      // HTTP failures (not "user not found" which is HTTP 200) should be < 10%
      expect(
        result.failureRate,
        `HTTP error rate ${(result.failureRate * 100).toFixed(1)}% exceeds 10% — server may be rejecting concurrent auth requests`,
      ).toBeLessThan(0.1);

      expect(
        result.p95,
        `p95 ${result.p95}ms exceeds write threshold ${API_THRESHOLDS.writes.p95}ms for POST /api/verifyLogin`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.writes.p95);

      expect(
        result.p99,
        `p99 ${result.p99}ms exceeds write p99 threshold ${API_THRESHOLDS.writes.p99}ms for POST /api/verifyLogin`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.writes.p99);
    });

    test(`POST /api/searchProduct — empty query returns quickly`, async ({ request }) => {
      // Edge case: empty search. The API returns all products or an error body —
      // either way the latency should not spike.
      const result = await runLoadTest(
        request,
        'POST',
        '/api/searchProduct',
        { search_product: '' },
        20, // use fewer concurrent requests for this edge case
      );
      apiMetrics.push(result);

      console.log(
        `  searchProduct (empty) — p50:${result.p50}ms  p95:${result.p95}ms`,
      );

      expect(
        result.p95,
        `Empty search p95 ${result.p95}ms exceeds write threshold ${API_THRESHOLDS.writes.p95}ms`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.writes.p95);
    });
  });

  // ── Memory and response-time degradation checks ─────────────────────────

  test.describe('Memory Leak & Degradation Detection', () => {
    test('GET /api/productsList — response time stays stable across repeated batches', async ({
      request,
    }) => {
      const mem = await runDegradationCheck(request, 'GET', '/api/productsList');
      memMetrics.push(mem);

      const deltaMB = (mem.delta / 1_048_576).toFixed(1);
      console.log(
        `  productsList memory — RSS Δ: ${deltaMB}MB  p95 early:${mem.p95Early}ms → late:${mem.p95Late}ms  degraded:${mem.degraded}`,
      );

      expect(
        mem.degraded,
        `Response time degraded by >${((mem.p95Late / mem.p95Early - 1) * 100).toFixed(0)}% (${mem.p95Early}ms → ${mem.p95Late}ms) across ${LEAK_BATCHES} batches — possible server-side resource exhaustion`,
      ).toBe(false);

      expect(
        mem.leaked,
        `Node.js process RSS grew by ${deltaMB}MB after ${mem.requestCount} requests — possible memory leak in test runner`,
      ).toBe(false);
    });

    test('POST /api/searchProduct — response time stays stable across repeated batches', async ({
      request,
    }) => {
      const mem = await runDegradationCheck(request, 'POST', '/api/searchProduct', {
        search_product: 'top',
      });
      memMetrics.push(mem);

      const deltaMB = (mem.delta / 1_048_576).toFixed(1);
      console.log(
        `  searchProduct memory — RSS Δ: ${deltaMB}MB  p95 early:${mem.p95Early}ms → late:${mem.p95Late}ms  degraded:${mem.degraded}`,
      );

      expect(
        mem.degraded,
        `Response time degraded by >${((mem.p95Late / Math.max(mem.p95Early, 1) - 1) * 100).toFixed(0)}% across ${LEAK_BATCHES} batches — possible server-side memory pressure`,
      ).toBe(false);

      expect(
        mem.leaked,
        `Node.js process RSS grew by ${deltaMB}MB after ${mem.requestCount} requests`,
      ).toBe(false);
    });

    test('sustained load: p95 of all reads under sustained 100-request pressure', async ({
      request,
    }) => {
      // Run 2× the standard CONCURRENCY to simulate a brief traffic spike
      const result = await runLoadTest(request, 'GET', '/api/productsList', undefined, 100);

      console.log(
        `  sustained load (100 concurrent) — p50:${result.p50}ms  p95:${result.p95}ms  p99:${result.p99}ms`,
      );

      // Under 2× load the threshold is relaxed to 2× the standard read threshold
      expect(
        result.p95,
        `Under 100-concurrent load p95 ${result.p95}ms exceeds 2× read threshold ${API_THRESHOLDS.reads.p95 * 2}ms`,
      ).toBeLessThanOrEqual(API_THRESHOLDS.reads.p95 * 2);

      // Push a summary entry for the report
      apiMetrics.push({ ...result, endpoint: '/api/productsList (100 concurrent)' });
    });
  });
});
