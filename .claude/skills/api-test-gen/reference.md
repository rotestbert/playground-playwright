# API Test Generation — Reference Templates

## Route analysis checklist

Before writing a single test, extract this from the route handler:

```
Route: METHOD /path/:param
Auth:  [ ] Public  [ ] Bearer token (any role)  [ ] ADMIN role only
Body:  required fields: [...], optional fields: [...]
Query: optional params: [...]
Path:  params: [...]

Success:
  HTTP status: 2xx
  Body shape: { field: type, ... }

Errors:
  400 — missing/invalid fields
  401 — no token
  403 — wrong role
  404 — resource not found
  409 — conflict (duplicate, state mismatch)
  422 — business logic violation
  500 — MUST NOT leak stack traces

Business rules:
  - [ ] List every domain constraint enforced by the handler
```

---

## Spec file template

```typescript
/**
 * <Feature> API tests
 *
 * Endpoints exercised:
 *   METHOD  /path              (brief description)
 *   METHOD  /path/:id          (brief description)
 */

import { test, expect } from '@playwright/test';
import { createApiClient, timed } from '../helpers/apiClient.js';
import {
  userFactory,
  // import only what you need
  memoryAdapter,
} from '../../src/factories/index.js';

// ─── Schema validators ────────────────────────────────────────────────────────

function assertXxxSchema(body: unknown, label = 'item'): void {
  const b = body as Record<string, unknown>;
  expect(typeof b['id'],   `${label}.id type`).toBe('string');
  expect((b['id'] as string).length, `${label}.id non-empty`).toBeGreaterThan(0);
  // ... add every expected field
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.afterEach(async () => {
  await memoryAdapter.reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// Happy Path
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Happy Path — <endpoint>', () => {
  test('<action> returns <status> and correct shape', async ({ request }) => {
    const user    = await userFactory.create();
    const client  = createApiClient(request).setToken(user.token);

    const response = await client.post('/api/resource', {
      data: { /* valid payload */ },
    });

    expect(response.status()).toBe(201);
    const body = await response.json() as Record<string, unknown>;
    assertXxxSchema(body, 'response');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {
  test('no token → 401', async ({ request }) => {
    const client = createApiClient(request); // no token
    const res = await client.post('/api/resource', { data: {} });
    expect(res.status()).toBe(401);
  });

  test('wrong role → 403', async ({ request }) => {
    const user   = await userFactory.create(); // USER, not ADMIN
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/admin/resource', { data: {} });
    expect(res.status()).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Validation', () => {
  test('missing required field → 400 with descriptive message', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);

    const res  = await client.post('/api/resource', {
      data: { /* omit required field */ },
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status()).toBe(400);
    expect(typeof body['message'], 'error message type').toBe('string');
    expect((body['message'] as string).length, 'message non-empty').toBeGreaterThan(0);
  });

  test('invalid enum value → 400', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);

    const res = await client.post('/api/resource', {
      data: { status: 'INVALID_STATUS' },
    });

    expect(res.status()).toBe(400);
  });

  test('boundary — amount of 0 → 400', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/resource', { data: { amount: 0 } });
    expect(res.status()).toBe(400);
  });

  test('boundary — amount of 1 (minimum valid) → 201', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/resource', { data: { amount: 1 } });
    expect(res.status()).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Business Logic
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Business Logic', () => {
  test('duplicate creation → 409', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const payload = { name: 'Duplicate Item' };

    await client.post('/api/resource', { data: payload }); // first — OK
    const res = await client.post('/api/resource', { data: payload }); // second

    expect(res.status()).toBe(409);
  });

  test('operates only on own resources', async ({ request }) => {
    const owner  = await userFactory.create();
    const other  = await userFactory.create();
    // create resource owned by `owner`, try to access as `other`
    const client = createApiClient(request).setToken(other.token);
    const res    = await client.get(`/api/resource/${owner.id}`);
    expect(res.status()).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Scenarios
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Error Scenarios', () => {
  test('unknown ID → 404', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.get('/api/resource/does-not-exist-999');
    expect(res.status()).toBe(404);
  });

  test('server errors do not leak stack traces', async ({ request }) => {
    // Trigger an error condition and verify the response is a clean error object
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/resource', { data: { /* trigger 500 */ } });
    if (res.status() >= 500) {
      const body = await res.json() as Record<string, unknown>;
      expect(typeof body['stack']).toBe('undefined');  // no stack trace leaked
      expect(typeof body['message'], 'error message type').toBe('string');
    }
  });

  test('SQL injection in string field does not cause 5xx', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const res    = await client.post('/api/resource', {
      data: { name: "'; DROP TABLE users; --" },
    });
    expect(res.status()).not.toBeGreaterThanOrEqual(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Schema', () => {
  test('list response — every item matches expected schema', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    // seed a few items first
    const res  = await client.get('/api/resource');
    const body = await res.json() as { items: unknown[] };

    expect(res.status()).toBe(200);
    for (const [i, item] of body.items.entries()) {
      assertXxxSchema(item, `items[${i}]`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('list endpoint responds in under 500 ms', async ({ request }) => {
    const user   = await userFactory.create();
    const client = createApiClient(request).setToken(user.token);
    const [res, ms] = await timed(() => client.get('/api/resource'));

    expect(res.status()).toBe(200);
    expect(ms, `Expected < 500 ms, got ${ms} ms`).toBeLessThan(500);
  });
});
```

