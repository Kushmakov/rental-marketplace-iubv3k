import { injectable } from 'inversify';
import Stripe from 'stripe'; // v12.x
import { Logger } from 'winston'; // v3.x
import { CircuitBreaker } from 'opossum'; // v7.x
import * as crypto from 'crypto'; // native
import { PaymentStatus, PaymentType } from '../models/payment.model';
import { TransactionType, TransactionStatus } from '../models/transaction.model';

const STRIPE_API_VERSION = '2023-10-16';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const RETRY_CONFIG = { maxAttempts: 3, backoff: 'exponential' };
const ENCRYPTION_KEY = process.env.PAYMENT_ENCRYPTION_KEY;

/**
 * Enhanced service class for secure Stripe payment processing with PCI DSS compliance
 */
@injectable()
export class StripeService {
  private readonly stripeClient: Stripe;
  private readonly logger: Logger;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly encryptionService: crypto.Cipher;

  constructor(
    private readonly apiKey: string,
    logger: Logger,
    circuitBreaker: CircuitBreaker
  ) {
    this.stripeClient = new Stripe(apiKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      telemetry: false // Disable telemetry for enhanced security
    });

    this.logger = logger;
    this.circuitBreaker = circuitBreaker;
    this.initializeEncryption();
    this.validateConfiguration();
  }

  /**
   * Creates a new Stripe customer with enhanced validation and PCI compliance
   */
  public async createCustomer(customerData: {
    email: string;
    name: string;
    metadata: Record<string, string>;
  }): Promise<Stripe.Customer> {
    this.validateCustomerData(customerData);
    const idempotencyKey = this.generateIdempotencyKey('customer');

    try {
      const customer = await this.circuitBreaker.fire(async () => {
        return await this.stripeClient.customers.create({
          ...customerData,
          metadata: this.sanitizeMetadata(customerData.metadata)
        }, {
          idempotencyKey
        });
      });

      this.logSecureEvent('customer_created', {
        customerId: customer.id,
        email: this.maskPII(customerData.email)
      });

      return customer;
    } catch (error) {
      this.handleStripeError(error, 'create_customer');
      throw error;
    }
  }

  /**
   * Creates a payment method with enhanced security measures
   */
  public async createPaymentMethod(
    customerId: string,
    paymentMethodData: Stripe.PaymentMethodCreateParams
  ): Promise<Stripe.PaymentMethod> {
    this.validatePaymentMethodData(paymentMethodData);
    const idempotencyKey = this.generateIdempotencyKey('payment_method');

    try {
      const paymentMethod = await this.circuitBreaker.fire(async () => {
        const method = await this.stripeClient.paymentMethods.create(
          paymentMethodData,
          { idempotencyKey }
        );

        await this.stripeClient.paymentMethods.attach(method.id, {
          customer: customerId
        });

        return method;
      });

      this.logSecureEvent('payment_method_created', {
        paymentMethodId: paymentMethod.id,
        customerId: this.maskPII(customerId),
        type: paymentMethod.type
      });

      return paymentMethod;
    } catch (error) {
      this.handleStripeError(error, 'create_payment_method');
      throw error;
    }
  }

  /**
   * Processes a payment with comprehensive error handling and retry logic
   */
  public async processPayment(
    paymentData: {
      amount: number;
      currency: string;
      paymentMethodId: string;
      customerId: string;
      metadata: Record<string, string>;
    }
  ): Promise<Stripe.PaymentIntent> {
    this.validatePaymentData(paymentData);
    const idempotencyKey = this.generateIdempotencyKey('payment');

    try {
      const paymentIntent = await this.circuitBreaker.fire(async () => {
        return await this.stripeClient.paymentIntents.create({
          amount: Math.round(paymentData.amount * 100),
          currency: paymentData.currency.toLowerCase(),
          payment_method: paymentData.paymentMethodId,
          customer: paymentData.customerId,
          confirm: true,
          metadata: this.sanitizeMetadata(paymentData.metadata),
          statement_descriptor: 'PROJECTX RENT',
          statement_descriptor_suffix: 'RENT'
        }, {
          idempotencyKey
        });
      });

      this.logSecureEvent('payment_processed', {
        paymentIntentId: paymentIntent.id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: paymentIntent.status
      });

      return paymentIntent;
    } catch (error) {
      this.handleStripeError(error, 'process_payment');
      throw error;
    }
  }

  /**
   * Handles Stripe webhooks with signature verification
   */
  public async handleWebhook(
    payload: Buffer,
    signature: string
  ): Promise<void> {
    try {
      const event = this.stripeClient.webhooks.constructEvent(
        payload,
        signature,
        STRIPE_WEBHOOK_SECRET!
      );

      await this.processWebhookEvent(event);
    } catch (error) {
      this.logger.error('Webhook signature verification failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initializes encryption service for sensitive data
   */
  private initializeEncryption(): void {
    const iv = crypto.randomBytes(16);
    this.encryptionService = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY!, 'base64'),
      iv
    );
  }

  /**
   * Validates service configuration
   */
  private validateConfiguration(): void {
    if (!STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe webhook secret is not configured');
    }
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key is not configured');
    }
  }

  /**
   * Generates cryptographically secure idempotency keys
   */
  private generateIdempotencyKey(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
  }

  /**
   * Handles Stripe errors with enhanced logging
   */
  private handleStripeError(error: Stripe.StripeError, operation: string): void {
    this.logger.error('Stripe operation failed', {
      operation,
      errorType: error.type,
      errorCode: error.code,
      message: error.message,
      requestId: error.requestId
    });
  }

  /**
   * Logs events securely without sensitive data
   */
  private logSecureEvent(
    event: string,
    data: Record<string, any>
  ): void {
    this.logger.info(`Stripe ${event}`, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Masks PII data for logging
   */
  private maskPII(value: string): string {
    if (!value) return '';
    return `${value.substring(0, 3)}...${value.substring(value.length - 3)}`;
  }

  /**
   * Sanitizes metadata to prevent injection
   */
  private sanitizeMetadata(
    metadata: Record<string, string>
  ): Record<string, string> {
    return Object.entries(metadata).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: this.sanitizeString(value)
    }), {});
  }

  /**
   * Sanitizes string values
   */
  private sanitizeString(value: string): string {
    return value.replace(/[<>]/g, '');
  }

  /**
   * Processes webhook events
   */
  private async processWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;
      // Add more event handlers as needed
    }
  }

  /**
   * Handles successful payment webhook events
   */
  private async handlePaymentSuccess(
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> {
    this.logSecureEvent('payment_success_webhook', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });
  }

  /**
   * Handles failed payment webhook events
   */
  private async handlePaymentFailure(
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> {
    this.logSecureEvent('payment_failure_webhook', {
      paymentIntentId: paymentIntent.id,
      error: paymentIntent.last_payment_error?.message
    });
  }
}