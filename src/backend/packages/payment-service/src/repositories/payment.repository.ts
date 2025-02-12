import { injectable } from 'inversify';
import { Logger } from 'winston';
import { Model } from 'mongoose';
import { DistributedLock } from 'redis-lock';
import { CacheService } from 'node-cache-manager';
import { PaymentModel, PaymentStatus, PaymentType } from '../models/payment.model';
import { TransactionModel, TransactionType, TransactionStatus } from '../models/transaction.model';

/**
 * Enhanced repository class for secure payment processing with PCI compliance
 * Supports high-volume transactions and comprehensive audit logging
 */
@injectable()
export class PaymentRepository {
  private static readonly CACHE_TTL = 300; // 5 minutes
  private static readonly LOCK_TTL = 30000; // 30 seconds
  private static readonly BULK_BATCH_SIZE = 100;

  constructor(
    private readonly logger: Logger,
    private readonly cacheService: CacheService,
    private readonly lockService: DistributedLock
  ) {
    this.logger.info('PaymentRepository initialized with enhanced security features');
  }

  /**
   * Creates a new payment with enhanced security and PCI compliance
   */
  public async createPayment(paymentData: Partial<PaymentModel>): Promise<PaymentModel> {
    const lockKey = `payment:create:${paymentData.userId}`;

    try {
      await this.lockService.acquire(lockKey, PaymentRepository.LOCK_TTL);
      
      this.logger.debug('Creating new payment', { 
        userId: paymentData.userId,
        amount: paymentData.amount,
        type: paymentData.type
      });

      const payment = new PaymentModel(paymentData);
      await payment.encryptSensitiveData();
      
      const savedPayment = await payment.save();
      
      // Create associated transaction record
      const transaction = new TransactionModel({
        paymentId: savedPayment.id,
        type: TransactionType.AUTHORIZATION,
        status: TransactionStatus.PENDING,
        amount: paymentData.amount,
        currency: paymentData.currency
      });
      await transaction.save();

      await this.cacheService.set(
        `payment:${savedPayment.id}`,
        savedPayment,
        PaymentRepository.CACHE_TTL
      );

      this.logger.info('Payment created successfully', { paymentId: savedPayment.id });
      return savedPayment;

    } catch (error) {
      this.logger.error('Failed to create payment', {
        error: error.message,
        userId: paymentData.userId
      });
      throw error;
    } finally {
      await this.lockService.release(lockKey);
    }
  }

  /**
   * Efficiently processes multiple payments in batches
   */
  public async bulkCreatePayments(paymentsData: Partial<PaymentModel>[]): Promise<PaymentModel[]> {
    if (!paymentsData.length) {
      return [];
    }

    this.logger.debug('Starting bulk payment creation', { 
      count: paymentsData.length 
    });

    const results: PaymentModel[] = [];
    const batches = this.chunkArray(paymentsData, PaymentRepository.BULK_BATCH_SIZE);

    for (const batch of batches) {
      try {
        const paymentPromises = batch.map(async (paymentData) => {
          const payment = new PaymentModel(paymentData);
          await payment.encryptSensitiveData();
          return payment;
        });

        const payments = await Promise.all(paymentPromises);
        const savedPayments = await PaymentModel.insertMany(payments, { ordered: false });

        // Create transactions in bulk
        const transactions = savedPayments.map(payment => ({
          paymentId: payment.id,
          type: TransactionType.AUTHORIZATION,
          status: TransactionStatus.PENDING,
          amount: payment.amount,
          currency: payment.currency
        }));

        await TransactionModel.insertMany(transactions, { ordered: false });

        // Cache all created payments
        const cachePromises = savedPayments.map(payment =>
          this.cacheService.set(
            `payment:${payment.id}`,
            payment,
            PaymentRepository.CACHE_TTL
          )
        );
        await Promise.all(cachePromises);

        results.push(...savedPayments);

      } catch (error) {
        this.logger.error('Error in bulk payment creation batch', {
          error: error.message,
          batchSize: batch.length
        });
        throw error;
      }
    }

    this.logger.info('Bulk payment creation completed', { 
      totalCreated: results.length 
    });
    return results;
  }

  /**
   * Retrieves payment by ID with caching and security checks
   */
  public async getPaymentById(paymentId: string): Promise<PaymentModel | null> {
    try {
      // Check cache first
      const cachedPayment = await this.cacheService.get<PaymentModel>(`payment:${paymentId}`);
      if (cachedPayment) {
        this.logger.debug('Payment retrieved from cache', { paymentId });
        return cachedPayment;
      }

      // Query database if not in cache
      const payment = await PaymentModel.findById(paymentId)
        .select('-stripePaymentMethodId -stripeCustomerId') // PCI compliance
        .lean();

      if (payment) {
        await this.cacheService.set(
          `payment:${paymentId}`,
          payment,
          PaymentRepository.CACHE_TTL
        );
      }

      return payment;

    } catch (error) {
      this.logger.error('Error retrieving payment', {
        error: error.message,
        paymentId
      });
      throw error;
    }
  }

  /**
   * Updates payment status with audit logging
   */
  public async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    metadata?: Record<string, any>
  ): Promise<PaymentModel | null> {
    const lockKey = `payment:update:${paymentId}`;

    try {
      await this.lockService.acquire(lockKey, PaymentRepository.LOCK_TTL);

      const payment = await PaymentModel.findById(paymentId);
      if (!payment) {
        return null;
      }

      payment.status = status;
      if (metadata) {
        payment.metadata = { ...payment.metadata, ...metadata };
      }

      const updatedPayment = await payment.save();
      await this.cacheService.del(`payment:${paymentId}`);

      this.logger.info('Payment status updated', {
        paymentId,
        oldStatus: payment.status,
        newStatus: status
      });

      return updatedPayment;

    } finally {
      await this.lockService.release(lockKey);
    }
  }

  /**
   * Retrieves payments by user ID with pagination
   */
  public async getPaymentsByUserId(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ payments: PaymentModel[]; total: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const [payments, total] = await Promise.all([
        PaymentModel.find({ userId })
          .select('-stripePaymentMethodId -stripeCustomerId')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        PaymentModel.countDocuments({ userId })
      ]);

      return { payments, total };

    } catch (error) {
      this.logger.error('Error retrieving user payments', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Utility method to chunk array for batch processing
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export default PaymentRepository;