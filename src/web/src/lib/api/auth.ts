// @package axios@1.4.0
import axiosInstance from '../axios';
import {
  LoginRequest,
  SignupRequest,
  AuthResponse,
  MFARequest,
  AuthTokens,
  PasswordResetRequest,
  PasswordResetConfirm
} from '../../types/auth';

// Constants for rate limiting and security
const MAX_LOGIN_ATTEMPTS = 5;
const MFA_CODE_LENGTH = 6;
const PASSWORD_MIN_LENGTH = 8;

/**
 * Authenticates user with email/password and handles MFA if enabled
 * @param credentials - Login credentials with MFA preference
 * @returns Promise with authentication response
 */
export const login = async (credentials: LoginRequest): Promise<AuthResponse> => {
  try {
    // Validate credentials format
    if (!credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }

    const response = await axiosInstance.post<AuthResponse>(
      '/auth/login',
      credentials,
      {
        headers: {
          'X-Login-Attempt': '1', // Used for rate limiting tracking
          'X-Client-Type': 'web'
        }
      }
    );

    // Handle MFA requirement
    if (response.data.requiresMFA) {
      return {
        ...response.data,
        user: response.data.user,
        requiresMFA: true,
        tokens: null // No tokens until MFA is verified
      };
    }

    // Store tokens securely
    if (response.data.tokens) {
      localStorage.setItem('auth_tokens', JSON.stringify(response.data.tokens));
    }

    return response.data;
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};

/**
 * Registers new user with comprehensive validation
 * @param userData - User registration data
 * @returns Promise with authentication response
 */
export const signup = async (userData: SignupRequest): Promise<AuthResponse> => {
  try {
    // Validate password strength
    if (!isPasswordValid(userData.password)) {
      throw new Error('Password does not meet security requirements');
    }

    // Validate email format
    if (!isEmailValid(userData.email)) {
      throw new Error('Invalid email format');
    }

    const response = await axiosInstance.post<AuthResponse>(
      '/auth/signup',
      userData,
      {
        headers: {
          'X-Registration-Source': 'web'
        }
      }
    );

    // Store initial tokens
    if (response.data.tokens) {
      localStorage.setItem('auth_tokens', JSON.stringify(response.data.tokens));
    }

    return response.data;
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};

/**
 * Verifies MFA code for enhanced security
 * @param mfaData - MFA verification data
 * @returns Promise with complete authentication response
 */
export const verifyMFA = async (mfaData: MFARequest): Promise<AuthResponse> => {
  try {
    // Validate MFA code format
    if (!isMFACodeValid(mfaData.code)) {
      throw new Error('Invalid MFA code format');
    }

    const response = await axiosInstance.post<AuthResponse>(
      '/auth/mfa/verify',
      mfaData
    );

    // Store tokens after successful MFA
    if (response.data.tokens) {
      localStorage.setItem('auth_tokens', JSON.stringify(response.data.tokens));
    }

    return response.data;
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};

/**
 * Refreshes authentication tokens
 * @param refreshToken - Current refresh token
 * @returns Promise with new auth tokens
 */
export const refreshToken = async (refreshToken: string): Promise<AuthTokens> => {
  try {
    const response = await axiosInstance.post<AuthTokens>(
      '/auth/refresh',
      { refreshToken }
    );

    // Update stored tokens
    localStorage.setItem('auth_tokens', JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};

/**
 * Logs out user and cleans up session data
 * @returns Promise<void>
 */
export const logout = async (): Promise<void> => {
  try {
    await axiosInstance.post('/auth/logout');
    
    // Clean up stored tokens and session data
    localStorage.removeItem('auth_tokens');
    
    // Clear any other auth-related storage
    sessionStorage.clear();
  } catch (error) {
    console.error('Logout error:', error);
    // Continue with cleanup even if API call fails
    localStorage.removeItem('auth_tokens');
  }
};

/**
 * Initiates password reset process
 * @param resetData - Password reset request data
 * @returns Promise<void>
 */
export const requestPasswordReset = async (resetData: PasswordResetRequest): Promise<void> => {
  try {
    // Validate email format
    if (!isEmailValid(resetData.email)) {
      throw new Error('Invalid email format');
    }

    await axiosInstance.post('/auth/password/reset', resetData, {
      headers: {
        'X-Reset-Source': 'web'
      }
    });
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};

/**
 * Completes password reset with new password
 * @param resetData - Password reset confirmation data
 * @returns Promise<void>
 */
export const resetPassword = async (resetData: PasswordResetConfirm): Promise<void> => {
  try {
    // Validate new password
    if (!isPasswordValid(resetData.newPassword)) {
      throw new Error('New password does not meet security requirements');
    }

    await axiosInstance.post('/auth/password/reset/confirm', resetData);
    
    // Clear any existing auth tokens after password reset
    localStorage.removeItem('auth_tokens');
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};

// Utility functions

/**
 * Validates password against security requirements
 * @param password - Password to validate
 * @returns boolean indicating password validity
 */
const isPasswordValid = (password: string): boolean => {
  const hasMinLength = password.length >= PASSWORD_MIN_LENGTH;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return hasMinLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
};

/**
 * Validates email format
 * @param email - Email to validate
 * @returns boolean indicating email validity
 */
const isEmailValid = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates MFA code format
 * @param code - MFA code to validate
 * @returns boolean indicating MFA code validity
 */
const isMFACodeValid = (code: string): boolean => {
  return code.length === MFA_CODE_LENGTH && /^\d+$/.test(code);
};

/**
 * Handles authentication errors with specific error messages
 * @param error - Error object from API call
 */
const handleAuthError = (error: any): void => {
  if (error.response) {
    switch (error.response.status) {
      case 401:
        throw new Error('Invalid credentials');
      case 403:
        throw new Error('Access denied');
      case 429:
        throw new Error('Too many attempts. Please try again later');
      default:
        throw new Error(error.response.data?.message || 'Authentication failed');
    }
  }
  throw new Error('Network error occurred');
};