# api-test-gen

Generates Playwright request-context API tests from Express or Fastify route handlers,
covering auth, schema validation, business logic, and error scenarios.

## How to invoke

```
/api-test-gen <target>
```

`<target>` can be:
- A route file path (e.g. `src/routes/orders.ts`, `src/api/users.router.ts`)
- A specific endpoint (e.g. `POST /api/orders`, `GET /api/users/:id`)
- A feature name that maps to routes (e.g. "orders", "auth", "payments")

---

## What this skill does — step by step

### 1. Analyse the route handler(s)

Read the target file(s) and for every route extract:

| Signal | Where to look |
|---|---|
| HTTP method + path | `router.get(...)`, `app.post(...)`, `fastify.put(...)` |
| Auth middleware | `authenticate`, `requireRole`, `verifyToken`, `@auth` decorators |
| Required role | `requireRole('ADMIN')`, `@auth(requires: ADMIN)` |
| Request body schema | Inline checks, Zod/Joi/Yup `.parse()`, manual `if (!field)` |
| Path & query params | `:id`, `req.params`, `req.query`, `request.params` |
| Business logic | Service calls, DB queries, side effects triggered |
| Success shape | What the handler returns on success (status + body shape) |
| Error responses | Every thrown error, rejected promise, explicit `res.status(4xx)` |
| Idempotency | Whether repeating the request is safe or causes a conflict |

Identify gaps between what the handler validates and what it silently allows.

### 2. Map auth requirements

Classify each endpoint:

- **Public** — no auth middleware, accessible without a token
- **Authenticated** — requires a valid Bearer token (any role)
- **Role-gated** — requires a specific role (e.g. `ADMIN`)

For every auth level generate three tests:
1. Correct auth → succeeds
2. No token → 401
3. Wrong role → 403 (if role-gated)

### 3. Generate schema validator functions

- If the response has a fixed shape, write an `assertXxxSchema(body, label)` validator function.
- Place it inline at the top of the spec, or in `tests/fixtures/api.ts` if shared across specs.
- Follow the style of `assertProductSchema` / `assertUserDetailSchema` in `tests/fixtures/api.ts`:
  - Use `expect(typeof field, label).toBe('type')` for type checks
  - Use labelled assertions so failures identify the exact failing field
  - Validate all required fields; skip optional fields but document them

```typescript
function assertOrderSchema(order: unknown, label = 'order'): void {
  const o = order as Record<string, unknown>;
  expect(typeof o['id'],     `${label}.id type`).toBe('string');
  expect((o['id'] as string).length, `${label}.id non-empty`).toBeGreaterThan(0);
  expect(typeof o['status'], `${label}.status type`).toBe('string');
  expect(['PENDING','PAID','DELIVERED','CANCELLED'],
    `${label}.status valid enum`).toContain(o['status']);
  // ...
}
```

### 4. Generate factory-based test data

Use the existing factory singletons from `src/factories/index.ts`.
Import directly into the spec file:

```typescript
import {
  userFactory,
  productFactory,
  orderFactory,
  paymentFactory,
  categoryFactory,
  memoryAdapter,
} from '../../src/factories/index.js';
```

Factory cheat sheet:

| Need | Factory call |
|---|---|
| Regular user | `await userFactory.create()` |
| Admin user | `await userFactory.admin().create()` |
| Verified user | `await userFactory.verified().create()` |
| Banned user | `await userFactory.banned().create()` |
| Product in category | `await productFactory.inCategory(cat.id).create()` |
| Out-of-stock product | `await productFactory.outOfStock().create()` |
| Featured product | `await productFactory.featured().create()` |
| Order for user | `await orderFactory.forUser(user.id).create()` |
| Order with items | `await orderFactory.withItems(3).forUser(user.id).create()` |
| Delivered order | `await orderFactory.delivered().forUser(user.id).create()` |
| Failed payment | `await paymentFactory.failed().create({ orderId, customerId })` |
| Payment in EUR | `await paymentFactory.inCurrency('EUR').create({ orderId, customerId })` |

Always call `await memoryAdapter.reset()` in `afterEach` / `afterAll` to wipe state.

### 5. Generate the spec file

- File name: `<feature-name>.spec.ts` → place in `tests/api/`
- Import `{ test, expect }` from `'@playwright/test'`
- Import `createApiClient` from `'../helpers/apiClient.js'`
- Import factories as needed from `'../../src/factories/index.js'`
- Wrap every request using `createApiClient(request)` — never use `request.*` directly

**Mandatory test groups:**

| Group | What to cover |
|---|---|
| Happy Path | Every primary success flow with valid data |
| Auth — unauthenticated | No token → 401 for every protected endpoint |
| Auth — wrong role | USER token on ADMIN endpoint → 403 |
| Validation | Missing required fields, wrong types, boundary values, invalid enums |
| Business Logic | Domain rules: duplicate prevention, stock checks, state transitions |
| Error Scenarios | 404 for unknown IDs, 409 conflicts, 422 unprocessable, 5xx must not leak |
| Schema | Every field of every success response matches expected type + format |
| Performance | Response time < 500 ms for read endpoints (use `timed()` helper) |

**Test independence rules:**
- Each test creates its own data via factories — never reuse across tests
- Use `afterEach(() => memoryAdapter.reset())` to clear in-memory state
- Use `try/finally` for external-API cleanup (same pattern as `tests/api/auth.spec.ts`)

### 6. Run and fix

```bash
npm run test:api -- --grep "<feature>"
```

- Fix every failure before returning — do not leave broken tests.
- If the handler is not yet implemented, mark the test `test.fixme(...)` with a comment.
- After all targeted tests pass, run `npm run test:api` to confirm no regressions.

---

## Hard rules

- **Never** call `request.get/post/...` directly — always go through `createApiClient`
- **Never** hardcode user IDs, tokens, or emails — generate with factories or `generateApiUser()`
- **Always** assert the HTTP status code AND the response body shape
- **Always** use labelled assertions in schema validators so failures are self-describing
- **Always** reset factory state in `afterEach` — tests must not share data
- **Always** add both positive and negative tests for every validation rule
- **Never** retry or sleep inside a test — diagnose the root cause instead
- File naming: `feature-name.spec.ts` → `tests/api/`
- Run API tests with: `npm run test:api`
