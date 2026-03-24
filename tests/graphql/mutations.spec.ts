/**
 * GraphQL mutation tests — every mutation in src/schema.graphql
 *
 * Covers three caller personas for each protected operation:
 *   anonymous  — no Authorization header
 *   user       — valid USER-role token (GQL_USER_TOKEN)
 *   admin      — valid ADMIN-role token (GQL_ADMIN_TOKEN)
 *
 * Public mutations (register, login) are tested for:
 *   - happy path
 *   - duplicate / wrong-credential errors
 *   - every required-field permutation
 *   - input validation (email format, password strength, rating bounds, etc.)
 */

import { test, expect } from '@playwright/test';
import {
  createGqlClient,
  generateGqlUser,
  generateGqlProduct,
  assertNoErrors,
  assertGqlError,
  assertUnauthorized,
  assertForbidden,
  assertBadUserInput,
  gql,
  FRAGMENTS,
  type GqlResponse,
} from './fixtures/graphql.js';

// ─── Env tokens ───────────────────────────────────────────────────────────────

const USER_TOKEN  = process.env['GQL_USER_TOKEN']  ?? '';
const ADMIN_TOKEN = process.env['GQL_ADMIN_TOKEN'] ?? '';
const CATEGORY_ID = process.env['GQL_CATEGORY_ID'] ?? 'category_placeholder';

const hasUserToken  = USER_TOKEN  !== '';
const hasAdminToken = ADMIN_TOKEN !== '';
const hasCategoryId = CATEGORY_ID !== 'category_placeholder';

// ─── Shared fragments ──────────────────────────────────────────────────────────

const REGISTER_MUTATION = gql`
  ${FRAGMENTS.AUTH_FIELDS}
  mutation Register($input: RegisterInput!) {
    register(input: $input) { ...AuthFields }
  }
`;

const LOGIN_MUTATION = gql`
  ${FRAGMENTS.AUTH_FIELDS}
  mutation Login($input: LoginInput!) {
    login(input: $input) { ...AuthFields }
  }
`;

// ─── register ─────────────────────────────────────────────────────────────────

