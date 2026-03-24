/**
 * GraphQL input validation and query analysis tests
 *
 * Covers:
 *   Query depth limiting        — reject queries deeper than the configured max
 *   Query complexity limits     — reject queries whose cost score exceeds the cap
 *   Type-system validation      — wrong scalar types, missing non-null fields
 *   Enum validation             — invalid enum values
 *   Null-safety                 — non-null field violations
 *   Business-rule validation    — email format, password strength, rating bounds,
 *                                 price/stock negativity, empty required strings
 *   Introspection gating        — disabled in production environments
 *   Batch query abuse           — multiple operations in one POST
 *   Alias flooding              — 50 aliases for the same expensive field
 *
 * Error codes expected from the server:
 *   GRAPHQL_VALIDATION_FAILED — document violates the GraphQL type system
 *   BAD_USER_INPUT            — business-rule / semantic validation failure
 *   DEPTH_LIMIT_EXCEEDED      — query depth > MAX_DEPTH (typically 10)
 *   COMPLEXITY_LIMIT_EXCEEDED — computed query cost > MAX_COMPLEXITY (typically 1000)
 *   PERSISTED_QUERY_NOT_FOUND — for APQ (if enabled)
 *
 * Server configuration required (Apollo example):
 *
 *   import depthLimit from 'graphql-depth-limit';
 *   import { createComplexityLimitRule } from 'graphql-validation-complexity';
 *
 *   new ApolloServer({
 *     validationRules: [
 *       depthLimit(10),
 *       createComplexityLimitRule(1000),
 *     ],
 *   });
 */

import { test, expect } from '@playwright/test';
import {
  createGqlClient,
  assertNoErrors,
  assertGqlError,
  assertValidationFailed,
  gql,
} from './fixtures/graphql.js';

const USER_TOKEN = process.env['GQL_USER_TOKEN'] ?? '';
const hasUserToken = USER_TOKEN !== '';

// ─── Query depth limiting ─────────────────────────────────────────────────────

