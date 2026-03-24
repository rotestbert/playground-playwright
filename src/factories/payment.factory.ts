/**
 * PaymentFactory — builds Payment records aligned with payment.service.ts types.
 *
 * Usage:
 *   paymentFactory.build({ orderId, customerId, amount })
 *   paymentFactory.failed().build({ orderId, customerId, amount })
 *   paymentFactory.refunded().build({ orderId, customerId, amount })
 *   paymentFactory.inCurrency('EUR').build({ ... })
 *   paymentFactory.forAmount(4999).build({ ... })        // 49.99 in the currency
 *   await paymentFactory.create({ orderId, customerId, amount })
 */

import { faker } from '@faker-js/faker';
import { SUPPORTED_CURRENCIES, type Currency, type TransactionStatus } from '../services/payment.service.js';
import type { DbAdapter } from './adapter.js';
import type { PartialPayment, Payment } from './types.js';

let _seq = 0;
function nextSeq(): number { return ++_seq; }

export class PaymentFactory {
  private _overrides: PartialPayment = {};

  constructor(private readonly adapter: DbAdapter) {}

  private clone(patch: PartialPayment): PaymentFactory {
    const next = new PaymentFactory(this.adapter);
    next._overrides = { ...this._overrides, ...patch };
    return next;
  }

  // ─── Traits ──────────────────────────────────────────────────────────────────

  /** Payment failed at the gateway — status: 'failed', gatewayTransactionId: ''. */
  failed(): PaymentFactory {
    return this.clone({ status: 'failed', gatewayTransactionId: '' });
  }

  /**
   * Full refund applied — status: 'refunded', refundedAmount equals amount.
   * Caller must ensure `amount` is set before or after building.
   */
  refunded(): PaymentFactory {
    return this.clone({ status: 'refunded' });
  }

  /** Override the currency. Must be one of SUPPORTED_CURRENCIES. */
  inCurrency(currency: Currency): PaymentFactory {
    return this.clone({ currency });
  }

  /** Pin the charge amount (in smallest currency unit / cents). */
  forAmount(cents: number): PaymentFactory {
    return this.clone({ amount: cents });
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  build(overrides: PartialPayment = {}): Payment {
    const seq  = nextSeq();
    const now  = new Date();
    const amount = overrides.amount ?? this._overrides.amount ?? faker.number.int({ min: 100, max: 99999 });
    const status: TransactionStatus = (this._overrides.status ?? 'completed') as TransactionStatus;

    const defaults: Payment = {
      id:                     `pay_${seq}_${faker.string.alphanumeric(6)}`,
      orderId:                `order_placeholder_${seq}`,
      customerId:             `user_placeholder_${seq}`,
      amount,
      currency:               SUPPORTED_CURRENCIES[seq % SUPPORTED_CURRENCIES.length] as Currency,
      status,
      gatewayTransactionId:   `gw_${faker.string.alphanumeric(16)}`,
      refundedAmount:         status === 'refunded' ? amount : 0,
      cardLast4:              faker.finance.creditCardNumber('####').slice(-4),
      createdAt:              now,
      updatedAt:              now,
    };

    return { ...defaults, ...this._overrides, ...overrides };
  }

  async create(overrides: PartialPayment = {}): Promise<Payment> {
    return this.adapter.savePayment(this.build(overrides));
  }

  async createMany(count: number, overrides: PartialPayment = {}): Promise<Payment[]> {
    return Promise.all(Array.from({ length: count }, () => this.create(overrides)));
  }
}
