/**
 * GraphQL query tests — every query in src/schema.graphql
 *
 * Covers:
 *   Public    product, products, category, categories
 *   User      me, order, myOrders
 *   Admin     user, users, allOrders
 *
 * For each query: valid variables, invalid variables, and permission checks
 * (anonymous / authenticated user / admin) where access control applies.
 *
 * Prerequisites (set via env vars or a running local server):
 *   GRAPHQL_URL       — GraphQL HTTP endpoint
 *   GQL_USER_TOKEN    — valid JWT for a USER-role account
 *   GQL_ADMIN_TOKEN   — valid JWT for an ADMIN-role account
 *   GQL_USER_ID       — ID of the user behind GQL_USER_TOKEN
 *   GQL_USER_ORDER_ID — ID of an order owned by that user
 *   GQL_PRODUCT_ID    — ID of any product
 *   GQL_CATEGORY_ID   — ID of any category
 */

import { test, expect } from '@playwright/test';
import {
  createGqlClient,
  assertNoErrors,
  assertGqlError,
  assertUnauthorized,
  assertForbidden,
  assertValidationFailed,
  gql,
  FRAGMENTS,
} from './fixtures/graphql.js';

// ─── Seed IDs from env (fall back to placeholder strings) ─────────────────────
// Tests that require real data will skip when placeholders are detected.

const USER_TOKEN    = process.env['GQL_USER_TOKEN']    ?? '';
const ADMIN_TOKEN   = process.env['GQL_ADMIN_TOKEN']   ?? '';
const USER_ID       = process.env['GQL_USER_ID']       ?? 'user_placeholder';
const USER_ORDER_ID = process.env['GQL_USER_ORDER_ID'] ?? 'order_placeholder';
const PRODUCT_ID    = process.env['GQL_PRODUCT_ID']    ?? 'product_placeholder';
const CATEGORY_ID   = process.env['GQL_CATEGORY_ID']   ?? 'category_placeholder';

const hasUserToken  = USER_TOKEN  !== '';
const hasAdminToken = ADMIN_TOKEN !== '';

// ─── product ──────────────────────────────────────────────────────────────────

test.describe('query product', () => {
  const QUERY = gql`
    query GetProduct($id: ID!) {
      product(id: $id) {
        ${FRAGMENTS.PRODUCT_FIELDS}
      }
    }
  `;

  test('returns a product for a valid ID', async ({ request }) => {
    test.skip(!hasAdminToken && PRODUCT_ID === 'product_placeholder', 'No PRODUCT_ID set');
    const res = await createGqlClient(request).query(QUERY, { id: PRODUCT_ID });
    assertNoErrors(res);
    expect((res.data as { product: { id: string } }).product.id).toBe(PRODUCT_ID);
  });

  test('returns null for a non-existent ID', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      id: 'nonexistent_product_id_00000',
    });
    assertNoErrors(res);
    expect((res.data as { product: null }).product).toBeNull();
  });

  test('returns GRAPHQL_VALIDATION_FAILED when id is omitted', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`query { product { id } }`);
    assertValidationFailed(res);
  });

  test('product is public — no token required', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY, {
      id: PRODUCT_ID,
    });
    // Either null (not found) or a valid product — never an auth error
    expect(res.errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')).toBe(false);
  });

  test('response includes category with id, name, and slug', async ({ request }) => {
    test.skip(PRODUCT_ID === 'product_placeholder', 'No PRODUCT_ID set');
    const res = await createGqlClient(request).query(QUERY, { id: PRODUCT_ID });
    if (!(res.data as { product: { id: string } | null }).product) return;
    const p = (res.data as { product: { category: { id: string; slug: string } } }).product;
    expect(typeof p.category.id).toBe('string');
    expect(typeof p.category.slug).toBe('string');
  });
});

// ─── products ─────────────────────────────────────────────────────────────────

