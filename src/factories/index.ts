/**
 * Factory entry point.
 *
 * Exports:
 *   - Singleton factory instances wired to a shared MemoryAdapter
 *   - All factory classes (for custom adapter scenarios)
 *   - All domain types
 *   - The DbAdapter interface and MemoryAdapter class
 *
 * Usage (default in-memory):
 *   import { userFactory, productFactory, orderFactory } from '../src/factories/index.js';
 *
 *   const user    = await userFactory.admin().create();
 *   const cat     = await categoryFactory.create();
 *   const product = await productFactory.inCategory(cat.id).create();
 *   const order   = await orderFactory.withItems(3).withPayment().forUser(user.id).create();
 *
 * Usage with a real adapter:
 *   import { UserFactory, MemoryAdapter } from '../src/factories/index.js';
 *   const adapter = new MyPrismaAdapter(prismaClient);
 *   const factory = new UserFactory(adapter);
 */

export { UserFactory }     from './user.factory.js';
export { CategoryFactory } from './category.factory.js';
export { ProductFactory }  from './product.factory.js';
export { OrderFactory }    from './order.factory.js';
export { PaymentFactory }  from './payment.factory.js';

export { MemoryAdapter }   from './adapter.js';
export type { DbAdapter }  from './adapter.js';

export type {
  User, Category, Product, Order, OrderItem, Payment, Review,
  UserGraph, ProductGraph, ReviewGraph, OrderItemGraph, OrderGraph,
  Role, OrderStatus, SortDirection,
  PartialUser, PartialCategory, PartialProduct, PartialOrder,
  PartialPayment, PartialOrderItem, PartialReview,
} from './types.js';

// ─── Shared in-memory adapter (singleton per process) ─────────────────────────

import { MemoryAdapter } from './adapter.js';
import { UserFactory }     from './user.factory.js';
import { CategoryFactory } from './category.factory.js';
import { ProductFactory }  from './product.factory.js';
import { OrderFactory }    from './order.factory.js';
import { PaymentFactory }  from './payment.factory.js';

export const memoryAdapter = new MemoryAdapter();

export const userFactory     = new UserFactory(memoryAdapter);
export const categoryFactory = new CategoryFactory(memoryAdapter);
export const productFactory  = new ProductFactory(memoryAdapter);
export const paymentFactory  = new PaymentFactory(memoryAdapter);
export const orderFactory    = new OrderFactory(memoryAdapter);

// Wire payment factory into order factory (breaks potential circular import)
orderFactory.setPaymentFactory(paymentFactory);
