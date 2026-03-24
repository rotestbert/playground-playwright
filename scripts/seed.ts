/**
 * seed.ts — populate the database with a reproducible known dataset.
 *
 * Run with:
 *   npm run db:seed
 *
 * The faker seed is fixed (42) so every run produces the same IDs and values.
 * After seeding, the script prints a JSON summary of what was created so
 * tests can reference the well-known IDs via env vars or import.
 *
 * Seeded dataset:
 *   - 1 admin user        (KNOWN_ADMIN)
 *   - 5 regular users     (KNOWN_USERS)
 *   - 4 categories        (electronics, clothing, books, sports)
 *   - 20 products         (5 per category; one out-of-stock per category)
 *   - 10 orders           (2 per user; each with 2–3 items + payment)
 *   - 20 reviews          (2 per product in the first category)
 */

import { faker } from '@faker-js/faker';
import {
  MemoryAdapter,
  UserFactory, CategoryFactory, ProductFactory, OrderFactory, PaymentFactory,
} from '../src/factories/index.js';

// Fix the seed for reproducibility
faker.seed(42);

// ─── Adapter ──────────────────────────────────────────────────────────────────

const adapter = new MemoryAdapter();

// ─── Factories ────────────────────────────────────────────────────────────────

const userFactory     = new UserFactory(adapter);
const categoryFactory = new CategoryFactory(adapter);
const productFactory  = new ProductFactory(adapter);
const paymentFactory  = new PaymentFactory(adapter);
const orderFactory    = new OrderFactory(adapter);
orderFactory.setPaymentFactory(paymentFactory);

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  // 1 ── Admin user ────────────────────────────────────────────────────────────
  const admin = await userFactory.admin().verified().create({
    email: 'admin@example.com',
    name:  'Seed Admin',
  });

  // 2 ── Regular users ─────────────────────────────────────────────────────────
  const users = await userFactory.verified().createMany(5);

  // 3 ── Categories ─────────────────────────────────────────────────────────────
  const electronics = await categoryFactory.named('Electronics').create();
  const clothing    = await categoryFactory.named('Clothing').create();
  const books       = await categoryFactory.named('Books').create();
  const sports      = await categoryFactory.named('Sports').create();
  const categories  = [electronics, clothing, books, sports];

  // 4 ── Products (5 per category; slot [4] = out-of-stock) ─────────────────────
  const allProducts: Awaited<ReturnType<typeof productFactory.create>>[] = [];

  for (const cat of categories) {
    for (let i = 0; i < 5; i++) {
      const factory = i === 4
        ? productFactory.outOfStock().inCategory(cat.id)
        : productFactory.inCategory(cat.id);
      const product = await factory.create();
      allProducts.push(product);
    }
  }

  // Featured product (first electronics product)
  const featuredProduct = allProducts[0]!;

  // 5 ── Orders (2 per user; with items + payment) ───────────────────────────────
  const allOrders: Awaited<ReturnType<typeof orderFactory.create>>[] = [];
  const productIds = allProducts.map((p) => p.id);

  for (const user of users) {
    for (let i = 0; i < 2; i++) {
      const order = await orderFactory
        .withItems(faker.number.int({ min: 2, max: 3 }))
        .withPayment()
        .delivered()
        .forUser(user.id)
        .create({}, productIds);
      allOrders.push(order);
    }
  }

  // 6 ── Reviews (2 per product in the electronics category) ────────────────────
  const electronicsProducts = allProducts.slice(0, 5);
  const reviewUserPool = users.slice(0, 3);

  for (const product of electronicsProducts) {
    for (const reviewUser of reviewUserPool.slice(0, 2)) {
      await adapter.saveReview({
        id:        `rev_${faker.string.alphanumeric(10)}`,
        productId: product.id,
        userId:    reviewUser.id,
        rating:    faker.number.int({ min: 3, max: 5 }),
        body:      faker.lorem.sentences(2),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────────

  const summary = {
    admin: {
      id:    admin.id,
      email: admin.email,
    },
    users: users.map((u) => ({ id: u.id, email: u.email })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    products: {
      total:         allProducts.length,
      featured:      { id: featuredProduct.id, name: featuredProduct.name },
      outOfStock:    allProducts.filter((p) => p.stock === 0).map((p) => p.id),
    },
    orders: {
      total: allOrders.length,
      first: allOrders[0] ? { id: allOrders[0].id, userId: allOrders[0].userId } : null,
    },
    reviews: {
      total: electronicsProducts.length * 2,
    },
  };

  console.log('\n✅ Seed complete\n');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nPaste relevant IDs into your .env as GQL_* / API_* variables.\n');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
