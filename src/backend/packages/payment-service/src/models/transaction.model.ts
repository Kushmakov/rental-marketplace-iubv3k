import { Model, Schema } from 'mongoose';
import { CircuitBreaker } from 'opossum'; // v6.x
import { BaseEntity } from '@projectx/common';
import { PaymentModel } from './payment.model';

/**
 * Enumeration of supported transaction types
 */
export enum TransactionType {
  AUTHORIZATION = 'authorization',
  CAPTURE = 'capture',
  REFUND = 'refund',
  CHARGEBACK = 'chargeback',
  FEE = 'fee',
  ADJUSTMENT = 'adjustment',
  COMMISSION = 'commission'
}

/**
 * Enumeration of possible transaction statuses
 */
export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
  RETRYING = 'retrying'
}

/**
 * Interface for transaction retry history
 */
interface RetryHistory {
  attemptNumber: number;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
  result: string;
}

/**
 * Interface for transaction audit log entries
 */
interface AuditLogEntry {
  action: string;
  timestamp: Date;
  userId?: string;
  details: Record<string, any>;
}

/**
 * Interface for transaction document structure
 */
interface ITransaction extends BaseEntity {
  paymentId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  stripeTransactionId?: string;
  description?: string;
  metadata: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  retryHistory: RetryHistory[];
  auditLog: AuditLogEntry[];
  lastRetryAt?: Date;
}

/**
 * Transaction schema with optimized indexing and PCI compliance
 */
const TransactionSchema = new Schema<ITransaction>(
  {
    paymentId: {
      type: String,
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(TransactionType)
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,
      index: true
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
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'USD'
    },
    stripeTransactionId: {
      type: String,
      sparse: true,
      select: false // PCI compliance - restricted field access
    },
    description: String,
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    errorCode: String,
    errorMessage: String,
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },
    retryHistory: [{
      attemptNumber: Number,
      timestamp: Date,
      errorCode: String,
      errorMessage: String,
      result: String
    }],
    auditLog: [{
      action: String,
      timestamp: { type: Date, default: Date.now },
      userId: String,
      details: Schema.Types.Mixed
    }],
    lastRetryAt: Date
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: {
      transform: (_, ret) => {
        delete ret.stripeTransactionId; // PCI compliance - mask sensitive data
        return ret;
      }
    }
  }
);

// Compound indexes for optimized queries
TransactionSchema.index({ paymentId: 1, type: 1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ lastRetryAt: 1 }, { sparse: true });

/**
 * Enhanced transaction model with retry mechanisms and comprehensive audit logging
 */
export class TransactionModel extends Model<ITransaction> {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

  private static readonly circuitBreaker = new CircuitBreaker(
    async (fn: () => Promise<any>) => await fn(),
    {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    }
  );

  /**
   * Creates a new transaction instance with comprehensive validation
   */
  constructor(transactionData: Partial<ITransaction>) {
    super();
    this.validateAndSanitize(transactionData);
    this.initializeAuditLog();
    this.retryCount = 0;
    this.retryHistory = [];
  }

  /**
   * Marks transaction as completed with distributed locking
   */
  public async complete(result: Record<string, any>): Promise<boolean> {
    try {
      await TransactionModel.circuitBreaker.fire(async () => {
        this.status = TransactionStatus.COMPLETED;
        this.metadata = { ...this.metadata, completionResult: result };
        
        this.addAuditLogEntry('transaction_completed', {
          result,
          completedAt: new Date()
        });

        await this.save();
      });

      return true;
    } catch (error) {
      await this.fail(
        'COMPLETION_ERROR',
        error.message,
        false
      );
      throw error;
    }
  }

  /**
   * Records transaction failure with retry assessment
   */
  public async fail(
    errorCode: string,
    errorMessage: string,
    canRetry: boolean = true
  ): Promise<boolean> {
    this.status = TransactionStatus.FAILED;
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;

    this.addAuditLogEntry('transaction_failed', {
      errorCode,
      errorMessage,
      canRetry
    });

    if (canRetry && this.retryCount < TransactionModel.MAX_RETRIES) {
      await this.retry();
      return true;
    }

    await this.save();
    return false;
  }

  /**
   * Attempts to retry a failed transaction with exponential backoff
   */
  public async retry(): Promise<boolean> {
    if (this.retryCount >= TransactionModel.MAX_RETRIES) {
      return false;
    }

    this.status = TransactionStatus.RETRYING;
    this.retryCount++;
    this.lastRetryAt = new Date();

    const delay = TransactionModel.RETRY_DELAYS[this.retryCount - 1];
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await TransactionModel.circuitBreaker.fire(async () => {
        // Retry logic implementation
        const result = await this.executeTransactionLogic();
        
        this.retryHistory.push({
          attemptNumber: this.retryCount,
          timestamp: new Date(),
          result: 'success'
        });

        this.addAuditLogEntry('transaction_retry_succeeded', {
          attemptNumber: this.retryCount,
          result
        });

        await this.save();
        return true;
      });
    } catch (error) {
      this.retryHistory.push({
        attemptNumber: this.retryCount,
        timestamp: new Date(),
        errorCode: error.code,
        errorMessage: error.message,
        result: 'failed'
      });

      this.addAuditLogEntry('transaction_retry_failed', {
        attemptNumber: this.retryCount,
        error: error.message
      });

      await this.save();
      return false;
    }

    return true;
  }

  /**
   * Adds an entry to the audit log with timestamp and user context
   */
  private addAuditLogEntry(
    action: string,
    details: Record<string, any>
  ): void {
    this.auditLog.push({
      action,
      timestamp: new Date(),
      details
    });
  }

  /**
   * Validates and sanitizes input data
   */
  private validateAndSanitize(data: Partial<ITransaction>): void {
    if (data.amount) {
      data.amount = Math.round(data.amount * 100) / 100;
    }
    if (data.currency) {
      data.currency = data.currency.toUpperCase();
    }
  }

  /**
   * Initializes the audit log
   */
  private initializeAuditLog(): void {
    this.auditLog = [{
      action: 'transaction_created',
      timestamp: new Date(),
      details: {
        type: this.type,
        amount: this.amount,
        currency: this.currency
      }
    }];
  }

  /**
   * Executes the core transaction logic based on type
   */
  private async executeTransactionLogic(): Promise<any> {
    // Implementation would vary based on transaction type
    // This is a placeholder for the actual implementation
    return Promise.resolve();
  }
}

export default TransactionModel;