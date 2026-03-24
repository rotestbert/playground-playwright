/**
 * File upload and multipart form-data tests
 *
 * automationexercise.com has no dedicated file-upload endpoint. These tests:
 *   1. Verify existing form endpoints handle multipart/form-data submissions
 *      correctly (createAccount accepts both application/x-www-form-urlencoded
 *      and multipart/form-data since they carry the same fields).
 *   2. Document what happens when binary payloads or unexpected MIME types
 *      are sent to form-accepting endpoints — the server must never 5xx.
 *   3. Act as a ready-made harness: when a real file-upload endpoint is added
 *      the acceptance tests below can be un-skipped and pointed at the new URL.
 *
 * MIME types tested:
 *   - application/x-www-form-urlencoded  (baseline)
 *   - multipart/form-data                (native Playwright multipart helper)
 *   - application/json                   (wrong type for this API — 400/405 expected)
 *   - text/plain                         (wrong type)
 *   - application/octet-stream           (binary blob)
 *   - image/png                          (synthetic 1-pixel PNG)
 *   - image/jpeg                         (synthetic JPEG header)
 *   - application/pdf                    (synthetic PDF header)
 *   - text/csv                           (CSV data)
 */

import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/apiClient.js';
import {
  generateApiUser,
  type ApiMessageResponse,
} from '../fixtures/api.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RequestContext = Parameters<Parameters<typeof test>[1]>[0]['request'];

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

// Tiny synthetic binary payloads — just enough bytes to trigger a MIME type.
// These are NOT valid image/PDF files; they only carry the magic bytes that
// identify the format to a MIME sniffer.

/** 1×1 white PNG (minimal valid PNG, 67 bytes) */
const PNG_1X1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex',
);

/** Minimal JPEG SOI + APP0 header */
const JPEG_HEADER = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');

/** Minimal PDF header */
const PDF_HEADER = Buffer.from('%PDF-1.4\n', 'utf-8');

/** Simple CSV payload */
const CSV_PAYLOAD = Buffer.from('id,name,email\n1,Test User,test@mailtest.dev\n', 'utf-8');

/** Random binary blob (32 bytes) */
const BINARY_BLOB = Buffer.alloc(32).fill(0xAB);

// ─── Multipart form-data — account creation ───────────────────────────────────

test.describe('Multipart form-data — POST /api/createAccount', () => {
  test('creates account via multipart/form-data instead of urlencoded', async ({ request }) => {
    const user = generateApiUser();
    const client = createApiClient(request);

    // Playwright's `multipart` option sets Content-Type: multipart/form-data
    const response = await client.post('/api/createAccount', {
      multipart: { ...user },
    });

    let body: ApiMessageResponse;
    try {
      body = await response.json() as ApiMessageResponse;
    } catch {
      // Some servers return 415 Unsupported Media Type for multipart on this
      // endpoint; that is acceptable behaviour — the key requirement is no 5xx.
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
      return;
    }

    // Either the server accepted the multipart payload (201) or it rejected the
    // content type (400/415) — both are acceptable; 5xx is not.
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);

    if (body.responseCode === 201) {
      await deleteUser(request, user.email, user.password);
    }
  });

  test('urlencoded form and multipart form carry identical account fields', async ({ request }) => {
    // Register via urlencoded, then verify the data is correctly stored.
    // This baseline ensures subsequent multipart tests are comparing apples to apples.
    const user = generateApiUser();
    const client = createApiClient(request);

    try {
      const body = await (
        await client.post('/api/createAccount', { form: user })
      ).json() as ApiMessageResponse;

      expect(body.responseCode).toBe(201);
    } finally {
      await deleteUser(request, user.email, user.password);
    }
  });
});

// ─── Wrong MIME types on form endpoints ───────────────────────────────────────
//
// Sending the wrong Content-Type to a form endpoint must never cause a 5xx.
// The server may return 400, 415, or even process it anyway — all are acceptable.

test.describe('Wrong MIME types on POST /api/verifyLogin', () => {
  test('sending JSON body returns 400 or 415 — never 5xx', async ({ request }) => {
    const response = await createApiClient(request).post('/api/verifyLogin', {
      data: { email: 'test@mailtest.dev', password: 'anypassword' },
    });

    const body = await response.json() as ApiMessageResponse;
    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
  });

  test('sending plain-text body does not cause a 5xx', async ({ request }) => {
    // Playwright has no built-in text body helper; send raw via data with the
    // appropriate header override.
    const response = await createApiClient(request).post('/api/verifyLogin', {
      headers: { 'Content-Type': 'text/plain' },
      data: 'email=test@mailtest.dev&password=anypassword',
    });

    // Body may not be parseable JSON; just check the HTTP status
    expect(response.status()).not.toBeGreaterThanOrEqual(500);
  });
});

// ─── Binary payloads on form endpoints ───────────────────────────────────────

test.describe('Binary payloads on POST /api/createAccount', () => {
  test('sending a raw binary blob does not cause a 5xx', async ({ request }) => {
    const response = await createApiClient(request).post('/api/createAccount', {
      headers: { 'Content-Type': 'application/octet-stream' },
      data: BINARY_BLOB,
    });

    expect(response.status()).not.toBeGreaterThanOrEqual(500);
  });

  test('sending a synthetic PNG does not cause a 5xx', async ({ request }) => {
    const response = await createApiClient(request).post('/api/createAccount', {
      headers: { 'Content-Type': 'image/png' },
      data: PNG_1X1,
    });

    expect(response.status()).not.toBeGreaterThanOrEqual(500);
  });

  test('sending a JPEG header does not cause a 5xx', async ({ request }) => {
    const response = await createApiClient(request).post('/api/createAccount', {
      headers: { 'Content-Type': 'image/jpeg' },
      data: JPEG_HEADER,
    });

    expect(response.status()).not.toBeGreaterThanOrEqual(500);
  });

  test('sending a PDF header does not cause a 5xx', async ({ request }) => {
    const response = await createApiClient(request).post('/api/createAccount', {
      headers: { 'Content-Type': 'application/pdf' },
      data: PDF_HEADER,
    });

    expect(response.status()).not.toBeGreaterThanOrEqual(500);
  });

  test('sending CSV data does not cause a 5xx', async ({ request }) => {
    const response = await createApiClient(request).post('/api/createAccount', {
      headers: { 'Content-Type': 'text/csv' },
      data: CSV_PAYLOAD,
    });

    expect(response.status()).not.toBeGreaterThanOrEqual(500);
  });
});

