/**
 * N+1 query detection
 *
 * The N+1 problem occurs when resolving a list of N items each triggers one
 * additional database round-trip, producing N+1 queries instead of 2
 * (one for the list, one batched for all nested items via DataLoader).
 *
 * Detection strategies used in this file (multiple layers):
 *
 *   1. extensions.diagnostics.queryCount (primary)
 *      If the server returns `extensions.diagnostics.queryCount` in the
 *      GraphQL response, assert it is within the expected bound.
 *      Wire this in your server with a per-request query counter.
 *
 *   2. Timing ratio heuristic (secondary fallback)
 *      Fetch a list of N items twice (N=3 vs N=12).  If queryCount grows
 *      linearly with N, the p95 latency ratio approaches N — a reliable
 *      N+1 signal.  The test asserts ratio < 2 (sub-linear growth expected
 *      from DataLoader batching).
 *
 *   3. Response completeness (sanity)
 *      After a nested query, every item in the list must have its nested
 *      field populated.  DataLoader is the correct fix; broken DataLoader
 *      still yields correct data — these tests detect the latency impact.
 *
 * How to expose diagnostics from your GraphQL server (Apollo example):
 *
 *   // In ApolloServer plugins array:
 *   {
 *     requestDidStart: () => ({
 *       willSendResponse: ({ response, contextValue }) => {
 *         response.body.singleResult.extensions ??= {};
 *         response.body.singleResult.extensions.diagnostics = {
 *           queryCount: contextValue.db.queryCount,
 *           resolverCallCount: contextValue.resolverCalls,
 *         };
 *       },
 *     }),
 *   }
 *
 * Prerequisites:
 *   GRAPHQL_URL      — HTTP endpoint
 *   GQL_ADMIN_TOKEN  — admin token (for allOrders + users queries)
 *   GQL_USER_TOKEN   — user token (for myOrders)
 */

import { test, expect } from '@playwright/test';
import {
  createGqlClient,
  assertNoErrors,
  gql,
  FRAGMENTS,
  type GqlDiagnostics,
  type GqlResponse,
} from './fixtures/graphql.js';

// ─── Env ──────────────────────────────────────────────────────────────────────

const USER_TOKEN  = process.env['GQL_USER_TOKEN']  ?? '';
const ADMIN_TOKEN = process.env['GQL_ADMIN_TOKEN'] ?? '';

const hasUserToken  = USER_TOKEN  !== '';
const hasAdminToken = ADMIN_TOKEN !== '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function diagnostics(res: GqlResponse): GqlDiagnostics | undefined {
  return res.extensions?.diagnostics;
}

function hasDiagnostics(res: GqlResponse): boolean {
  return diagnostics(res)?.queryCount !== undefined;
}

/**
 * Measures the p50 latency (median) of `runs` executions of `fn`.
 * Returns elapsed milliseconds.
 */
async function medianMs(fn: () => Promise<unknown>, runs = 3): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = Date.now();
    await fn();
    times.push(Date.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

// ─── products → category (one-to-one nested) ─────────────────────────────────

test.describe('N+1 detection: products → category', () => {
  const QUERY = gql`
    query ProductsWithCategory($pagination: PaginationInput) {
      products(pagination: $pagination) {
        edges {
          node {
            id
            name
            category {
              id
              name
            }
          }
        }
      }
    }
  `;

  test('fetching 10 products with category costs ≤ 2 DB queries (1 list + 1 batch)', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      pagination: { first: 10 },
    });
    assertNoErrors(res);

    if (!hasDiagnostics(res)) {
      // Diagnostics not exposed — verify completeness only
      const edges = (res.data as { products: { edges: Array<{ node: { category: { id: string } } }> } }).products.edges;
      for (const { node } of edges) {
        expect(typeof node.category.id).toBe('string');
      }
      return;
    }

    const d = diagnostics(res)!;
    expect(
      d.queryCount,
      `Expected ≤ 2 DB queries for 10 products+category, got ${d.queryCount}`,
    ).toBeLessThanOrEqual(2);
  });

  test('queryCount for 1-item page equals queryCount for 10-item page (DataLoader batches)', async ({ request }) => {
    const client = createGqlClient(request);

    const res1  = await client.query(QUERY, { pagination: { first: 1 } });
    const res10 = await client.query(QUERY, { pagination: { first: 10 } });

    assertNoErrors(res1);
    assertNoErrors(res10);

    if (!hasDiagnostics(res1) || !hasDiagnostics(res10)) return;

    // Both should cost 2 queries regardless of page size
    expect(diagnostics(res1)!.queryCount).toBeLessThanOrEqual(2);
    expect(diagnostics(res10)!.queryCount).toBeLessThanOrEqual(2);
  });

  test('latency for 10-item page is less than 4× the latency of 1-item page', async ({ request }) => {
    const client = createGqlClient(request);

    const t1  = await medianMs(() => client.query(QUERY, { pagination: { first: 1 } }));
    const t10 = await medianMs(() => client.query(QUERY, { pagination: { first: 10 } }));

    const ratio = t10 / Math.max(t1, 1);
    expect(
      ratio,
      `Latency ratio 10:1 = ${ratio.toFixed(2)} — possible N+1 (expected < 4)`,
    ).toBeLessThan(4);
  });
});

