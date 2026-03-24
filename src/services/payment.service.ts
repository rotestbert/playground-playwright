/**
 * PaymentService — processes payments, refunds, and transaction queries
 * for the Automation Exercise e-commerce platform.
 *
 * All monetary amounts are in the smallest currency unit (cents / paise)
 * to avoid floating-point precision issues.
 *
 * External dependencies are injected so they can be mocked in tests.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard ceiling on a single charge: $999,999.99 expressed in cents. */
export const MAX_PAYMENT_AMOUNT = 99_999_999;

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded';

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface PaymentDetails {
  orderId: string;
  customerId: string;
  /** Charge amount in the smallest currency unit (cents). Must be a positive integer. */
  amount: number;
  currency: Currency;
  /** Opaque token representing the customer's card (e.g. Stripe token). */
  cardToken: string;
}

export interface RefundRequest {
  transactionId: string;
  /** Partial refund amount in cents. Omit to refund the full remaining balance. */
  amount?: number;
  reason: string;
}

export interface Transaction {
  id: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  /** ID assigned by the payment gateway after a successful charge. */
  gatewayTransactionId: string;
  /** Running total of cents already refunded against this transaction. */
  refundedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── External dependency interfaces ──────────────────────────────────────────

export interface DatabaseClient {
  saveTransaction(transaction: Transaction): Promise<void>;
  getTransaction(id: string): Promise<Transaction | null>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction>;
  getTransactionsByCustomer(
    customerId: string,
    limit: number,
    offset: number,
  ): Promise<Transaction[]>;
  getTransactionByOrderId(orderId: string): Promise<Transaction | null>;
}

export interface PaymentGateway {
  charge(
    cardToken: string,
    amount: number,
    currency: string,
  ): Promise<{ gatewayTransactionId: string }>;
  refund(gatewayTransactionId: string, amount: number): Promise<{ refundId: string }>;
}

export interface EmailService {
  sendPaymentConfirmation(customerId: string, transaction: Transaction): Promise<void>;
  sendRefundConfirmation(
    customerId: string,
    transaction: Transaction,
    refundAmount: number,
  ): Promise<void>;
  sendPaymentFailure(customerId: string, orderId: string, reason: string): Promise<void>;
}

// ─── Custom error types ───────────────────────────────────────────────────────

export class PaymentValidationError extends Error {
  readonly name = 'PaymentValidationError';
  constructor(message: string) {
    super(message);
  }
}

export class PaymentGatewayError extends Error {
  readonly name = 'PaymentGatewayError';
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export class TransactionNotFoundError extends Error {
  readonly name = 'TransactionNotFoundError';
  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
  }
}

export class RefundError extends Error {
  readonly name = 'RefundError';
  constructor(message: string) {
    super(message);
  }
}

export class DuplicateOrderError extends Error {
  readonly name = 'DuplicateOrderError';
  constructor(orderId: string) {
    super(`Order already processed: ${orderId}`);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PaymentService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly gateway: PaymentGateway,
    private readonly email: EmailService,
  ) {}

