# Example Patterns — API Test Scenarios

These mirror the patterns used in this project's existing API test suite. Use them as starting points.

---

## 1. CRUD resource (orders)

Covers: list, get-by-id, create, update, delete with auth + validation.

```typescript
// tests/api/orders.spec.ts
import { test, expect } from '@playwright/test';
import { createApiClient, timed } from '../helpers/apiClient.js';
import {
  userFactory, orderFactory, productFactory, categoryFactory, memoryAdapter,
} from '../../src/factories/index.js';
import type { Order } from '../../src/factories/types.js';

// ─── Schema validator ─────────────────────────────────────────────────────────

function assertOrderSchema(order: unknown, label = 'order'): void {
  const o = order as Record<string, unknown>;
  expect(typeof o['id'],     `${label}.id type`).toBe('string');
  expect(typeof o['status'], `${label}.status type`).toBe('string');
  expect(
    ['PENDING', 'PAID', 'DELIVERED', 'CANCELLED'],
    `${label}.status valid enum`,
  ).toContain(o['status']);
  expect(typeof o['userId'], `${label}.userId type`).toBe('string');
  expect(o['createdAt'],     `${label}.createdAt present`).toBeTruthy();
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
  await memoryAdapter.reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders  (list — authenticated user sees own orders only)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('GET /api/orders', () => {
  test('returns own orders with correct schema', async ({ request }) => {
    const user   = await userFactory.create();
    await orderFactory.withItems(2).forUser(user.id).create();
    await orderFactory.withItems(1).forUser(user.id).create();

    const client = createApiClient(request).setToken(user.token);
    const res    = await client.get('/api/orders');
    const body   = await res.json() as { orders: unknown[] };

    expect(res.status()).toBe(200);
    expect(body.orders.length).toBe(2);
    for (const [i, order] of body.orders.entries()) {
      assertOrderSchema(order, `orders[${i}]`);
    }
  });

  test('does not include other users\' orders', async ({ request }) => {
    const user  = await userFactory.create();
    const other = await userFactory.create();
    await orderFactory.forUser(other.id).create();

    const client = createApiClient(request).setToken(user.token);
    const body   = await (await client.get('/api/orders')).json() as { orders: unknown[] };
    expect(body.orders.length).toBe(0);
  });

  test('no token → 401', async ({ request }) => {
    const res = await createApiClient(request).get('/api/orders');
    expect(res.status()).toBe(401);
  });

  test('responds in under 500 ms', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const [res, ms] = await timed(() => client.get('/api/orders'));
    expect(res.status()).toBe(200);
    expect(ms, `Expected < 500 ms, got ${ms} ms`).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id
// ─────────────────────────────────────────────────────────────────────────────

test.describe('GET /api/orders/:id', () => {
  test('returns the order by ID', async ({ request }) => {
    const user  = await userFactory.create();
    const order = await orderFactory.forUser(user.id).create();
    const client = createApiClient(request).setToken(user.token);

    const res  = await client.get(`/api/orders/${order.id}`);
    const body = await res.json() as Order;

    expect(res.status()).toBe(200);
    expect(body.id).toBe(order.id);
    assertOrderSchema(body);
  });

  test('unknown ID → 404', async ({ request }) => {
    const user  = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res   = await client.get('/api/orders/does-not-exist-999');
    expect(res.status()).toBe(404);
  });

  test('another user\'s order → 403', async ({ request }) => {
    const owner = await userFactory.create();
    const order = await orderFactory.forUser(owner.id).create();
    const other = await userFactory.create();

    const client = createApiClient(request).setToken(other.token);
    const res    = await client.get(`/api/orders/${order.id}`);
    expect(res.status()).toBe(403);
  });

  test('ADMIN can access any order', async ({ request }) => {
    const owner = await userFactory.create();
    const order = await orderFactory.forUser(owner.id).create();
    const admin = await userFactory.admin().create();

    const client = createApiClient(request).setToken(admin.token);
    const res    = await client.get(`/api/orders/${order.id}`);
    expect(res.status()).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders  (create)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('POST /api/orders', () => {
  test('creates an order and returns 201 with schema', async ({ request }) => {
    const user    = await userFactory.create();
    const cat     = await categoryFactory.create();
    const product = await productFactory.inCategory(cat.id).create();
    const client  = createApiClient(request).setToken(user.token);

    const res  = await client.post('/api/orders', {
      data: { items: [{ productId: product.id, quantity: 2 }] },
    });
    const body = await res.json() as Order;

    expect(res.status()).toBe(201);
    assertOrderSchema(body);
    expect(body.userId).toBe(user.id);
    expect(body.status).toBe('PENDING');
  });

  test('empty items array → 400', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/orders', { data: { items: [] } });
    expect(res.status()).toBe(400);
  });

  test('missing items field → 400', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/orders', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('out-of-stock product → 422', async ({ request }) => {
    const user    = await userFactory.create();
    const cat     = await categoryFactory.create();
    const product = await productFactory.outOfStock().inCategory(cat.id).create();
    const client  = createApiClient(request).setToken(user.token);

    const res = await client.post('/api/orders', {
      data: { items: [{ productId: product.id, quantity: 1 }] },
    });
    expect(res.status()).toBe(422);
  });

  test('quantity ≤ 0 → 400', async ({ request }) => {
    const user    = await userFactory.create();
    const cat     = await categoryFactory.create();
    const product = await productFactory.inCategory(cat.id).create();
    const client  = createApiClient(request).setToken(user.token);

    const res = await client.post('/api/orders', {
      data: { items: [{ productId: product.id, quantity: 0 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('SQL injection in productId does not cause 5xx', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/orders', {
      data: { items: [{ productId: "'; DROP TABLE orders; --", quantity: 1 }] },
    });
    expect(res.status()).not.toBeGreaterThanOrEqual(500);
  });
});
```

