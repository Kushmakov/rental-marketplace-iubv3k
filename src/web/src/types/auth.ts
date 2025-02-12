// @package jsonwebtoken@9.0.0
import { JwtPayload } from 'jsonwebtoken';

/**
 * Enumeration of user roles for role-based access control
 * Aligned with system security requirements and access levels
 */
export enum UserRole {
  RENTER = 'RENTER',
  PROPERTY_MANAGER = 'PROPERTY_MANAGER',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN'
}

/**
 * Core user interface defining the user data structure
 * Includes essential fields for user identification and security audit
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  lastLogin: Date;
}

/**
 * Login request interface with MFA support
 * Used for initiating authentication process
 */
export interface LoginRequest {
  email: string;
  password: string;
  mfaEnabled: boolean;
}

/**
 * Signup request interface for new user registration
 * Includes required fields for account creation
 */
export interface SignupRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

/**
 * MFA verification request interface
 * Used for two-factor authentication process
 */
export interface MFARequest {
  email: string;
  code: string;
}

/**
 * Authentication tokens interface
 * Manages JWT tokens and their expiration
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Complete authentication response interface
 * Includes user data, tokens, and MFA status
 */
export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
  requiresMFA: boolean;
}

/**
 * Extended JWT payload interface with custom claims
 * Enhances token security with additional user context
 */
export interface JWTCustomPayload extends JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * Password reset request interface
 * Initiates secure password recovery process
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Password reset confirmation interface
 * Completes password recovery with secure token
 */
export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}