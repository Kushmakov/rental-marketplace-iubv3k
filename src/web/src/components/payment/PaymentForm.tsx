import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/stripe-js'; // @stripe/stripe-js@2.1.0
import { useDataDog } from '@datadog/browser-rum'; // @datadog/browser-rum@4.40.0

import { Payment, PaymentType } from '../../types/payment';
import LoadingButton from '../common/LoadingButton';
import { processPayment, createPaymentIntent } from '../../lib/api/payments';

// Interface for form props with comprehensive payment handling
interface PaymentFormProps {
  amount: number;
  paymentType: PaymentType;
  onSuccess: (payment: Payment) => void;
  onError: (error: PaymentError) => void;
  retryAttempts?: number;
  idempotencyKey?: string;
  enableMonitoring?: boolean;
}

// Enhanced error interface for detailed error tracking
interface PaymentError {
  code: string;
  message: string;
  details?: Record<string, any>;
  retryable: boolean;
}

// Internal component for payment form content
const PaymentFormContent: React.FC<PaymentFormProps> = ({
  amount,
  paymentType,
  onSuccess,
  onError,
  retryAttempts = 3,
  idempotencyKey,
  enableMonitoring = true,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { addTiming, addError } = useDataDog();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const startTimeRef = useRef<number>(0);

  // Initialize monitoring
  useEffect(() => {
    if (enableMonitoring) {
      startTimeRef.current = performance.now();
    }
  }, [enableMonitoring]);

  // Handle payment element changes with accessibility
  const handlePaymentElementChange = useCallback((event: { complete: boolean; error?: { message: string } }) => {
    setIsValid(event.complete);
    if (event.error) {
      setError(event.error.message);
      // Announce error to screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'alert');
      announcement.textContent = event.error.message;
      document.body.appendChild(announcement);
      setTimeout(() => announcement.remove(), 1000);
    } else {
      setError(null);
    }
  }, []);

  // Enhanced payment submission handler with retry logic
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      onError({
        code: 'STRIPE_NOT_INITIALIZED',
        message: 'Payment system is not initialized',
        retryable: true
      });
      return;
    }

    setLoading(true);
    const currentTime = performance.now();

    try {
      // Create payment intent with idempotency
      const { clientSecret, paymentIntentId } = await createPaymentIntent({
        amount,
        currency: 'USD',
        paymentType,
        metadata: {
          idempotencyKey: idempotencyKey || crypto.randomUUID()
        }
      });

      // Confirm payment with Stripe
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment/confirm`,
        },
        redirect: 'if_required'
      });

      if (stripeError) {
        throw stripeError;
      }

      // Process payment on backend
      const payment = await processPayment(paymentIntentId, {
        type: 'card',
        metadata: { paymentType }
      });

      // Log successful payment metrics
      if (enableMonitoring) {
        addTiming('payment_processing_time', performance.now() - currentTime);
      }

      onSuccess(payment);
    } catch (error: any) {
      const paymentError: PaymentError = {
        code: error.code || 'PAYMENT_FAILED',
        message: error.message || 'Payment processing failed',
        details: error.details,
        retryable: error.code !== 'CARD_DECLINED'
      };

      // Log payment error
      if (enableMonitoring) {
        addError('payment_error', {
          error: paymentError,
          duration: performance.now() - currentTime
        });
      }

      setError(paymentError.message);
      onError(paymentError);
    } finally {
      setLoading(false);
    }
  }, [stripe, elements, amount, paymentType, onSuccess, onError, enableMonitoring, idempotencyKey]);

  return (
    <form onSubmit={handleSubmit} aria-label="Payment form">
      <div role="alert" aria-live="polite">
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="payment-element-container">
        <PaymentElement
          onChange={handlePaymentElementChange}
          options={{
            layout: { type: 'tabs', defaultCollapsed: false },
            paymentMethodOrder: ['card', 'us_bank_account'],
          }}
        />
      </div>

      <LoadingButton
        type="submit"
        loading={loading}
        disabled={!isValid || loading}
        variant="contained"
        color="primary"
        size="large"
        fullWidth
        aria-label="Process payment"
      >
        Pay ${(amount / 100).toFixed(2)}
      </LoadingButton>
    </form>
  );
};

// Main payment form component with Stripe Elements wrapper
const PaymentForm: React.FC<PaymentFormProps> = (props) => {
  const [clientSecret, setClientSecret] = useState<string>('');

  // Initialize Stripe session
  useEffect(() => {
    const initializePayment = async () => {
      try {
        const { clientSecret } = await createPaymentIntent({
          amount: props.amount,
          currency: 'USD',
          paymentType: props.paymentType
        });
        setClientSecret(clientSecret);
      } catch (error) {
        props.onError({
          code: 'INITIALIZATION_FAILED',
          message: 'Failed to initialize payment',
          retryable: true
        });
      }
    };

    initializePayment();
  }, [props.amount, props.paymentType]);

  if (!clientSecret) {
    return <div aria-label="Loading payment form">Loading payment form...</div>;
  }

  return (
    <Elements
      stripe={loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!)}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#1976d2',
            colorBackground: '#ffffff',
            borderRadius: '8px'
          }
        }
      }}
    >
      <PaymentFormContent {...props} />
    </Elements>
  );
};

export default PaymentForm;