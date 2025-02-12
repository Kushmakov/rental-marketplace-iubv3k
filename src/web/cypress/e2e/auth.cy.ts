import { LoginFormData, AuthResponse } from '../../src/types/auth';
import '@testing-library/cypress';
import 'cypress-axe';

// Test user data and API routes
const TEST_USERS = {
  standard: {
    email: 'test@example.com',
    password: 'Test123!@#',
  },
  mfa: {
    email: 'mfa@example.com',
    password: 'Mfa123!@#',
    totpSecret: 'BASE32SECRET',
  },
};

const API_ROUTES = {
  login: '/api/auth/login',
  oauth: '/api/auth/oauth',
  mfa: '/api/auth/mfa/verify',
  reset: '/api/auth/password/reset',
  logout: '/api/auth/logout',
};

const TEST_SELECTORS = {
  loginForm: '[data-testid=login-form]',
  emailInput: '[data-testid=email-input]',
  passwordInput: '[data-testid=password-input]',
  submitButton: '[data-testid=submit-button]',
  errorMessage: '[data-testid=error-message]',
  mfaInput: '[data-testid=mfa-input]',
  resetLink: '[data-testid=reset-password-link]',
  oauthGoogle: '[data-testid=google-login]',
  oauthApple: '[data-testid=apple-login]',
  oauthFacebook: '[data-testid=facebook-login]',
};

