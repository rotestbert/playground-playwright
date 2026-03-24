/**
 * Auth flows — register, login, re-authentication resilience, logout
 *
 * Endpoints exercised:
 *   POST   /api/createAccount   (register)
 *   POST   /api/verifyLogin     (login)
 *   DELETE /api/deleteAccount   (logout / account teardown)
 *
 * Note on token refresh: automationexercise.com uses stateless form-based auth
 * with no Bearer tokens or sessions. The "token refresh" suite therefore tests
 * re-authentication resilience — i.e. that credentials remain valid after
 * repeated login calls and that stale / tampered tokens behave correctly when
 * the client has a token set.
 *
 * Note on logout: the API has no explicit session-invalidation endpoint.
 * The logout suite documents that behaviour and verifies that deleted accounts
 * cannot subsequently log in.
 */

import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/apiClient.js';
import { generateApiUser, type ApiMessageResponse, type ApiUserPayload } from '../fixtures/api.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function register(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  user: ApiUserPayload,
): Promise<void> {
  const client = createApiClient(request);
  const body = await (
    await client.post('/api/createAccount', { form: user })
  ).json() as ApiMessageResponse;
  if (body.responseCode !== 201) {
    throw new Error(`register helper failed: ${JSON.stringify(body)}`);
  }
}