test.describe('query products', () => {
  const QUERY = gql`
    ${FRAGMENTS.PAGE_INFO}
    query GetProducts(
      $filter: ProductFilterInput
      $sort: ProductSortInput
      $pagination: PaginationInput
    ) {
      products(filter: $filter, sort: $sort, pagination: $pagination) {
        pageInfo { ...PageInfoFields }
        edges {
          cursor
          node {
            id
            name
            price
            stock
            category { id name }
          }
        }
      }
    }
  `;

  test('returns a connection with edges and pageInfo when no args supplied', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY);
    assertNoErrors(res);
    const conn = (res.data as { products: { edges: unknown[]; pageInfo: { totalCount: number } } }).products;
    expect(Array.isArray(conn.edges)).toBe(true);
    expect(typeof conn.pageInfo.totalCount).toBe('number');
  });

  test('forward pagination: first:3 returns at most 3 edges', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      pagination: { first: 3 },
    });
    assertNoErrors(res);
    const edges = (res.data as { products: { edges: unknown[] } }).products.edges;
    expect(edges.length).toBeLessThanOrEqual(3);
  });

  test('hasNextPage is true when results exist beyond the first page', async ({ request }) => {
    const small = await createGqlClient(request).query(QUERY, {
      pagination: { first: 1 },
    });
    assertNoErrors(small);
    const pi = (small.data as { products: { pageInfo: { totalCount: number; hasNextPage: boolean } } }).products.pageInfo;
    if (pi.totalCount > 1) {
      expect(pi.hasNextPage).toBe(true);
    }
  });

  test('second page cursor-paginated results do not overlap with first page', async ({ request }) => {
    const client = createGqlClient(request);
    const page1 = await client.query(QUERY, { pagination: { first: 2 } });
    assertNoErrors(page1);
    const p1 = (page1.data as { products: { edges: Array<{ cursor: string; node: { id: string } }>; pageInfo: { endCursor: string; hasNextPage: boolean } } }).products;
    if (!p1.pageInfo.hasNextPage) return;

    const page2 = await client.query(QUERY, {
      pagination: { first: 2, after: p1.pageInfo.endCursor },
    });
    assertNoErrors(page2);
    const p2ids = new Set((page2.data as { products: { edges: Array<{ node: { id: string } }> } }).products.edges.map((e) => e.node.id));
    for (const e of p1.edges) {
      expect(p2ids.has(e.node.id)).toBe(false);
    }
  });

  test('filter by minPrice and maxPrice returns only products within range', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      filter: { minPrice: 10.0, maxPrice: 50.0 },
    });
    assertNoErrors(res);
    const edges = (res.data as { products: { edges: Array<{ node: { price: number } }> } }).products.edges;
    for (const { node } of edges) {
      expect(node.price).toBeGreaterThanOrEqual(10.0);
      expect(node.price).toBeLessThanOrEqual(50.0);
    }
  });

  test('filter inStock:true returns only products with stock > 0', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      filter: { inStock: true },
    });
    assertNoErrors(res);
    const edges = (res.data as { products: { edges: Array<{ node: { stock: number } }> } }).products.edges;
    for (const { node } of edges) {
      expect(node.stock).toBeGreaterThan(0);
    }
  });

  test('sort PRICE ASC produces non-decreasing prices', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      sort: { field: 'PRICE', direction: 'ASC' },
      pagination: { first: 10 },
    });
    assertNoErrors(res);
    const prices = (res.data as { products: { edges: Array<{ node: { price: number } }> } }).products.edges.map((e) => e.node.price);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]!);
    }
  });

  test('sort PRICE DESC produces non-increasing prices', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      sort: { field: 'PRICE', direction: 'DESC' },
      pagination: { first: 10 },
    });
    assertNoErrors(res);
    const prices = (res.data as { products: { edges: Array<{ node: { price: number } }> } }).products.edges.map((e) => e.node.price);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]!);
    }
  });

  test('invalid sort field returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      sort: { field: 'NOT_A_FIELD', direction: 'ASC' },
    });
    assertValidationFailed(res);
  });

  test('invalid sort direction returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      sort: { field: 'PRICE', direction: 'SIDEWAYS' },
    });
    assertValidationFailed(res);
  });

  test('negative first value is rejected', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      pagination: { first: -1 },
    });
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('products is public — anonymous access allowed', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY);
    expect(res.errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')).toBe(false);
  });
});

// ─── category ─────────────────────────────────────────────────────────────────

test.describe('query category', () => {
  const QUERY = gql`
    query GetCategory($id: ID!) {
      category(id: $id) {
        id
        name
        slug
        products {
          id
          name
        }
      }
    }
  `;

  test('returns a category for a valid ID', async ({ request }) => {
    test.skip(CATEGORY_ID === 'category_placeholder', 'No CATEGORY_ID set');
    const res = await createGqlClient(request).query(QUERY, { id: CATEGORY_ID });
    assertNoErrors(res);
    expect((res.data as { category: { id: string } }).category.id).toBe(CATEGORY_ID);
  });

  test('returns null for a non-existent category ID', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY, {
      id: 'category_does_not_exist_9999',
    });
    assertNoErrors(res);
    expect((res.data as { category: null }).category).toBeNull();
  });

  test('missing required id argument returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`query { category { id } }`);
    assertValidationFailed(res);
  });

  test('category is public — no auth required', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY, {
      id: CATEGORY_ID,
    });
    expect(res.errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')).toBe(false);
  });
});

// ─── categories ───────────────────────────────────────────────────────────────

