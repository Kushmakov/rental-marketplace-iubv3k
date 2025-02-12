import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest, describe, beforeAll, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Elements } from '@stripe/stripe-js';

import PaymentForm from '../../../components/payment/PaymentForm';
import { PaymentType } from '../../../types/payment';
import { processPayment } from '../../../lib/api/payments';
import * as stripeLib from '../../../lib/stripe';

// Mock Stripe and related dependencies
jest.mock('@stripe/stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div data-testid="stripe-payment-element" />,
  useStripe: () => ({
    confirmPayment: jest.fn(),
    elements: jest.fn(),
  }),
  useElements: () => ({
    getElement: jest.fn(),
  }),
}));

// Mock DataDog RUM
jest.mock('@datadog/browser-rum', () => ({
  useDataDog: () => ({
    addTiming: jest.fn(),
    addError: jest.fn(),
  }),
}));

// Mock payment processing functions
jest.mock('../../../lib/api/payments');
jest.mock('../../../lib/stripe');

describe('PaymentForm', () => {
  // Test constants
  const defaultProps = {
    amount: 10000, // $100.00
    paymentType: PaymentType.APPLICATION_FEE,
    onSuccess: jest.fn(),
    onError: jest.fn(),
    retryAttempts: 3,
    idempotencyKey: 'test-key-123',
    enableMonitoring: true,
  };

  // Mock implementations
  let mockStripe: any;
  let mockElements: any;
  let mockCreatePaymentIntent: jest.SpyInstance;

  beforeAll(() => {
    // Configure global mocks
    global.crypto = {
      ...global.crypto,
      randomUUID: () => 'test-uuid',
    };
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Setup Stripe mocks
    mockStripe = {
      confirmPayment: jest.fn(),
      elements: jest.fn(),
    };

    mockElements = {
      getElement: jest.fn(),
    };

    // Mock createPaymentIntent
    mockCreatePaymentIntent = jest.spyOn(stripeLib, 'createPaymentIntent').mockResolvedValue({
      clientSecret: 'test-secret',
      paymentIntentId: 'test-intent-id',
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Rendering', () => {
    it('should render the payment form with all required elements', async () => {
      render(
        <Elements stripe={null}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      // Verify form elements
      expect(screen.getByRole('form')).toBeInTheDocument();
      expect(screen.getByTestId('stripe-payment-element')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveTextContent(`Pay $${(defaultProps.amount / 100).toFixed(2)}`);
    });

    it('should show loading state when initializing', () => {
      render(
        <Elements stripe={null}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      expect(screen.getByLabelText('Loading payment form')).toBeInTheDocument();
    });

    it('should apply proper ARIA attributes for accessibility', () => {
      render(
        <Elements stripe={null}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      expect(screen.getByRole('form')).toHaveAttribute('aria-label', 'Payment form');
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Process payment');
    });
  });

  describe('Payment Processing', () => {
    it('should handle successful payment submission', async () => {
      const mockPaymentResult = {
        id: 'test-payment-id',
        status: 'succeeded',
      };

      (processPayment as jest.Mock).mockResolvedValueOnce(mockPaymentResult);

      render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      // Trigger payment submission
      await act(async () => {
        fireEvent.submit(screen.getByRole('form'));
      });

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledWith(mockPaymentResult);
      });
    });

    it('should handle payment validation errors', async () => {
      const mockError = {
        code: 'card_error',
        message: 'Your card was declined',
        retryable: false,
      };

      mockStripe.confirmPayment.mockResolvedValueOnce({ error: mockError });

      render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      await act(async () => {
        fireEvent.submit(screen.getByRole('form'));
      });

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(expect.objectContaining({
          code: mockError.code,
          message: mockError.message,
        }));
        expect(screen.getByRole('alert')).toHaveTextContent(mockError.message);
      });
    });

    it('should retry failed payments up to specified attempts', async () => {
      const mockError = new Error('Network error');
      (processPayment as jest.Mock)
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce({ id: 'test-payment-id', status: 'succeeded' });

      render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      await act(async () => {
        fireEvent.submit(screen.getByRole('form'));
      });

      await waitFor(() => {
        expect(processPayment).toHaveBeenCalledTimes(3);
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Stripe initialization errors', async () => {
      mockCreatePaymentIntent.mockRejectedValueOnce(new Error('Failed to initialize'));

      render(
        <Elements stripe={null}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(expect.objectContaining({
          code: 'INITIALIZATION_FAILED',
        }));
      });
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      (processPayment as jest.Mock).mockRejectedValueOnce(networkError);

      render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      await act(async () => {
        fireEvent.submit(screen.getByRole('form'));
      });

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalled();
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('should handle concurrent submission attempts', async () => {
      render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      // Attempt multiple submissions
      await act(async () => {
        fireEvent.submit(screen.getByRole('form'));
        fireEvent.submit(screen.getByRole('form'));
      });

      await waitFor(() => {
        expect(processPayment).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Integration', () => {
    it('should properly integrate with Stripe Elements', async () => {
      render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      expect(screen.getByTestId('stripe-payment-element')).toBeInTheDocument();
    });

    it('should handle payment element change events', async () => {
      const { container } = render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      // Simulate payment element change
      const paymentElement = screen.getByTestId('stripe-payment-element');
      fireEvent.change(paymentElement, { complete: true });

      await waitFor(() => {
        expect(screen.getByRole('button')).not.toBeDisabled();
      });
    });

    it('should maintain proper loading states during processing', async () => {
      (processPayment as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      render(
        <Elements stripe={mockStripe}>
          <PaymentForm {...defaultProps} />
        </Elements>
      );

      await act(async () => {
        fireEvent.submit(screen.getByRole('form'));
      });

      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });
  });
});