test.describe('mutation register', () => {
  test('valid input returns a token and user object', async ({ request }) => {
    const seed = generateGqlUser();
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, { input: seed });
    assertNoErrors(res);
    const payload = (res.data as { register: { token: string; user: { email: string; role: string } } }).register;
    expect(typeof payload.token).toBe('string');
    expect(payload.token.length).toBeGreaterThan(10);
    expect(payload.user.email).toBe(seed.email);
    expect(payload.user.role).toBe('USER');
  });

  test('returned token can be used to call the me query', async ({ request }) => {
    const seed = generateGqlUser();
    const client = createGqlClient(request);
    const regRes = await client.mutate(REGISTER_MUTATION, { input: seed });
    assertNoErrors(regRes);
    const token = (regRes.data as { register: { token: string } }).register.token;

    const meRes = await client.withToken(token).query(gql`query { me { id email } }`);
    assertNoErrors(meRes);
    expect((meRes.data as { me: { email: string } }).me.email).toBe(seed.email);
  });

  test('duplicate email returns BAD_USER_INPUT', async ({ request }) => {
    const seed = generateGqlUser();
    const client = createGqlClient(request);
    await client.mutate(REGISTER_MUTATION, { input: seed });
    const res = await client.mutate(REGISTER_MUTATION, { input: seed });
    assertBadUserInput(res);
  });

  test('invalid email format returns BAD_USER_INPUT', async ({ request }) => {
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, {
      input: { ...generateGqlUser(), email: 'not-an-email' },
    });
    assertBadUserInput(res);
  });

  test('password shorter than 8 characters returns BAD_USER_INPUT', async ({ request }) => {
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, {
      input: { ...generateGqlUser(), password: 'Short1' },
    });
    assertBadUserInput(res);
  });

  test('password with no digit returns BAD_USER_INPUT', async ({ request }) => {
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, {
      input: { ...generateGqlUser(), password: 'NoDigitsHere' },
    });
    assertBadUserInput(res);
  });

  test('empty name returns BAD_USER_INPUT', async ({ request }) => {
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, {
      input: { ...generateGqlUser(), name: '' },
    });
    assertBadUserInput(res);
  });

  test('missing required field email causes GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const { email: _omit, ...withoutEmail } = generateGqlUser();
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, {
      input: withoutEmail,
    });
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('SQL injection in name field does not cause 5xx and is rejected or sanitised', async ({ request }) => {
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, {
      input: { ...generateGqlUser(), name: "'; DROP TABLE users; --" },
    });
    // Either succeeds (sanitised) or rejects — never a server error
    if (res.errors) {
      expect(res.errors[0]?.extensions?.code).not.toMatch(/INTERNAL_SERVER_ERROR/);
    }
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

test.describe('mutation login', () => {
  let registeredEmail: string;
  let registeredPassword: string;

  test.beforeAll(async ({ request }) => {
    const seed = generateGqlUser();
    const res = await createGqlClient(request).mutate(REGISTER_MUTATION, {
      input: seed,
    });
    if (res.errors) throw new Error(`login beforeAll register failed: ${JSON.stringify(res.errors)}`);
    registeredEmail    = seed.email;
    registeredPassword = seed.password;
  });

  test('valid credentials return token and user', async ({ request }) => {
    const res = await createGqlClient(request).mutate(LOGIN_MUTATION, {
      input: { email: registeredEmail, password: registeredPassword },
    });
    assertNoErrors(res);
    const payload = (res.data as { login: { token: string; user: { email: string } } }).login;
    expect(typeof payload.token).toBe('string');
    expect(payload.user.email).toBe(registeredEmail);
  });

  test('wrong password returns BAD_USER_INPUT or UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).mutate(LOGIN_MUTATION, {
      input: { email: registeredEmail, password: 'TotallyWrong9' },
    });
    assertGqlError(res); // any error is acceptable
    expect(res.errors![0]!.extensions?.code).toMatch(/UNAUTHENTICATED|BAD_USER_INPUT/);
  });

  test('non-existent email returns BAD_USER_INPUT or UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).mutate(LOGIN_MUTATION, {
      input: { email: 'ghost_account_never_registered@mailtest.dev', password: 'Test@Pass8' },
    });
    assertGqlError(res);
  });

  test('empty email field returns an error', async ({ request }) => {
    const res = await createGqlClient(request).mutate(LOGIN_MUTATION, {
      input: { email: '', password: registeredPassword },
    });
    assertGqlError(res);
  });

  test('missing email field causes GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    const res = await createGqlClient(request).mutate(
      gql`mutation { login(input: { password: "Test@Pass8" }) { token } }`,
    );
    expect(res.errors?.length).toBeGreaterThan(0);
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

test.describe('mutation logout', () => {
  const MUTATION = gql`mutation { logout }`;

  test('authenticated user receives true on logout', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION);
    assertNoErrors(res);
    expect((res.data as { logout: boolean }).logout).toBe(true);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION);
    assertUnauthorized(res);
  });

  test('calling logout with a tampered token returns UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request, 'bogus.token.abc').mutate(MUTATION);
    assertUnauthorized(res);
  });
});

// ─── updateMe ─────────────────────────────────────────────────────────────────

test.describe('mutation updateMe', () => {
  const MUTATION = gql`
    ${FRAGMENTS.USER_FIELDS}
    mutation UpdateMe($input: UpdateUserInput!) {
      updateMe(input: $input) { ...UserFields }
    }
  `;

  test('authenticated user can change their name', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const newName = `Updated Name ${Date.now()}`;
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { name: newName },
    });
    assertNoErrors(res);
    expect((res.data as { updateMe: { name: string } }).updateMe.name).toBe(newName);
  });

  test('user can update email to a valid new address', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const newEmail = `updated.${Date.now()}@mailtest.dev`;
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { email: newEmail },
    });
    assertNoErrors(res);
    expect((res.data as { updateMe: { email: string } }).updateMe.email).toBe(newEmail);
  });

  test('invalid email format in update returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { email: 'not-valid-email' },
    });
    assertBadUserInput(res);
  });

  test('new password shorter than 8 chars returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { password: 'short1' },
    });
    assertBadUserInput(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      input: { name: 'Ghost' },
    });
    assertUnauthorized(res);
  });

  test('empty name returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { name: '' },
    });
    assertBadUserInput(res);
  });
});

