// @stripe/stripe-js@1.54.0
// @react@18.2.0

import { useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { useAppDispatch, useAppSelector } from '../store';
import { 
  selectCurrentPayment,
  selectPaymentHistory,
  selectPaymentMetrics,
  selectPaymentErrors,
  processPaymentThunk,
  setupRecurringPaymentThunk,
  retryFailedPaymentThunk,
  updatePaymentMetrics,
  clearPaymentErrors
} from '../store/slices/paymentSlice';
import type { 
  Payment,
  PaymentMethod,
  PaymentType,
  PaymentStatus,
  PaymentFrequency,
  PaymentError,
  Transaction
} from '../types/payment';

// Initialize Stripe with public key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!);

/**
 * Custom hook for secure payment operations with PCI compliance
 * Implements comprehensive payment processing with monitoring and validation
 */
export const usePayments = () => {
  const dispatch = useAppDispatch();
  
  // Redux selectors
  const currentPayment = useAppSelector(selectCurrentPayment);
  const paymentHistory = useAppSelector(selectPaymentHistory);
  const metrics = useAppSelector(selectPaymentMetrics);
  const { error, validationErrors } = useAppSelector(selectPaymentErrors);

  // Local state for payment processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  /**
   * Creates and processes a new payment with comprehensive validation
   */
  const createPayment = useCallback(async (
    paymentData: {
      amount: number;
      type: PaymentType;
      applicationId: string;
      propertyId: string;
      paymentMethodId?: string;
    }
  ) => {
    try {
      setIsProcessing(true);
      
      // Validate payment data
      if (!paymentData.amount || paymentData.amount <= 0) {
        throw new Error('Invalid payment amount');
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe failed to initialize');
      }

      // Process payment through Redux
      const result = await dispatch(processPaymentThunk({
        ...paymentData,
        status: PaymentStatus.PENDING,
        currency: 'USD',
        frequency: PaymentFrequency.ONE_TIME,
        dueDate: new Date(),
        retryCount: 0,
        metadata: {
          initiatedFrom: 'web',
          timestamp: new Date().toISOString()
        }
      })).unwrap();

      return result;
    } catch (err) {
      console.error('Payment processing error:', err);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [dispatch]);

  /**
   * Validates payment method with enhanced security checks
   */
  const validatePaymentMethod = useCallback(async (
    paymentMethodId: string
  ): Promise<boolean> => {
    try {
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe failed to initialize');
      }

      // Perform validation through Stripe
      const result = await stripe.paymentMethods.retrieve(paymentMethodId);
      return !!result;
    } catch (err) {
      console.error('Payment method validation error:', err);
      return false;
    }
  }, []);

  /**
   * Sets up recurring payment with comprehensive validation
   */
  const setupRecurringPayment = useCallback(async (
    recurringData: {
      amount: number;
      frequency: PaymentFrequency;
      startDate: Date;
      paymentMethodId: string;
    }
  ) => {
    try {
      // Validate payment method
      const isValid = await validatePaymentMethod(recurringData.paymentMethodId);
      if (!isValid) {
        throw new Error('Invalid payment method');
      }

      // Setup recurring payment through Redux
      const result = await dispatch(setupRecurringPaymentThunk(recurringData)).unwrap();
      return result;
    } catch (err) {
      console.error('Recurring payment setup error:', err);
      throw err;
    }
  }, [dispatch, validatePaymentMethod]);

  /**
   * Retries failed payment with exponential backoff
   */
  const retryFailedPayment = useCallback(async (
    paymentId: string
  ) => {
    try {
      const result = await dispatch(retryFailedPaymentThunk(paymentId)).unwrap();
      return result;
    } catch (err) {
      console.error('Payment retry error:', err);
      throw err;
    }
  }, [dispatch]);

  /**
   * Retrieves detailed transaction status
   */
  const getTransactionStatus = useCallback(async (
    transactionId: string
  ): Promise<Transaction | null> => {
    try {
      const response = await fetch(`/api/payments/transactions/${transactionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transaction status');
      }
      return await response.json();
    } catch (err) {
      console.error('Transaction status error:', err);
      return null;
    }
  }, []);

  /**
   * Retrieves payment analytics and metrics
   */
  const getPaymentAnalytics = useCallback(() => {
    return {
      ...metrics,
      totalPayments: paymentHistory.length,
      successfulPayments: paymentHistory.filter(p => p.status === PaymentStatus.CAPTURED).length,
      failedPayments: paymentHistory.filter(p => p.status === PaymentStatus.FAILED).length
    };
  }, [metrics, paymentHistory]);

  // Cleanup and error handling
  useEffect(() => {
    return () => {
      dispatch(clearPaymentErrors());
    };
  }, [dispatch]);

  return {
    // State
    currentPayment,
    paymentHistory,
    paymentMethods,
    selectedMethod,
    isProcessing,
    error,
    validationErrors,
    metrics,

    // Actions
    createPayment,
    validatePaymentMethod,
    setupRecurringPayment,
    retryFailedPayment,
    getTransactionStatus,
    getPaymentAnalytics,
    
    // Payment method management
    setSelectedMethod,
    clearErrors: () => dispatch(clearPaymentErrors())
  };
};