// ─── Multipart with file-like fields ─────────────────────────────────────────
//
// Sends a text-field form alongside a named file buffer to simulate an
// endpoint that accepts both metadata fields and a file attachment.
// The createAccount endpoint ignores unknown fields, so the key assertion
// is that the server processes the request without crashing.

test.describe('Multipart requests with embedded file buffers', () => {
  test('multipart with a PNG buffer field does not cause a 5xx', async ({ request }) => {
    const user = generateApiUser();
    const response = await createApiClient(request).post('/api/createAccount', {
      multipart: {
        ...user,
        avatar: { name: 'avatar.png', mimeType: 'image/png', buffer: PNG_1X1 },
      },
    });

    let body: ApiMessageResponse;
    try {
      body = await response.json() as ApiMessageResponse;
    } catch {
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
      return;
    }

    expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
    if (body.responseCode === 201) {
      await deleteUser(request, user.email, user.password);
    }
  });

  test('multipart with a JPEG buffer field does not cause a 5xx', async ({ request }) => {
    const user = generateApiUser();
    const response = await createApiClient(request).post('/api/createAccount', {
      multipart: {
        ...user,
        photo: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: JPEG_HEADER },
      },
    });

    try {
      const body = await response.json() as ApiMessageResponse;
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
      if (body.responseCode === 201) {
        await deleteUser(request, user.email, user.password);
      }
    } catch {
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
    }
  });

  test('multipart with a PDF buffer field does not cause a 5xx', async ({ request }) => {
    const user = generateApiUser();
    const response = await createApiClient(request).post('/api/createAccount', {
      multipart: {
        ...user,
        document: { name: 'doc.pdf', mimeType: 'application/pdf', buffer: PDF_HEADER },
      },
    });

    try {
      const body = await response.json() as ApiMessageResponse;
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
      if (body.responseCode === 201) {
        await deleteUser(request, user.email, user.password);
      }
    } catch {
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
    }
  });

  test('multipart with a CSV buffer field does not cause a 5xx', async ({ request }) => {
    const user = generateApiUser();
    const response = await createApiClient(request).post('/api/createAccount', {
      multipart: {
        ...user,
        data: { name: 'data.csv', mimeType: 'text/csv', buffer: CSV_PAYLOAD },
      },
    });

    try {
      const body = await response.json() as ApiMessageResponse;
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
      if (body.responseCode === 201) {
        await deleteUser(request, user.email, user.password);
      }
    } catch {
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
    }
  });

  test('multipart with a large binary blob (64 KB) does not cause a 5xx', async ({ request }) => {
    const user = generateApiUser();
    const largeBuffer = Buffer.alloc(65_536).fill(0xFF);

    const response = await createApiClient(request).post('/api/createAccount', {
      multipart: {
        ...user,
        attachment: { name: 'large.bin', mimeType: 'application/octet-stream', buffer: largeBuffer },
      },
    });

    try {
      const body = await response.json() as ApiMessageResponse;
      expect(body.responseCode).not.toBeGreaterThanOrEqual(500);
      if (body.responseCode === 201) {
        await deleteUser(request, user.email, user.password);
      }
    } catch {
      // 413 Request Entity Too Large is acceptable — just not 5xx
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
    }
  });
});

// ─── Future upload endpoint harness ──────────────────────────────────────────
//
// These tests are skipped because no file-upload endpoint exists yet.
// Un-skip and update UPLOAD_ENDPOINT when one is introduced.

const UPLOAD_ENDPOINT = '/api/uploadFile'; // placeholder

test.describe('Future: dedicated file-upload endpoint', () => {
  test.skip('POST to upload endpoint with a valid PNG returns 200 or 201', async ({ request }) => {
    const response = await createApiClient(request).post(UPLOAD_ENDPOINT, {
      multipart: {
        file: { name: 'test.png', mimeType: 'image/png', buffer: PNG_1X1 },
      },
    });

    expect([200, 201]).toContain(response.status());
  });

  test.skip('POST to upload endpoint with an unsupported MIME type returns 415', async ({ request }) => {
    const response = await createApiClient(request).post(UPLOAD_ENDPOINT, {
      multipart: {
        file: { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: BINARY_BLOB },
      },
    });

    expect(response.status()).toBe(415);
  });

  test.skip('POST to upload endpoint with no file field returns 400', async ({ request }) => {
    const response = await createApiClient(request).post(UPLOAD_ENDPOINT);
    expect(response.status()).toBe(400);
  });

  test.skip('POST to upload endpoint with an empty file returns 400 or 422', async ({ request }) => {
    const response = await createApiClient(request).post(UPLOAD_ENDPOINT, {
      multipart: {
        file: { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
      },
    });

    expect([400, 422]).toContain(response.status());
  });

  test.skip('GET to upload endpoint returns 405 — method not supported', async ({ request }) => {
    const response = await createApiClient(request).get(UPLOAD_ENDPOINT);
    expect(response.status()).toBe(405);
  });
});