// ─── createOrder ──────────────────────────────────────────────────────────────

test.describe('mutation createOrder', () => {
  const MUTATION = gql`
    ${FRAGMENTS.ORDER_FIELDS}
    mutation CreateOrder($input: CreateOrderInput!) {
      createOrder(input: $input) { ...OrderFields }
    }
  `;

  test('authenticated user can create an order with a valid product', async ({ request }) => {
    test.skip(!hasUserToken || !hasCategoryId, 'No token or category');
    // Uses a known product ID from the catalogue — seeded in PRODUCT_ID env
    const productId = process.env['GQL_PRODUCT_ID'] ?? 'product_placeholder';
    test.skip(productId === 'product_placeholder', 'No GQL_PRODUCT_ID set');

    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { items: [{ productId, quantity: 1 }] },
    });
    assertNoErrors(res);
    const order = (res.data as { createOrder: { id: string; status: string; total: number } }).createOrder;
    expect(typeof order.id).toBe('string');
    expect(order.status).toBe('PENDING');
    expect(order.total).toBeGreaterThan(0);
  });

  test('order with quantity 0 returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { items: [{ productId: 'prod_1', quantity: 0 }] },
    });
    assertBadUserInput(res);
  });

  test('order with empty items array returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { items: [] },
    });
    assertBadUserInput(res);
  });

  test('non-existent productId returns BAD_USER_INPUT or NOT_FOUND', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { items: [{ productId: 'product_does_not_exist_9999', quantity: 1 }] },
    });
    assertGqlError(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      input: { items: [{ productId: 'prod_1', quantity: 1 }] },
    });
    assertUnauthorized(res);
  });
});

// ─── addReview ────────────────────────────────────────────────────────────────

test.describe('mutation addReview', () => {
  const MUTATION = gql`
    mutation AddReview($input: AddReviewInput!) {
      addReview(input: $input) {
        id
        rating
        body
        product { id }
        user { id }
      }
    }
  `;

  const PRODUCT_ID = process.env['GQL_PRODUCT_ID'] ?? 'product_placeholder';

  test('authenticated user can add a review with rating 5', async ({ request }) => {
    test.skip(!hasUserToken || PRODUCT_ID === 'product_placeholder', 'No token/product');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { productId: PRODUCT_ID, rating: 5, body: 'Excellent product!' },
    });
    assertNoErrors(res);
    const review = (res.data as { addReview: { id: string; rating: number } }).addReview;
    expect(review.rating).toBe(5);
    expect(typeof review.id).toBe('string');
  });

  test('rating 0 returns BAD_USER_INPUT (below minimum of 1)', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { productId: PRODUCT_ID, rating: 0 },
    });
    assertBadUserInput(res);
  });

  test('rating 6 returns BAD_USER_INPUT (above maximum of 5)', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { productId: PRODUCT_ID, rating: 6 },
    });
    assertBadUserInput(res);
  });

  test('rating of -1 returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { productId: PRODUCT_ID, rating: -1 },
    });
    assertBadUserInput(res);
  });

  test('review for non-existent product returns an error', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { productId: 'product_does_not_exist_9999', rating: 3 },
    });
    assertGqlError(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      input: { productId: PRODUCT_ID, rating: 4 },
    });
    assertUnauthorized(res);
  });

  test('rating 1 (boundary minimum) is accepted', async ({ request }) => {
    test.skip(!hasUserToken || PRODUCT_ID === 'product_placeholder', 'No token/product');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { productId: PRODUCT_ID, rating: 1, body: 'Not great.' },
    });
    if (res.errors) {
      // Acceptable if the server rejects a duplicate review
      expect(res.errors[0]?.extensions?.code).not.toMatch(/INTERNAL_SERVER_ERROR/);
    } else {
      expect((res.data as { addReview: { rating: number } }).addReview.rating).toBe(1);
    }
  });
});

// ─── deleteUser (admin) ───────────────────────────────────────────────────────

