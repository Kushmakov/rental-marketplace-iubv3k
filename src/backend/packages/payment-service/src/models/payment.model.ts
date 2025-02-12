import { Model, Schema, model } from 'mongoose';
import Stripe from 'stripe'; // v12.x
import { BaseEntity } from '@projectx/common';
import { EncryptionService } from '@projectx/security'; // v1.x

/**
 * Enumeration of supported payment types
 */
export enum PaymentType {
  APPLICATION_FEE = 'application_fee',
  SECURITY_DEPOSIT = 'security_deposit',
  RENT = 'rent',
  LATE_FEE = 'late_fee'
}

/**
 * Enumeration of possible payment statuses
 */
export enum PaymentStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

/**
 * Enumeration of supported payment frequencies
 */
export enum PaymentFrequency {
  ONE_TIME = 'one_time',
  MONTHLY = 'monthly',
  BI_WEEKLY = 'bi_weekly',
  WEEKLY = 'weekly'
}

/**
 * Interface defining the payment document structure
 */
export interface IPayment extends BaseEntity {
  applicationId?: string;
  propertyId: string;
  userId: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  currency: string;
  frequency: PaymentFrequency;
  stripePaymentMethodId: string;
  stripeCustomerId: string;
  dueDate: Date;
  paidDate?: Date;
  metadata: Record<string, any>;
  idempotencyKey: string;
  auditLog: Array<{
    action: string;
    timestamp: Date;
    details: Record<string, any>;
  }>;
}

/**
 * Payment schema with optimistic concurrency and comprehensive indexing
 */
const PaymentSchema = new Schema<IPayment>(
  {
    applicationId: { type: String, sparse: true },
    propertyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    type: { 
      type: String, 
      required: true, 
      enum: Object.values(PaymentType)
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v: number) => v > 0,
        message: 'Amount must be greater than 0'
      }
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      minlength: 3,
      maxlength: 3
    },
    frequency: {
      type: String,
      required: true,
      enum: Object.values(PaymentFrequency),
      default: PaymentFrequency.ONE_TIME
    },
    stripePaymentMethodId: {
      type: String,
      required: true,
      select: false // PCI compliance - restricted field access
    },
    stripeCustomerId: {
      type: String,
      required: true,
      select: false // PCI compliance - restricted field access
    },
    dueDate: {
      type: Date,
      required: true,
      index: true
    },
    paidDate: {
      type: Date,
      sparse: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true
    },
    auditLog: [{
      action: String,
      timestamp: { type: Date, default: Date.now },
      details: Schema.Types.Mixed
    }]
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: {
      transform: (_, ret) => {
        delete ret.stripePaymentMethodId;
        delete ret.stripeCustomerId;
        return ret;
      }
    }
  }
);

// Compound indexes for optimized queries
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ propertyId: 1, status: 1 });
PaymentSchema.index({ dueDate: 1, status: 1 });

/**
 * Enhanced payment model with PCI compliance and high-volume processing capabilities
 */
export class PaymentModel extends Model<IPayment> {
  private static readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16',
    typescript: true
  });

  private static readonly encryptionService = new EncryptionService();

  /**
   * Creates a new payment instance with enhanced validation and encryption
   */
  constructor(paymentData: Partial<IPayment>) {
    super();
    this.validateAndSanitize(paymentData);
    this.idempotencyKey = this.generateIdempotencyKey();
    this.encryptSensitiveData();
    this.initializeAuditLog();
  }

  /**
   * Authorizes payment with enhanced error handling and retry logic
   */
  public async authorize(
    paymentMethodId: string,
    options: { retryAttempts?: number } = {}
  ): Promise<boolean> {
    try {
      const retryAttempts = options.retryAttempts || 3;
      
      for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        try {
          const paymentIntent = await PaymentModel.stripe.paymentIntents.create({
            amount: this.amount * 100, // Convert to cents
            currency: this.currency.toLowerCase(),
            payment_method: paymentMethodId,
            customer: this.stripeCustomerId,
            confirm: true,
            metadata: {
              paymentId: this.id,
              propertyId: this.propertyId,
              userId: this.userId
            },
            idempotency_key: this.idempotencyKey
          });

          this.status = PaymentStatus.AUTHORIZED;
          this.addAuditLogEntry('payment_authorized', { paymentIntentId: paymentIntent.id });
          await this.save();
          
          return true;
        } catch (error) {
          if (attempt === retryAttempts) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    } catch (error) {
      this.status = PaymentStatus.FAILED;
      this.addAuditLogEntry('payment_authorization_failed', { error: error.message });
      await this.save();
      throw error;
    }
    return false;
  }

  /**
   * Captures authorized payment with transaction logging
   */
  public async capture(options: { amount?: number } = {}): Promise<boolean> {
    if (this.status !== PaymentStatus.AUTHORIZED) {
      throw new Error('Payment must be authorized before capture');
    }

    try {
      const captureAmount = options.amount || this.amount;
      const paymentIntent = await PaymentModel.stripe.paymentIntents.capture(
        this.stripePaymentMethodId,
        {
          amount_to_capture: captureAmount * 100,
          idempotency_key: `${this.idempotencyKey}_capture`
        }
      );

      this.status = PaymentStatus.CAPTURED;
      this.paidDate = new Date();
      this.addAuditLogEntry('payment_captured', { 
        captureAmount,
        paymentIntentId: paymentIntent.id 
      });
      await this.save();

      return true;
    } catch (error) {
      this.addAuditLogEntry('payment_capture_failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Processes refunds with compliance logging
   */
  public async refund(
    amount: number,
    reason: string,
    options: { metadata?: Record<string, any> } = {}
  ): Promise<boolean> {
    if (this.status !== PaymentStatus.CAPTURED) {
      throw new Error('Only captured payments can be refunded');
    }

    try {
      const refund = await PaymentModel.stripe.refunds.create({
        payment_intent: this.stripePaymentMethodId,
        amount: amount * 100,
        reason: reason as Stripe.RefundCreateParams.Reason,
        metadata: {
          ...options.metadata,
          originalPaymentId: this.id
        },
        idempotency_key: `${this.idempotencyKey}_refund`
      });

      this.status = PaymentStatus.REFUNDED;
      this.addAuditLogEntry('payment_refunded', {
        refundId: refund.id,
        amount,
        reason
      });
      await this.save();

      return true;
    } catch (error) {
      this.addAuditLogEntry('payment_refund_failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Adds an entry to the audit log with timestamp
   */
  private addAuditLogEntry(action: string, details: Record<string, any>): void {
    this.auditLog.push({
      action,
      timestamp: new Date(),
      details
    });
  }

  /**
   * Generates a unique idempotency key
   */
  private generateIdempotencyKey(): string {
    return `${this.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Encrypts sensitive payment data
   */
  private encryptSensitiveData(): void {
    if (this.stripePaymentMethodId) {
      this.stripePaymentMethodId = PaymentModel.encryptionService.encrypt(
        this.stripePaymentMethodId
      );
    }
    if (this.stripeCustomerId) {
      this.stripeCustomerId = PaymentModel.encryptionService.encrypt(
        this.stripeCustomerId
      );
    }
  }

  /**
   * Validates and sanitizes input data
   */
  private validateAndSanitize(data: Partial<IPayment>): void {
    if (data.amount) {
      data.amount = Math.round(data.amount * 100) / 100;
    }
    if (data.currency) {
      data.currency = data.currency.toUpperCase();
    }
  }
}

export const Payment = model<IPayment>('Payment', PaymentSchema);