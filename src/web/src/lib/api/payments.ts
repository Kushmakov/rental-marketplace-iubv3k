// @stripe/stripe-js v2.1.0
import { Stripe, loadStripe } from '@stripe/stripe-js';
// @datadog/browser-logs v4.19.1
import { datadogLogs } from '@datadog/browser-logs';
// zod v3.22.2
import { z } from 'zod';

import axiosInstance from '../axios';
import { Payment, PaymentType, PaymentStatus, PaymentFrequency } from '../../types/payment';

// Initialize Stripe with public key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!);

// Validation schemas
const paymentDataSchema = z.object({
  amount: z.number().positive(),
  type: z.nativeEnum(PaymentType),
  applicationId: z.string().uuid().optional(),
  propertyId: z.string().uuid(),
  frequency: z.nativeEnum(PaymentFrequency).default(PaymentFrequency.ONE_TIME),
  metadata: z.record(z.any()).optional(),
  idempotencyKey: z.string().optional()
});

const paymentMethodSchema = z.object({
  type: z.string(),
  card: z.object({
    number: z.string(),
    expMonth: z.number(),
    expYear: z.number(),
    cvc: z.string()
  }).optional(),
  bankAccount: z.object({
    accountNumber: z.string(),
    routingNumber: z.string()
  }).optional()
});

const recurringPaymentSchema = z.object({
  frequency: z.nativeEnum(PaymentFrequency),
  startDate: z.date(),
  endDate: z.date().optional(),
  retryConfig: z.object({
    maxAttempts: z.number().min(1).max(5),
    retryInterval: z.number().min(1).max(7)
  }).optional()
});

/**
 * Creates a new payment record with comprehensive validation
 * @param paymentData Payment creation data
 * @returns Promise<Payment>
 */
export const createPayment = async (paymentData: z.infer<typeof paymentDataSchema>): Promise<Payment> => {
  try {
    // Validate payment data
    const validatedData = paymentDataSchema.parse(paymentData);

    // Generate idempotency key if not provided
    const idempotencyKey = validatedData.idempotencyKey || crypto.randomUUID();

    datadogLogs.logger.info('Creating payment', {
      paymentType: validatedData.type,
      amount: validatedData.amount,
      idempotencyKey
    });

    const response = await axiosInstance.post<Payment>('/payments', validatedData, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });

    datadogLogs.logger.info('Payment created successfully', {
      paymentId: response.data.id,
      status: response.data.status
    });

    return response.data;
  } catch (error) {
    datadogLogs.logger.error('Payment creation failed', { error });
    throw error;
  }
};

/**
 * Processes a payment using Stripe payment intent
 * @param paymentId Payment ID to process
 * @param paymentMethodData Stripe payment method details
 * @returns Promise<Payment>
 */
export const processPayment = async (
  paymentId: string,
  paymentMethodData: z.infer<typeof paymentMethodSchema>
): Promise<Payment> => {
  try {
    // Validate payment method data
    const validatedMethodData = paymentMethodSchema.parse(paymentMethodData);
    
    const stripe = await stripePromise;
    if (!stripe) throw new Error('Stripe failed to initialize');

    datadogLogs.logger.info('Processing payment', { paymentId });

    // Create payment intent
    const { data: paymentIntent } = await axiosInstance.post(`/payments/${paymentId}/intent`, {
      paymentMethodData: validatedMethodData
    });

    // Confirm payment with Stripe
    const result = await stripe.confirmCardPayment(paymentIntent.clientSecret, {
      payment_method: validatedMethodData
    });

    if (result.error) {
      datadogLogs.logger.error('Payment processing failed', {
        paymentId,
        error: result.error
      });
      throw result.error;
    }

    // Update payment status
    const response = await axiosInstance.post<Payment>(`/payments/${paymentId}/confirm`, {
      stripePaymentIntentId: result.paymentIntent.id
    });

    datadogLogs.logger.info('Payment processed successfully', {
      paymentId,
      status: response.data.status
    });

    return response.data;
  } catch (error) {
    datadogLogs.logger.error('Payment processing failed', { paymentId, error });
    throw error;
  }
};

/**
 * Sets up secure recurring payments
 * @param paymentId Payment ID to set up recurring
 * @param recurringPaymentData Recurring payment configuration
 * @returns Promise<Payment>
 */
export const setupRecurringPayment = async (
  paymentId: string,
  recurringPaymentData: z.infer<typeof recurringPaymentSchema>
): Promise<Payment> => {
  try {
    // Validate recurring payment data
    const validatedData = recurringPaymentSchema.parse(recurringPaymentData);

    datadogLogs.logger.info('Setting up recurring payment', {
      paymentId,
      frequency: validatedData.frequency
    });

    const response = await axiosInstance.post<Payment>(
      `/payments/${paymentId}/recurring`,
      validatedData
    );

    datadogLogs.logger.info('Recurring payment setup successful', {
      paymentId,
      frequency: response.data.frequency
    });

    return response.data;
  } catch (error) {
    datadogLogs.logger.error('Recurring payment setup failed', { paymentId, error });
    throw error;
  }
};

/**
 * Processes payment refunds
 * @param paymentId Payment ID to refund
 * @param refundData Refund details
 * @returns Promise<Payment>
 */
export const refundPayment = async (
  paymentId: string,
  refundData: { amount: number; reason: string }
): Promise<Payment> => {
  try {
    datadogLogs.logger.info('Processing refund', {
      paymentId,
      amount: refundData.amount
    });

    const response = await axiosInstance.post<Payment>(
      `/payments/${paymentId}/refund`,
      refundData,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() }
      }
    );

    datadogLogs.logger.info('Refund processed successfully', {
      paymentId,
      status: response.data.status
    });

    return response.data;
  } catch (error) {
    datadogLogs.logger.error('Refund processing failed', { paymentId, error });
    throw error;
  }
};

/**
 * Retrieves paginated payment history
 * @param filters Optional filters for payment history
 * @returns Promise<Payment[]>
 */
export const getPaymentHistory = async (filters?: {
  startDate?: Date;
  endDate?: Date;
  status?: PaymentStatus;
  type?: PaymentType;
  page?: number;
  limit?: number;
}): Promise<{ payments: Payment[]; total: number; page: number; totalPages: number }> => {
  try {
    const response = await axiosInstance.get<{
      payments: Payment[];
      total: number;
      page: number;
      totalPages: number;
    }>('/payments', {
      params: {
        ...filters,
        startDate: filters?.startDate?.toISOString(),
        endDate: filters?.endDate?.toISOString(),
        page: filters?.page || 1,
        limit: filters?.limit || 20
      }
    });

    return response.data;
  } catch (error) {
    datadogLogs.logger.error('Payment history retrieval failed', { error });
    throw error;
  }
};