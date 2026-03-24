/**
 * Users CRUD — full lifecycle and edge cases
 *
 * Endpoints exercised:
 *   POST   /api/createAccount         (Create)
 *   GET    /api/getUserDetailByEmail  (Read)
 *   PUT    /api/updateAccount         (Update)
 *   DELETE /api/deleteAccount         (Delete)
 *
 * Each describe block is self-contained: it owns its own user creation and
 * teardown so failures in one block do not cascade into another.
 */

import { test, expect } from '@playwright/test';
import { createApiClient, timed } from '../helpers/apiClient.js';
import {
  generateApiUser,
  assertUserDetailSchema,
  type ApiMessageResponse,
  type UserDetailResponse,
  type ApiUserPayload,
} from '../fixtures/api.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RequestContext = Parameters<Parameters<typeof test>[1]>[0]['request'];

async function createUser(request: RequestContext, user: ApiUserPayload): Promise<void> {
  const body = await (
    await createApiClient(request).post('/api/createAccount', { form: user })
  ).json() as ApiMessageResponse;
  if (body.responseCode !== 201) {
    throw new Error(`createUser failed: ${JSON.stringify(body)}`);
  }
}

async function deleteUser(
  request: RequestContext,
  email: string,
  password: string,
): Promise<void> {
  try {
    await createApiClient(request).delete('/api/deleteAccount', {
      form: { email, password },
    });
  } catch {
    // Best-effort teardown
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

test.describe('Create — POST /api/createAccount', () => {
  test('full payload creates account with 201', async ({ request }) => {
    const user = generateApiUser();
    try {
      const body = await (
        await createApiClient(request).post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(201);
      expect(body.message).toBe('User created!');
    } finally {
      await deleteUser(request, user.email, user.password);
    }
  });

  test('response time is under 3000 ms', async ({ request }) => {
    const user = generateApiUser();
    try {
      const [, ms] = await timed(() =>
        createApiClient(request).post('/api/createAccount', { form: user }),
      );
      expect(ms).toBeLessThan(3000);
    } finally {
      await deleteUser(request, user.email, user.password);
    }
  });

  test('each required field missing individually causes a non-201 response', async ({ request }) => {
    const requiredFields: (keyof ApiUserPayload)[] = ['name', 'email', 'password'];

    for (const field of requiredFields) {
      const base = generateApiUser();
      const payload = { ...base } as Partial<ApiUserPayload>;
      delete payload[field];

      const body = await (
        await createApiClient(request).post('/api/createAccount', {
          form: payload as Record<string, string>,
        })
      ).json() as ApiMessageResponse;

      expect(
        body.responseCode,
        `omitting "${field}" should not return 201`,
      ).not.toBe(201);
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    }
  });

  test('duplicate email returns 400 with an "exists" message', async ({ request }) => {
    const user = generateApiUser();
    await createUser(request, user);
    try {
      const body = await (
        await createApiClient(request).post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(400);
      expect(body.message).toMatch(/exists/i);
    } finally {
      await deleteUser(request, user.email, user.password);
    }
  });

  test('content-type is application/json', async ({ request }) => {
    const user = generateApiUser();
    try {
      const response = await createApiClient(request).post('/api/createAccount', {
        form: user,
      });
      expect(response.headers()['content-type']).toContain('application/json');
    } finally {
      await deleteUser(request, user.email, user.password);
    }
  });
});

// ─── Read ─────────────────────────────────────────────────────────────────────

test.describe('Read — GET /api/getUserDetailByEmail', () => {
  let user: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    user = generateApiUser();
    await createUser(request, user);
  });

  test.afterAll(async ({ request }) => {
    await deleteUser(request, user.email, user.password);
  });

  test('returns 200 and a user object for a registered email', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;

    expect(body.responseCode).toBe(200);
    expect(body.user).toBeTruthy();
  });

  test('response time is under 1000 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      }),
    );
    expect(ms).toBeLessThan(1000);
  });

  test('returned user object satisfies the full schema', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;

    assertUserDetailSchema(body.user);
  });

  test('returned email matches the queried email exactly', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;

    expect(body.user.email).toBe(user.email);
  });

  test('returned name matches the registered name', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;

    expect(body.user.name).toBe(user.name);
  });

  test('user id is a positive integer', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;

    expect(typeof body.user.id).toBe('number');
    expect(body.user.id).toBeGreaterThan(0);
    expect(Number.isInteger(body.user.id)).toBe(true);
  });

  test('non-existent email returns 404', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: 'nobody_registered_this@mailtest.dev' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('missing email parameter returns an error — not 200', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail')
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
  });

  test('empty email string returns an error — not 200 or 5xx', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: '' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(200);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('email address with plus-sign alias is handled without 5xx', async ({ request }) => {
    const body = await (
      await createApiClient(request).get('/api/getUserDetailByEmail', {
        params: { email: 'user+alias@mailtest.dev' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });
});

// ─── Update ───────────────────────────────────────────────────────────────────

test.describe('Update — PUT /api/updateAccount', () => {
  let user: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    user = generateApiUser();
    await createUser(request, user);
  });

  test.afterAll(async ({ request }) => {
    await deleteUser(request, user.email, user.password);
  });

  test('updating name returns 200 "User updated!"', async ({ request }) => {
    const body = await (
      await createApiClient(request).put('/api/updateAccount', {
        form: { ...user, name: `Updated ${Date.now()}` },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(200);
    expect(body.message).toBe('User updated!');
  });

  test('update is reflected when the account is subsequently read', async ({ request }) => {
    const updatedCity = `City_${Date.now()}`;
    const client = createApiClient(request);

    await client.put('/api/updateAccount', { form: { ...user, city: updatedCity } });

    const body = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;

    expect(body.user.city).toBe(updatedCity);
  });

  test('updating multiple optional fields at once succeeds', async ({ request }) => {
    const body = await (
      await createApiClient(request).put('/api/updateAccount', {
        form: {
          ...user,
          firstname: 'NewFirst',
          lastname: 'NewLast',
          company: 'NewCo',
          city: 'New York',
          state: 'New York',
          country: 'United States',
          zipcode: '10001',
        },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(200);
  });

  test('response time is under 3000 ms', async ({ request }) => {
    const [, ms] = await timed(() =>
      createApiClient(request).put('/api/updateAccount', { form: user }),
    );
    expect(ms).toBeLessThan(3000);
  });

  test('missing name field is rejected — not 200', async ({ request }) => {
    const { name: _omit, ...withoutName } = user;
    const body = await (
      await createApiClient(request).put('/api/updateAccount', {
        form: withoutName,
      })
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
      await createApiClient(request).put('/api/updateAccount', { form: ghost })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

test.describe('Delete — DELETE /api/deleteAccount', () => {
  test('deletes account and returns 200 "Account deleted!"', async ({ request }) => {
    const user = generateApiUser();
    await createUser(request, user);

    const body = await (
      await createApiClient(request).delete('/api/deleteAccount', {
        form: { email: user.email, password: user.password },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(200);
    expect(body.message).toBe('Account deleted!');
  });

  test('deleted user cannot be found via getUserDetailByEmail', async ({ request }) => {
    const user = generateApiUser();
    await createUser(request, user);
    const client = createApiClient(request);

    await client.delete('/api/deleteAccount', {
      form: { email: user.email, password: user.password },
    });

    const body = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
  });

  test('after deletion the email can be re-registered', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);
    await createUser(request, user);
    await client.delete('/api/deleteAccount', {
      form: { email: user.email, password: user.password },
    });

    // Re-register — should succeed
    try {
      const body = await (
        await client.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(201);
    } finally {
      await deleteUser(request, user.email, user.password);
    }
  });

  test('delete with wrong password returns an error — not 200', async ({ request }) => {
    const user = generateApiUser();
    await createUser(request, user);
    try {
      const body = await (
        await createApiClient(request).delete('/api/deleteAccount', {
          form: { email: user.email, password: 'wrong_password' },
        })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).not.toBe(200);
    } finally {
      await deleteUser(request, user.email, user.password);
    }
  });

  test('deleting a non-existent account returns 404', async ({ request }) => {
    const body = await (
      await createApiClient(request).delete('/api/deleteAccount', {
        form: { email: 'never_created@mailtest.dev', password: 'anything' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).toBe(404);
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('response time is under 3000 ms', async ({ request }) => {
    const user = generateApiUser();
    await createUser(request, user);

    const [, ms] = await timed(() =>
      createApiClient(request).delete('/api/deleteAccount', {
        form: { email: user.email, password: user.password },
      }),
    );
    expect(ms).toBeLessThan(3000);
  });
});

// ─── Full lifecycle ───────────────────────────────────────────────────────────

test.describe('Full CRUD lifecycle', () => {
  test('create → read → update → delete completes without errors', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);

    // Create
    const createBody = await (
      await client.post('/api/createAccount', { form: user })
    ).json() as ApiMessageResponse;
    expect(createBody.responseCode).toBe(201);

    // Read
    const readBody = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;
    expect(readBody.responseCode).toBe(200);
    expect(readBody.user.email).toBe(user.email);

    // Update
    const updateBody = await (
      await client.put('/api/updateAccount', {
        form: { ...user, city: 'Updated City' },
      })
    ).json() as ApiMessageResponse;
    expect(updateBody.responseCode).toBe(200);

    // Verify update persisted
    const readAfterUpdate = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as UserDetailResponse;
    expect(readAfterUpdate.user.city).toBe('Updated City');

    // Delete
    const deleteBody = await (
      await client.delete('/api/deleteAccount', {
        form: { email: user.email, password: user.password },
      })
    ).json() as ApiMessageResponse;
    expect(deleteBody.responseCode).toBe(200);

    // Verify deletion
    const readAfterDelete = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: user.email },
      })
    ).json() as ApiMessageResponse;
    expect(readAfterDelete.responseCode).toBe(404);
  });
});