---

## Token generation pattern

If the API uses JWT / Bearer tokens, derive a token from the factory user
using your project's token helper. If none exists yet, document the gap
with `test.fixme` and use `generateApiUser()` from `tests/fixtures/api.ts`
for integration tests against a running server.

```typescript
// Pattern A — factory user with token helper
import { signToken } from '../../src/auth/token.js';
const user  = await userFactory.admin().create();
const token = signToken({ userId: user.id, role: user.role });
const client = createApiClient(request).setToken(token);

// Pattern B — live server login (integration test)
const creds  = generateApiUser();
const login  = await createApiClient(request).post('/api/login', { data: creds });
const { token } = await login.json() as { token: string };
const client = createApiClient(request).setToken(token);
```

---

## Factory cleanup patterns

```typescript
// Pattern A — reset in-memory adapter (for unit/integration tests using MemoryAdapter)
test.afterEach(async () => {
  await memoryAdapter.reset();
});

// Pattern B — delete via API (for tests against a live server)
async function cleanup(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  id: string,
  token: string,
): Promise<void> {
  try {
    await createApiClient(request).setToken(token).delete(`/api/resource/${id}`);
  } catch {
    // best-effort; must not mask test failures
  }
}

test('creates a resource', async ({ request }) => {
  let createdId: string | undefined;
  try {
    const res  = await createApiClient(request).post('/api/resource', { data: payload });
    const body = await res.json() as { id: string };
    createdId  = body.id;
    expect(res.status()).toBe(201);
  } finally {
    if (createdId) await cleanup(request, createdId, token);
  }
});
```

---

## Request body content-type guide

```typescript
// JSON body (most REST APIs)
client.post('/api/orders', { data: { productId: 'abc', quantity: 2 } })

// Form-encoded (legacy or multipart endpoints)
client.post('/api/createAccount', { form: { email: 'user@test.com', password: 'pass' } })

// Query params
client.get('/api/products', { params: { category: 'electronics', page: '1' } })

// Path params — interpolate directly in the path
client.get(`/api/users/${user.id}`)
client.delete(`/api/orders/${order.id}`)
```

---

## Asserting error bodies

Always assert both the status code AND a meaningful property of the error body.
Never assert the exact error string from a live API — it may change. Assert a pattern:

```typescript
const body = await res.json() as Record<string, unknown>;
expect(res.status()).toBe(400);
expect(typeof body['message'], 'error message present').toBe('string');
expect((body['message'] as string).length, 'error message non-empty').toBeGreaterThan(0);

// OR assert a pattern for known messages
expect(body['message'] as string, 'error message content').toMatch(/required|missing/i);
```