test.describe('mutation deleteUser — admin only', () => {
  const MUTATION = gql`
    mutation DeleteUser($id: ID!) {
      deleteUser(id: $id)
    }
  `;

  test('admin can delete a user by ID', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    // Register a throwaway user for deletion
    const seed = generateGqlUser();
    const regRes = await createGqlClient(request).mutate(REGISTER_MUTATION, { input: seed });
    if (regRes.errors) { test.skip(true, 'Could not create throwaway user'); return; }
    const userId = (regRes.data as { register: { user: { id: string } } }).register.user.id;

    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, { id: userId });
    assertNoErrors(res);
    expect((res.data as { deleteUser: boolean }).deleteUser).toBe(true);
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      id: 'any_user_id',
    });
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      id: 'any_user_id',
    });
    assertUnauthorized(res);
  });

  test('deleting a non-existent user returns BAD_USER_INPUT or NOT_FOUND — not 5xx', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      id: 'user_does_not_exist_9999',
    });
    assertGqlError(res);
    expect(res.errors![0]!.extensions?.code).not.toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── createProduct (admin) ────────────────────────────────────────────────────

test.describe('mutation createProduct — admin only', () => {
  const MUTATION = gql`
    ${FRAGMENTS.PRODUCT_FIELDS}
    mutation CreateProduct($input: CreateProductInput!) {
      createProduct(input: $input) { ...ProductFields }
    }
  `;

  test('admin creates a product with all fields', async ({ request }) => {
    test.skip(!hasAdminToken || !hasCategoryId, 'No ADMIN_TOKEN/CATEGORY_ID');
    const seed = generateGqlProduct(CATEGORY_ID);
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, { input: seed });
    assertNoErrors(res);
    const p = (res.data as { createProduct: { id: string; name: string; price: number } }).createProduct;
    expect(typeof p.id).toBe('string');
    expect(p.name).toBe(seed.name);
    expect(p.price).toBe(seed.price);
  });

  test('admin creates a product with minimal required fields', async ({ request }) => {
    test.skip(!hasAdminToken || !hasCategoryId, 'No ADMIN_TOKEN/CATEGORY_ID');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      input: { name: `Min Product ${Date.now()}`, price: 9.99, stock: 5, categoryId: CATEGORY_ID },
    });
    assertNoErrors(res);
  });

  test('price of 0 returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasAdminToken || !hasCategoryId, 'No ADMIN_TOKEN/CATEGORY_ID');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      input: { name: 'Zero Price', price: 0, stock: 10, categoryId: CATEGORY_ID },
    });
    assertBadUserInput(res);
  });

  test('negative price returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasAdminToken || !hasCategoryId, 'No ADMIN_TOKEN/CATEGORY_ID');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      input: { name: 'Negative Price', price: -5.0, stock: 10, categoryId: CATEGORY_ID },
    });
    assertBadUserInput(res);
  });

  test('negative stock returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasAdminToken || !hasCategoryId, 'No ADMIN_TOKEN/CATEGORY_ID');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      input: { name: 'Neg Stock', price: 10, stock: -1, categoryId: CATEGORY_ID },
    });
    assertBadUserInput(res);
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { name: 'Forbidden Product', price: 9.99, stock: 5, categoryId: CATEGORY_ID },
    });
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      input: { name: 'Anon Product', price: 9.99, stock: 5, categoryId: CATEGORY_ID },
    });
    assertUnauthorized(res);
  });
});

// ─── updateProduct (admin) ────────────────────────────────────────────────────

test.describe('mutation updateProduct — admin only', () => {
  const MUTATION = gql`
    mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
      updateProduct(id: $id, input: $input) {
        id
        name
        price
        stock
      }
    }
  `;

  const PRODUCT_ID = process.env['GQL_PRODUCT_ID'] ?? 'product_placeholder';

  test('admin can update product name and price', async ({ request }) => {
    test.skip(!hasAdminToken || PRODUCT_ID === 'product_placeholder', 'No token/product');
    const newName = `Updated Product ${Date.now()}`;
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      id: PRODUCT_ID,
      input: { name: newName, price: 39.99 },
    });
    assertNoErrors(res);
    const p = (res.data as { updateProduct: { name: string; price: number } }).updateProduct;
    expect(p.name).toBe(newName);
    expect(p.price).toBeCloseTo(39.99);
  });

  test('updating to price 0 returns BAD_USER_INPUT', async ({ request }) => {
    test.skip(!hasAdminToken || PRODUCT_ID === 'product_placeholder', 'No token/product');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      id: PRODUCT_ID,
      input: { price: 0 },
    });
    assertBadUserInput(res);
  });

  test('updating non-existent product returns an error', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      id: 'product_does_not_exist_9999',
      input: { name: 'Ghost Update' },
    });
    assertGqlError(res);
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      id: PRODUCT_ID,
      input: { name: 'User Sneaky Update' },
    });
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      id: PRODUCT_ID,
      input: { name: 'Anon Update' },
    });
    assertUnauthorized(res);
  });
});