  /**
   * Charges a card and records the transaction.
   *
   * Steps:
   *   1. Validate the payment details.
   *   2. Guard against duplicate order IDs.
   *   3. Persist a `pending` transaction.
   *   4. Charge the card via the payment gateway.
   *      - On failure: mark `failed`, fire failure email, re-throw.
   *   5. Mark `completed`, fire confirmation email (non-blocking).
   */
  async processPayment(details: PaymentDetails): Promise<Transaction> {
    this.validatePaymentDetails(details);

    const existing = await this.db.getTransactionByOrderId(details.orderId);
    if (existing) {
      throw new DuplicateOrderError(details.orderId);
    }

    const transaction: Transaction = {
      id: this.generateId(),
      orderId: details.orderId,
      customerId: details.customerId,
      amount: details.amount,
      currency: details.currency,
      status: 'pending',
      gatewayTransactionId: '',
      refundedAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.saveTransaction(transaction);

    let gatewayResult: { gatewayTransactionId: string };
    try {
      gatewayResult = await this.gateway.charge(
        details.cardToken,
        details.amount,
        details.currency,
      );
    } catch (err) {
      const failed = await this.db.updateTransaction(transaction.id, {
        status: 'failed',
        updatedAt: new Date(),
      });

      // Email is best-effort — a send failure must never mask the payment error.
      this.email
        .sendPaymentFailure(
          details.customerId,
          details.orderId,
          err instanceof Error ? err.message : 'Unknown gateway error',
        )
        .catch(() => {});

      // Re-surface the gateway error to the caller.
      throw new PaymentGatewayError(
        err instanceof Error ? err.message : 'Payment gateway error',
      );
    }

    const completed = await this.db.updateTransaction(transaction.id, {
      status: 'completed',
      gatewayTransactionId: gatewayResult.gatewayTransactionId,
      updatedAt: new Date(),
    });

    // Confirmation email is best-effort.
    this.email.sendPaymentConfirmation(details.customerId, completed).catch(() => {});

    return completed;
  }

  /**
   * Issues a full or partial refund against a completed transaction.
   *
   * Rules:
   *   - Only `completed` transactions can be refunded.
   *   - The refund amount must not exceed the un-refunded balance.
   *   - When the entire amount has been refunded the status becomes `refunded`.
   */
  async refundPayment(request: RefundRequest): Promise<Transaction> {
    if (!request.transactionId?.trim()) {
      throw new PaymentValidationError('Transaction ID is required');
    }
    if (!request.reason?.trim()) {
      throw new PaymentValidationError('Refund reason is required');
    }

    const transaction = await this.db.getTransaction(request.transactionId);
    if (!transaction) {
      throw new TransactionNotFoundError(request.transactionId);
    }

    if (transaction.status !== 'completed') {
      throw new RefundError(
        `Cannot refund a transaction with status "${transaction.status}"`,
      );
    }

    const refundAmount = request.amount ?? transaction.amount - transaction.refundedAmount;

    if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
      throw new PaymentValidationError('Refund amount must be a positive integer');
    }

    const refundable = transaction.amount - transaction.refundedAmount;
    if (refundAmount > refundable) {
      throw new RefundError(
        `Refund amount (${refundAmount}) exceeds refundable balance (${refundable})`,
      );
    }

    await this.gateway.refund(transaction.gatewayTransactionId, refundAmount);

    const newRefundedAmount = transaction.refundedAmount + refundAmount;
    const newStatus: TransactionStatus =
      newRefundedAmount >= transaction.amount ? 'refunded' : 'completed';

    const updated = await this.db.updateTransaction(transaction.id, {
      status: newStatus,
      refundedAmount: newRefundedAmount,
      updatedAt: new Date(),
    });

    // Refund confirmation email is best-effort.
    this.email
      .sendRefundConfirmation(transaction.customerId, updated, refundAmount)
      .catch(() => {});

    return updated;
  }

  /**
   * Fetches a single transaction by its ID.
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    if (!transactionId?.trim()) {
      throw new PaymentValidationError('Transaction ID is required');
    }

    const transaction = await this.db.getTransaction(transactionId);
    if (!transaction) {
      throw new TransactionNotFoundError(transactionId);
    }

    return transaction;
  }

  /**
   * Returns a paginated list of transactions for a customer.
   *
   * @param options.limit  Page size — 1..100 (default 20).
   * @param options.offset Zero-based starting index (default 0).
   */
  async getTransactionHistory(
    customerId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Transaction[]> {
    if (!customerId?.trim()) {
      throw new PaymentValidationError('Customer ID is required');
    }

    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      throw new PaymentValidationError('Limit must be an integer between 1 and 100');
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new PaymentValidationError('Offset must be a non-negative integer');
    }

    return this.db.getTransactionsByCustomer(customerId, limit, offset);
  }

  /**
   * Validates payment details synchronously.
   * Exposed publicly so callers can pre-validate without side effects.
   * Throws {@link PaymentValidationError} on the first invalid field.
   */
  validatePaymentDetails(details: PaymentDetails): void {
    if (!details.orderId?.trim()) {
      throw new PaymentValidationError('Order ID is required');
    }
    if (!details.customerId?.trim()) {
      throw new PaymentValidationError('Customer ID is required');
    }
    if (!details.cardToken?.trim()) {
      throw new PaymentValidationError('Card token is required');
    }
    if (!Number.isFinite(details.amount) || !Number.isInteger(details.amount)) {
      throw new PaymentValidationError('Amount must be a finite integer (in cents)');
    }
    if (details.amount <= 0) {
      throw new PaymentValidationError('Amount must be greater than 0');
    }
    if (details.amount > MAX_PAYMENT_AMOUNT) {
      throw new PaymentValidationError(
        `Amount (${details.amount}) exceeds the maximum allowed (${MAX_PAYMENT_AMOUNT})`,
      );
    }
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(details.currency)) {
      throw new PaymentValidationError(
        `Unsupported currency "${details.currency}". Supported: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private generateId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
