import { describe, it, expect, vi, beforeEach, afterEach, type MockedObject } from 'vitest';
import {
  PaymentService,
  MAX_PAYMENT_AMOUNT,
  SUPPORTED_CURRENCIES,
  PaymentValidationError,
  PaymentGatewayError,
  TransactionNotFoundError,
  RefundError,
  DuplicateOrderError,
  type DatabaseClient,
  type PaymentGateway,
  type EmailService,
  type Transaction,
  type PaymentDetails,
} from '@src/services/payment.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test factories
// ─────────────────────────────────────────────────────────────────────────────

function makePaymentDetails(overrides: Partial<PaymentDetails> = {}): PaymentDetails {
  return {
    orderId: 'order-001',
    customerId: 'customer-001',
    amount: 5000, // $50.00
    currency: 'USD',
    cardToken: 'tok_valid_card',
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_test_001',
    orderId: 'order-001',
    customerId: 'customer-001',
    amount: 5000,
    currency: 'USD',
    status: 'completed',
    gatewayTransactionId: 'gw_abc123',
    refundedAmount: 0,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock dependencies
// ─────────────────────────────────────────────────────────────────────────────

function makeMockDb(): MockedObject<DatabaseClient> {
  return {
    saveTransaction: vi.fn().mockResolvedValue(undefined),
    getTransaction: vi.fn().mockResolvedValue(null),
    updateTransaction: vi.fn().mockImplementation((_id, updates) =>
      Promise.resolve(makeTransaction(updates)),
    ),
    getTransactionsByCustomer: vi.fn().mockResolvedValue([]),
    getTransactionByOrderId: vi.fn().mockResolvedValue(null),
  };
}

function makeMockGateway(): MockedObject<PaymentGateway> {
  return {
    charge: vi.fn().mockResolvedValue({ gatewayTransactionId: 'gw_abc123' }),
    refund: vi.fn().mockResolvedValue({ refundId: 'ref_001' }),
  };
}

function makeMockEmail(): MockedObject<EmailService> {
  return {
    sendPaymentConfirmation: vi.fn().mockResolvedValue(undefined),
    sendRefundConfirmation: vi.fn().mockResolvedValue(undefined),
    sendPaymentFailure: vi.fn().mockResolvedValue(undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
  let db: MockedObject<DatabaseClient>;
  let gateway: MockedObject<PaymentGateway>;
  let email: MockedObject<EmailService>;
  let service: PaymentService;

  beforeEach(() => {
    db = makeMockDb();
    gateway = makeMockGateway();
    email = makeMockEmail();
    service = new PaymentService(db, gateway, email);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // validatePaymentDetails
  // ───────────────────────────────────────────────────────────────────────────

  describe('validatePaymentDetails', () => {
    describe('valid input', () => {
      it('does not throw for a valid payment detail object', () => {
        // Arrange
        const details = makePaymentDetails();

        // Act & Assert
        expect(() => service.validatePaymentDetails(details)).not.toThrow();
      });

      it.each(SUPPORTED_CURRENCIES)('accepts currency "%s"', (currency) => {
        // Arrange
        const details = makePaymentDetails({ currency });

        // Act & Assert
        expect(() => service.validatePaymentDetails(details)).not.toThrow();
      });

      it('accepts the minimum valid amount (1 cent)', () => {
        const details = makePaymentDetails({ amount: 1 });
        expect(() => service.validatePaymentDetails(details)).not.toThrow();
      });

      it('accepts the maximum allowed amount', () => {
        const details = makePaymentDetails({ amount: MAX_PAYMENT_AMOUNT });
        expect(() => service.validatePaymentDetails(details)).not.toThrow();
      });
    });

    describe('orderId validation', () => {
      it('throws PaymentValidationError when orderId is empty', () => {
        // Arrange
        const details = makePaymentDetails({ orderId: '' });

        // Act & Assert
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
        expect(() => service.validatePaymentDetails(details))
          .toThrow('Order ID is required');
      });

      it('throws when orderId is only whitespace', () => {
        const details = makePaymentDetails({ orderId: '   ' });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });
    });

    describe('customerId validation', () => {
      it('throws PaymentValidationError when customerId is empty', () => {
        const details = makePaymentDetails({ customerId: '' });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
        expect(() => service.validatePaymentDetails(details))
          .toThrow('Customer ID is required');
      });

      it('throws when customerId is only whitespace', () => {
        const details = makePaymentDetails({ customerId: '\t' });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });
    });

    describe('cardToken validation', () => {
      it('throws PaymentValidationError when cardToken is empty', () => {
        const details = makePaymentDetails({ cardToken: '' });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
        expect(() => service.validatePaymentDetails(details))
          .toThrow('Card token is required');
      });
    });

    describe('amount boundary conditions', () => {
      it('throws when amount is 0', () => {
        // Arrange
        const details = makePaymentDetails({ amount: 0 });

        // Act & Assert
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
        expect(() => service.validatePaymentDetails(details))
          .toThrow('Amount must be greater than 0');
      });

      it('throws when amount is negative', () => {
        const details = makePaymentDetails({ amount: -1 });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });

      it('throws when amount is a large negative number', () => {
        const details = makePaymentDetails({ amount: -Number.MAX_SAFE_INTEGER });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });

      it('throws when amount exceeds MAX_PAYMENT_AMOUNT', () => {
        // Arrange — one cent over the ceiling
        const details = makePaymentDetails({ amount: MAX_PAYMENT_AMOUNT + 1 });

        // Act & Assert
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
        expect(() => service.validatePaymentDetails(details))
          .toThrow(`${MAX_PAYMENT_AMOUNT + 1}`);
      });

      it('throws when amount is Number.MAX_SAFE_INTEGER', () => {
        const details = makePaymentDetails({ amount: Number.MAX_SAFE_INTEGER });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });

      it('throws when amount is a float (non-integer cents)', () => {
        const details = makePaymentDetails({ amount: 10.5 });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
        expect(() => service.validatePaymentDetails(details))
          .toThrow('finite integer');
      });

      it('throws when amount is NaN', () => {
        const details = makePaymentDetails({ amount: NaN });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });

      it('throws when amount is Infinity', () => {
        const details = makePaymentDetails({ amount: Infinity });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });

      it('throws when amount is -Infinity', () => {
        const details = makePaymentDetails({ amount: -Infinity });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });
    });

    describe('currency validation', () => {
      it('throws PaymentValidationError for an unsupported currency code', () => {
        // Arrange
        const details = makePaymentDetails({ currency: 'XYZ' as never });

        // Act & Assert
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
        expect(() => service.validatePaymentDetails(details))
          .toThrow('Unsupported currency "XYZ"');
      });

      it('throws for lowercase currency codes', () => {
        const details = makePaymentDetails({ currency: 'usd' as never });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });

      it('throws for an empty currency string', () => {
        const details = makePaymentDetails({ currency: '' as never });
        expect(() => service.validatePaymentDetails(details))
          .toThrow(PaymentValidationError);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // processPayment
  // ───────────────────────────────────────────────────────────────────────────

  describe('processPayment', () => {
    describe('happy path', () => {
      it('returns a completed transaction with gateway ID', async () => {
        // Arrange
        const details = makePaymentDetails();
        const completedTxn = makeTransaction({ status: 'completed', gatewayTransactionId: 'gw_abc123' });
        db.updateTransaction.mockResolvedValue(completedTxn);

        // Act
        const result = await service.processPayment(details);

        // Assert
        expect(result.status).toBe('completed');
        expect(result.gatewayTransactionId).toBe('gw_abc123');
      });

      it('saves a pending transaction before charging the gateway', async () => {
        // Arrange
        const details = makePaymentDetails();

        // Act
        await service.processPayment(details);

        // Assert — saveTransaction called before gateway.charge
        const saveOrder = db.saveTransaction.mock.invocationCallOrder[0]!;
        const chargeOrder = gateway.charge.mock.invocationCallOrder[0]!;
        expect(saveOrder).toBeLessThan(chargeOrder);
      });

      it('saves the transaction with status "pending" initially', async () => {
        // Arrange
        const details = makePaymentDetails();

        // Act
        await service.processPayment(details);

        // Assert
        const savedTxn = db.saveTransaction.mock.calls[0]![0]!;
        expect(savedTxn.status).toBe('pending');
        expect(savedTxn.gatewayTransactionId).toBe('');
        expect(savedTxn.refundedAmount).toBe(0);
      });

      it('calls gateway.charge with correct card token, amount, and currency', async () => {
        // Arrange
        const details = makePaymentDetails({ amount: 9999, currency: 'EUR', cardToken: 'tok_test' });

        // Act
        await service.processPayment(details);

        // Assert
        expect(gateway.charge).toHaveBeenCalledWith('tok_test', 9999, 'EUR');
      });

      it('updates the transaction to "completed" after a successful charge', async () => {
        // Arrange & Act
        await service.processPayment(makePaymentDetails());

        // Assert — second updateTransaction call (first is to 'completed')
        const updateArg = db.updateTransaction.mock.calls[0]![1]!;
        expect(updateArg.status).toBe('completed');
        expect(updateArg.gatewayTransactionId).toBe('gw_abc123');
      });

      it('sends a confirmation email after a successful payment', async () => {
        // Arrange
        const completedTxn = makeTransaction({ status: 'completed' });
        db.updateTransaction.mockResolvedValue(completedTxn);

        // Act
        await service.processPayment(makePaymentDetails());

        // Assert — allow the fire-and-forget promise to settle
        await vi.waitUntil(() => email.sendPaymentConfirmation.mock.calls.length > 0);
        expect(email.sendPaymentConfirmation).toHaveBeenCalledWith(
          'customer-001',
          completedTxn,
        );
      });

      it('saves the transaction with matching orderId and customerId', async () => {
        // Arrange
        const details = makePaymentDetails({ orderId: 'order-xyz', customerId: 'cust-abc' });

        // Act
        await service.processPayment(details);

        // Assert
        const saved = db.saveTransaction.mock.calls[0]![0]!;
        expect(saved.orderId).toBe('order-xyz');
        expect(saved.customerId).toBe('cust-abc');
      });

      it('assigns a non-empty transaction ID', async () => {
        // Arrange & Act
        await service.processPayment(makePaymentDetails());

        // Assert
        const saved = db.saveTransaction.mock.calls[0]![0]!;
        expect(saved.id).toBeTruthy();
        expect(typeof saved.id).toBe('string');
      });
    });

    describe('duplicate order guard', () => {
      it('throws DuplicateOrderError when the order was already processed', async () => {
        // Arrange — DB has an existing transaction for this orderId
        db.getTransactionByOrderId.mockResolvedValue(makeTransaction());

        // Act & Assert
        await expect(service.processPayment(makePaymentDetails()))
          .rejects.toThrow(DuplicateOrderError);
        await expect(service.processPayment(makePaymentDetails()))
          .rejects.toThrow('order-001');
      });

      it('does not call gateway.charge when order is duplicated', async () => {
        // Arrange
        db.getTransactionByOrderId.mockResolvedValue(makeTransaction());

        // Act
        await service.processPayment(makePaymentDetails()).catch(() => {});

        // Assert — gateway must never be charged for a duplicate
        expect(gateway.charge).not.toHaveBeenCalled();
      });
    });

    describe('gateway failure', () => {
      it('throws PaymentGatewayError when the gateway rejects', async () => {
        // Arrange
        gateway.charge.mockRejectedValue(new Error('Card declined'));

        // Act & Assert
        await expect(service.processPayment(makePaymentDetails()))
          .rejects.toThrow(PaymentGatewayError);
        await expect(service.processPayment(makePaymentDetails()))
          .rejects.toThrow('Card declined');
      });

      it('marks the transaction as "failed" when the gateway rejects', async () => {
        // Arrange
        gateway.charge.mockRejectedValue(new Error('Insufficient funds'));

        // Act
        await service.processPayment(makePaymentDetails()).catch(() => {});

        // Assert
        const updateArg = db.updateTransaction.mock.calls[0]![1]!;
        expect(updateArg.status).toBe('failed');
      });

      it('sends a failure email when the gateway rejects', async () => {
        // Arrange
        gateway.charge.mockRejectedValue(new Error('Network timeout'));

        // Act
        await service.processPayment(makePaymentDetails()).catch(() => {});

        // Assert
        await vi.waitUntil(() => email.sendPaymentFailure.mock.calls.length > 0);
        expect(email.sendPaymentFailure).toHaveBeenCalledWith(
          'customer-001',
          'order-001',
          'Network timeout',
        );
      });

      it('does NOT send a confirmation email when the gateway rejects', async () => {
        // Arrange
        gateway.charge.mockRejectedValue(new Error('Declined'));

        // Act
        await service.processPayment(makePaymentDetails()).catch(() => {});
        await new Promise((r) => setTimeout(r, 10)); // let fire-and-forget settle

        // Assert
        expect(email.sendPaymentConfirmation).not.toHaveBeenCalled();
      });

      it('wraps a non-Error gateway rejection in PaymentGatewayError', async () => {
        // Arrange — gateway throws a raw string instead of an Error
        gateway.charge.mockRejectedValue('gateway_exploded');

        // Act & Assert
        await expect(service.processPayment(makePaymentDetails()))
          .rejects.toThrow(PaymentGatewayError);
      });
    });

    describe('email failure resilience', () => {
      it('still returns the completed transaction when confirmation email fails', async () => {
        // Arrange
        const completedTxn = makeTransaction({ status: 'completed' });
        db.updateTransaction.mockResolvedValue(completedTxn);
        email.sendPaymentConfirmation.mockRejectedValue(new Error('SMTP timeout'));

        // Act
        const result = await service.processPayment(makePaymentDetails());

        // Assert — payment succeeded despite email failure
        expect(result.status).toBe('completed');
      });
    });

    describe('database failure', () => {
      it('throws when the initial saveTransaction rejects', async () => {
        // Arrange
        db.saveTransaction.mockRejectedValue(new Error('DB connection lost'));

        // Act & Assert
        await expect(service.processPayment(makePaymentDetails()))
          .rejects.toThrow('DB connection lost');

        // Gateway must not be charged if we could not save the pending record
        expect(gateway.charge).not.toHaveBeenCalled();
      });

      it('throws when updateTransaction rejects after a successful charge', async () => {
        // Arrange
        db.updateTransaction.mockRejectedValue(new Error('Write conflict'));

        // Act & Assert
        await expect(service.processPayment(makePaymentDetails()))
          .rejects.toThrow('Write conflict');
      });
    });

    describe('input validation passthrough', () => {
      it('throws PaymentValidationError for invalid input before touching any dependency', async () => {
        // Arrange
        const details = makePaymentDetails({ amount: -100 });

        // Act
        await expect(service.processPayment(details))
          .rejects.toThrow(PaymentValidationError);

        // Assert — no side effects
        expect(db.getTransactionByOrderId).not.toHaveBeenCalled();
        expect(db.saveTransaction).not.toHaveBeenCalled();
        expect(gateway.charge).not.toHaveBeenCalled();
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // refundPayment
  // ───────────────────────────────────────────────────────────────────────────

  describe('refundPayment', () => {
    describe('full refund', () => {
      it('returns a "refunded" transaction when the full amount is refunded', async () => {
        // Arrange
        const txn = makeTransaction({ amount: 5000, refundedAmount: 0 });
        db.getTransaction.mockResolvedValue(txn);
        const refundedTxn = makeTransaction({ status: 'refunded', refundedAmount: 5000 });
        db.updateTransaction.mockResolvedValue(refundedTxn);

        // Act
        const result = await service.refundPayment({
          transactionId: 'txn_test_001',
          reason: 'Customer request',
        });

        // Assert
        expect(result.status).toBe('refunded');
        expect(result.refundedAmount).toBe(5000);
      });

      it('calls gateway.refund with the gateway transaction ID and full amount', async () => {
        // Arrange
        const txn = makeTransaction({ amount: 5000, refundedAmount: 0, gatewayTransactionId: 'gw_xyz' });
        db.getTransaction.mockResolvedValue(txn);
        db.updateTransaction.mockResolvedValue(makeTransaction({ status: 'refunded' }));

        // Act
        await service.refundPayment({ transactionId: 'txn_test_001', reason: 'Duplicate order' });

        // Assert
        expect(gateway.refund).toHaveBeenCalledWith('gw_xyz', 5000);
      });

      it('sends a refund confirmation email', async () => {
        // Arrange
        const txn = makeTransaction({ amount: 5000, refundedAmount: 0 });
        db.getTransaction.mockResolvedValue(txn);
        const updatedTxn = makeTransaction({ status: 'refunded', refundedAmount: 5000 });
        db.updateTransaction.mockResolvedValue(updatedTxn);

        // Act
        await service.refundPayment({ transactionId: 'txn_test_001', reason: 'Test' });

        // Assert
        await vi.waitUntil(() => email.sendRefundConfirmation.mock.calls.length > 0);
        expect(email.sendRefundConfirmation).toHaveBeenCalledWith(
          txn.customerId,
          updatedTxn,
          5000,
        );
      });
    });

    describe('partial refund', () => {
      it('keeps status "completed" after a partial refund', async () => {
        // Arrange
        const txn = makeTransaction({ amount: 5000, refundedAmount: 0 });
        db.getTransaction.mockResolvedValue(txn);
        const updatedTxn = makeTransaction({ status: 'completed', refundedAmount: 2000 });
        db.updateTransaction.mockResolvedValue(updatedTxn);

        // Act
        const result = await service.refundPayment({
          transactionId: 'txn_test_001',
          amount: 2000,
          reason: 'Partial return',
        });

        // Assert
        expect(result.status).toBe('completed');
        expect(result.refundedAmount).toBe(2000);
      });

      it('transitions to "refunded" when the remaining balance is fully refunded in a second call', async () => {
        // Arrange — 2000 already refunded, now refunding the remaining 3000
        const txn = makeTransaction({ amount: 5000, refundedAmount: 2000 });
        db.getTransaction.mockResolvedValue(txn);
        const updatedTxn = makeTransaction({ status: 'refunded', refundedAmount: 5000 });
        db.updateTransaction.mockResolvedValue(updatedTxn);

        // Act
        const result = await service.refundPayment({
          transactionId: 'txn_test_001',
          amount: 3000,
          reason: 'Second partial refund completing full amount',
        });

        // Assert
        expect(result.status).toBe('refunded');
      });

      it('persists newRefundedAmount = prior + partial', async () => {
        // Arrange
        const txn = makeTransaction({ amount: 10000, refundedAmount: 1000 });
        db.getTransaction.mockResolvedValue(txn);
        db.updateTransaction.mockImplementation((_id, updates) =>
          Promise.resolve(makeTransaction(updates)),
        );

        // Act
        await service.refundPayment({ transactionId: 'txn_test_001', amount: 4000, reason: 'Test' });

        // Assert
        const updateArg = db.updateTransaction.mock.calls[0]![1]!;
        expect(updateArg.refundedAmount).toBe(5000); // 1000 prior + 4000 new
      });
    });

    describe('validation errors', () => {
      it('throws PaymentValidationError when transactionId is empty', async () => {
        await expect(
          service.refundPayment({ transactionId: '', reason: 'Test' }),
        ).rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when transactionId is whitespace', async () => {
        await expect(
          service.refundPayment({ transactionId: '   ', reason: 'Test' }),
        ).rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when reason is empty', async () => {
        await expect(
          service.refundPayment({ transactionId: 'txn_001', reason: '' }),
        ).rejects.toThrow(PaymentValidationError);
        await expect(
          service.refundPayment({ transactionId: 'txn_001', reason: '' }),
        ).rejects.toThrow('Refund reason is required');
      });

      it('throws PaymentValidationError when reason is only whitespace', async () => {
        await expect(
          service.refundPayment({ transactionId: 'txn_001', reason: '   ' }),
        ).rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when explicit amount is 0', async () => {
        // Arrange
        db.getTransaction.mockResolvedValue(makeTransaction());

        // Act & Assert
        await expect(
          service.refundPayment({ transactionId: 'txn_001', amount: 0, reason: 'Test' }),
        ).rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when explicit amount is negative', async () => {
        db.getTransaction.mockResolvedValue(makeTransaction());
        await expect(
          service.refundPayment({ transactionId: 'txn_001', amount: -100, reason: 'Test' }),
        ).rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when explicit amount is a float', async () => {
        db.getTransaction.mockResolvedValue(makeTransaction());
        await expect(
          service.refundPayment({ transactionId: 'txn_001', amount: 12.5, reason: 'Test' }),
        ).rejects.toThrow(PaymentValidationError);
      });
    });

    describe('transaction state errors', () => {
      it('throws TransactionNotFoundError when the transaction does not exist', async () => {
        // Arrange
        db.getTransaction.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.refundPayment({ transactionId: 'txn_ghost', reason: 'Test' }),
        ).rejects.toThrow(TransactionNotFoundError);
        await expect(
          service.refundPayment({ transactionId: 'txn_ghost', reason: 'Test' }),
        ).rejects.toThrow('txn_ghost');
      });

      it('throws RefundError when the transaction status is "pending"', async () => {
        // Arrange
        db.getTransaction.mockResolvedValue(makeTransaction({ status: 'pending' }));

        // Act & Assert
        await expect(
          service.refundPayment({ transactionId: 'txn_001', reason: 'Test' }),
        ).rejects.toThrow(RefundError);
        await expect(
          service.refundPayment({ transactionId: 'txn_001', reason: 'Test' }),
        ).rejects.toThrow('"pending"');
      });

      it('throws RefundError when the transaction status is "failed"', async () => {
        db.getTransaction.mockResolvedValue(makeTransaction({ status: 'failed' }));
        await expect(
          service.refundPayment({ transactionId: 'txn_001', reason: 'Test' }),
        ).rejects.toThrow(RefundError);
      });

      it('throws RefundError when the transaction is already fully refunded', async () => {
        // Arrange — the entire 5000 was already refunded
        db.getTransaction.mockResolvedValue(makeTransaction({ status: 'refunded' }));

        // Act & Assert
        await expect(
          service.refundPayment({ transactionId: 'txn_001', reason: 'Test' }),
        ).rejects.toThrow(RefundError);
      });
    });

    describe('over-refund boundary conditions', () => {
      it('throws RefundError when refund amount exceeds the transaction amount', async () => {
        // Arrange — transaction is $50, trying to refund $51
        const txn = makeTransaction({ amount: 5000, refundedAmount: 0 });
        db.getTransaction.mockResolvedValue(txn);

        // Act & Assert
        await expect(
          service.refundPayment({ transactionId: 'txn_001', amount: 5001, reason: 'Test' }),
        ).rejects.toThrow(RefundError);
        await expect(
          service.refundPayment({ transactionId: 'txn_001', amount: 5001, reason: 'Test' }),
        ).rejects.toThrow('5001');
      });

      it('throws RefundError when partial refunds combined would exceed the original amount', async () => {
        // Arrange — 4000 already refunded, trying to refund 1001 (only 1000 left)
        const txn = makeTransaction({ amount: 5000, refundedAmount: 4000 });
        db.getTransaction.mockResolvedValue(txn);

        // Act & Assert
        await expect(
          service.refundPayment({ transactionId: 'txn_001', amount: 1001, reason: 'Test' }),
        ).rejects.toThrow(RefundError);
      });

      it('does not call gateway.refund when the over-refund is detected', async () => {
        // Arrange
        const txn = makeTransaction({ amount: 5000, refundedAmount: 0 });
        db.getTransaction.mockResolvedValue(txn);

        // Act
        await service.refundPayment({ transactionId: 'txn_001', amount: 9999, reason: 'Test' })
          .catch(() => {});

        // Assert
        expect(gateway.refund).not.toHaveBeenCalled();
      });
    });

    describe('email failure resilience', () => {
      it('still returns the updated transaction when refund confirmation email fails', async () => {
        // Arrange
        const txn = makeTransaction({ amount: 5000, refundedAmount: 0 });
        db.getTransaction.mockResolvedValue(txn);
        const updatedTxn = makeTransaction({ status: 'refunded', refundedAmount: 5000 });
        db.updateTransaction.mockResolvedValue(updatedTxn);
        email.sendRefundConfirmation.mockRejectedValue(new Error('SMTP error'));

        // Act
        const result = await service.refundPayment({
          transactionId: 'txn_001',
          reason: 'Customer return',
        });

        // Assert — refund completed despite email failure
        expect(result.status).toBe('refunded');
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getTransaction
  // ───────────────────────────────────────────────────────────────────────────

  describe('getTransaction', () => {
    it('returns the transaction when it exists', async () => {
      // Arrange
      const txn = makeTransaction({ id: 'txn_found' });
      db.getTransaction.mockResolvedValue(txn);

      // Act
      const result = await service.getTransaction('txn_found');

      // Assert
      expect(result).toEqual(txn);
      expect(db.getTransaction).toHaveBeenCalledWith('txn_found');
    });

    it('throws TransactionNotFoundError when the transaction does not exist', async () => {
      // Arrange
      db.getTransaction.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getTransaction('txn_ghost'))
        .rejects.toThrow(TransactionNotFoundError);
      await expect(service.getTransaction('txn_ghost'))
        .rejects.toThrow('txn_ghost');
    });

    it('throws PaymentValidationError when transactionId is empty', async () => {
      await expect(service.getTransaction(''))
        .rejects.toThrow(PaymentValidationError);
    });

    it('throws PaymentValidationError when transactionId is whitespace', async () => {
      await expect(service.getTransaction('   '))
        .rejects.toThrow(PaymentValidationError);
    });

    it('does not call db.getTransaction when input is invalid', async () => {
      // Arrange & Act
      await service.getTransaction('').catch(() => {});

      // Assert
      expect(db.getTransaction).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getTransactionHistory
  // ───────────────────────────────────────────────────────────────────────────

  describe('getTransactionHistory', () => {
    describe('happy path', () => {
      it('returns the transaction list for a valid customer', async () => {
        // Arrange
        const transactions = [makeTransaction(), makeTransaction({ id: 'txn_002' })];
        db.getTransactionsByCustomer.mockResolvedValue(transactions);

        // Act
        const result = await service.getTransactionHistory('customer-001');

        // Assert
        expect(result).toEqual(transactions);
      });

      it('uses default limit 20 and offset 0 when options are omitted', async () => {
        // Arrange & Act
        await service.getTransactionHistory('customer-001');

        // Assert
        expect(db.getTransactionsByCustomer).toHaveBeenCalledWith('customer-001', 20, 0);
      });

      it('forwards explicit limit and offset to the database', async () => {
        // Arrange & Act
        await service.getTransactionHistory('customer-001', { limit: 10, offset: 30 });

        // Assert
        expect(db.getTransactionsByCustomer).toHaveBeenCalledWith('customer-001', 10, 30);
      });

      it('returns an empty array when the customer has no transactions', async () => {
        // Arrange
        db.getTransactionsByCustomer.mockResolvedValue([]);

        // Act
        const result = await service.getTransactionHistory('customer-001');

        // Assert
        expect(result).toEqual([]);
      });

      it('accepts the minimum valid limit (1)', async () => {
        await expect(
          service.getTransactionHistory('customer-001', { limit: 1 }),
        ).resolves.toBeDefined();
      });

      it('accepts the maximum valid limit (100)', async () => {
        await expect(
          service.getTransactionHistory('customer-001', { limit: 100 }),
        ).resolves.toBeDefined();
      });

      it('accepts offset 0', async () => {
        await expect(
          service.getTransactionHistory('customer-001', { offset: 0 }),
        ).resolves.toBeDefined();
      });
    });

    describe('customerId validation', () => {
      it('throws PaymentValidationError when customerId is empty', async () => {
        await expect(service.getTransactionHistory(''))
          .rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when customerId is whitespace', async () => {
        await expect(service.getTransactionHistory('  '))
          .rejects.toThrow(PaymentValidationError);
      });
    });

    describe('limit boundary conditions', () => {
      it('throws PaymentValidationError when limit is 0', async () => {
        await expect(service.getTransactionHistory('cust-001', { limit: 0 }))
          .rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when limit is negative', async () => {
        await expect(service.getTransactionHistory('cust-001', { limit: -5 }))
          .rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when limit exceeds 100', async () => {
        await expect(service.getTransactionHistory('cust-001', { limit: 101 }))
          .rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when limit is Number.MAX_SAFE_INTEGER', async () => {
        await expect(
          service.getTransactionHistory('cust-001', { limit: Number.MAX_SAFE_INTEGER }),
        ).rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when limit is a float', async () => {
        await expect(service.getTransactionHistory('cust-001', { limit: 10.5 }))
          .rejects.toThrow(PaymentValidationError);
      });
    });

    describe('offset boundary conditions', () => {
      it('throws PaymentValidationError when offset is negative', async () => {
        await expect(service.getTransactionHistory('cust-001', { offset: -1 }))
          .rejects.toThrow(PaymentValidationError);
      });

      it('throws PaymentValidationError when offset is a float', async () => {
        await expect(service.getTransactionHistory('cust-001', { offset: 1.5 }))
          .rejects.toThrow(PaymentValidationError);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Concurrent operations
  // ───────────────────────────────────────────────────────────────────────────

  describe('concurrent operations', () => {
    it('processes two payments for different orders independently and in parallel', async () => {
      // Arrange — each order has no prior transaction
      db.getTransactionByOrderId.mockResolvedValue(null);
      const completedTxn1 = makeTransaction({ id: 'txn_1', orderId: 'order-A' });
      const completedTxn2 = makeTransaction({ id: 'txn_2', orderId: 'order-B' });
      db.updateTransaction
        .mockResolvedValueOnce(completedTxn1)
        .mockResolvedValueOnce(completedTxn2);

      // Act
      const [result1, result2] = await Promise.all([
        service.processPayment(makePaymentDetails({ orderId: 'order-A' })),
        service.processPayment(makePaymentDetails({ orderId: 'order-B' })),
      ]);

      // Assert — both complete successfully
      expect(result1.orderId).toBe('order-A');
      expect(result2.orderId).toBe('order-B');
      expect(gateway.charge).toHaveBeenCalledTimes(2);
    });

    it('rejects the second processPayment call when the first already persisted the order', async () => {
      // Arrange — first check sees no transaction; second check (simulating the
      // race winner having written) sees an existing one
      db.getTransactionByOrderId
        .mockResolvedValueOnce(null)       // first concurrent call — proceeds
        .mockResolvedValueOnce(makeTransaction()); // second concurrent call — blocked

      // Act
      const results = await Promise.allSettled([
        service.processPayment(makePaymentDetails({ orderId: 'order-001' })),
        service.processPayment(makePaymentDetails({ orderId: 'order-001' })),
      ]);

      // Assert — exactly one succeeds, one fails with DuplicateOrderError
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateOrderError);
    });

    it('fetches multiple transactions concurrently without interference', async () => {
      // Arrange
      const txn1 = makeTransaction({ id: 'txn_A' });
      const txn2 = makeTransaction({ id: 'txn_B' });
      db.getTransaction
        .mockResolvedValueOnce(txn1)
        .mockResolvedValueOnce(txn2);

      // Act
      const [r1, r2] = await Promise.all([
        service.getTransaction('txn_A'),
        service.getTransaction('txn_B'),
      ]);

      // Assert
      expect(r1.id).toBe('txn_A');
      expect(r2.id).toBe('txn_B');
    });

    it('two concurrent refunds on the same transaction both call the gateway — documents the race condition', async () => {
      // Arrange — both concurrent reads return the same snapshot (refundedAmount = 0)
      // This documents the lack of optimistic locking in the current implementation.
      const txn = makeTransaction({ amount: 5000, refundedAmount: 0 });
      db.getTransaction.mockResolvedValue(txn);
      db.updateTransaction.mockImplementation((_id, updates) =>
        Promise.resolve(makeTransaction(updates)),
      );

      // Act — both calls race to refund the full amount
      const results = await Promise.allSettled([
        service.refundPayment({ transactionId: 'txn_001', reason: 'Race test 1' }),
        service.refundPayment({ transactionId: 'txn_001', reason: 'Race test 2' }),
      ]);

      // Assert — both calls proceed past the read-check because both saw
      // refundedAmount = 0 simultaneously. This is the known race condition.
      // A real implementation would use a DB-level transaction / optimistic lock.
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      expect(gateway.refund).toHaveBeenCalledTimes(fulfilled.length);
    });

    it('resolves concurrent getTransactionHistory calls without cross-contamination', async () => {
      // Arrange
      const custATxns = [makeTransaction({ customerId: 'cust-A' })];
      const custBTxns = [makeTransaction({ customerId: 'cust-B' })];
      db.getTransactionsByCustomer
        .mockResolvedValueOnce(custATxns)
        .mockResolvedValueOnce(custBTxns);

      // Act
      const [historyA, historyB] = await Promise.all([
        service.getTransactionHistory('cust-A'),
        service.getTransactionHistory('cust-B'),
      ]);

      // Assert
      expect(historyA[0]!.customerId).toBe('cust-A');
      expect(historyB[0]!.customerId).toBe('cust-B');
    });
  });
});
