/**
 * CategoryFactory — builds Category records with realistic Faker data.
 *
 * Usage:
 *   categoryFactory.build()
 *   categoryFactory.build({ name: 'Electronics' })
 *   await categoryFactory.create()
 *   await categoryFactory.createMany(5)
 */

import { faker } from '@faker-js/faker';
import type { DbAdapter } from './adapter.js';
import type { Category, PartialCategory } from './types.js';

let _seq = 0;
function nextSeq(): number { return ++_seq; }

// Real-sounding e-commerce category names for variety
const CATEGORY_NAMES = [
  'Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports & Outdoors',
  'Beauty & Personal Care', 'Toys & Games', 'Automotive', 'Health & Wellness',
  'Food & Grocery', 'Pet Supplies', 'Office Supplies', 'Jewelry', 'Music',
  'Movies & TV', 'Software', 'Tools & Hardware', 'Baby Products', 'Luggage',
];

export class CategoryFactory {
  private _overrides: PartialCategory = {};

  constructor(private readonly adapter: DbAdapter) {}

  private clone(patch: PartialCategory): CategoryFactory {
    const next = new CategoryFactory(this.adapter);
    next._overrides = { ...this._overrides, ...patch };
    return next;
  }

  // ─── Traits ──────────────────────────────────────────────────────────────────

  /** Force a specific category name (slug is derived automatically). */
  named(name: string): CategoryFactory {
    return this.clone({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  build(overrides: PartialCategory = {}): Category {
    const seq = nextSeq();
    const now = new Date();
    const name = CATEGORY_NAMES[seq % CATEGORY_NAMES.length] ?? faker.commerce.department();

    const defaults: Category = {
      id:          `cat_${seq}_${faker.string.alphanumeric(6)}`,
      name,
      slug:        name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: faker.lorem.sentence(),
      createdAt:   now,
      updatedAt:   now,
    };

    return { ...defaults, ...this._overrides, ...overrides };
  }

  async create(overrides: PartialCategory = {}): Promise<Category> {
    return this.adapter.saveCategory(this.build(overrides));
  }

  async createMany(count: number, overrides: PartialCategory = {}): Promise<Category[]> {
    return Promise.all(Array.from({ length: count }, () => this.create(overrides)));
  }
}