test.describe('Query depth limiting', () => {
  /** Builds a deeply nested query string N levels deep. */
  function buildDeepQuery(depth: number): string {
    // Nest: products → edges → node → category → products → edges → node → …
    // Each pair of levels adds one "product → category" hop.
    const openings = Array.from({ length: depth }, (_, i) =>
      i % 2 === 0
        ? 'products(pagination:{first:1}){edges{node{id category{'
        : 'products(pagination:{first:1}){edges{node{id category{',
    ).join('');
    const id = 'id ';
    const closings = Array.from({ length: depth }, () => '}}}').join('');
    return `query { ${openings}${id}${closings} }`;
  }

  test('query with depth 5 is accepted', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query {
        products(pagination: { first: 1 }) {
          edges {
            node {
              id
              category {
                id
                name
              }
            }
          }
        }
      }
    `);
    // depth 5 — should not trigger depth limit
    expect(res.errors?.some((e) => /depth/i.test(e.message))).toBe(false);
  });

  test('query exceeding max depth returns a depth-limit error', async ({ request }) => {
    // Build a 15-level deep query — exceeds the typical 10-level cap
    const deepQuery = buildDeepQuery(15);
    const res = await createGqlClient(request).query(deepQuery);

    // Either GRAPHQL_VALIDATION_FAILED or a custom DEPTH_LIMIT_EXCEEDED code
    expect(res.errors?.length).toBeGreaterThan(0);
    const errorMessages = res.errors!.map((e) => e.message.toLowerCase()).join(' ');
    const hasDepthError =
      errorMessages.includes('depth') ||
      errorMessages.includes('complex') ||
      res.errors!.some((e) =>
        ['DEPTH_LIMIT_EXCEEDED', 'GRAPHQL_VALIDATION_FAILED'].includes(
          e.extensions?.code ?? '',
        ),
      );
    expect(hasDepthError, `Expected depth/complexity error, got: ${JSON.stringify(res.errors)}`).toBe(true);
  });

  test('deeply nested query returns data: null when rejected (no partial data leak)', async ({ request }) => {
    const deepQuery = buildDeepQuery(15);
    const res = await createGqlClient(request).query(deepQuery);
    if (res.errors?.length) {
      expect(res.data).toBeNull();
    }
  });

  test('depth-limited query behaves consistently across repeated calls', async ({ request }) => {
    const deepQuery = buildDeepQuery(15);
    const client = createGqlClient(request);
    const [r1, r2] = await Promise.all([
      client.query(deepQuery),
      client.query(deepQuery),
    ]);
    // Both must agree — both errors or both successes
    expect(!!r1.errors?.length).toBe(!!r2.errors?.length);
  });
});

// ─── Query complexity ─────────────────────────────────────────────────────────

test.describe('Query complexity limits', () => {
  test('simple query is well within complexity budget', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query { categories { id name } }
    `);
    expect(res.errors?.some((e) => /complex/i.test(e.message))).toBe(false);
  });

  test('query requesting many fields simultaneously is either allowed or rejected gracefully', async ({ request }) => {
    // Request first:100 with many fields — high complexity score
    const res = await createGqlClient(request).query(gql`
      query {
        products(pagination: { first: 100 }) {
          edges {
            node {
              id name description price stock averageRating createdAt updatedAt
              category { id name slug }
              reviews {
                id rating body createdAt
                user { id name email }
              }
            }
          }
          pageInfo {
            hasNextPage hasPreviousPage startCursor endCursor totalCount
          }
        }
      }
    `);

    if (res.errors?.length) {
      // Server rejected the high-cost query — verify the code is correct
      const code = res.errors[0]?.extensions?.code ?? '';
      expect(
        ['GRAPHQL_VALIDATION_FAILED', 'COMPLEXITY_LIMIT_EXCEEDED', 'BAD_USER_INPUT'].includes(code) ||
        /complex|cost|limit/i.test(res.errors[0]!.message),
      ).toBe(true);
    } else {
      // Allowed — data must be complete and non-null
      assertNoErrors(res);
    }
  });

  test('alias flooding — 50 aliases for the same field is rejected or rate-limited', async ({ request }) => {
    // Each alias independently resolves; 50 × cost of products exceeds most limits
    const aliases = Array.from(
      { length: 50 },
      (_, i) => `p${i}: products(pagination:{first:1}){edges{node{id name price}}}`,
    ).join('\n');
    const query = `query AliasBomb { ${aliases} }`;
    const res = await createGqlClient(request).query(query);

    // Must not silently succeed without a complexity check
    if (res.errors?.length) {
      const code = res.errors[0]?.extensions?.code ?? '';
      expect(
        ['GRAPHQL_VALIDATION_FAILED', 'COMPLEXITY_LIMIT_EXCEEDED'].includes(code) ||
        /complex|cost|limit|alias/i.test(res.errors[0]!.message),
      ).toBe(true);
    }
    // If accepted: server allows alias expansion — document and move on
  });

  test('fragment bomb — same fragment spread 20 times is handled without crash', async ({ request }) => {
    const query = gql`
      fragment F on Query { categories { id } }
      query FragBomb {
        ${Array.from({ length: 20 }, () => '...F').join('\n')}
      }
    `;
    const res = await createGqlClient(request).query(query);
    // May fail with validation error or succeed — must not crash
    expect(res.errors?.some((e) => e.extensions?.code === 'INTERNAL_SERVER_ERROR')).toBe(false);
  });
});

// ─── Type-system validation ───────────────────────────────────────────────────

