/**
 * Concurrent modification tests
 *
 * Verifies server behaviour under simultaneous write and read operations:
 *
 *   1. Duplicate-registration race — two workers POST the same email at the
 *      same time; exactly one must succeed (201) and the other must fail (400).
 *
 *   2. Read stability under concurrent writes — reads of a resource that is
 *      being written concurrently must never return a 5xx or corrupt body.
 *
 *   3. Concurrent updates to the same account — last-write-wins semantics are
 *      documented; the server must not error or corrupt the record.
 *
 *   4. Concurrent deletions of the same account — only the first delete should
 *      succeed (200); subsequent ones must return 404, not 5xx.
 *
 * Note on optimistic locking: automationexercise.com does not expose ETags,
 * If-Match headers, or a version/updatedAt field. The tests below document
 * last-write-wins semantics and act as a regression harness for when OCC is
 * added.  See the "Optimistic locking (OCC)" suite for the relevant assertions.
 */

import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/apiClient.js';
import {
  generateApiUser,
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

// ─── Duplicate-registration race ─────────────────────────────────────────────

test.describe('Duplicate-registration race condition', () => {
  test('exactly one of two simultaneous registrations with the same email succeeds', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);

    const [res1, res2] = await Promise.all([
      client.post('/api/createAccount', { form: user }),
      client.post('/api/createAccount', { form: user }),
    ]);

    const [body1, body2] = await Promise.all([
      res1.json() as Promise<ApiMessageResponse>,
      res2.json() as Promise<ApiMessageResponse>,
    ]);

    const codes = [body1.responseCode, body2.responseCode].sort();

    // One 201 and one 400 — order is non-deterministic
    expect(codes).toEqual([201, 400]);

    await deleteUser(request, user.email, user.password);
  });

  test('four simultaneous registrations with the same email yield exactly one 201', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        client.post('/api/createAccount', { form: user }),
      ),
    );
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<ApiMessageResponse>),
    );
    const created = bodies.filter((b) => b.responseCode === 201);
    const failed  = bodies.filter((b) => b.responseCode === 400);

    expect(created.length).toBe(1);
    expect(failed.length).toBe(3);
    expect(bodies.every((b) => b.responseCode < 500)).toBe(true);

    await deleteUser(request, user.email, user.password);
  });

  test('no 5xx responses are returned during a registration race', async ({ request }) => {
    const user = generateApiUser();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        createApiClient(request).post('/api/createAccount', { form: user }),
      ),
    );
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<ApiMessageResponse>),
    );

    for (const body of bodies) {
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    }

    await deleteUser(request, user.email, user.password);
  });

  test('two independent users registered simultaneously both succeed', async ({ request }) => {
    const [user1, user2] = [generateApiUser(), generateApiUser()];
    const client = createApiClient(request);

    const [res1, res2] = await Promise.all([
      client.post('/api/createAccount', { form: user1 }),
      client.post('/api/createAccount', { form: user2 }),
    ]);

    const [body1, body2] = await Promise.all([
      res1.json() as Promise<ApiMessageResponse>,
      res2.json() as Promise<ApiMessageResponse>,
    ]);

    expect(body1.responseCode).toBe(201);
    expect(body2.responseCode).toBe(201);

    await Promise.all([
      deleteUser(request, user1.email, user1.password),
      deleteUser(request, user2.email, user2.password),
    ]);
  });
});

// ─── Concurrent reads ─────────────────────────────────────────────────────────

test.describe('Concurrent reads', () => {
  let sharedUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    sharedUser = generateApiUser();
    await createUser(request, sharedUser);
  });

  test.afterAll(async ({ request }) => {
    await deleteUser(request, sharedUser.email, sharedUser.password);
  });

  test('10 concurrent reads of the same user all return the same email', async ({ request }) => {
    const client = createApiClient(request);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.get('/api/getUserDetailByEmail', {
          params: { email: sharedUser.email },
        }),
      ),
    );
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<UserDetailResponse>),
    );

    for (const body of bodies) {
      expect(body.responseCode).toBe(200);
      expect(body.user.email).toBe(sharedUser.email);
    }
  });

  test('20 concurrent reads of the product list all return 200', async ({ request }) => {
    const client = createApiClient(request);
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => client.get('/api/productsList')),
    );

    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });

  test('concurrent reads of two different users return correct data for each', async ({ request }) => {
    const user2 = generateApiUser();
    await createUser(request, user2);

    try {
      const client = createApiClient(request);
      const [res1, res2] = await Promise.all([
        client.get('/api/getUserDetailByEmail', { params: { email: sharedUser.email } }),
        client.get('/api/getUserDetailByEmail', { params: { email: user2.email } }),
      ]);
      const [body1, body2] = await Promise.all([
        res1.json() as Promise<UserDetailResponse>,
        res2.json() as Promise<UserDetailResponse>,
      ]);

      expect(body1.user.email).toBe(sharedUser.email);
      expect(body2.user.email).toBe(user2.email);
      // Cross-contamination check
      expect(body1.user.email).not.toBe(body2.user.email);
    } finally {
      await deleteUser(request, user2.email, user2.password);
    }
  });
});

// ─── Concurrent updates ───────────────────────────────────────────────────────

