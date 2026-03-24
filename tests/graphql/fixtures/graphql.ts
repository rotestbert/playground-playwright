/**
 * Shared GraphQL test infrastructure.
 *
 * Provides:
 *   GqlClient      — Playwright request-context wrapper for HTTP GraphQL calls
 *   WsClient       — graphql-ws protocol client for Subscription tests
 *   Assertion helpers — assertNoErrors, assertGqlError, assertUnauthorized, …
 *   Data factories — generateGqlUser, generateGqlProduct, generateGqlReview
 *   gql tag        — template tag for syntax highlighting (no runtime overhead)
 *
 * Environment variables:
 *   GRAPHQL_URL    — HTTP endpoint  (default: http://localhost:4000/graphql)
 *   GRAPHQL_WS_URL — WebSocket endpoint (default: ws://localhost:4000/graphql)
 */

import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import WebSocket from 'ws';

// ─── Environment ──────────────────────────────────────────────────────────────

export const GQL_ENDPOINT =
  process.env['GRAPHQL_URL'] ?? 'http://localhost:4000/graphql';

export const GQL_WS_ENDPOINT =
  process.env['GRAPHQL_WS_URL'] ?? 'ws://localhost:4000/graphql';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GqlError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
    classification?: string;
    [key: string]: unknown;
  };
}

export interface GqlDiagnostics {
  /** Total SQL / DB queries executed while resolving this operation. */
  queryCount?: number;
  /** Number of individual resolver function invocations. */
  resolverCallCount?: number;
  /** Server-side execution time in milliseconds. */
  durationMs?: number;
  /** Computed query complexity score. */
  complexity?: number;
}

export interface GqlExtensions {
  diagnostics?: GqlDiagnostics;
  complexity?: number;
  [key: string]: unknown;
}

export interface GqlResponse<T = Record<string, unknown>> {
  data: T | null;
  errors?: GqlError[];
  extensions?: GqlExtensions;
}

export interface GqlClientOptions {
  endpoint?: string;
}

// ─── gql tag ─────────────────────────────────────────────────────────────────

/**
 * Identity template tag — purely for editor syntax highlighting.
 * No runtime cost; just returns the template string verbatim.
 *
 *   const q = gql`query { me { id } }`;
 */
export function gql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''),
    '',
  );
}

// ─── GqlClient ────────────────────────────────────────────────────────────────

export class GqlClient {
  private readonly ctx: APIRequestContext;
  private readonly endpoint: string;
  private readonly token: string | null;

  constructor(
    ctx: APIRequestContext,
    token: string | null = null,
    options: GqlClientOptions = {},
  ) {
    this.ctx = ctx;
    this.token = token;
    this.endpoint = options.endpoint ?? GQL_ENDPOINT;
  }

  // ── Auth helpers ───────────────────────────────────────────────────────────

  /** Returns a new client with the given Bearer token attached. */
  withToken(token: string): GqlClient {
    return new GqlClient(this.ctx, token, { endpoint: this.endpoint });
  }

  /** Returns a new client with no Authorization header (anonymous). */
  withoutToken(): GqlClient {
    return new GqlClient(this.ctx, null, { endpoint: this.endpoint });
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  async query<T = Record<string, unknown>>(
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<GqlResponse<T>> {
    return this.send<T>(document, variables);
  }

  async mutate<T = Record<string, unknown>>(
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<GqlResponse<T>> {
    return this.send<T>(document, variables);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async send<T>(
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<GqlResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await this.ctx.post(this.endpoint, {
      headers,
      data: JSON.stringify({ query: document, variables }),
    });

    // GraphQL always returns HTTP 200 even for logical errors
    return response.json() as Promise<GqlResponse<T>>;
  }
}

/** Factory — creates a GqlClient bound to the given Playwright request context. */
export function createGqlClient(
  ctx: APIRequestContext,
  token?: string,
): GqlClient {
  return new GqlClient(ctx, token ?? null);
}

// ─── WsClient ────────────────────────────────────────────────────────────────

/**
 * Minimal graphql-ws protocol client for Subscription tests.
 *
 * graphql-ws message types used:
 *   client → server:  connection_init | subscribe | complete
 *   server → client:  connection_ack | next | error | complete
 *
 * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md
 */
export class WsClient {
  private readonly ws: WebSocket;
  private readonly pendingAck: Promise<void>;
  private idCounter = 0;

  private constructor(ws: WebSocket, pendingAck: Promise<void>) {
    this.ws = ws;
    this.pendingAck = pendingAck;
  }

  static async connect(
    endpoint: string = GQL_WS_ENDPOINT,
    token?: string,
  ): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(endpoint, ['graphql-transport-ws']);
      let ackResolve: () => void;
      let ackReject: (err: Error) => void;

      const pendingAck = new Promise<void>((res, rej) => {
        ackResolve = res;
        ackReject = rej;
      });

      ws.on('open', () => {
        const payload: Record<string, unknown> = {};
        if (token) payload['Authorization'] = `Bearer ${token}`;
        ws.send(JSON.stringify({ type: 'connection_init', payload }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === 'connection_ack') {
          ackResolve!();
          resolve(new WsClient(ws, pendingAck));
        }
        if (msg.type === 'connection_error') {
          ackReject!(new Error('graphql-ws connection_error'));
          reject(new Error('graphql-ws connection_error'));
        }
      });

      ws.on('error', reject);
    });
  }

  /**
   * Subscribes to a GraphQL subscription and collects up to `maxEvents`
   * messages or until `timeoutMs` expires.
   */
  subscribe(
    document: string,
    variables?: Record<string, unknown>,
    options: { maxEvents?: number; timeoutMs?: number } = {},
  ): Promise<Array<GqlResponse>> {
    const { maxEvents = 1, timeoutMs = 5000 } = options;
    const id = String(++this.idCounter);

    return new Promise((resolve, reject) => {
      const collected: GqlResponse[] = [];

      const onMessage = (raw: WebSocket.RawData): void => {
        const msg = JSON.parse(raw.toString()) as {
          id?: string;
          type: string;
          payload?: GqlResponse | GqlError[];
        };
        if (msg.id !== id) return;

        if (msg.type === 'next') {
          collected.push(msg.payload as GqlResponse);
          if (collected.length >= maxEvents) finish();
        }
        if (msg.type === 'error') {
          finish();
        }
        if (msg.type === 'complete') {
          finish();
        }
      };

      const timer = setTimeout(() => finish(), timeoutMs);

      const finish = (): void => {
        clearTimeout(timer);
        this.ws.off('message', onMessage);
        this.ws.send(JSON.stringify({ id, type: 'complete' }));
        resolve(collected);
      };

      void this.pendingAck.then(() => {
        this.ws.on('message', onMessage);
        this.ws.send(
          JSON.stringify({ id, type: 'subscribe', payload: { query: document, variables } }),
        );
      }).catch(reject);
    });
  }

  /** Closes the WebSocket connection cleanly. */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      this.ws.on('close', () => resolve());
      this.ws.close();
    });
  }
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/** Asserts the response has no errors and data is non-null. */
export function assertNoErrors(res: GqlResponse): void {
  expect(
    res.errors,
    `Expected no GraphQL errors but got: ${JSON.stringify(res.errors)}`,
  ).toBeUndefined();
  expect(res.data, 'Expected non-null data').not.toBeNull();
}