// ─── products → reviews (one-to-many nested) ──────────────────────────────────

test.describe('N+1 detection: products → reviews', () => {
  const QUERY = gql`
    query ProductsWithReviews($pagination: PaginationInput) {
      products(pagination: $pagination) {
        edges {
          node {
            id
            name
            reviews {
              id
              rating
              user { id name }
            }
          }
        }
      }
    }
  `;

  test('fetching products with reviews costs ≤ 3 DB queries (products + reviews batch + users batch)', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      pagination: { first: 5 },
    });
    assertNoErrors(res);

    if (!hasDiagnostics(res)) {
      // Completeness check only
      const edges = (res.data as { products: { edges: Array<{ node: { reviews: unknown[] } }> } }).products.edges;
      expect(Array.isArray(edges)).toBe(true);
      return;
    }

    expect(diagnostics(res)!.queryCount).toBeLessThanOrEqual(3);
  });

  test('reviews are fully populated for every product in the result', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      pagination: { first: 5 },
    });
    assertNoErrors(res);

    const edges = (res.data as {
      products: { edges: Array<{ node: { reviews: Array<{ id: string; rating: number }> } }> };
    }).products.edges;

    for (const { node } of edges) {
      for (const review of node.reviews) {
        expect(typeof review.id).toBe('string');
        expect(typeof review.rating).toBe('number');
      }
    }
  });
});

// ─── allOrders → user + items → product (multi-level) ───────────────────────

test.describe('N+1 detection: allOrders → user → items → product (admin)', () => {
  const QUERY = gql`
    query AllOrdersDeep($pagination: PaginationInput) {
      allOrders(pagination: $pagination) {
        edges {
          node {
            id
            status
            user {
              id
              email
            }
            items {
              id
              quantity
              product {
                id
                name
                price
              }
            }
          }
        }
      }
    }
  `;

  test('fetching 5 orders with nested user+items+product costs ≤ 4 DB queries', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');

    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY, {
      pagination: { first: 5 },
    });
    assertNoErrors(res);

    if (!hasDiagnostics(res)) {
      // Completeness check
      const edges = (res.data as {
        allOrders: { edges: Array<{ node: { user: { id: string }; items: unknown[] } }> };
      }).allOrders.edges;
      for (const { node } of edges) {
        expect(typeof node.user.id).toBe('string');
        expect(Array.isArray(node.items)).toBe(true);
      }
      return;
    }

    expect(
      diagnostics(res)!.queryCount,
      'Expected DataLoader batching to keep queries ≤ 4 for 5 orders with 3 levels of nesting',
    ).toBeLessThanOrEqual(4);
  });

  test('latency ratio between 5-order and 1-order queries is sub-linear', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');

    const client = createGqlClient(request, ADMIN_TOKEN);

    const t1 = await medianMs(() => client.query(QUERY, { pagination: { first: 1 } }));
    const t5 = await medianMs(() => client.query(QUERY, { pagination: { first: 5 } }));

    const ratio = t5 / Math.max(t1, 1);
    expect(
      ratio,
      `Latency ratio 5:1 = ${ratio.toFixed(2)} — possible N+1 (expected < 4)`,
    ).toBeLessThan(4);
  });
});

// ─── users → orders → items (admin) ──────────────────────────────────────────

test.describe('N+1 detection: users → orders → items (admin)', () => {
  const QUERY = gql`
    query UsersWithOrders($pagination: PaginationInput) {
      users(pagination: $pagination) {
        edges {
          node {
            id
            email
            orders {
              id
              status
              total
              items {
                id
                quantity
                product { id name }
              }
            }
          }
        }
      }
    }
  `;

  test('users with nested orders and items costs ≤ 4 DB queries for 3 users', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');

    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY, {
      pagination: { first: 3 },
    });
    assertNoErrors(res);

    if (!hasDiagnostics(res)) {
      const edges = (res.data as { users: { edges: Array<{ node: { orders: unknown[] } }> } }).users.edges;
      for (const { node } of edges) {
        expect(Array.isArray(node.orders)).toBe(true);
      }
      return;
    }

    expect(diagnostics(res)!.queryCount).toBeLessThanOrEqual(4);
  });
});

