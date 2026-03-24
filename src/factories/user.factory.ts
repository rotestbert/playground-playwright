/**
 * UserFactory — builds User records with realistic Faker data.
 *
 * Usage:
 *   userFactory.build()                    // random USER
 *   userFactory.admin().build()            // admin user
 *   userFactory.verified().build()         // verified user
 *   userFactory.banned().build()           // banned user
 *   userFactory.withOrders(3).build()      // overrides stored in meta; use with OrderFactory
 *   userFactory.build({ email: 'x@y.com' }) // override specific fields
 *   await userFactory.create()             // build + persist via adapter
 */

import { faker } from '@faker-js/faker';
import type { DbAdapter } from './adapter.js';
import type { PartialUser, User, Role } from './types.js';

// Shared sequence counter (collision-safe across the same process)
let _seq = 0;
function nextSeq(): number { return ++_seq; }

export class UserFactory {
  private _overrides: PartialUser = {};
  private _ordersToCreate = 0;

  constructor(private readonly adapter: DbAdapter) {}

  // ─── Immutable clone helpers ────────────────────────────────────────────────

  private clone(patch: PartialUser): UserFactory {
    const next = new UserFactory(this.adapter);
    next._overrides = { ...this._overrides, ...patch };
    next._ordersToCreate = this._ordersToCreate;
    return next;
  }

  // ─── Traits ─────────────────────────────────────────────────────────────────

  /** Produces an ADMIN-role user. */
  admin(): UserFactory {
    return this.clone({ role: 'ADMIN' });
  }

  /** Produces a verified user. */
  verified(): UserFactory {
    return this.clone({ isVerified: true });
  }

  /** Produces a banned user. */
  banned(): UserFactory {
    return this.clone({ isBanned: true });
  }

  /**
   * Marks that `n` orders should be created for this user.
   * The caller is responsible for building those orders via OrderFactory;
   * this trait sets a `_ordersToCreate` hint used by the seed script.
   */
  withOrders(n: number): UserFactory {
    const next = this.clone({});
    next._ordersToCreate = n;
    return next;
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  /** Returns how many orders should be attached to this user (seed-script hint). */
  get ordersToCreate(): number { return this._ordersToCreate; }

  build(overrides: PartialUser = {}): User {
    const seq = nextSeq();
    const now = new Date();

    const defaults: User = {
      id:           `user_${seq}_${faker.string.alphanumeric(6)}`,
      email:        faker.internet.email({ provider: `example${seq}.com` }),
      name:         faker.person.fullName(),
      role:         'USER' as Role,
      passwordHash: `$2b$10$${faker.string.alphanumeric(53)}`,
      isVerified:   false,
      isBanned:     false,
      createdAt:    now,
      updatedAt:    now,
    };

    return { ...defaults, ...this._overrides, ...overrides };
  }

  /** Build and persist via the adapter. */
  async create(overrides: PartialUser = {}): Promise<User> {
    return this.adapter.saveUser(this.build(overrides));
  }

  /** Build and persist N users at once. */
  async createMany(count: number, overrides: PartialUser = {}): Promise<User[]> {
    return Promise.all(Array.from({ length: count }, () => this.create(overrides)));
  }
}
