/**
 * Type definitions and interfaces for the authentication service.
 * Extends common types with auth-specific functionality.
 * @packageDocumentation
 */

import { User, UserRole } from '@projectx/common/interfaces';
// jsonwebtoken@9.0.0
import { JwtPayload } from 'jsonwebtoken';

/**
 * Extended user interface with comprehensive authentication and security fields
 */
export interface AuthUser extends User {
  /** Hashed password */
  readonly password: string;
  /** Timestamp of last login attempt */
  readonly lastLogin: Date;
  /** Whether MFA is enabled for the account */
  readonly mfaEnabled: boolean;
  /** TOTP secret for MFA if enabled */
  readonly mfaSecret: string | null;
  /** Timestamp of last password change */
  readonly passwordLastChanged: Date;
  /** Count of consecutive failed login attempts */
  readonly failedLoginAttempts: number;
  /** Whether account is temporarily locked due to failed attempts */
  readonly accountLocked: boolean;
}

/**
 * Login request payload type with MFA support
 */
export interface LoginCredentials {
  /** User's email address */
  readonly email: string;
  /** User's password */
  readonly password: string;
  /** Optional MFA token for two-factor authentication */
  readonly mfaToken?: string;
}

/**
 * Signup request payload type with required user information
 */
export interface SignupCredentials {
  /** User's email address */
  readonly email: string;
  /** User's password */
  readonly password: string;
  /** User's first name */
  readonly firstName: string;
  /** User's last name */
  readonly lastName: string;
  /** User's role in the system */
  readonly role: UserRole;
}

/**
 * Authentication tokens response type with expiration
 */
export interface AuthTokens {
  /** JWT access token */
  readonly accessToken: string;
  /** JWT refresh token */
  readonly refreshToken: string;
  /** Token expiration time in seconds */
  readonly expiresIn: number;
  /** Token type (always 'Bearer') */
  readonly tokenType: string;
}

/**
 * Enhanced JWT payload with session tracking and MFA status
 */
export interface JWTCustomPayload extends JwtPayload {
  /** User's unique identifier */
  readonly userId: string;
  /** User's email address */
  readonly email: string;
  /** User's role */
  readonly role: UserRole;
  /** Unique session identifier */
  readonly sessionId: string;
  /** Whether MFA has been verified for this session */
  readonly mfaVerified: boolean;
}

/**
 * Password reset request with anti-abuse protection
 */
export interface PasswordResetRequest {
  /** User's email address */
  readonly email: string;
  /** reCAPTCHA token for verification */
  readonly recaptchaToken: string;
}

/**
 * Password reset confirmation with validation
 */
export interface PasswordResetConfirm {
  /** Password reset token from email */
  readonly token: string;
  /** New password */
  readonly newPassword: string;
  /** Password confirmation for validation */
  readonly confirmPassword: string;
}

/**
 * Authentication audit action types
 */
export enum AuthAuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED'
}

/**
 * Comprehensive audit logging for authentication events
 */
export interface AuthAuditLog {
  /** User ID associated with the event */
  readonly userId: string;
  /** Type of authentication action */
  readonly action: AuthAuditAction;
  /** Timestamp of the event */
  readonly timestamp: Date;
  /** IP address of the request */
  readonly ipAddress: string;
  /** User agent string from the request */
  readonly userAgent: string;
}