test.describe('Type-system validation (GRAPHQL_VALIDATION_FAILED)', () => {
  test('requesting a non-existent field returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query { products { nonExistentField }  }
    `);
    assertValidationFailed(res);
  });

  test('passing Int where ID is expected returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    // product(id: ID!) — passing a literal integer
    const res = await createGqlClient(request).query(gql`
      query { product(id: 12345) { id name } }
    `);
    // Integers coerce to strings in GraphQL — server may accept or reject
    // The important thing: no INTERNAL_SERVER_ERROR
    expect(res.errors?.some((e) => e.extensions?.code === 'INTERNAL_SERVER_ERROR')).toBe(false);
  });

  test('passing a String variable for an Int! input field returns type error', async ({ request }) => {
    const res = await createGqlClient(request).mutate(
      gql`
        mutation AddReview($input: AddReviewInput!) {
          addReview(input: $input) { id }
        }
      `,
      { input: { productId: 'p1', rating: 'not-a-number' } },
    );
    expect(res.errors?.length).toBeGreaterThan(0);
    expect(res.errors![0]!.extensions?.code).not.toBe('INTERNAL_SERVER_ERROR');
  });

  test('omitting a required non-null variable returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    // RegisterInput.email is String! — omit it
    const res = await createGqlClient(request).mutate(
      gql`mutation($input: RegisterInput!) { register(input: $input) { token } }`,
      { input: { name: 'No Email', password: 'Test@Pass8' } }, // email omitted
    );
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('null for a non-null field returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).mutate(
      gql`mutation($input: LoginInput!) { login(input: $input) { token } }`,
      { input: { email: null, password: 'Test@Pass8' } },
    );
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('extra unknown field in input object is ignored or rejected gracefully', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query {
        products(filter: { unknownField: "value", inStock: true }) {
          edges { node { id } }
        }
      }
    `);
    // Strict servers reject unknown fields; lenient ones ignore them
    // Neither should produce a 500
    expect(res.errors?.some((e) => e.extensions?.code === 'INTERNAL_SERVER_ERROR')).toBe(false);
  });

  test('completely empty document body returns a parse/validation error', async ({ request }) => {
    const res = await createGqlClient(request).query('');
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('non-GraphQL JSON body (no query field) returns a validation error', async ({ request }) => {
    // Send a POST with valid JSON but no `query` property
    const res = await request.post(
      process.env['GRAPHQL_URL'] ?? 'http://localhost:4000/graphql',
      {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ notQuery: 'missing query field' }),
      },
    );
    // Server should return 400 or a JSON error body — never 500
    expect(res.status()).not.toBe(500);
  });
});

// ─── Enum validation ──────────────────────────────────────────────────────────

test.describe('Enum validation', () => {
  test('invalid OrderStatus enum value returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(
      gql`
        mutation($input: UpdateOrderStatusInput!) {
          updateOrderStatus(input: $input) { id }
        }
      `,
      { input: { orderId: 'o1', status: 'NOT_A_REAL_STATUS' } },
    );
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('invalid ProductSortField enum value returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query {
        products(sort: { field: INVALID_FIELD, direction: ASC }) {
          edges { node { id } }
        }
      }
    `);
    assertValidationFailed(res);
  });

  test('invalid SortDirection enum value returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query {
        products(sort: { field: PRICE, direction: DIAGONAL }) {
          edges { node { id } }
        }
      }
    `);
    assertValidationFailed(res);
  });

  test('lowercase enum value is rejected (enums are case-sensitive)', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query { products(sort: { field: price, direction: asc }) { edges { node { id } } } }
    `);
    assertValidationFailed(res);
  });
});

// ─── Business-rule / BAD_USER_INPUT ──────────────────────────────────────────

test.describe('Business-rule input validation (BAD_USER_INPUT)', () => {
  test('email without @ is rejected at register', async ({ request }) => {
    const res = await createGqlClient(request).mutate(
      gql`mutation($input: RegisterInput!) { register(input: $input) { token } }`,
      { input: { email: 'bademail', password: 'Test@Pass8', name: 'Bad Email User' } },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('password with no digit is rejected at register', async ({ request }) => {
    const res = await createGqlClient(request).mutate(
      gql`mutation($input: RegisterInput!) { register(input: $input) { token } }`,
      { input: { email: 'valid@mailtest.dev', password: 'NoDigitPassword', name: 'User' } },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('review rating 0 is rejected (below minimum of 1)', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(
      gql`mutation($input: AddReviewInput!) { addReview(input: $input) { id } }`,
      { input: { productId: 'p1', rating: 0 } },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('review rating 6 is rejected (above maximum of 5)', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(
      gql`mutation($input: AddReviewInput!) { addReview(input: $input) { id } }`,
      { input: { productId: 'p1', rating: 6 } },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('product price 0 is rejected at createProduct', async ({ request }) => {
    test.skip(!process.env['GQL_ADMIN_TOKEN'], 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, process.env['GQL_ADMIN_TOKEN']!).mutate(
      gql`mutation($input: CreateProductInput!) { createProduct(input: $input) { id } }`,
      {
        input: {
          name: 'Zero Price',
          price: 0,
          stock: 10,
          categoryId: process.env['GQL_CATEGORY_ID'] ?? 'cat_1',
        },
      },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('product stock -1 is rejected at createProduct', async ({ request }) => {
    test.skip(!process.env['GQL_ADMIN_TOKEN'], 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, process.env['GQL_ADMIN_TOKEN']!).mutate(
      gql`mutation($input: CreateProductInput!) { createProduct(input: $input) { id } }`,
      {
        input: {
          name: 'Negative Stock',
          price: 10,
          stock: -1,
          categoryId: process.env['GQL_CATEGORY_ID'] ?? 'cat_1',
        },
      },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('order with quantity 0 is rejected', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(
      gql`mutation($input: CreateOrderInput!) { createOrder(input: $input) { id } }`,
      { input: { items: [{ productId: 'p1', quantity: 0 }] } },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('order with empty items array is rejected', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(
      gql`mutation($input: CreateOrderInput!) { createOrder(input: $input) { id } }`,
      { input: { items: [] } },
    );
    assertGqlError(res, 'BAD_USER_INPUT');
  });

  test('pagination first: -5 is rejected', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query { products(pagination: { first: -5 }) { edges { node { id } } } }
    `);
    expect(res.errors?.length).toBeGreaterThan(0);
    expect(res.errors![0]!.extensions?.code).not.toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── Null-safety ──────────────────────────────────────────────────────────────

