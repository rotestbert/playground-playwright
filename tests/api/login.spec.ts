/**
 * API 7  — POST   /api/verifyLogin (valid credentials)    → 200, "User exists!"
 * API 8  — POST   /api/verifyLogin (missing email)        → 400, bad request
 * API 9  — DELETE /api/verifyLogin                        → 405, not supported
 * API 10 — POST   /api/verifyLogin (invalid credentials)  → 404, "User not found!"
 */
import { test, expect } from '@playwright/test';
import { generateApiUser, timed, type ApiMessageResponse, type ApiUserPayload } from '../fixtures/api.js';

// One account is created for the whole describe block to keep setup fast.
// All tests that need valid credentials share it; teardown deletes it.
test.describe('POST /api/verifyLogin', () => {
  let testUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    testUser = generateApiUser();
    const response = await request.post('/api/createAccount', { form: testUser });
    const body = await response.json() as ApiMessageResponse;
    if (body.responseCode !== 201) {
      throw new Error(`beforeAll: failed to create test user — ${JSON.stringify(body)}`);
    }
  });

  test.afterAll(async ({ request }) => {
    await request.delete('/api/deleteAccount', {
      form: { email: testUser.email, password: testUser.password },
    });
  });

  // ── Positive ────────────────────────────────────────────────────────────────

  test('valid email + password returns responseCode 200 and "User exists!"', async ({
    request,
  }) => {
    const response = await request.post('/api/verifyLogin', {
      form: { email: testUser.email, password: testUser.password },
    });
    const body = await response.json() as ApiMessageResponse;

    expect(body.responseCode).toBe(200);
    expect(body.message).toBe('User exists!');
  });

  test('response time for valid login is under 2000 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      request.post('/api/verifyLogin', {
        form: { email: testUser.email, password: testUser.password },
      }),
    );
    expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
  });

  test('response body contains both responseCode and message fields', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin', {
        form: { email: testUser.email, password: testUser.password },
      })
    ).json() as ApiMessageResponse;

    expect(typeof body.responseCode).toBe('number');
    expect(typeof body.message).toBe('string');
  });

  // ── Negative — wrong credentials ────────────────────────────────────────────

  test('wrong password returns responseCode 404 and "User not found!"', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin', {
        form: { email: testUser.email, password: 'definitively_wrong_password' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.message).toBe('User not found!');
  });

  test('non-existent email returns responseCode 404', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin', {
        form: { email: 'nobody.ever.exists@mailtest.dev', password: 'anypassword' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.message).toMatch(/not found/i);
  });

  test('incorrect email and password both return 404 — not a 500', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin', {
        form: { email: 'bad@bad.bad', password: 'bad' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  // ── Negative — missing / empty parameters ───────────────────────────────────

  test('missing email parameter returns responseCode 400', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin', {
        form: { password: testUser.password },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
    expect(body.message).toMatch(/bad request/i);
    expect(body.message).toMatch(/email.*password|parameter.*missing/i);
  });

  test('missing password parameter returns responseCode 400', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin', {
        form: { email: testUser.email },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
    expect(body.message).toMatch(/bad request/i);
  });

  test('empty request body returns responseCode 400', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin')
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
  });

  test('empty string email returns 400 or 404 — never a 2xx', async ({ request }) => {
    const body = await (
      await request.post('/api/verifyLogin', {
        form: { email: '', password: testUser.password },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });
});

test.describe('DELETE /api/verifyLogin', () => {
  test('returns responseCode 405 — method not supported', async ({ request }) => {
    const body = await (
      await request.delete('/api/verifyLogin')
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(405);
    expect(body.message).toMatch(/not supported/i);
  });

  test('405 response time is under 2000 ms', async ({ request }) => {
    const [, ms] = await timed(() => request.delete('/api/verifyLogin'));
    expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
  });
});