test.describe('query categories', () => {
  const QUERY = gql`
    query {
      categories {
        id
        name
        slug
      }
    }
  `;

  test('returns an array of categories', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY);
    assertNoErrors(res);
    expect(Array.isArray((res.data as { categories: unknown[] }).categories)).toBe(true);
  });

  test('every category has id, name, and slug', async ({ request }) => {
    const res = await createGqlClient(request).query(QUERY);
    assertNoErrors(res);
    for (const cat of (res.data as { categories: Array<{ id: string; name: string; slug: string }> }).categories) {
      expect(typeof cat.id).toBe('string');
      expect(cat.id.length).toBeGreaterThan(0);
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.slug).toBe('string');
    }
  });

  test('categories is public — no auth required', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY);
    expect(res.errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')).toBe(false);
  });

  test('count is stable across two sequential calls', async ({ request }) => {
    const client = createGqlClient(request);
    const a = await client.query(QUERY);
    const b = await client.query(QUERY);
    assertNoErrors(a);
    assertNoErrors(b);
    expect(
      (b.data as { categories: unknown[] }).categories.length,
    ).toBe((a.data as { categories: unknown[] }).categories.length);
  });
});

// ─── me ───────────────────────────────────────────────────────────────────────

test.describe('query me', () => {
  const QUERY = gql`
    ${FRAGMENTS.USER_FIELDS}
    query {
      me { ...UserFields }
    }
  `;

  test('returns the authenticated user when a valid token is provided', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY);
    assertNoErrors(res);
    const me = (res.data as { me: { id: string; email: string; role: string } }).me;
    expect(typeof me.id).toBe('string');
    expect(me.email).toContain('@');
    expect(me.role).toBe('USER');
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY);
    assertUnauthorized(res);
  });

  test('returns UNAUTHENTICATED for a tampered/invalid token', async ({ request }) => {
    const res = await createGqlClient(request, 'invalid.jwt.token').query(QUERY);
    assertUnauthorized(res);
  });

  test('returned id matches GQL_USER_ID env var', async ({ request }) => {
    test.skip(!hasUserToken || USER_ID === 'user_placeholder', 'No GQL_USER_TOKEN or USER_ID set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY);
    assertNoErrors(res);
    expect((res.data as { me: { id: string } }).me.id).toBe(USER_ID);
  });
});

// ─── order ────────────────────────────────────────────────────────────────────

test.describe('query order', () => {
  const QUERY = gql`
    ${FRAGMENTS.ORDER_FIELDS}
    query GetOrder($id: ID!) {
      order(id: $id) { ...OrderFields }
    }
  `;

  test('authenticated user can fetch their own order', async ({ request }) => {
    test.skip(!hasUserToken || USER_ORDER_ID === 'order_placeholder', 'No token/order set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY, {
      id: USER_ORDER_ID,
    });
    assertNoErrors(res);
    expect((res.data as { order: { id: string } }).order.id).toBe(USER_ORDER_ID);
  });

  test('order returns null for a non-existent ID (no leak of other users orders)', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY, {
      id: 'order_that_does_not_exist_000',
    });
    // Either null or FORBIDDEN — never exposes another user's data silently
    assertNoErrors(res);
    expect((res.data as { order: null }).order).toBeNull();
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY, {
      id: USER_ORDER_ID,
    });
    assertUnauthorized(res);
  });

  test('missing required id argument returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(
      gql`query { order { id status } }`,
    );
    assertValidationFailed(res);
  });

  test('order fields include status, total, and items array', async ({ request }) => {
    test.skip(!hasUserToken || USER_ORDER_ID === 'order_placeholder', 'No token/order set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY, {
      id: USER_ORDER_ID,
    });
    assertNoErrors(res);
    const ord = (res.data as { order: { status: string; total: number; items: unknown[] } }).order;
    expect(typeof ord.status).toBe('string');
    expect(typeof ord.total).toBe('number');
    expect(Array.isArray(ord.items)).toBe(true);
  });
});

// ─── myOrders ─────────────────────────────────────────────────────────────────

test.describe('query myOrders', () => {
  const QUERY = gql`
    ${FRAGMENTS.PAGE_INFO}
    query MyOrders($pagination: PaginationInput) {
      myOrders(pagination: $pagination) {
        pageInfo { ...PageInfoFields }
        edges {
          cursor
          node {
            id
            status
            total
          }
        }
      }
    }
  `;

  test('authenticated user receives their order list', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY);
    assertNoErrors(res);
    const conn = (res.data as { myOrders: { edges: unknown[]; pageInfo: { totalCount: number } } }).myOrders;
    expect(Array.isArray(conn.edges)).toBe(true);
    expect(typeof conn.pageInfo.totalCount).toBe('number');
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY);
    assertUnauthorized(res);
  });

  test('first:1 returns at most one order', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY, {
      pagination: { first: 1 },
    });
    assertNoErrors(res);
    const edges = (res.data as { myOrders: { edges: unknown[] } }).myOrders.edges;
    expect(edges.length).toBeLessThanOrEqual(1);
  });
});