---

## 2. Auth endpoint (login + token lifecycle)

Covers: successful login, wrong credentials, locked accounts, token reuse.

```typescript
// tests/api/auth.spec.ts
import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/apiClient.js';
import { userFactory, memoryAdapter } from '../../src/factories/index.js';

test.afterEach(async () => { await memoryAdapter.reset(); });

test.describe('POST /api/login', () => {
  test('valid credentials return 200 and a token', async ({ request }) => {
    const user   = await userFactory.verified().create();
    const client = createApiClient(request);

    const res  = await client.post('/api/login', {
      data: { email: user.email, password: 'password' }, // factory default
    });
    const body = await res.json() as { token: string; user: unknown };

    expect(res.status()).toBe(200);
    expect(typeof body.token, 'token type').toBe('string');
    expect(body.token.length, 'token non-empty').toBeGreaterThan(0);
  });

  test('wrong password → 401', async ({ request }) => {
    const user  = await userFactory.verified().create();
    const res   = await createApiClient(request).post('/api/login', {
      data: { email: user.email, password: 'WrongPassword!99' },
    });
    const body  = await res.json() as Record<string, unknown>;

    expect(res.status()).toBe(401);
    expect(body['token']).toBeUndefined();
  });

  test('unknown email → 401 (same error shape — no user enumeration)', async ({ request }) => {
    const res  = await createApiClient(request).post('/api/login', {
      data: { email: 'nobody@example.com', password: 'irrelevant' },
    });
    expect(res.status()).toBe(401);
    // Must NOT expose "user not found" vs "wrong password"
    const body = await res.json() as Record<string, unknown>;
    expect(body['token']).toBeUndefined();
  });

  test('banned user → 403 with reason', async ({ request }) => {
    const user = await userFactory.banned().create();
    const res  = await createApiClient(request).post('/api/login', {
      data: { email: user.email, password: 'password' },
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status()).toBe(403);
    expect(body['message'] as string).toMatch(/banned|suspended/i);
  });

  test('missing email → 400', async ({ request }) => {
    const res = await createApiClient(request).post('/api/login', {
      data: { password: 'pass' },
    });
    expect(res.status()).toBe(400);
  });

  test('missing password → 400', async ({ request }) => {
    const res = await createApiClient(request).post('/api/login', {
      data: { email: 'user@example.com' },
    });
    expect(res.status()).toBe(400);
  });

  test('XSS payload in email → 4xx, not 5xx', async ({ request }) => {
    const res = await createApiClient(request).post('/api/login', {
      data: { email: '<script>alert(1)</script>@evil.com', password: 'pass' },
    });
    expect(res.status()).not.toBeGreaterThanOrEqual(500);
  });
});
```

