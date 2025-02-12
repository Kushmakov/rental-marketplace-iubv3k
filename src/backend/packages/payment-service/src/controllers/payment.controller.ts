import { injectable } from 'inversify'; // v6.x
import { 
  controller, 
  httpPost, 
  httpGet, 
  authorize,
  useInterceptor 
} from 'routing-controllers'; // v0.10.x
import { CircuitBreaker } from 'opossum'; // v6.x
import { validate } from 'class-validator'; // v0.14.x
import { PaymentSanitizer } from '@company/payment-utils'; // v1.x
import { PaymentLogger } from '@company/logging'; // v1.x

import { PaymentService } from '../services/payment.service';
import { PaymentType } from '../models/payment.model';
import { ApiResponse } from '@projectx/common';

// Circuit breaker configuration
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};

/**
 * Enhanced payment controller with PCI DSS compliance and comprehensive monitoring
 */
@injectable()
@controller('/api/v1/payments')
@useInterceptor(PaymentMonitoringInterceptor)
@useInterceptor(PaymentSecurityInterceptor)
export class PaymentController {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly paymentService: PaymentService,
    private readonly sanitizer: PaymentSanitizer,
    private readonly logger: PaymentLogger
  ) {
    this.circuitBreaker = new CircuitBreaker(
      async (fn: () => Promise<any>) => await fn(),
      CIRCUIT_BREAKER_OPTIONS
    );

    this.initializeCircuitBreakerEvents();
  }

  /**
   * Creates a new payment record with enhanced validation and security
   */
  @httpPost('/')
  @authorize()
  @validate(CreatePaymentDto)
  @useTransaction()
  public async createPayment(
    @body() paymentData: CreatePaymentDto
  ): Promise<ApiResponse<Payment>> {
    try {
      this.logger.info('Payment creation initiated', {
        type: paymentData.type,
        amount: paymentData.amount,
        userId: paymentData.userId
      });

      // Sanitize input data
      const sanitizedData = this.sanitizer.sanitizePaymentData(paymentData);

      // Additional validation for payment amount
      if (sanitizedData.amount <= 0) {
        throw new Error('Payment amount must be greater than 0');
      }

      const payment = await this.circuitBreaker.fire(async () => {
        return await this.paymentService.createPayment(sanitizedData);
      });

      this.logger.info('Payment created successfully', {
        paymentId: payment.id,
        type: payment.type,
        status: payment.status
      });

      return {
        status: 201,
        data: payment,
        message: 'Payment created successfully',
        timestamp: new Date(),
        requestId: this.generateRequestId()
      };
    } catch (error) {
      this.handlePaymentError(error, 'create_payment');
      throw error;
    }
  }

  /**
   * Processes a payment with comprehensive error handling and retry mechanism
   */
  @httpPost('/:id/process')
  @authorize()
  @validate(ProcessPaymentDto)
  @useTransaction()
  @useCircuitBreaker()
  public async processPayment(
    @param('id') id: string,
    @body() paymentMethodData: ProcessPaymentDto
  ): Promise<ApiResponse<Payment>> {
    try {
      this.logger.info('Payment processing initiated', { paymentId: id });

      // Sanitize payment method data
      const sanitizedMethodData = this.sanitizer.sanitizePaymentMethod(
        paymentMethodData
      );

      const payment = await this.circuitBreaker.fire(async () => {
        return await this.paymentService.processPayment(
          id,
          sanitizedMethodData.paymentMethodId
        );
      });

      this.logger.info('Payment processed successfully', {
        paymentId: payment.id,
        status: payment.status,
        processedAt: new Date()
      });

      return {
        status: 200,
        data: payment,
        message: 'Payment processed successfully',
        timestamp: new Date(),
        requestId: this.generateRequestId()
      };
    } catch (error) {
      this.handlePaymentError(error, 'process_payment');
      throw error;
    }
  }

  /**
   * Sets up recurring payment with validation and monitoring
   */
  @httpPost('/:id/recurring')
  @authorize()
  @validate(RecurringPaymentDto)
  @useTransaction()
  public async setupRecurringPayment(
    @param('id') id: string,
    @body() recurringData: RecurringPaymentDto
  ): Promise<ApiResponse<Payment>> {
    try {
      this.logger.info('Recurring payment setup initiated', { paymentId: id });

      const sanitizedData = this.sanitizer.sanitizeRecurringData(recurringData);

      const payment = await this.circuitBreaker.fire(async () => {
        return await this.paymentService.setupRecurringPayment(
          id,
          sanitizedData
        );
      });

      this.logger.info('Recurring payment setup completed', {
        paymentId: payment.id,
        frequency: payment.frequency
      });

      return {
        status: 200,
        data: payment,
        message: 'Recurring payment setup completed',
        timestamp: new Date(),
        requestId: this.generateRequestId()
      };
    } catch (error) {
      this.handlePaymentError(error, 'setup_recurring');
      throw error;
    }
  }

  /**
   * Retrieves payment history with pagination and filtering
   */
  @httpGet('/history')
  @authorize()
  @validate(PaymentHistoryDto)
  public async getPaymentHistory(
    @query() filters: PaymentHistoryDto
  ): Promise<ApiResponse<PaginatedResponse<Payment>>> {
    try {
      const sanitizedFilters = this.sanitizer.sanitizeFilters(filters);

      const history = await this.circuitBreaker.fire(async () => {
        return await this.paymentService.getPaymentHistory(sanitizedFilters);
      });

      return {
        status: 200,
        data: history,
        message: 'Payment history retrieved successfully',
        timestamp: new Date(),
        requestId: this.generateRequestId()
      };
    } catch (error) {
      this.handlePaymentError(error, 'get_history');
      throw error;
    }
  }

  /**
   * Processes payment refund with validation and compliance logging
   */
  @httpPost('/:id/refund')
  @authorize()
  @validate(RefundPaymentDto)
  @useTransaction()
  public async refundPayment(
    @param('id') id: string,
    @body() refundData: RefundPaymentDto
  ): Promise<ApiResponse<Payment>> {
    try {
      this.logger.info('Payment refund initiated', { 
        paymentId: id,
        amount: refundData.amount
      });

      const sanitizedData = this.sanitizer.sanitizeRefundData(refundData);

      const payment = await this.circuitBreaker.fire(async () => {
        return await this.paymentService.refundPayment(
          id,
          sanitizedData.amount,
          sanitizedData.reason
        );
      });

      this.logger.info('Payment refunded successfully', {
        paymentId: payment.id,
        refundAmount: sanitizedData.amount
      });

      return {
        status: 200,
        data: payment,
        message: 'Payment refunded successfully',
        timestamp: new Date(),
        requestId: this.generateRequestId()
      };
    } catch (error) {
      this.handlePaymentError(error, 'refund_payment');
      throw error;
    }
  }

  /**
   * Initializes circuit breaker event handlers
   */
  private initializeCircuitBreakerEvents(): void {
    this.circuitBreaker.on('open', () => {
      this.logger.warn('Payment circuit breaker opened');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.info('Payment circuit breaker half-opened');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.info('Payment circuit breaker closed');
    });
  }

  /**
   * Handles payment-related errors with enhanced logging
   */
  private handlePaymentError(error: any, operation: string): void {
    this.logger.error('Payment operation failed', {
      operation,
      errorType: error.name,
      errorMessage: error.message,
      timestamp: new Date()
    });
  }

  /**
   * Generates unique request identifier for tracing
   */
  private generateRequestId(): string {
    return `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * DTOs for payment operations with validation rules
 */
class CreatePaymentDto {
  @IsNotEmpty()
  @IsString()
  propertyId: string;

  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsEnum(PaymentType)
  type: PaymentType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

class ProcessPaymentDto {
  @IsNotEmpty()
  @IsString()
  paymentMethodId: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

class RecurringPaymentDto {
  @IsNotEmpty()
  @IsEnum(PaymentFrequency)
  frequency: PaymentFrequency;

  @IsDate()
  startDate: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;
}

class RefundPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

class PaymentHistoryDto {
  @IsOptional()
  @IsEnum(PaymentType)
  type?: PaymentType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}