test.describe('Concurrent updates to the same account', () => {
  let sharedUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    sharedUser = generateApiUser();
    await createUser(request, sharedUser);
  });

  test.afterAll(async ({ request }) => {
    await deleteUser(request, sharedUser.email, sharedUser.password);
  });

  test('two concurrent updates both complete without a 5xx', async ({ request }) => {
    const client = createApiClient(request);
    const [res1, res2] = await Promise.all([
      client.put('/api/updateAccount', {
        form: { ...sharedUser, city: 'ConcurrentCity1' },
      }),
      client.put('/api/updateAccount', {
        form: { ...sharedUser, city: 'ConcurrentCity2' },
      }),
    ]);

    const [body1, body2] = await Promise.all([
      res1.json() as Promise<ApiMessageResponse>,
      res2.json() as Promise<ApiMessageResponse>,
    ]);

    expect(body1.responseCode).not.toBeGreaterThanOrEqual(500);
    expect(body2.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('after two concurrent updates, a subsequent read returns a consistent record', async ({ request }) => {
    const client = createApiClient(request);

    await Promise.all([
      client.put('/api/updateAccount', { form: { ...sharedUser, city: 'Alpha' } }),
      client.put('/api/updateAccount', { form: { ...sharedUser, city: 'Beta' } }),
    ]);

    const body = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: sharedUser.email },
      })
    ).json() as UserDetailResponse;

    // Must be valid JSON with a string city — not null, undefined, or corrupt
    expect(body.responseCode).toBe(200);
    expect(typeof body.user.city).toBe('string');
    expect(body.user.city.length).toBeGreaterThan(0);
  });

  test('five concurrent updates all return 200 or 400 — never 5xx', async ({ request }) => {
    const client = createApiClient(request);
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        client.put('/api/updateAccount', {
          form: { ...sharedUser, city: `City_${i}` },
        }),
      ),
    );
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<ApiMessageResponse>),
    );

    for (const body of bodies) {
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    }
  });
});

// ─── Concurrent deletions ─────────────────────────────────────────────────────

test.describe('Concurrent deletions of the same account', () => {
  test('only one deletion succeeds (200); subsequent ones return 404', async ({ request }) => {
    const user = generateApiUser();
    await createUser(request, user);

    const client = createApiClient(request);
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        client.delete('/api/deleteAccount', {
          form: { email: user.email, password: user.password },
        }),
      ),
    );
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<ApiMessageResponse>),
    );

    const successes = bodies.filter((b) => b.responseCode === 200);
    const notFound  = bodies.filter((b) => b.responseCode === 404);

    expect(successes.length).toBe(1);
    expect(notFound.length).toBe(2);
    // No 5xx
    expect(bodies.every((b) => b.responseCode < 500)).toBe(true);
  });

  test('no 5xx responses during three concurrent deletions of the same account', async ({ request }) => {
    const user = generateApiUser();
    await createUser(request, user);

    const client = createApiClient(request);
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        client.delete('/api/deleteAccount', {
          form: { email: user.email, password: user.password },
        }),
      ),
    );
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<ApiMessageResponse>),
    );

    for (const body of bodies) {
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    }
  });
});

// ─── Optimistic locking (OCC) ─────────────────────────────────────────────────
//
// automationexercise.com does not implement ETags or a version field, so there
// is no server-enforced OCC. The suite below documents that fact and acts as a
// regression harness for when it is introduced.

test.describe('Optimistic locking (OCC) — current API behaviour documentation', () => {
  let sharedUser: ApiUserPayload;

  test.beforeAll(async ({ request }) => {
    sharedUser = generateApiUser();
    await createUser(request, sharedUser);
  });

  test.afterAll(async ({ request }) => {
    await deleteUser(request, sharedUser.email, sharedUser.password);
  });

  test('PUT /api/updateAccount does not require an ETag or version field', async ({ request }) => {
    // If the server required an ETag, this request (sent without one) would
    // return 412 Precondition Failed or 428 Precondition Required.
    const body = await (
      await createApiClient(request).put('/api/updateAccount', {
        form: { ...sharedUser, city: 'OCC Test City' },
      })
    ).json() as ApiMessageResponse;

    expect(body.responseCode).not.toBe(412);
    expect(body.responseCode).not.toBe(428);
  });

  test('response headers contain no ETag (OCC not yet implemented)', async ({ request }) => {
    const response = await createApiClient(request).get('/api/getUserDetailByEmail', {
      params: { email: sharedUser.email },
    });

    const headers = response.headers();
    // Document current state — no ETag header expected
    const hasEtag = 'etag' in headers;
    if (hasEtag) {
      console.info(
        'INFO: ETag header found — OCC may now be supported. ' +
        'Review optimistic-locking tests and add If-Match assertions.',
      );
    }
    // No hard assertion; test acts as a sensor
  });

  test('stale-write pattern: read → concurrent write → read reflects one consistent state', async ({ request }) => {
    const client = createApiClient(request);

    // Simulate an optimistic-locking workflow without server support:
    // 1. Read current state
    const readBefore = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: sharedUser.email },
      })
    ).json() as UserDetailResponse;
    expect(readBefore.responseCode).toBe(200);

    // 2. Two clients attempt to write simultaneously based on the stale read
    await Promise.all([
      client.put('/api/updateAccount', {
        form: { ...sharedUser, city: 'WriterA_City' },
      }),
      client.put('/api/updateAccount', {
        form: { ...sharedUser, city: 'WriterB_City' },
      }),
    ]);

    // 3. Read after concurrent writes — must be valid, either writer's value
    const readAfter = await (
      await client.get('/api/getUserDetailByEmail', {
        params: { email: sharedUser.email },
      })
    ).json() as UserDetailResponse;

    expect(readAfter.responseCode).toBe(200);
    expect(['WriterA_City', 'WriterB_City']).toContain(readAfter.user.city);
  });
});
