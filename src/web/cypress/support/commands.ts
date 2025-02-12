import { LoginRequest, SignupRequest, UserRole } from '../../src/types/auth';
import 'cypress';

// Extend Cypress namespace with custom command types
declare global {
  namespace Cypress {
    interface Chainable {
      login(credentials: LoginRequest, options?: Partial<LoginOptions>): Chainable<void>;
      signup(userData: SignupRequest, options?: Partial<SignupOptions>): Chainable<void>;
      interceptApi(method: string, url: string, response?: any, options?: InterceptOptions): Chainable<void>;
      clearAuthState(options?: Partial<ClearAuthOptions>): Chainable<void>;
    }
  }
}

// Command configuration interfaces
interface LoginOptions {
  rememberMe: boolean;
  retryAttempts: number;
  mfaTimeout: number;
}

interface SignupOptions {
  skipEmailVerification: boolean;
  retryAttempts: number;
  validatePassword: boolean;
}

interface InterceptOptions {
  delay: number;
  alias: string;
  statusCode: number;
  failOnError: boolean;
}

interface ClearAuthOptions {
  preserveLocalStorage: boolean;
  clearCookies: boolean;
}

// Default command options
const DEFAULT_LOGIN_OPTIONS: LoginOptions = {
  rememberMe: false,
  retryAttempts: 3,
  mfaTimeout: 30000
};

const DEFAULT_SIGNUP_OPTIONS: SignupOptions = {
  skipEmailVerification: false,
  retryAttempts: 3,
  validatePassword: true
};

const DEFAULT_INTERCEPT_OPTIONS: InterceptOptions = {
  delay: 100,
  alias: '',
  statusCode: 200,
  failOnError: true
};

/**
 * Enhanced login command with MFA support and secure token handling
 */
Cypress.Commands.add('login', (credentials: LoginRequest, options?: Partial<LoginOptions>) => {
  const finalOptions = { ...DEFAULT_LOGIN_OPTIONS, ...options };

  cy.interceptApi('POST', '/api/auth/login', null, { alias: 'loginRequest' });
  
  cy.visit('/login', { retryOnStatusCodeFailure: true });
  
  // Fill login form
  cy.get('[data-cy=email-input]').type(credentials.email);
  cy.get('[data-cy=password-input]').type(credentials.password, { log: false });
  
  if (finalOptions.rememberMe) {
    cy.get('[data-cy=remember-me]').check();
  }
  
  cy.get('[data-cy=login-submit]').click();
  
  // Handle MFA if enabled
  cy.wait('@loginRequest').then((interception) => {
    if (interception.response?.body.requiresMFA) {
      cy.get('[data-cy=mfa-input]', { timeout: finalOptions.mfaTimeout })
        .should('be.visible')
        .type(credentials.mfaCode);
      
      cy.get('[data-cy=mfa-submit]').click();
      cy.wait('@loginRequest');
    }
  });
  
  // Verify successful login
  cy.url().should('not.include', '/login');
});

/**
 * Enhanced signup command with role validation and security checks
 */
Cypress.Commands.add('signup', (userData: SignupRequest, options?: Partial<SignupOptions>) => {
  const finalOptions = { ...DEFAULT_SIGNUP_OPTIONS, ...options };

  cy.interceptApi('POST', '/api/auth/signup', null, { alias: 'signupRequest' });
  
  cy.visit('/signup');
  
  // Validate user role
  if (!Object.values(UserRole).includes(userData.role)) {
    throw new Error(`Invalid user role: ${userData.role}`);
  }
  
  // Fill signup form
  cy.get('[data-cy=email-input]').type(userData.email);
  cy.get('[data-cy=password-input]').type(userData.password, { log: false });
  cy.get('[data-cy=firstName-input]').type(userData.firstName);
  cy.get('[data-cy=lastName-input]').type(userData.lastName);
  cy.get(`[data-cy=role-${userData.role}]`).check();
  
  if (finalOptions.validatePassword) {
    cy.get('[data-cy=password-input]').should('satisfy', (value: string) => {
      return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
    });
  }
  
  cy.get('[data-cy=signup-submit]').click();
  
  // Handle email verification
  if (!finalOptions.skipEmailVerification) {
    cy.url().should('include', '/verify-email');
  }
});

/**
 * Enhanced API interception command with response validation
 */
Cypress.Commands.add('interceptApi', (method: string, url: string, response?: any, options?: Partial<InterceptOptions>) => {
  const finalOptions = { ...DEFAULT_INTERCEPT_OPTIONS, ...options };
  
  const interceptConfig: any = {
    method,
    url: `*${url}*`,
  };
  
  if (response) {
    interceptConfig.reply = (req: any) => {
      return {
        statusCode: finalOptions.statusCode,
        body: response,
        delay: finalOptions.delay
      };
    };
  }
  
  if (finalOptions.alias) {
    cy.intercept(interceptConfig).as(finalOptions.alias);
  } else {
    cy.intercept(interceptConfig);
  }
});

/**
 * Enhanced authentication state cleanup command
 */
Cypress.Commands.add('clearAuthState', (options?: Partial<ClearAuthOptions>) => {
  const defaultOptions = {
    preserveLocalStorage: false,
    clearCookies: true
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  
  // Clear authentication tokens
  if (!finalOptions.preserveLocalStorage) {
    cy.window().then((win) => {
      win.localStorage.removeItem('accessToken');
      win.localStorage.removeItem('refreshToken');
      win.localStorage.removeItem('user');
    });
  }
  
  // Clear cookies if specified
  if (finalOptions.clearCookies) {
    cy.clearCookies();
  }
  
  // Clear session storage
  cy.window().then((win) => {
    win.sessionStorage.clear();
  });
  
  // Verify clean state
  cy.window().then((win) => {
    if (!finalOptions.preserveLocalStorage) {
      expect(win.localStorage.getItem('accessToken')).to.be.null;
      expect(win.localStorage.getItem('refreshToken')).to.be.null;
      expect(win.localStorage.getItem('user')).to.be.null;
    }
  });
});