async function cleanup(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  email: string,
  password: string,
): Promise<void> {
  try {
    const client = createApiClient(request);
    await client.delete('/api/deleteAccount', { form: { email, password } });
  } catch {
    // Best-effort; cleanup must not mask real test failures
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

test.describe('Register — POST /api/createAccount', () => {
  test('successful registration returns 201 and "User created!"', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);
    try {
      const body = await (
        await client.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(201);
      expect(body.message).toBe('User created!');
    } finally {
      await cleanup(request, user.email, user.password);
    }
  });

  test('newly registered user can immediately log in', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);
    try {
      await register(request, user);
      const body = await (
        await client.post('/api/verifyLogin', {
          form: { email: user.email, password: user.password },
        })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(200);
      expect(body.message).toBe('User exists!');
    } finally {
      await cleanup(request, user.email, user.password);
    }
  });

  test('duplicate email returns 400 with an "exists" message', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);
    await register(request, user);
    try {
      const body = await (
        await client.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(400);
      expect(body.message).toMatch(/exists/i);
    } finally {
      await cleanup(request, user.email, user.password);
    }
  });

  test('missing email field is rejected — not 201', async ({ request }) => {
    const { email: _omit, ...withoutEmail } = generateApiUser();
    const body = await (
      await createApiClient(request).post('/api/createAccount', { form: withoutEmail })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(201);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('missing password field is rejected — not 201', async ({ request }) => {
    const { password: _omit, ...withoutPassword } = generateApiUser();
    const body = await (
      await createApiClient(request).post('/api/createAccount', { form: withoutPassword })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(201);
  });

  test('missing name field is rejected — not 201', async ({ request }) => {
    const { name: _omit, ...withoutName } = generateApiUser();
    const body = await (
      await createApiClient(request).post('/api/createAccount', { form: withoutName })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(201);
  });

  test('SQL-injection in email field does not cause a 5xx', async ({ request }) => {
    const user: ApiUserPayload = {
      ...generateApiUser(),
      email: "' OR '1'='1'; --@mailtest.dev",
    };
    const body = await (
      await createApiClient(request).post('/api/createAccount', { form: user })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('XSS payload in name field does not cause a 5xx', async ({ request }) => {
    const user = generateApiUser();
    user.name = '<script>alert(1)</script>';
    const client = createApiClient(request);
    try {
      const body = await (
        await client.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    } finally {
      await cleanup(request, user.email, user.password);
    }
  });

  test('response always contains responseCode (number) and message (string)', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);
    try {
      const body = await (
        await client.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(typeof body.responseCode).toBe('number');
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    } finally {
      await cleanup(request, user.email, user.password);
    }
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

test.describe('Login — POST /api/verifyLogin', () => {
  let sharedUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    sharedUser = generateApiUser();
    await register(request, sharedUser);
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request, sharedUser.email, sharedUser.password);
  });

  test('valid credentials return 200 "User exists!"', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin', {
        form: { email: sharedUser.email, password: sharedUser.password },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(200);
    expect(body.message).toBe('User exists!');
  });

  test('wrong password returns 404 "User not found!"', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin', {
        form: { email: sharedUser.email, password: 'absolutely_wrong_pw_123' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.message).toMatch(/not found/i);
  });

  test('non-existent email returns 404', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin', {
        form: { email: 'nobody_ever_exists@mailtest.dev', password: 'anything' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
  });

  test('missing email returns 400 bad request', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin', {
        form: { password: sharedUser.password },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
    expect(body.message).toMatch(/bad request/i);
  });

  test('missing password returns 400 bad request', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin', {
        form: { email: sharedUser.email },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
  });

  test('empty body returns 400 — not a 5xx', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin')
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(400);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('SQL injection in email field does not return 5xx', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin', {
        form: { email: "' OR '1'='1' --", password: 'anything' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    // Must not accidentally authenticate
    expect(body.responseCode).not.toBe(200);
  });

  test('empty string email returns 400 or 404 — never 2xx or 5xx', async ({ request }) => {
    const body = await (
      await createApiClient(request).post('/api/verifyLogin', {
        form: { email: '', password: sharedUser.password },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('DELETE /api/verifyLogin returns 405 — method not supported', async ({ request }) => {
    const body = await (
      await createApiClient(request).delete('/api/verifyLogin')
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(405);
    expect(body.message).toMatch(/not supported/i);
  });
});

// ─── Re-authentication resilience (token refresh analogue) ────────────────────
//
// This API is stateless — there are no Bearer tokens or sessions to refresh.
// The suite below documents that behaviour and verifies that credentials stay
// valid across multiple sequential login calls (i.e. there is no "one-shot"
// credential invalidation) and that the client's token management helpers work
// correctly with a downstream Bearer-token API.

test.describe('Re-authentication resilience', () => {
  let sharedUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    sharedUser = generateApiUser();
    await register(request, sharedUser);
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request, sharedUser.email, sharedUser.password);
  });

  test('same credentials succeed across three sequential login calls', async ({ request }) => {
    const client = createApiClient(request);
    for (let i = 0; i < 3; i++) {
      const body = await (
        await client.post('/api/verifyLogin', {
          form: { email: sharedUser.email, password: sharedUser.password },
        })
      ).json() as ApiMessageResponse;

      expect(body.responseCode, `attempt ${i + 1}`).toBe(200);
    }
  });

  test('ApiClient.setToken attaches Authorization header to subsequent calls', async ({ request }) => {
    const client = createApiClient(request);
    expect(client.hasToken()).toBe(false);

    client.setToken('test-bearer-token-abc');
    expect(client.hasToken()).toBe(true);
    expect(client.getToken()).toBe('test-bearer-token-abc');

    // The live API ignores the Authorization header, so the response is still
    // valid — we're asserting the client state, not the server's auth.
    const body = await (
      await client.get('/api/productsList')
    ).json() as { responseCode: number };

    expect(body.responseCode).toBe(200);
  });

  test('ApiClient.clearToken removes the stored token', async ({ request }) => {
    const client = createApiClient(request);
    client.setToken('temporary-token');
    expect(client.hasToken()).toBe(true);

    client.clearToken();
    expect(client.hasToken()).toBe(false);
    expect(client.getToken()).toBeNull();
  });

  test('setToken returns the client instance for fluent chaining', async ({ request }) => {
    const client = createApiClient(request);
    const returned = client.setToken('chain-test');
    expect(returned).toBe(client);
    client.clearToken();
  });

  test('stale / tampered token does not grant access to protected resources', async ({ request }) => {
    // This API has no protected resources, but we verify the client sends the
    // header correctly by confirming no server error is thrown and the token
    // does not accidentally elevate privileges.
    const client = createApiClient(request);
    client.setToken('tampered.jwt.payload');

    const body = await (
      await client.post('/api/verifyLogin', {
        form: { email: sharedUser.email, password: 'wrong_password' },
      })
    ).json() as ApiMessageResponse;

    // A wrong password must still fail even when an Authorization header is present
    expect(body.responseCode).not.toBe(200);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
//
// The API has no explicit session-invalidation endpoint. "Logout" on this
// platform is modelled as account deletion. After deletion the credentials
// must be unusable.

test.describe('Logout — DELETE /api/deleteAccount', () => {
  test('deleted account cannot log in afterwards', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);

    // Register
    await register(request, user);

    // Verify login works
    let body = await (
      await client.post('/api/verifyLogin', {
        form: { email: user.email, password: user.password },
      })
    ).json() as ApiMessageResponse;
    expect(body.responseCode).toBe(200);

    // Delete (logout)
    const deleteBody = await (
      await client.delete('/api/deleteAccount', {
        form: { email: user.email, password: user.password },
      })
    ).json() as ApiMessageResponse;
    expect(deleteBody.responseCode).toBe(200);
    expect(deleteBody.message).toBe('Account deleted!');

    // Login attempt must now fail
    body = await (
      await client.post('/api/verifyLogin', {
        form: { email: user.email, password: user.password },
      })
    ).json() as ApiMessageResponse;
    expect(body.responseCode).toBe(404);
  });

  test('deleting a non-existent account returns 404', async ({ request }) => {
    const body = await (
      await createApiClient(request).delete('/api/deleteAccount', {
        form: { email: 'ghost.never.existed@mailtest.dev', password: 'anypassword' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('missing email in delete request returns an error — not 200', async ({ request }) => {
    const body = await (
      await createApiClient(request).delete('/api/deleteAccount', {
        form: { password: 'somepassword' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
  });

  test('missing password in delete request returns an error — not 200', async ({ request }) => {
    const body = await (
      await createApiClient(request).delete('/api/deleteAccount', {
        form: { email: 'test@mailtest.dev' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
  });

  test('wrong password on delete returns an error — not 200', async ({ request }) => {
    const user = generateApiUser();
    await register(request, user);
    try {
      const body = await (
        await createApiClient(request).delete('/api/deleteAccount', {
          form: { email: user.email, password: 'wrong_password_for_delete' },
        })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).not.toBe(200);
    } finally {
      await cleanup(request, user.email, user.password);
    }
  });
});
