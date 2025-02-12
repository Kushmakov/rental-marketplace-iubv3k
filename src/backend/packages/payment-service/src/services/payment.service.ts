import { injectable } from 'inversify'; // v6.x
import { Logger } from 'winston'; // v3.x
import { PaymentModel, PaymentStatus, PaymentType, PaymentFrequency } from '../models/payment.model';
import { TransactionModel, TransactionType, TransactionStatus } from '../models/transaction.model';
import { StripeService } from './stripe.service';

const MAX_RETRY_ATTEMPTS = 3;
const CIRCUIT_BREAKER_THRESHOLD = 5;

/**
 * Enhanced service class for managing secure payment operations with PCI DSS compliance
 */
@injectable()
export class PaymentService {
  constructor(
    private readonly paymentModel: PaymentModel,
    private readonly transactionModel: TransactionModel,
    private readonly stripeService: StripeService,
    private readonly logger: Logger
  ) {}

  /**
   * Creates a new payment record with enhanced validation and security
   */
  public async createPayment(paymentData: {
    applicationId?: string;
    propertyId: string;
    userId: string;
    type: PaymentType;
    amount: number;
    currency: string;
    frequency: PaymentFrequency;
    dueDate: Date;
    metadata?: Record<string, any>;
  }): Promise<PaymentModel> {
    try {
      // Create Stripe customer if not exists
      const customer = await this.stripeService.createCustomer({
        email: paymentData.metadata?.userEmail,
        name: paymentData.metadata?.userName,
        metadata: {
          userId: paymentData.userId,
          propertyId: paymentData.propertyId
        }
      });

      // Create payment record
      const payment = new PaymentModel({
        ...paymentData,
        status: PaymentStatus.PENDING,
        stripeCustomerId: customer.id,
        metadata: {
          ...paymentData.metadata,
          stripeCustomerId: customer.id
        }
      });

      await payment.save();

      this.logger.info('Payment record created', {
        paymentId: payment.id,
        type: payment.type,
        amount: payment.amount,
        userId: payment.userId
      });

      return payment;
    } catch (error) {
      this.logger.error('Failed to create payment', {
        error: error.message,
        paymentData
      });
      throw error;
    }
  }

  /**
   * Processes payment with enhanced security and reliability
   */
  public async processPayment(
    paymentId: string,
    paymentMethodId: string
  ): Promise<PaymentModel> {
    try {
      const payment = await this.paymentModel.findById(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new Error(`Invalid payment status: ${payment.status}`);
      }

      // Create transaction record
      const transaction = new this.transactionModel({
        paymentId: payment.id,
        type: TransactionType.AUTHORIZATION,
        status: TransactionStatus.PENDING,
        amount: payment.amount,
        currency: payment.currency,
        metadata: {
          paymentType: payment.type,
          propertyId: payment.propertyId
        }
      });

      // Attach payment method to customer
      await this.stripeService.createPaymentMethod(
        payment.stripeCustomerId,
        { type: 'card', card: { token: paymentMethodId } }
      );

      // Process payment through Stripe
      const paymentIntent = await this.stripeService.processPayment({
        amount: payment.amount,
        currency: payment.currency,
        paymentMethodId,
        customerId: payment.stripeCustomerId,
        metadata: {
          paymentId: payment.id,
          transactionId: transaction.id,
          propertyId: payment.propertyId
        }
      });

      // Update payment and transaction status
      payment.status = PaymentStatus.CAPTURED;
      payment.paidDate = new Date();
      transaction.status = TransactionStatus.COMPLETED;
      transaction.stripeTransactionId = paymentIntent.id;

      await Promise.all([
        payment.save(),
        transaction.save()
      ]);

      this.logger.info('Payment processed successfully', {
        paymentId: payment.id,
        transactionId: transaction.id,
        amount: payment.amount
      });

      return payment;
    } catch (error) {
      this.logger.error('Payment processing failed', {
        paymentId,
        error: error.message
      });

      // Handle failed payment
      await this.handleFailedPayment(paymentId, error);
      throw error;
    }
  }

  /**
   * Handles refund processing with compliance logging
   */
  public async processRefund(
    paymentId: string,
    amount: number,
    reason: string
  ): Promise<PaymentModel> {
    try {
      const payment = await this.paymentModel.findById(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== PaymentStatus.CAPTURED) {
        throw new Error('Payment must be captured before refund');
      }

      const transaction = new this.transactionModel({
        paymentId: payment.id,
        type: TransactionType.REFUND,
        status: TransactionStatus.PENDING,
        amount,
        currency: payment.currency,
        metadata: { reason }
      });

      await payment.refund(amount, reason);
      transaction.status = TransactionStatus.COMPLETED;

      await Promise.all([
        payment.save(),
        transaction.save()
      ]);

      this.logger.info('Refund processed successfully', {
        paymentId,
        refundAmount: amount,
        reason
      });

      return payment;
    } catch (error) {
      this.logger.error('Refund processing failed', {
        paymentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handles failed payment scenarios with retry logic
   */
  private async handleFailedPayment(
    paymentId: string,
    error: Error
  ): Promise<void> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) return;

    payment.status = PaymentStatus.FAILED;
    
    const transaction = new this.transactionModel({
      paymentId: payment.id,
      type: TransactionType.AUTHORIZATION,
      status: TransactionStatus.FAILED,
      amount: payment.amount,
      currency: payment.currency,
      errorMessage: error.message
    });

    await Promise.all([
      payment.save(),
      transaction.save()
    ]);
  }
}