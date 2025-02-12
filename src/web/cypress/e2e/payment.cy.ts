import payments from '../fixtures/payments.json';
import { PaymentType, PaymentStatus } from '../../src/types/payment';
import type { Stripe } from '@stripe/stripe-js';

describe('Payment Integration Tests', () => {
  beforeEach(() => {
    // Clear cookies and local storage for clean state
    cy.clearCookies();
    cy.clearLocalStorage();

    // Mock Stripe Elements initialization
    cy.window().then((win) => {
      win.Stripe = cy.stub().returns({
        elements: cy.stub().returns({
          create: cy.stub().returns({
            mount: cy.stub(),
            on: cy.stub(),
            unmount: cy.stub()
          })
        }),
        confirmPayment: cy.stub().resolves({ paymentIntent: { status: 'succeeded' } })
      });
    });

    // Intercept payment-related API calls
    cy.intercept('POST', '/api/payments', { statusCode: 200, body: payments.payments[0] }).as('createPayment');
    cy.intercept('GET', '/api/payments/*', { statusCode: 200, body: payments.payments[0] }).as('getPayment');
    cy.intercept('GET', '/api/payments/history', { statusCode: 200, body: payments.payments }).as('getPaymentHistory');

    // Login as test user
    cy.login('testuser@example.com', 'password123');
  });

  describe('Payment Form Validation', () => {
    it('should validate required payment form fields', () => {
      cy.visit('/payments/new');
      cy.get('[data-testid="submit-payment"]').click();

      // Verify required field validations
      cy.get('[data-testid="amount-error"]').should('be.visible');
      cy.get('[data-testid="payment-method-error"]').should('be.visible');
      cy.get('[data-testid="billing-address-error"]').should('be.visible');
    });

    it('should validate payment amount constraints', () => {
      cy.visit('/payments/new');
      
      // Test minimum amount validation
      cy.get('[data-testid="payment-amount"]').type('0');
      cy.get('[data-testid="amount-error"]').should('contain', 'Amount must be greater than 0');

      // Test maximum amount validation
      cy.get('[data-testid="payment-amount"]').clear().type('1000001');
      cy.get('[data-testid="amount-error"]').should('contain', 'Amount cannot exceed 1,000,000');
    });

    it('should validate credit card information', () => {
      cy.visit('/payments/new');
      
      // Test invalid card number
      cy.get('[data-testid="card-number"]').type('4242424242424241');
      cy.get('[data-testid="card-error"]').should('contain', 'Invalid card number');

      // Test expired card
      cy.get('[data-testid="card-expiry"]').type('1220');
      cy.get('[data-testid="expiry-error"]').should('contain', 'Card has expired');
    });
  });

  describe('Payment Processing Flows', () => {
    it('should process application fee payment successfully', () => {
      cy.visit('/applications/app_test_001/payment');
      
      // Fill payment form
      cy.get('[data-testid="payment-amount"]').should('have.value', '50.00');
      cy.get('[data-testid="payment-type"]').should('have.value', PaymentType.APPLICATION_FEE);
      
      // Enter card details
      cy.get('[data-testid="card-number"]').type('4242424242424242');
      cy.get('[data-testid="card-expiry"]').type('1230');
      cy.get('[data-testid="card-cvc"]').type('123');
      
      // Submit payment
      cy.get('[data-testid="submit-payment"]').click();
      
      // Verify success
      cy.wait('@createPayment');
      cy.get('[data-testid="payment-success"]').should('be.visible');
      cy.get('[data-testid="payment-status"]').should('contain', PaymentStatus.CAPTURED);
    });

    it('should handle failed payments appropriately', () => {
      cy.visit('/payments/new');
      
      // Mock failed payment
      cy.intercept('POST', '/api/payments', {
        statusCode: 400,
        body: {
          error: {
            code: 'card_declined',
            message: 'Your card was declined'
          }
        }
      }).as('failedPayment');
      
      // Fill and submit payment form
      cy.get('[data-testid="payment-amount"]').type('250.00');
      cy.get('[data-testid="card-number"]').type('4000000000000002'); // Decline card
      cy.get('[data-testid="card-expiry"]').type('1230');
      cy.get('[data-testid="card-cvc"]').type('123');
      cy.get('[data-testid="submit-payment"]').click();
      
      // Verify error handling
      cy.wait('@failedPayment');
      cy.get('[data-testid="payment-error"]').should('contain', 'Your card was declined');
      cy.get('[data-testid="payment-status"]').should('contain', PaymentStatus.FAILED);
    });

    it('should process high-volume transactions efficiently', () => {
      // Test batch payment processing
      const batchPayments = Array(10).fill(payments.payments[0]);
      cy.intercept('POST', '/api/payments/batch', { statusCode: 200, body: batchPayments }).as('batchPayment');
      
      cy.visit('/payments/batch');
      cy.get('[data-testid="batch-payment"]').click();
      
      // Verify batch processing
      cy.wait('@batchPayment');
      cy.get('[data-testid="success-count"]').should('contain', '10');
      cy.get('[data-testid="processing-time"]').should('be.lessThan', 5000); // 5 seconds
    });
  });

  describe('Payment Security', () => {
    it('should maintain PCI compliance standards', () => {
      cy.visit('/payments/new');
      
      // Verify secure form handling
      cy.get('form[data-testid="payment-form"]').should('have.attr', 'data-secure', 'true');
      
      // Verify card data is not logged
      cy.intercept('POST', '/api/payments', (req) => {
        expect(req.body).not.to.have.property('cardNumber');
        expect(req.body).not.to.have.property('cvc');
      }).as('securePayment');
      
      // Verify secure headers
      cy.request('/payments/new').then((response) => {
        expect(response.headers).to.include({
          'strict-transport-security': 'max-age=31536000; includeSubDomains',
          'content-security-policy': "default-src 'self' https://js.stripe.com",
          'x-frame-options': 'DENY'
        });
      });
    });

    it('should properly handle sensitive payment data', () => {
      cy.visit('/payments/new');
      
      // Verify card tokenization
      cy.window().then((win) => {
        expect(win.Stripe).to.be.called;
      });
      
      // Verify secure transmission
      cy.intercept('POST', '/api/payments', (req) => {
        expect(req.headers['content-type']).to.include('application/json');
        expect(req.headers).to.have.property('x-stripe-token');
      }).as('tokenizedPayment');
    });
  });

  describe('Payment History and Reporting', () => {
    it('should display payment history accurately', () => {
      cy.visit('/payments/history');
      cy.wait('@getPaymentHistory');
      
      // Verify payment list
      cy.get('[data-testid="payment-list"]').should('have.length', payments.payments.length);
      cy.get('[data-testid="payment-item"]').first().should('contain', payments.payments[0].amount);
    });

    it('should generate payment receipts', () => {
      cy.visit(`/payments/${payments.payments[0].id}/receipt`);
      
      // Verify receipt content
      cy.get('[data-testid="receipt-amount"]').should('contain', payments.payments[0].amount);
      cy.get('[data-testid="receipt-date"]').should('contain', new Date(payments.payments[0].paidDate).toLocaleDateString());
      cy.get('[data-testid="receipt-status"]').should('contain', payments.payments[0].status);
    });
  });
});