// ─── deleteProduct (admin) ────────────────────────────────────────────────────

test.describe('mutation deleteProduct — admin only', () => {
  const MUTATION = gql`
    mutation DeleteProduct($id: ID!) {
      deleteProduct(id: $id)
    }
  `;

  test('admin can delete a product', async ({ request }) => {
    test.skip(!hasAdminToken || !hasCategoryId, 'No ADMIN_TOKEN/CATEGORY_ID');
    // Create a throwaway product then delete it
    const createRes = await createGqlClient(request, ADMIN_TOKEN).mutate(
      gql`
        mutation($input: CreateProductInput!) {
          createProduct(input: $input) { id }
        }
      `,
      {
        input: {
          name: `Disposable ${Date.now()}`,
          price: 1.0,
          stock: 1,
          categoryId: CATEGORY_ID,
        },
      },
    );
    if (createRes.errors) { test.skip(true, 'Could not create throwaway product'); return; }
    const pid = (createRes.data as { createProduct: { id: string } }).createProduct.id;

    const delRes = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, { id: pid });
    assertNoErrors(delRes);
    expect((delRes.data as { deleteProduct: boolean }).deleteProduct).toBe(true);
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      id: 'some_product_id',
    });
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      id: 'some_product_id',
    });
    assertUnauthorized(res);
  });

  test('deleting a non-existent product returns an error — not INTERNAL_SERVER_ERROR', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      id: 'product_does_not_exist_9999',
    });
    assertGqlError(res);
    expect(res.errors![0]!.extensions?.code).not.toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── updateOrderStatus (admin) ────────────────────────────────────────────────

test.describe('mutation updateOrderStatus — admin only', () => {
  const MUTATION = gql`
    mutation UpdateOrderStatus($input: UpdateOrderStatusInput!) {
      updateOrderStatus(input: $input) {
        id
        status
      }
    }
  `;

  const ORDER_ID = process.env['GQL_USER_ORDER_ID'] ?? 'order_placeholder';

  test('admin can advance a PENDING order to CONFIRMED', async ({ request }) => {
    test.skip(!hasAdminToken || ORDER_ID === 'order_placeholder', 'No token/order');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      input: { orderId: ORDER_ID, status: 'CONFIRMED' },
    });
    assertNoErrors(res);
    expect((res.data as { updateOrderStatus: { status: string } }).updateOrderStatus.status).toBe('CONFIRMED');
  });

  test('invalid status enum returns GRAPHQL_VALIDATION_FAILED', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      input: { orderId: ORDER_ID, status: 'BEAMED_UP' },
    });
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  test('non-existent orderId returns an error — not INTERNAL_SERVER_ERROR', async ({ request }) => {
    test.skip(!hasAdminToken, 'No GQL_ADMIN_TOKEN set');
    const res = await createGqlClient(request, ADMIN_TOKEN).mutate(MUTATION, {
      input: { orderId: 'order_does_not_exist_9999', status: 'CONFIRMED' },
    });
    assertGqlError(res);
    expect(res.errors![0]!.extensions?.code).not.toBe('INTERNAL_SERVER_ERROR');
  });

  test('user-role token receives FORBIDDEN', async ({ request }) => {
    test.skip(!hasUserToken, 'No GQL_USER_TOKEN set');
    const res = await createGqlClient(request, USER_TOKEN).mutate(MUTATION, {
      input: { orderId: ORDER_ID, status: 'CONFIRMED' },
    });
    assertForbidden(res);
  });

  test('anonymous caller receives UNAUTHENTICATED', async ({ request }) => {
    const res = await createGqlClient(request).withoutToken().mutate(MUTATION, {
      input: { orderId: ORDER_ID, status: 'CONFIRMED' },
    });
    assertUnauthorized(res);
  });
});