---

## 3. Payment processing

Covers: business rules from `PaymentService.validatePaymentDetails`, which maps to the handler.

```typescript
// tests/api/payments.spec.ts
import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/apiClient.js';
import {
  userFactory, orderFactory, paymentFactory, memoryAdapter,
} from '../../src/factories/index.js';

test.afterEach(async () => { await memoryAdapter.reset(); });

test.describe('POST /api/payments', () => {
  test('valid payment returns 201', async ({ request }) => {
    const user  = await userFactory.create();
    const order = await orderFactory.forUser(user.id).create();

    const res  = await createApiClient(request).setToken(user.token).post('/api/payments', {
      data: {
        orderId:   order.id,
        cardToken: 'tok_visa_test',
        amount:    order.total,
        currency:  'USD',
      },
    });
    expect(res.status()).toBe(201);
  });

  test('amount of 0 → 400', async ({ request }) => {
    const user  = await userFactory.create();
    const order = await orderFactory.forUser(user.id).create();
    const res   = await createApiClient(request).setToken(user.token).post('/api/payments', {
      data: { orderId: order.id, cardToken: 'tok_visa', amount: 0, currency: 'USD' },
    });
    expect(res.status()).toBe(400);
  });

  test('amount exceeding max → 400', async ({ request }) => {
    const user  = await userFactory.create();
    const order = await orderFactory.forUser(user.id).create();
    const res   = await createApiClient(request).setToken(user.token).post('/api/payments', {
      data: {
        orderId: order.id, cardToken: 'tok_visa',
        amount: 999_999_999, // > MAX_PAYMENT_AMOUNT
        currency: 'USD',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('unsupported currency → 400', async ({ request }) => {
    const user  = await userFactory.create();
    const order = await orderFactory.forUser(user.id).create();
    const res   = await createApiClient(request).setToken(user.token).post('/api/payments', {
      data: { orderId: order.id, cardToken: 'tok_visa', amount: 1000, currency: 'XYZ' },
    });
    const body  = await res.json() as Record<string, unknown>;
    expect(res.status()).toBe(400);
    expect(body['message'] as string).toMatch(/currency/i);
  });

  test('already-paid order → 409', async ({ request }) => {
    const user  = await userFactory.create();
    const order = await orderFactory.delivered().forUser(user.id).create();
    const res   = await createApiClient(request).setToken(user.token).post('/api/payments', {
      data: { orderId: order.id, cardToken: 'tok_visa', amount: 1000, currency: 'USD' },
    });
    expect(res.status()).toBe(409);
  });

  // Factory-based pre-existing payment (refund endpoint)
  test('GET /api/payments/:id returns refunded payment shape', async ({ request }) => {
    const user    = await userFactory.create();
    const order   = await orderFactory.forUser(user.id).create();
    const payment = await paymentFactory.refunded().create({
      orderId: order.id, customerId: user.id, amount: 4999,
    });

    const res  = await createApiClient(request).setToken(user.token)
      .get(`/api/payments/${payment.id}`);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status()).toBe(200);
    expect(body['status']).toBe('refunded');
    expect(body['id']).toBe(payment.id);
  });
});
```

---

## 4. Admin-only endpoint