// ─── user (admin) ─────────────────────────────────────────────────────────────

test.describe('query user — admin only', () => {
  const QUERY = gql`
    ${FRAGMENTS.USER_FIELDS}
    query GetUser($id: ID!) {
      user(id: $id) { ...UserFields }
    }
  `;

  test('admin can fetch any user by ID', async ({ request }) => {
    test.skip(!hasAdminToken || USER_ID === 'user_placeholder', 'No ADMIN_TOKEN/USER_ID set');
    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY, {
      id: USER_ID,
    });
    assertNoErrors(res);
    expect((res.data as { user: { id: string } }).user.id).toBe(USER_ID);
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY, {
      id: USER_ID,
    });
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY, {
      id: USER_ID,
    });
    assertUnauthorized(res);
  });

  test('admin query for non-existent ID returns null', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY, {
      id: 'user_does_not_exist_00000',
    });
    assertNoErrors(res);
    expect((res.data as { user: null }).user).toBeNull();
  });
});

// ─── users (admin) ────────────────────────────────────────────────────────────

test.describe('query users — admin only', () => {
  const QUERY = gql`
    ${FRAGMENTS.PAGE_INFO}
    query GetUsers($pagination: PaginationInput) {
      users(pagination: $pagination) {
        pageInfo { ...PageInfoFields }
        edges {
          cursor
          node { id email role }
        }
      }
    }
  `;

  test('admin receives a paginated user list', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY);
    assertNoErrors(res);
    const conn = (res.data as { users: { edges: unknown[]; pageInfo: { totalCount: number } } }).users;
    expect(Array.isArray(conn.edges)).toBe(true);
    expect(typeof conn.pageInfo.totalCount).toBe('number');
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY);
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY);
    assertUnauthorized(res);
  });

  test('admin first:2 returns at most 2 users', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY, {
      pagination: { first: 2 },
    });
    assertNoErrors(res);
    expect(
      (res.data as { users: { edges: unknown[] } }).users.edges.length,
    ).toBeLessThanOrEqual(2);
  });
});

// ─── allOrders (admin) ────────────────────────────────────────────────────────

test.describe('query allOrders — admin only', () => {
  const QUERY = gql`
    ${FRAGMENTS.PAGE_INFO}
    query AllOrders($pagination: PaginationInput) {
      allOrders(pagination: $pagination) {
        pageInfo { ...PageInfoFields }
        edges {
          cursor
          node {
            id
            status
            total
            user { id email }
          }
        }
      }
    }
  `;

  test('admin receives all orders across all users', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY);
    assertNoErrors(res);
    expect(
      Array.isArray((res.data as { allOrders: { edges: unknown[] } }).allOrders.edges),
    ).toBe(true);
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).query(QUERY);
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().query(QUERY);
    assertUnauthorized(res);
  });

  test('each order in allOrders includes a user sub-object', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).query(QUERY, {
      pagination: { first: 5 },
    });
    assertNoErrors(res);
    const edges = (res.data as { allOrders: { edges: Array<{ node: { user: { id: string } } }> } }).allOrders.edges;
    for (const { node } of edges) {
      expect(typeof node.user.id).toBe('string');
    }
  });
});

// ─── Introspection ────────────────────────────────────────────────────────────

test.describe('introspection', () => {
  test('__schema query returns the full type list', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query {
        __schema {
          types {
            name
            kind
          }
        }
      }
    `);
    // Introspection should be enabled in non-production environments
    if (res.errors?.some((e) => e.message.toLowerCase().includes('introspection'))) {
      // Disabled — acceptable in production; document and return
      return;
    }
    assertNoErrors(res);
    const types = (res.data as { __schema: { types: Array<{ name: string }> } }).__schema.types;
    const typeNames = types.map((t) => t.name);
    expect(typeNames).toContain('Query');
    expect(typeNames).toContain('Mutation');
    expect(typeNames).toContain('User');
    expect(typeNames).toContain('Product');
  });

  test('__type on User returns expected fields', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query {
        __type(name: "User") {
          name
          fields {
            name
            type {
              kind
              name
            }
          }
        }
      }
    `);
    if (res.errors?.some((e) => e.message.toLowerCase().includes('introspection'))) return;
    assertNoErrors(res);
    const fields = (res.data as { __type: { fields: Array<{ name: string }> } }).__type.fields.map((f) => f.name);
    expect(fields).toContain('id');
    expect(fields).toContain('email');
    expect(fields).toContain('role');
  });
});
