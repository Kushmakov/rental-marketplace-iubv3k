import { Container } from 'inversify'; // v6.x
import { MockStripe } from 'stripe-mock'; // v2.x
import { PCIValidator } from 'pci-validator'; // v1.x
import { PaymentService } from '../src/services/payment.service';
import { 
  PaymentModel, 
  PaymentType, 
  PaymentStatus, 
  PaymentFrequency 
} from '../src/models/payment.model';

describe('PaymentService', () => {
  let container: Container;
  let paymentService: PaymentService;
  let mockStripe: MockStripe;
  let pciValidator: PCIValidator;

  const testPaymentData = {
    propertyId: 'prop_123',
    userId: 'user_456',
    type: PaymentType.RENT,
    amount: 2000.00,
    currency: 'USD',
    frequency: PaymentFrequency.MONTHLY,
    dueDate: new Date(),
    metadata: {
      userEmail: 'test@example.com',
      userName: 'Test User'
    }
  };

  beforeAll(async () => {
    // Initialize test container with enhanced security context
    container = new Container({ defaultScope: 'Singleton' });
    container.bind(PaymentService).toSelf();

    // Configure PCI-compliant mock Stripe instance
    mockStripe = new MockStripe({
      apiVersion: '2023-10-16',
      webhookSecret: 'test_webhook_secret'
    });

    // Initialize PCI compliance validator
    pciValidator = new PCIValidator({
      level: 'SAQ-A',
      validateTokenization: true
    });

    // Bind services to container
    paymentService = container.get(PaymentService);
  });

  afterAll(async () => {
    // Cleanup sensitive test data
    await mockStripe.cleanup();
    await container.unbindAll();
  });

  describe('Payment Creation', () => {
    it('should create a new payment record with PCI compliance', async () => {
      // Validate PCI compliance before test
      const complianceResult = await pciValidator.validateContext();
      expect(complianceResult.compliant).toBe(true);

      const payment = await paymentService.createPayment(testPaymentData);

      expect(payment).toBeDefined();
      expect(payment.id).toBeDefined();
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.amount).toBe(testPaymentData.amount);
      expect(payment.stripeCustomerId).toBeDefined();
      
      // Verify sensitive data handling
      expect(payment.toJSON()).not.toHaveProperty('stripeCustomerId');
      expect(payment.toJSON()).not.toHaveProperty('stripePaymentMethodId');
    });

    it('should handle payment creation failures securely', async () => {
      const invalidData = {
        ...testPaymentData,
        amount: -100 // Invalid amount
      };

      await expect(paymentService.createPayment(invalidData))
        .rejects
        .toThrow('Amount must be greater than 0');
    });
  });

  describe('Payment Processing', () => {
    const testPaymentMethodId = 'pm_test_123';
    let paymentId: string;

    beforeEach(async () => {
      const payment = await paymentService.createPayment(testPaymentData);
      paymentId = payment.id;
    });

    it('should process payment with proper security measures', async () => {
      const payment = await paymentService.processPayment(
        paymentId,
        testPaymentMethodId
      );

      expect(payment.status).toBe(PaymentStatus.CAPTURED);
      expect(payment.paidDate).toBeDefined();
      
      // Verify audit trail
      expect(payment.auditLog).toContainEqual(
        expect.objectContaining({
          action: 'payment_processed'
        })
      );
    });

    it('should handle payment processing failures with retry mechanism', async () => {
      // Mock Stripe failure
      mockStripe.setNextResponse({
        error: {
          type: 'card_error',
          code: 'card_declined'
        }
      });

      await expect(paymentService.processPayment(
        paymentId,
        'pm_test_declined'
      )).rejects.toThrow();

      const payment = await PaymentModel.findById(paymentId);
      expect(payment?.status).toBe(PaymentStatus.FAILED);
      expect(payment?.retryCount).toBeGreaterThan(0);
    });
  });

  describe('High Volume Transaction Handling', () => {
    it('should handle concurrent payment processing', async () => {
      const concurrentPayments = 50;
      const payments = await Promise.all(
        Array(concurrentPayments).fill(null).map(() =>
          paymentService.createPayment({
            ...testPaymentData,
            amount: 1000 + Math.random() * 1000
          })
        )
      );

      const results = await Promise.allSettled(
        payments.map(payment =>
          paymentService.processPayment(
            payment.id,
            `pm_test_${Math.random()}`
          )
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);
      
      // Verify transaction integrity
      const processedPayments = await PaymentModel.find({
        id: { $in: payments.map(p => p.id) }
      });
      
      expect(processedPayments.every(p => 
        p.status === PaymentStatus.CAPTURED || 
        p.status === PaymentStatus.FAILED
      )).toBe(true);
    });

    it('should maintain data consistency under load', async () => {
      const batchSize = 25;
      const batches = 4;
      
      for (let i = 0; i < batches; i++) {
        const batchPayments = await Promise.all(
          Array(batchSize).fill(null).map(() =>
            paymentService.createPayment({
              ...testPaymentData,
              amount: 1000 + Math.random() * 1000
            })
          )
        );

        await Promise.all(
          batchPayments.map(payment =>
            paymentService.processPayment(
              payment.id,
              `pm_test_${Math.random()}`
            ).catch(() => null) // Allow some failures
          )
        );

        // Verify data integrity after each batch
        const verifiedPayments = await PaymentModel.find({
          id: { $in: batchPayments.map(p => p.id) }
        });

        expect(verifiedPayments.length).toBe(batchSize);
        verifiedPayments.forEach(payment => {
          expect(payment.auditLog).toBeDefined();
          expect(payment.idempotencyKey).toBeDefined();
        });
      }
    });
  });

  describe('Security and Compliance', () => {
    it('should validate PCI compliance for payment processing', async () => {
      const payment = await paymentService.createPayment(testPaymentData);
      
      const validationResult = await pciValidator.validatePaymentFlow({
        paymentId: payment.id,
        amount: payment.amount,
        cardData: {
          tokenized: true,
          transmission: 'encrypted'
        }
      });

      expect(validationResult.compliant).toBe(true);
      expect(validationResult.requirements).toContain('tokenization');
      expect(validationResult.requirements).toContain('encryption');
    });

    it('should properly handle sensitive payment data', async () => {
      const payment = await paymentService.createPayment(testPaymentData);
      const serializedPayment = JSON.stringify(payment);

      // Verify PCI compliance in serialized data
      expect(serializedPayment).not.toContain('stripePaymentMethodId');
      expect(serializedPayment).not.toContain('stripeCustomerId');
      
      // Verify audit logging
      expect(payment.auditLog).toBeDefined();
      expect(payment.auditLog[0].action).toBe('payment_created');
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should activate circuit breaker on consecutive failures', async () => {
      // Force consecutive failures
      mockStripe.setNextResponses(Array(5).fill({
        error: { type: 'api_error', code: 'service_unavailable' }
      }));

      const attempts = [];
      for (let i = 0; i < 5; i++) {
        try {
          const payment = await paymentService.createPayment({
            ...testPaymentData,
            amount: 1000 + i
          });
          await paymentService.processPayment(payment.id, 'pm_test_fail');
        } catch (error) {
          attempts.push(error);
        }
      }

      // Verify circuit breaker activation
      expect(attempts.length).toBe(5);
      expect(attempts[4].message).toContain('Circuit breaker is open');
    });

    it('should reset circuit breaker after cooling period', async () => {
      // Wait for circuit breaker reset
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Attempt payment after reset
      const payment = await paymentService.createPayment(testPaymentData);
      const result = await paymentService.processPayment(
        payment.id,
        'pm_test_success'
      );

      expect(result.status).toBe(PaymentStatus.CAPTURED);
    });
  });
});