Covers: role enforcement — both that admins can access and regular users cannot.

```typescript
test.describe('GET /api/admin/users (ADMIN only)', () => {
  test('admin token → 200 with user list', async ({ request }) => {
    await userFactory.createMany(3);
    const admin  = await userFactory.admin().create();
    const client = createApiClient(request).setToken(admin.token);

    const res  = await client.get('/api/admin/users');
    const body = await res.json() as { users: unknown[] };

    expect(res.status()).toBe(200);
    expect(body.users.length).toBeGreaterThanOrEqual(3);
  });

  test('USER token → 403', async ({ request }) => {
    const user   = await userFactory.create(); // role: USER
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.get('/api/admin/users');
    expect(res.status()).toBe(403);
  });

  test('no token → 401', async ({ request }) => {
    const res = await createApiClient(request).get('/api/admin/users');
    expect(res.status()).toBe(401);
  });
});
```

---

## 5. Resource state transitions

Covers: valid and invalid order status transitions (state machine enforcement).

```typescript
test.describe('PATCH /api/orders/:id/status', () => {
  const TRANSITIONS: Array<{ from: string; to: string; valid: boolean }> = [
    { from: 'PENDING',   to: 'PAID',      valid: true  },
    { from: 'PAID',      to: 'DELIVERED', valid: true  },
    { from: 'PENDING',   to: 'DELIVERED', valid: false }, // must pay first
    { from: 'DELIVERED', to: 'PENDING',   valid: false }, // no going back
    { from: 'CANCELLED', to: 'PAID',      valid: false }, // cancelled is terminal
  ];

  for (const { from, to, valid } of TRANSITIONS) {
    test(`${from} → ${to} is ${valid ? 'allowed' : 'rejected'}`, async ({ request }) => {
      const admin = await userFactory.admin().create();
      const user  = await userFactory.create();
      const order = await orderFactory
        // set status by choosing the matching trait
        .forUser(user.id)
        .create({ status: from as Order['status'] });

      const client = createApiClient(request).setToken(admin.token);
      const res    = await client.patch(`/api/orders/${order.id}/status`, {
        data: { status: to },
      });

      if (valid) {
        expect(res.status()).toBe(200);
        const body = await res.json() as { status: string };
        expect(body.status).toBe(to);
      } else {
        expect(res.status()).toBe(422);
      }
    });
  }
});
```

---

## 6. Parametric validation tests

Avoid copy-paste by driving boundary checks from a table:

```typescript
const INVALID_AMOUNTS = [
  { amount: 0,          reason: 'zero'        },
  { amount: -1,         reason: 'negative'    },
  { amount: 0.5,        reason: 'non-integer' },
  { amount: 999_999_99, reason: 'over max'    },
  { amount: NaN,        reason: 'NaN'         },
];

test.describe('amount validation', () => {
  for (const { amount, reason } of INVALID_AMOUNTS) {
    test(`amount ${reason} → 400`, async ({ request }) => {
      const user  = await userFactory.create();
      const order = await orderFactory.forUser(user.id).create();
      const res   = await createApiClient(request).setToken(user.token).post('/api/payments', {
        data: { orderId: order.id, cardToken: 'tok_visa', amount, currency: 'USD' },
      });
      expect(res.status()).toBe(400);
    });
  }
});
```

---

## Selector decision tree for route analysis

```
Is there an auth middleware wrapping the route?
  YES → generate: valid-auth success + no-token 401 + wrong-role 403
  NO  → document that it's public; add a note if it seems like it should be protected

Does the handler read req.body?
  YES → for every required field: missing → 400
      → for every enum field: invalid value → 400
      → for every numeric field: zero, negative, over max → 400 / 422

Does the handler read req.params/:id?
  YES → unknown ID → 404
      → other user's resource → 403

Does the handler call a service / DB?
  YES → extract every business rule → write a test for each violation
      → note any side effects (emails, charges) → verify they happen or are prevented
```
