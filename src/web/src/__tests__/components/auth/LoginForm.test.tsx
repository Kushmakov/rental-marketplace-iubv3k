import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { LoginForm } from '../../../components/auth/LoginForm';
import { useAuth } from '../../../hooks/useAuth';

// Extend Jest matchers for accessibility testing
expect.extend(toHaveNoViolations);

// Mock the auth hook
jest.mock('../../../hooks/useAuth', () => ({
  useAuth: jest.fn()
}));

// Mock rate limiter service
jest.mock('@rentals/rate-limit', () => ({
  useRateLimit: jest.fn(() => ({
    isRateLimited: false,
    incrementAttempts: jest.fn()
  }))
}));

describe('LoginForm', () => {
  // Test data
  const validCredentials = {
    email: 'test@example.com',
    password: 'ValidP@ss123',
    mfaCode: '123456'
  };

  const mockOnSuccess = jest.fn();
  const mockLogin = jest.fn();
  const mockVerifyMFA = jest.fn();
  const mockBiometricAuth = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default auth hook implementation
    (useAuth as jest.Mock).mockImplementation(() => ({
      login: mockLogin,
      verifyMFA: mockVerifyMFA,
      verifyBiometric: mockBiometricAuth,
      loading: false,
      error: null
    }));
  });

  describe('Form Rendering and Accessibility', () => {
    it('should render login form with all required fields', () => {
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /remember me/i })).toBeInTheDocument();
    });

    it('should meet accessibility standards', async () => {
      const { container } = render(<LoginForm onSuccess={mockOnSuccess} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', () => {
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const rememberMe = screen.getByRole('checkbox', { name: /remember me/i });
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      emailInput.focus();
      expect(document.activeElement).toBe(emailInput);
      
      userEvent.tab();
      expect(document.activeElement).toBe(passwordInput);
      
      userEvent.tab();
      expect(document.activeElement).toBe(rememberMe);
      
      userEvent.tab();
      expect(document.activeElement).toBe(signInButton);
    });
  });

  describe('Form Validation', () => {
    it('should validate email format', async () => {
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      const emailInput = screen.getByLabelText(/email/i);
      await userEvent.type(emailInput, 'invalid-email');
      fireEvent.blur(emailInput);

      expect(await screen.findByText(/invalid email format/i)).toBeInTheDocument();
    });

    it('should validate password complexity', async () => {
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      const passwordInput = screen.getByLabelText(/password/i);
      await userEvent.type(passwordInput, 'weak');
      fireEvent.blur(passwordInput);

      expect(await screen.findByText(/must be at least 8 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/must contain an uppercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/must contain a number/i)).toBeInTheDocument();
      expect(screen.getByText(/must contain a special character/i)).toBeInTheDocument();
    });

    it('should disable form submission when validation fails', async () => {
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      const signInButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(signInButton);

      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('Authentication Flow', () => {
    it('should handle successful login without MFA', async () => {
      mockLogin.mockResolvedValueOnce({ mfaRequired: false });
      
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: validCredentials.email,
          password: validCredentials.password,
          mfaEnabled: true
        });
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should handle MFA flow', async () => {
      mockLogin.mockResolvedValueOnce({ mfaRequired: true });
      
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      // Initial login
      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // MFA verification
      await waitFor(() => {
        expect(screen.getByText(/enter verification code/i)).toBeInTheDocument();
      });

      const mfaInput = screen.getByLabelText(/verification code/i);
      await userEvent.type(mfaInput, validCredentials.mfaCode);
      fireEvent.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(mockVerifyMFA).toHaveBeenCalledWith(validCredentials.mfaCode);
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should handle biometric authentication', async () => {
      mockBiometricAuth.mockResolvedValueOnce(true);
      
      render(<LoginForm onSuccess={mockOnSuccess} enableBiometric={true} />);
      
      const biometricButton = await screen.findByRole('button', { name: /use biometric/i });
      fireEvent.click(biometricButton);

      await waitFor(() => {
        expect(mockBiometricAuth).toHaveBeenCalled();
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling and Security', () => {
    it('should handle authentication errors', async () => {
      const errorMessage = 'Invalid credentials';
      mockLogin.mockRejectedValueOnce(new Error(errorMessage));
      
      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      expect(await screen.findByText(errorMessage)).toBeInTheDocument();
    });

    it('should handle rate limiting', async () => {
      jest.mock('@rentals/rate-limit', () => ({
        useRateLimit: jest.fn(() => ({
          isRateLimited: true,
          incrementAttempts: jest.fn()
        }))
      }));

      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });

    it('should prevent multiple form submissions while loading', async () => {
      (useAuth as jest.Mock).mockImplementation(() => ({
        login: mockLogin,
        loading: true,
        error: null
      }));

      render(<LoginForm onSuccess={mockOnSuccess} />);
      
      const signInButton = screen.getByRole('button', { name: /sign in/i });
      expect(signInButton).toBeDisabled();
      expect(within(signInButton).getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Redirect Behavior', () => {
    it('should handle redirect after successful login', async () => {
      const redirectUrl = '/dashboard';
      mockLogin.mockResolvedValueOnce({ mfaRequired: false });
      
      render(<LoginForm onSuccess={mockOnSuccess} redirectUrl={redirectUrl} />);
      
      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(window.location.href).toBe(redirectUrl);
      });
    });
  });
});