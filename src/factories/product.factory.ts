/**
 * ProductFactory — builds Product records with realistic Faker data.
 *
 * Usage:
 *   productFactory.build({ categoryId: 'cat_1' })
 *   productFactory.outOfStock().build({ categoryId })
 *   productFactory.featured().build({ categoryId })
 *   productFactory.onSale(20).build({ categoryId })   // 20 % off
 *   productFactory.inCategory('cat_1').build()
 *   await productFactory.create({ categoryId })
 *   await productFactory.createMany(10, { categoryId })
 */

import { faker } from '@faker-js/faker';
import type { DbAdapter } from './adapter.js';
import type { PartialProduct, Product } from './types.js';

let _seq = 0;
function nextSeq(): number { return ++_seq; }

export class ProductFactory {
  private _overrides: PartialProduct = {};

  constructor(private readonly adapter: DbAdapter) {}

  private clone(patch: PartialProduct): ProductFactory {
    const next = new ProductFactory(this.adapter);
    next._overrides = { ...this._overrides, ...patch };
    return next;
  }

  // ─── Traits ──────────────────────────────────────────────────────────────────

  /** Stock = 0, unavailable for purchase. */
  outOfStock(): ProductFactory {
    return this.clone({ stock: 0 });
  }

  /** Marks the product as featured (e.g. shown on the home page). */
  featured(): ProductFactory {
    return this.clone({ isFeatured: true });
  }

  /**
   * Applies a percentage discount to the base price.
   * @param percent — integer between 1 and 99 (e.g. 20 = 20 % off)
   */
  onSale(percent: number): ProductFactory {
    // We keep price as cents. The trait just records the discount factor;
    // actual price is applied at build time from the current override state.
    // We set a low-ish price so "on sale" is visually recognisable.
    const discountFactor = 1 - Math.min(Math.max(percent, 1), 99) / 100;
    const salePrice = Math.max(1, Math.round(faker.number.int({ min: 500, max: 10000 }) * discountFactor));
    return this.clone({ price: salePrice });
  }

  /** Pin this product to a specific category. */
  inCategory(categoryId: string): ProductFactory {
    return this.clone({ categoryId });
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  build(overrides: PartialProduct = {}): Product {
    const seq = nextSeq();
    const now = new Date();

    const defaults: Product = {
      id:          `prod_${seq}_${faker.string.alphanumeric(6)}`,
      name:        faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price:       faker.number.int({ min: 99, max: 99999 }), // cents
      stock:       faker.number.int({ min: 1, max: 500 }),
      sku:         `SKU-${seq.toString().padStart(5, '0')}-${faker.string.alphanumeric(4).toUpperCase()}`,
      imageUrl:    `https://picsum.photos/seed/${seq}/400/400`,
      isFeatured:  false,
      categoryId:  `cat_placeholder_${seq}`,
      createdAt:   now,
      updatedAt:   now,
    };

    return { ...defaults, ...this._overrides, ...overrides };
  }

  async create(overrides: PartialProduct = {}): Promise<Product> {
    return this.adapter.saveProduct(this.build(overrides));
  }

  async createMany(count: number, overrides: PartialProduct = {}): Promise<Product[]> {
    return Promise.all(Array.from({ length: count }, () => this.create(overrides)));
  }
}