describe('Authentication Flows', () => {
  beforeEach(() => {
    // Reset application state
    cy.clearCookies();
    cy.clearLocalStorage();
    
    // Configure accessibility testing
    cy.injectAxe();
    
    // Visit login page
    cy.visit('/login');
  });

  describe('Standard Login', () => {
    it('should display login form with required fields', () => {
      cy.get(TEST_SELECTORS.loginForm).should('be.visible');
      cy.get(TEST_SELECTORS.emailInput).should('be.visible');
      cy.get(TEST_SELECTORS.passwordInput).should('be.visible');
      cy.get(TEST_SELECTORS.submitButton).should('be.visible');
    });

    it('should validate form inputs', () => {
      cy.get(TEST_SELECTORS.submitButton).click();
      cy.get(TEST_SELECTORS.errorMessage).should('contain', 'Email is required');
      
      cy.get(TEST_SELECTORS.emailInput).type('invalid-email');
      cy.get(TEST_SELECTORS.submitButton).click();
      cy.get(TEST_SELECTORS.errorMessage).should('contain', 'Invalid email format');
    });

    it('should handle successful login', () => {
      cy.intercept('POST', API_ROUTES.login, {
        statusCode: 200,
        body: {
          token: 'valid-jwt-token',
          requiresMFA: false,
          user: {
            email: TEST_USERS.standard.email,
            role: 'RENTER',
          },
        },
      }).as('loginRequest');

      cy.get(TEST_SELECTORS.emailInput).type(TEST_USERS.standard.email);
      cy.get(TEST_SELECTORS.passwordInput).type(TEST_USERS.standard.password);
      cy.get(TEST_SELECTORS.submitButton).click();

      cy.wait('@loginRequest');
      cy.url().should('include', '/dashboard');
    });

    it('should handle invalid credentials', () => {
      cy.intercept('POST', API_ROUTES.login, {
        statusCode: 401,
        body: {
          error: 'Invalid credentials',
        },
      }).as('failedLogin');

      cy.get(TEST_SELECTORS.emailInput).type('wrong@example.com');
      cy.get(TEST_SELECTORS.passwordInput).type('wrongpass');
      cy.get(TEST_SELECTORS.submitButton).click();

      cy.get(TEST_SELECTORS.errorMessage).should('contain', 'Invalid credentials');
    });
  });

  describe('OAuth Authentication', () => {
    it('should handle Google OAuth flow', () => {
      cy.intercept('GET', '/api/auth/oauth/google/url', {
        body: {
          url: 'https://accounts.google.com/oauth2/auth',
        },
      }).as('googleOAuthUrl');

      cy.get(TEST_SELECTORS.oauthGoogle).click();
      cy.wait('@googleOAuthUrl');
    });

    it('should handle OAuth callback success', () => {
      cy.intercept('GET', '/api/auth/oauth/callback*', {
        statusCode: 200,
        body: {
          token: 'oauth-token',
          user: {
            email: 'oauth@example.com',
          },
        },
      }).as('oauthCallback');

      cy.visit('/auth/callback?code=valid-code');
      cy.url().should('include', '/dashboard');
    });
  });

  describe('MFA Verification', () => {
    beforeEach(() => {
      cy.intercept('POST', API_ROUTES.login, {
        statusCode: 200,
        body: {
          requiresMFA: true,
          tempToken: 'temp-token',
        },
      }).as('mfaLogin');
    });

    it('should prompt for MFA code when required', () => {
      cy.get(TEST_SELECTORS.emailInput).type(TEST_USERS.mfa.email);
      cy.get(TEST_SELECTORS.passwordInput).type(TEST_USERS.mfa.password);
      cy.get(TEST_SELECTORS.submitButton).click();

      cy.wait('@mfaLogin');
      cy.get(TEST_SELECTORS.mfaInput).should('be.visible');
    });

    it('should validate MFA code', () => {
      cy.intercept('POST', API_ROUTES.mfa, {
        statusCode: 200,
        body: {
          token: 'valid-jwt-token',
          user: {
            email: TEST_USERS.mfa.email,
          },
        },
      }).as('mfaVerify');

      cy.get(TEST_SELECTORS.mfaInput).type('123456');
      cy.get(TEST_SELECTORS.submitButton).click();

      cy.wait('@mfaVerify');
      cy.url().should('include', '/dashboard');
    });
  });

  describe('Password Reset', () => {
    it('should handle password reset request', () => {
      cy.intercept('POST', API_ROUTES.reset, {
        statusCode: 200,
        body: {
          message: 'Reset email sent',
        },
      }).as('resetRequest');

      cy.get(TEST_SELECTORS.resetLink).click();
      cy.get('[data-testid=reset-email]').type(TEST_USERS.standard.email);
      cy.get('[data-testid=reset-submit]').click();

      cy.wait('@resetRequest');
      cy.get('[data-testid=success-message]')
        .should('contain', 'Reset instructions sent');
    });

    it('should validate reset token', () => {
      cy.intercept('GET', `${API_ROUTES.reset}/validate/*`, {
        statusCode: 200,
      }).as('validateToken');

      cy.visit('/reset-password?token=valid-token');
      cy.wait('@validateToken');
      cy.get('[data-testid=new-password]').should('be.visible');
    });
  });

  describe('Accessibility', () => {
    it('should meet WCAG 2.1 Level AA standards', () => {
      cy.checkA11y(TEST_SELECTORS.loginForm, {
        runOnly: {
          type: 'tag',
          values: ['wcag2aa'],
        },
      });
    });

    it('should support keyboard navigation', () => {
      cy.get(TEST_SELECTORS.emailInput).focus()
        .type('{tab}')
        .focused()
        .should('have.attr', 'data-testid', 'password-input');
    });
  });

  describe('Security Features', () => {
    it('should handle rate limiting', () => {
      cy.intercept('POST', API_ROUTES.login, {
        statusCode: 429,
        body: {
          error: 'Too many attempts',
          retryAfter: 300,
        },
      }).as('rateLimited');

      for (let i = 0; i < 5; i++) {
        cy.get(TEST_SELECTORS.emailInput).clear().type(TEST_USERS.standard.email);
        cy.get(TEST_SELECTORS.passwordInput).clear().type('wrongpass');
        cy.get(TEST_SELECTORS.submitButton).click();
      }

      cy.get(TEST_SELECTORS.errorMessage)
        .should('contain', 'Too many attempts');
    });

    it('should clear sensitive data on logout', () => {
      cy.intercept('POST', API_ROUTES.logout, {
        statusCode: 200,
      }).as('logout');

      cy.window().then((win) => {
        win.localStorage.setItem('authToken', 'test-token');
      });

      cy.get('[data-testid=logout-button]').click();
      cy.wait('@logout');

      cy.window().then((win) => {
        expect(win.localStorage.getItem('authToken')).to.be.null;
      });

      cy.url().should('include', '/login');
    });
  });
});