/**
 * Asserts the response contains at least one error, optionally matching
 * the extension error code.  Returns the first error for further assertions.
 */
export function assertGqlError(res: GqlResponse, code?: string): GqlError {
  expect(
    res.errors?.length,
    `Expected GraphQL errors but got none (data: ${JSON.stringify(res.data)})`,
  ).toBeGreaterThan(0);
  const first = res.errors![0]!;
  if (code !== undefined) {
    expect(
      first.extensions?.code,
      `Expected error code "${code}" but got "${first.extensions?.code}"`,
    ).toBe(code);
  }
  return first;
}

/** Asserts the response signals an unauthenticated caller. */
export function assertUnauthorized(res: GqlResponse): void {
  assertGqlError(res, 'UNAUTHENTICATED');
}

/** Asserts the response signals an authenticated but insufficiently privileged caller. */
export function assertForbidden(res: GqlResponse): void {
  assertGqlError(res, 'FORBIDDEN');
}

/** Asserts the response signals a business-logic validation failure. */
export function assertBadUserInput(res: GqlResponse): void {
  assertGqlError(res, 'BAD_USER_INPUT');
}

/** Asserts the response signals a GraphQL type-system validation failure. */
export function assertValidationFailed(res: GqlResponse): void {
  assertGqlError(res, 'GRAPHQL_VALIDATION_FAILED');
}

// ─── Data factories ───────────────────────────────────────────────────────────

export interface GqlUserSeed {
  name: string;
  email: string;
  password: string;
}

export interface GqlProductSeed {
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryId: string;
}

/**
 * Generates a unique user payload on every call.
 * Timestamp suffix prevents email collisions in parallel workers.
 */
export function generateGqlUser(overrides: Partial<GqlUserSeed> = {}): GqlUserSeed {
  const id = Date.now();
  return {
    name: `GraphQL User ${id}`,
    email: `gqluser.${id}@mailtest.dev`,
    password: 'Test@Password8',
    ...overrides,
  };
}

export function generateGqlProduct(
  categoryId: string,
  overrides: Partial<GqlProductSeed> = {},
): GqlProductSeed {
  const id = Date.now();
  return {
    name: `Test Product ${id}`,
    description: 'A product created by an automated test.',
    price: 29.99,
    stock: 100,
    categoryId,
    ...overrides,
  };
}

// ─── Shared query fragments ───────────────────────────────────────────────────

export const FRAGMENTS = {
  USER_FIELDS: gql`
    fragment UserFields on User {
      id
      email
      name
      role
      createdAt
      updatedAt
    }
  `,

  PRODUCT_FIELDS: gql`
    fragment ProductFields on Product {
      id
      name
      description
      price
      stock
      averageRating
      createdAt
      updatedAt
      category {
        id
        name
        slug
      }
    }
  `,

  ORDER_FIELDS: gql`
    fragment OrderFields on Order {
      id
      status
      total
      createdAt
      updatedAt
      items {
        id
        quantity
        unitPrice
        subtotal
        product {
          id
          name
        }
      }
    }
  `,

  AUTH_FIELDS: gql`
    fragment AuthFields on AuthPayload {
      token
      expiresAt
      user {
        id
        email
        name
        role
      }
    }
  `,

  PAGE_INFO: gql`
    fragment PageInfoFields on PageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
      totalCount
    }
  `,
} as const;