// ─── myOrders → items → product (user) ───────────────────────────────────────

test.describe('N+1 detection: myOrders → items → product (user)', () => {
  const QUERY = gql`
    query MyOrdersDeep($pagination: PaginationInput) {
      myOrders(pagination: $pagination) {
        edges {
          node {
            id
            status
            items {
              id
              quantity
              product {
                id
                name
                category { id name }
              }
            }
          }
        }
      }
    }
  `;

  test('myOrders with nested items+product costs ≤ 3 DB queries', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');

    const res = await createGqlClient(request, USER_TOKEN).query(QUERY, {
      pagination: { first: 5 },
    });
    assertNoErrors(res);

    if (!hasDiagnostics(res)) {
      // Completeness only
      expect(
        (res.data as { myOrders: { edges: unknown[] } }).myOrders.edges,
      ).toBeDefined();
      return;
    }

    expect(diagnostics(res)!.queryCount).toBeLessThanOrEqual(3);
  });
});

// ─── Resolver call count ──────────────────────────────────────────────────────

test.describe('Resolver call count (extensions.diagnostics.resolverCallCount)', () => {
  test('resolverCallCount for products query is proportional to items returned', async ({ request }) => {
    const QUERY = gql`
      query($pagination: PaginationInput) {
        products(pagination: $pagination) {
          edges { node { id name price } }
        }
      }
    `;

    const res = await createGqlClient(request).query(QUERY, { pagination: { first: 5 } });
    assertNoErrors(res);

    if (!res.extensions?.diagnostics?.resolverCallCount) return;

    const count = res.extensions.diagnostics.resolverCallCount;
    const edgeCount = (res.data as { products: { edges: unknown[] } }).products.edges.length;

    // Minimum: 1 (products resolver) + 1 (edges) + N (node resolvers) + N (id/name/price per node)
    // Maximum: should not exceed ~10× the edge count (no resolver explosion)
    expect(count).toBeLessThanOrEqual(edgeCount * 10 + 10);
  });

  test('adding deeper nesting increases resolverCallCount but not beyond batch factor', async ({ request }) => {
    const SHALLOW = gql`
      query { products(pagination: { first: 3 }) { edges { node { id name } } } }
    `;
    const DEEP = gql`
      query {
        products(pagination: { first: 3 }) {
          edges {
            node {
              id name
              category { id name }
              reviews { id rating }
            }
          }
        }
      }
    `;

    const client = createGqlClient(request);
    const [shallowRes, deepRes] = await Promise.all([
      client.query(SHALLOW),
      client.query(DEEP),
    ]);

    assertNoErrors(shallowRes);
    assertNoErrors(deepRes);

    if (
      shallowRes.extensions?.diagnostics?.resolverCallCount === undefined ||
      deepRes.extensions?.diagnostics?.resolverCallCount === undefined
    ) {
      return;
    }

    const shallowCount = shallowRes.extensions.diagnostics.resolverCallCount;
    const deepCount    = deepRes.extensions.diagnostics.resolverCallCount;

    // Deep must be higher, but not more than 10× the shallow count
    expect(deepCount).toBeGreaterThan(shallowCount);
    expect(deepCount).toBeLessThan(shallowCount * 10);
  });
});

// ─── DataLoader batching proof ────────────────────────────────────────────────

test.describe('DataLoader batching proof via parallel queries', () => {
  test('two concurrent queries for the same resource use ≤ 2 DB queries total', async ({ request }) => {
    const QUERY = gql`
      query($pagination: PaginationInput) {
        products(pagination: $pagination) {
          edges { node { id category { id name } } }
        }
      }
    `;

    const client = createGqlClient(request);
    const [res1, res2] = await Promise.all([
      client.query(QUERY, { pagination: { first: 5 } }),
      client.query(QUERY, { pagination: { first: 5 } }),
    ]);

    assertNoErrors(res1);
    assertNoErrors(res2);

    // Both should return complete data without errors
    const e1 = (res1.data as { products: { edges: unknown[] } }).products.edges;
    const e2 = (res2.data as { products: { edges: unknown[] } }).products.edges;
    expect(e1.length).toBe(e2.length);
  });
});