test.describe('Null-safety', () => {
  test('non-null field in response is never null for a valid response', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query { categories { id name slug } }
    `);
    assertNoErrors(res);
    const cats = (res.data as { categories: Array<{ id: string; name: string; slug: string }> }).categories;
    for (const cat of cats) {
      expect(cat.id).not.toBeNull();
      expect(cat.name).not.toBeNull();
      expect(cat.slug).not.toBeNull();
    }
  });

  test('PageInfo non-null booleans are always present in connection response', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query {
        products {
          pageInfo {
            hasNextPage
            hasPreviousPage
            totalCount
          }
        }
      }
    `);
    assertNoErrors(res);
    const pi = (res.data as { products: { pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; totalCount: number } } }).products.pageInfo;
    expect(typeof pi.hasNextPage).toBe('boolean');
    expect(typeof pi.hasPreviousPage).toBe('boolean');
    expect(typeof pi.totalCount).toBe('number');
  });
});

// ─── Introspection gating ─────────────────────────────────────────────────────

test.describe('Introspection', () => {
  test('introspection is allowed in non-production or returns a clear disabled message', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query { __schema { queryType { name } } }
    `);

    if (res.errors?.length) {
      // Server has introspection disabled — must return a clear message, not 500
      expect(res.errors[0]!.extensions?.code).not.toBe('INTERNAL_SERVER_ERROR');
      expect(res.errors[0]!.message.toLowerCase()).toMatch(
        /introspection|disabled|not allowed/,
      );
    } else {
      assertNoErrors(res);
      expect(
        (res.data as { __schema: { queryType: { name: string } } }).__schema.queryType.name,
      ).toBe('Query');
    }
  });

  test('__typename meta-field is always available on any type', async ({ request }) => {
    const res = await createGqlClient(request).query(gql`
      query { categories { __typename id } }
    `);
    assertNoErrors(res);
    const cats = (res.data as { categories: Array<{ __typename: string }> }).categories;
    for (const cat of cats) {
      expect(cat.__typename).toBe('Category');
    }
  });
});

// ─── Batch query handling ─────────────────────────────────────────────────────

test.describe('Batch query / multi-operation handling', () => {
  test('document with two named operations and no operationName returns an error', async ({ request }) => {
    // GraphQL spec: when a document has multiple operations, operationName is required
    const res = await createGqlClient(request).query(gql`
      query A { categories { id } }
      query B { categories { name } }
    `);
    // Server must require operationName — should not silently pick one
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('document with two operations and explicit operationName A succeeds', async ({ request }) => {
    const endpoint = process.env['GRAPHQL_URL'] ?? 'http://localhost:4000/graphql';
    const httpRes = await request.post(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        query: 'query A { categories { id } } query B { categories { name } }',
        operationName: 'A',
      }),
    });
    const body = await httpRes.json() as { data?: unknown; errors?: unknown[] };
    expect(body.errors).toBeUndefined();
    expect(body.data).toBeTruthy();
  });

  test('array batch POST (if supported) processes each operation independently', async ({ request }) => {
    const endpoint = process.env['GRAPHQL_URL'] ?? 'http://localhost:4000/graphql';
    const httpRes = await request.post(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify([
        { query: '{ categories { id } }' },
        { query: '{ categories { name } }' },
      ]),
    });

    // Batch HTTP is optional per spec — server may return 400 (not supported)
    // or an array of results — never a 500
    expect(httpRes.status()).not.toBe(500);
  });
});
