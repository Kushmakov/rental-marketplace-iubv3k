import { loadStripe, Stripe, StripeElements, StripeError } from '@stripe/stripe-js';
import { PaymentType } from '../types/payment';
import * as Sentry from '@sentry/browser';

// Environment variables and constants
const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_KEY;
const STRIPE_API_VERSION = '2023-10-16';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Singleton instance
let stripeInstance: Stripe | null = null;

/**
 * Initializes and returns a Stripe instance with error handling and monitoring
 * @returns Promise<Stripe | null> Initialized Stripe instance or null if initialization fails
 */
export const initializeStripe = async (): Promise<Stripe | null> => {
  try {
    if (!STRIPE_PUBLIC_KEY) {
      throw new Error('Stripe public key is not configured');
    }

    Sentry.addBreadcrumb({
      category: 'stripe',
      message: 'Initializing Stripe instance',
      level: 'info',
    });

    if (!stripeInstance) {
      const startTime = performance.now();
      stripeInstance = await loadStripe(STRIPE_PUBLIC_KEY, {
        apiVersion: STRIPE_API_VERSION,
      });
      const loadTime = performance.now() - startTime;

      Sentry.captureMessage('Stripe initialization time', {
        level: 'info',
        extra: { loadTimeMs: loadTime },
      });
    }

    return stripeInstance;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { action: 'stripe_initialization' },
    });
    return null;
  }
};

/**
 * Creates a payment intent with retry logic and monitoring
 */
export const createPaymentIntent = async ({
  amount,
  currency,
  paymentType,
  metadata = {},
}: {
  amount: number;
  currency: string;
  paymentType: PaymentType;
  metadata?: Record<string, string>;
}): Promise<{ clientSecret: string; paymentIntentId: string }> => {
  let attempts = 0;

  while (attempts < MAX_RETRY_ATTEMPTS) {
    try {
      const startTime = performance.now();
      
      const response = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          paymentType,
          metadata: {
            ...metadata,
            paymentType,
          },
        }),
      });

      const endTime = performance.now();
      Sentry.addBreadcrumb({
        category: 'stripe',
        message: 'Payment intent creation time',
        data: { durationMs: endTime - startTime },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId,
      };
    } catch (error) {
      attempts++;
      if (attempts === MAX_RETRY_ATTEMPTS) {
        Sentry.captureException(error, {
          tags: { action: 'create_payment_intent' },
          extra: { attempts, amount, currency, paymentType },
        });
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempts));
    }
  }

  throw new Error('Failed to create payment intent after maximum retries');
};

/**
 * Creates and mounts a Stripe Payment Element with error handling
 */
export const createPaymentElement = async (
  elements: StripeElements,
  elementId: string,
  options: {
    theme?: 'light' | 'dark';
    variables?: Record<string, string>;
  } = {}
): Promise<void> => {
  try {
    const startTime = performance.now();

    const paymentElement = elements.create('payment', {
      layout: { type: 'tabs', defaultCollapsed: false },
      theme: options.theme || 'light',
      variables: options.variables,
    });

    await paymentElement.mount(`#${elementId}`);

    const mountTime = performance.now() - startTime;
    Sentry.addBreadcrumb({
      category: 'stripe',
      message: 'Payment element mount time',
      data: { mountTimeMs: mountTime },
    });

    // Monitor element state changes
    paymentElement.on('change', (event) => {
      if (event.error) {
        Sentry.captureMessage('Payment element error', {
          level: 'error',
          extra: { error: event.error },
        });
      }
    });

    return;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { action: 'create_payment_element' },
    });
    throw error;
  }
};

/**
 * Confirms a payment with comprehensive error handling and monitoring
 */
export const confirmPayment = async ({
  elements,
  clientSecret,
  returnUrl,
}: {
  elements: StripeElements;
  clientSecret: string;
  returnUrl?: string;
}): Promise<{
  error?: StripeError;
  paymentIntent?: object;
  status: string;
}> => {
  try {
    const stripe = await initializeStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    const startTime = performance.now();
    
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: returnUrl || window.location.origin,
      },
    });

    const confirmTime = performance.now() - startTime;
    
    Sentry.addBreadcrumb({
      category: 'stripe',
      message: 'Payment confirmation time',
      data: { confirmTimeMs: confirmTime },
    });

    if (error) {
      Sentry.captureMessage('Payment confirmation error', {
        level: 'error',
        extra: { error },
      });

      return {
        error,
        status: 'failed',
      };
    }

    return {
      paymentIntent,
      status: 'succeeded',
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { action: 'confirm_payment' },
    });

    return {
      error: error as StripeError,
      status: 'error',
    };
  }
};