/**
 * OrderFactory — builds Order + OrderItem records with a fluent, composable API.
 *
 * Usage:
 *   orderFactory.build({ userId: 'u1' })
 *   orderFactory.withItems(3).build({ userId })
 *   orderFactory.withPayment().build({ userId })
 *   orderFactory.pending().build({ userId })
 *   orderFactory.delivered().build({ userId })
 *   orderFactory.cancelled().build({ userId })
 *   orderFactory.forUser('user_1').build()
 *   orderFactory.withItems(3).withPayment().forUser('user_1').build()
 *
 * Items are built lazily at create() time. Payment is built by PaymentFactory
 * when the withPayment() trait is active; the factory receives the PaymentFactory
 * via setPaymentFactory() to avoid a circular import at module level.
 */

import { faker } from '@faker-js/faker';
import type { DbAdapter } from './adapter.js';
import type { Order, OrderItem, OrderStatus, PartialOrder, PartialOrderItem } from './types.js';
import type { PaymentFactory } from './payment.factory.js';

let _seq = 0;
function nextSeq(): number { return ++_seq; }

export class OrderFactory {
  private _overrides: PartialOrder = {};
  private _itemCount    = 0;
  private _createPayment = false;
  private _paymentFactory: PaymentFactory | undefined;

  constructor(private readonly adapter: DbAdapter) {}

  /** Inject PaymentFactory after construction to avoid circular imports. */
  setPaymentFactory(pf: PaymentFactory): this {
    this._paymentFactory = pf;
    return this;
  }

  // ─── Immutable clone helpers ────────────────────────────────────────────────

  private clone(patch: PartialOrder): OrderFactory {
    const next = new OrderFactory(this.adapter);
    next._overrides       = { ...this._overrides, ...patch };
    next._itemCount       = this._itemCount;
    next._createPayment   = this._createPayment;
    next._paymentFactory  = this._paymentFactory;
    return next;
  }

  // ─── Traits ─────────────────────────────────────────────────────────────────

  /** Attach N order items when persisting via create(). */
  withItems(n: number): OrderFactory {
    const next = this.clone({});
    next._itemCount = n;
    return next;
  }

  /** Also create a Payment record for this order when persisting via create(). */
  withPayment(): OrderFactory {
    const next = this.clone({});
    next._createPayment = true;
    return next;
  }

  pending(): OrderFactory    { return this.clone({ status: 'PENDING' }); }
  confirmed(): OrderFactory  { return this.clone({ status: 'CONFIRMED' }); }
  processing(): OrderFactory { return this.clone({ status: 'PROCESSING' }); }
  shipped(): OrderFactory    { return this.clone({ status: 'SHIPPED' }); }
  delivered(): OrderFactory  { return this.clone({ status: 'DELIVERED' }); }
  cancelled(): OrderFactory  { return this.clone({ status: 'CANCELLED' }); }
  refunded(): OrderFactory   { return this.clone({ status: 'REFUNDED' }); }

  forUser(userId: string): OrderFactory { return this.clone({ userId }); }

  // ─── Build ───────────────────────────────────────────────────────────────────

  build(overrides: PartialOrder = {}): Order {
    const seq = nextSeq();
    const now = new Date();

    const itemCount  = this._itemCount > 0 ? this._itemCount : faker.number.int({ min: 1, max: 5 });
    const unitPrice  = faker.number.int({ min: 199, max: 9999 });
    const total      = unitPrice * itemCount;

    const defaults: Order = {
      id:              `order_${seq}_${faker.string.alphanumeric(6)}`,
      userId:          `user_placeholder_${seq}`,
      status:          'PENDING' as OrderStatus,
      total,
      shippingAddress: `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.country()}`,
      notes:           '',
      createdAt:       now,
      updatedAt:       now,
    };

    return { ...defaults, ...this._overrides, ...overrides };
  }

  /** Build N standalone OrderItem records for a given order. */
  buildItems(orderId: string, count: number, productIds: string[] = []): OrderItem[] {
    return Array.from({ length: count }, (_, i) => {
      const seq = nextSeq();
      const item: OrderItem = {
        id:        `item_${seq}_${faker.string.alphanumeric(6)}`,
        orderId,
        productId: productIds[i] ?? `prod_placeholder_${seq}`,
        quantity:  faker.number.int({ min: 1, max: 10 }),
        unitPrice: faker.number.int({ min: 199, max: 9999 }),
      };
      return item;
    });
  }

  /** Build and persist the order (+ items + payment when traits are set). */
  async create(overrides: PartialOrder = {}, productIds: string[] = []): Promise<Order> {
    const order = await this.adapter.saveOrder(this.build(overrides));

    if (this._itemCount > 0) {
      const items = this.buildItems(order.id, this._itemCount, productIds);
      await Promise.all(items.map((item) => this.adapter.saveOrderItem(item)));
    }

    if (this._createPayment && this._paymentFactory) {
      await this._paymentFactory.create({
        orderId:    order.id,
        customerId: order.userId,
        amount:     order.total,
      });
    }

    return order;
  }

  async createMany(count: number, overrides: PartialOrder = {}): Promise<Order[]> {
    return Promise.all(Array.from({ length: count }, () => this.create(overrides)));
  }

  /** Helper: build a standalone item without persisting (useful in tests). */
  buildItem(overrides: PartialOrderItem = {}): OrderItem {
    const seq = nextSeq();
    return {
      id:        `item_${seq}_${faker.string.alphanumeric(6)}`,
      orderId:   `order_placeholder_${seq}`,
      productId: `prod_placeholder_${seq}`,
      quantity:  faker.number.int({ min: 1, max: 10 }),
      unitPrice: faker.number.int({ min: 199, max: 9999 }),
      ...overrides,
    };
  }
}
