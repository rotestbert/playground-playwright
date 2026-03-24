/**
 * Shared API client helper for all Playwright API tests.
 *
 * Wraps Playwright's APIRequestContext and provides:
 *  - Base URL resolution from the BASE_URL environment variable
 *  - Bearer-token auth management (set / clear / presence check)
 *  - Structured request/response logging (opt-in via `verbose` or custom logger)
 *  - Exponential-backoff retry for transient network errors and 5xx responses
 *    (429 is NOT retried automatically — rate-limit tests must observe it raw)
 *
 * Usage:
 *   const client = createApiClient(request);               // silent
 *   const client = createApiClient(request, { verbose: true }); // console logging
 *   const client = createApiClient(request, { logger: myFn });  // custom logger
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  direction: 'request' | 'response';
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  attempt?: number;
  body?: unknown;
}

export interface ApiClientOptions {
  /** Overrides BASE_URL env var and the built-in default. */
  baseURL?: string;
  /** Custom logger; receives every request and response entry. */
  logger?: (entry: LogEntry) => void;
  /** How many times to retry a retryable failure. Default: 3. */
  maxRetries?: number;
  /** Base delay between retries in ms; doubles each attempt. Default: 300. */
  retryDelayMs?: number;
}

export interface RequestOptions {
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** Send as application/x-www-form-urlencoded */
  form?: Record<string, string | number | boolean>;
  /** Send as application/json */
  data?: unknown;
  /** Send as multipart/form-data */
  multipart?: Record<string, string | number | boolean | { name: string; mimeType: string; buffer: Buffer }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** HTTP status codes that warrant an automatic retry (excludes 429 deliberately). */
const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504]);

/** Node.js / OS-level error strings that indicate a transient network problem. */
const RETRYABLE_ERROR_FRAGMENTS = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'socket hang up',
  'read ECONNRESET',
];

// ─── ApiClient ────────────────────────────────────────────────────────────────

export class ApiClient {
  private readonly ctx: APIRequestContext;
  private readonly baseURL: string;
  private readonly log: (entry: LogEntry) => void;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private authToken: string | null = null;

  constructor(ctx: APIRequestContext, options: ApiClientOptions = {}) {
    this.ctx = ctx;
    this.baseURL = (
      options.baseURL ??
      process.env['BASE_URL'] ??
      'https://automationexercise.com'
    ).replace(/\/$/, '');
    this.log = options.logger ?? ((): void => { /* no-op */ });
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 300;
  }

  // ── Auth token management ──────────────────────────────────────────────────

  /**
   * Stores a Bearer token that is attached to every subsequent request via
   * the Authorization header.  Returns `this` for fluent chaining.
   */
  setToken(token: string): this {
    this.authToken = token;
    return this;
  }

  /** Clears the stored token.  Returns `this` for fluent chaining. */
  clearToken(): this {
    this.authToken = null;
    return this;
  }

  /** Returns true if a token is currently stored. */
  hasToken(): boolean {
    return this.authToken !== null;
  }

  /** Returns the raw token value (useful for assertions). */
  getToken(): string | null {
    return this.authToken;
  }

  // ── HTTP verbs ─────────────────────────────────────────────────────────────

  get(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('GET', path, options);
  }

  post(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('POST', path, options);
  }

  put(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('PUT', path, options);
  }

  patch(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('PATCH', path, options);
  }

  delete(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('DELETE', path, options);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private resolveUrl(path: string): string {
    return path.startsWith('http') ? path : `${this.baseURL}${path}`;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async send(
    method: string,
    path: string,
    options: RequestOptions = {},
    attempt = 1,
  ): Promise<APIResponse> {
    const url = this.resolveUrl(path);
    const headers = this.buildHeaders(options.headers);

    this.log({
      direction: 'request',
      method,
      url,
      attempt,
      body: options.form ?? options.data ?? options.multipart,
    });

    const start = Date.now();
    let response: APIResponse;

    try {
      response = await this.dispatch(method, url, { ...options, headers });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = RETRYABLE_ERROR_FRAGMENTS.some((fragment) =>
        msg.includes(fragment),
      );

      if (isRetryable && attempt <= this.maxRetries) {
        await this.sleep(this.retryDelayMs * attempt);
        return this.send(method, path, options, attempt + 1);
      }
      throw err;
    }

    const durationMs = Date.now() - start;
    this.log({
      direction: 'response',
      method,
      url,
      status: response.status(),
      durationMs,
      attempt,
    });

    // Retry on 5xx (not 429 — callers must observe rate-limit responses as-is)
    if (RETRYABLE_STATUS.has(response.status()) && attempt <= this.maxRetries) {
      await this.sleep(this.retryDelayMs * attempt);
      return this.send(method, path, options, attempt + 1);
    }

    return response;
  }

  /** Dispatches to the correct Playwright APIRequestContext method. */
  private dispatch(
    method: string,
    url: string,
    options: RequestOptions & { headers?: Record<string, string> },
  ): Promise<APIResponse> {
    const shared = {
      params: options.params,
      headers: options.headers,
      form: options.form,
      data: options.data,
      multipart: options.multipart,
    };

    switch (method) {
      case 'GET':    return this.ctx.get(url, shared);
      case 'POST':   return this.ctx.post(url, shared);
      case 'PUT':    return this.ctx.put(url, shared);
      case 'PATCH':  return this.ctx.patch(url, shared);
      case 'DELETE': return this.ctx.delete(url, shared);
      default:       throw new Error(`ApiClient: unsupported method "${method}"`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an ApiClient bound to the given Playwright request context.
 *
 * @param ctx      Playwright APIRequestContext (the `request` fixture).
 * @param options  Optional overrides; pass `verbose: true` for console logging.
 */
export function createApiClient(
  ctx: APIRequestContext,
  options: ApiClientOptions & { verbose?: boolean } = {},
): ApiClient {
  const { verbose = false, ...rest } = options;

  const logger = verbose
    ? (entry: LogEntry): void => {
        if (entry.direction === 'request') {
          const tag = (entry.attempt ?? 1) > 1 ? ` [retry ${entry.attempt}]` : '';
          console.log(`  → ${entry.method} ${entry.url}${tag}`);
        } else {
          console.log(
            `  ← ${entry.status} ${entry.url} (${entry.durationMs}ms)`,
          );
        }
      }
    : rest.logger;

  return new ApiClient(ctx, { ...rest, logger });
}

// ─── Timing helper (re-exported for convenience) ──────────────────────────────

/**
 * Wraps a single async call and returns `[result, elapsedMs]`.
 *
 *   const [res, ms] = await timed(() => client.get('/api/productsList'));
 *   expect(ms).toBeLessThan(500);
 */
export async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  return [result, Date.now() - start];
}
