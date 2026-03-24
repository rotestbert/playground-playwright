/**
 * API 11 — POST   /api/createAccount         → 201, "User created!"
 * API 12 — DELETE /api/deleteAccount         → 200, "Account deleted!"
 * API 13 — PUT    /api/updateAccount         → 200, "User updated!"
 * API 14 — GET    /api/getUserDetailByEmail  → 200, user object
 */
import { test, expect } from '@playwright/test';
import {
  generateApiUser,
  assertUserDetailSchema,
  timed,
  type ApiMessageResponse,
  type UserDetailResponse,
  type ApiUserPayload,
} from '../fixtures/api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Creates an account and returns the payload used. Throws if creation fails. */
async function createAccount(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  user: ApiUserPayload,
): Promise<void> {
  const body = await (
    await request.post('/api/createAccount', { form: user })
  ).json() as ApiMessageResponse;

  if (body.responseCode !== 201) {
    throw new Error(`createAccount helper failed: ${JSON.stringify(body)}`);
  }
}

/** Deletes an account. Best-effort — does not throw on failure. */
async function deleteAccount(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  email: string,
  password: string,
): Promise<void> {
  try {
    await request.delete('/api/deleteAccount', { form: { email, password } });
  } catch {
    // Intentionally swallowed — cleanup should not mask test failures
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API 11 — POST /api/createAccount
// ─────────────────────────────────────────────────────────────────────────────
test.describe('POST /api/createAccount', () => {
  test('creates a new account and returns 201 "User created!"', async ({ request }) => {
    const user = generateApiUser();
    try {
      const response = await request.post('/api/createAccount', { form: user });
      const body = await response.json() as ApiMessageResponse;

      expect(body.responseCode).toBe(201);
      expect(body.message).toBe('User created!');
    } finally {
      await deleteAccount(request, user.email, user.password);
    }
  });

  test('response time is under 2000 ms', async ({ request }) => {
    const user = generateApiUser();
    try {
      const [, ms] = await timed(() =>
        request.post('/api/createAccount', { form: user }),
      );
      expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
    } finally {
      await deleteAccount(request, user.email, user.password);
    }
  });

  test('duplicate email returns responseCode 400', async ({ request }) => {
    const user = generateApiUser();
    await createAccount(request, user);

    try {
      const body = await (
        await request.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(400);
      expect(body.message).toMatch(/exists/i);
    } finally {
      await deleteAccount(request, user.email, user.password);
    }
  });

  test('missing name field returns an error — not 201', async ({ request }) => {
    const { name: _omitted, ...withoutName } = generateApiUser();
    const body = await (
      await request.post('/api/createAccount', { form: withoutName })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(201);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('missing email field returns an error — not 201', async ({ request }) => {
    const { email: _omitted, ...withoutEmail } = generateApiUser();
    const body = await (
      await request.post('/api/createAccount', { form: withoutEmail })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(201);
  });

  test('missing password field returns an error — not 201', async ({ request }) => {
    const { password: _omitted, ...withoutPassword } = generateApiUser();
    const body = await (
      await request.post('/api/createAccount', { form: withoutPassword })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(201);
  });

  test('response body always contains responseCode and message', async ({ request }) => {
    const user = generateApiUser();
    try {
      const body = await (
        await request.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(typeof body.responseCode).toBe('number');
      expect(typeof body.message).toBe('string');
    } finally {
      await deleteAccount(request, user.email, user.password);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API 12 — DELETE /api/deleteAccount
// ─────────────────────────────────────────────────────────────────────────────
test.describe('DELETE /api/deleteAccount', () => {
  test('deletes an existing account and returns 200 "Account deleted!"', async ({
    request,
  }) => {
    const user = generateApiUser();
    await createAccount(request, user);

    const body = await (
      await request.delete('/api/deleteAccount', {
        form: { email: user.email, password: user.password },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(200);
    expect(body.message).toBe('Account deleted!');
  });

  test('deleting a non-existent account returns 404', async ({ request }) => {
    const body = await (
      await request.delete('/api/deleteAccount', {
        form: { email: 'ghost.account.never@mailtest.dev', password: 'anything' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('missing email parameter returns an error', async ({ request }) => {
    const body = await (
      await request.delete('/api/deleteAccount', {
        form: { password: 'somepassword' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
  });

  test('missing password parameter returns an error', async ({ request }) => {
    const body = await (
      await request.delete('/api/deleteAccount', {
        form: { email: 'test@mailtest.dev' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
  });

  test('response time is under 2000 ms', async ({ request }) => {
    const user = generateApiUser();
    await createAccount(request, user);

    const [, ms] = await timed(() =>
      request.delete('/api/deleteAccount', {
        form: { email: user.email, password: user.password },
      }),
    );
    expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API 13 — PUT /api/updateAccount
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PUT /api/updateAccount', () => {
  let sharedUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    sharedUser = generateApiUser();
    await createAccount(request, sharedUser);
  });

  test.afterAll(async ({ request }) => {
    await deleteAccount(request, sharedUser.email, sharedUser.password);
  });

  test('updates an existing account and returns 200 "User updated!"', async ({ request }) => {
    const updates: ApiUserPayload = {
      ...sharedUser,
      name: `Updated User ${Date.now()}`,
      firstname: 'Updated',
      city: 'San Francisco',
    };

    const body = await (
      await request.put('/api/updateAccount', { form: updates })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(200);
    expect(body.message).toBe('User updated!');
  });

  test('response time is under 2000 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      request.put('/api/updateAccount', { form: sharedUser }),
    );
    expect(ms, `Expected < 2000 ms, got ${ms} ms`).toBeLessThan(2000);
  });

  test('missing name field returns an error — not 200', async ({ request }) => {
    const { name: _omitted, ...withoutName } = sharedUser;
    const body = await (
      await request.put('/api/updateAccount', { form: withoutName })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('update for a non-existent email returns 404', async ({ request }) => {
    const ghost: ApiUserPayload = {
      ...generateApiUser(),
      email: `ghost.${Date.now()}@mailtest.dev`,
    };
    const body = await (
      await request.put('/api/updateAccount', { form: ghost })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API 14 — GET /api/getUserDetailByEmail
// ─────────────────────────────────────────────────────────────────────────────
test.describe('GET /api/getUserDetailByEmail', () => {
  let sharedUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    sharedUser = generateApiUser();
    await createAccount(request, sharedUser);
  });

  test.afterAll(async ({ request }) => {
    await deleteAccount(request, sharedUser.email, sharedUser.password);
  });

  test('returns 200 with a user object for a registered email', async ({ request }) => {
    const response = await request.get('/api/getUserDetailByEmail', {
      params: { email: sharedUser.email },
    });
    const body = await response.json() as UserDetailResponse;

    expect(body.responseCode).toBe(200);
    expect(body.user).toBeTruthy();
  });

  test('response time is under 500 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      request.get('/api/getUserDetailByEmail', {
        params: { email: sharedUser.email },
      }),
    );
    expect(ms, `Expected < 500 ms, got ${ms} ms`).toBeLessThan(500);
  });

  test('returned user object matches the expected schema', async ({ request }) => {
    const body = await (
      await request.get('/api/getUserDetailByEmail', {
        params: { email: sharedUser.email },
      })
    ).json() as UserDetailResponse;

    assertUserDetailSchema(body.user);
  });

  test('returned email matches the queried email', async ({ request }) => {
    const body = await (
      await request.get('/api/getUserDetailByEmail', {
        params: { email: sharedUser.email },
      })
    ).json() as UserDetailResponse;

    expect(body.user.email).toBe(sharedUser.email);
  });

  test('non-existent email returns responseCode 404', async ({ request }) => {
    const body = await (
      await request.get('/api/getUserDetailByEmail', {
        params: { email: 'definitelynotregistered@mailtest.dev' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('missing email parameter returns an error — not 200', async ({ request }) => {
    const body = await (
      await request.get('/api/getUserDetailByEmail')
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
  });

  test('empty email string returns an error — not 200', async ({ request }) => {
    const body = await (
      await request.get('/api/getUserDetailByEmail', {
        params: { email: '' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('Content-Type header is application/json', async ({ request }) => {
    const response = await request.get('/api/getUserDetailByEmail', {
      params: { email: sharedUser.email },
    });
    expect(response.headers()['content-type']).toContain('application/json');
  });
});
