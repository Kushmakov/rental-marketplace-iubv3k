/**
 * @fileoverview Enhanced authentication service implementing OAuth 2.0 + OIDC
 * Provides comprehensive security features including MFA, session management,
 * and secure password operations with Argon2id hashing
 * @version 1.0.0
 */

import { UserRepository } from '../repositories/user.repository';
import { AuthErrors } from '@projectx/common'; // v1.0.0
import { SecurityMetrics } from '@projectx/monitoring'; // v1.0.0
import { TokenService } from '@projectx/token-service'; // v1.0.0
import { SecurityUtils } from '@projectx/security-utils'; // v1.0.0
import { User, UserRole, ApiResponse } from '@projectx/common/interfaces';
import { HTTP_STATUS, JWT_CONFIG } from '@projectx/common/constants';
import { config } from '../config';

/**
 * Registration request data transfer object
 */
interface RegisterDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;
  mfaEnabled?: boolean;
}

/**
 * Login request data transfer object
 */
interface LoginDTO {
  email: string;
  password: string;
  mfaToken?: string;
}

/**
 * Authentication response with tokens and session data
 */
interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Omit<User, 'password' | 'mfaSecret'>;
  mfaRequired?: boolean;
}

/**
 * Enhanced authentication service with comprehensive security features
 */
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
    private readonly securityUtils: SecurityUtils,
    private readonly securityMetrics: SecurityMetrics
  ) {}

  /**
   * Enhanced user registration with security features
   * @param userData Registration data
   * @returns Registration response with MFA setup information
   */
  public async register(userData: RegisterDTO): Promise<ApiResponse<User>> {
    try {
      // Validate email format and domain
      if (!this.securityUtils.validateEmail(userData.email)) {
        throw new AuthErrors.ValidationError('Invalid email format');
      }

      // Validate password strength
      if (!this.securityUtils.validatePasswordStrength(userData.password, config.password)) {
        throw new AuthErrors.ValidationError('Password does not meet security requirements');
      }

      // Check if email already exists
      const existingUser = await this.userRepository.findByEmail(userData.email);
      if (existingUser) {
        throw new AuthErrors.ConflictError('Email already registered');
      }

      // Generate MFA secret if enabled
      let mfaSecret: string | undefined;
      let backupCodes: string[] | undefined;
      if (userData.mfaEnabled || config.mfa.enforceForRoles.includes(userData.role)) {
        mfaSecret = await this.securityUtils.generateMFASecret();
        backupCodes = await this.securityUtils.generateBackupCodes(
          config.mfa.backupCodesCount
        );
      }

      // Create user with enhanced security
      const user = await this.userRepository.create({
        ...userData,
        password: await this.securityUtils.hashPassword(userData.password),
        mfaSecret,
        backupCodes,
        mfaEnabled: !!mfaSecret,
        loginAttempts: 0,
        isActive: true
      });

      // Track security metrics
      this.securityMetrics.trackRegistration({
        userId: user.id,
        role: user.role,
        mfaEnabled: !!mfaSecret
      });

      return {
        status: HTTP_STATUS.CREATED,
        data: user,
        message: 'User registered successfully',
        errors: [],
        timestamp: new Date(),
        requestId: this.securityUtils.generateRequestId()
      };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Enhanced login with MFA and security features
   * @param credentials Login credentials
   * @returns Authentication response with tokens
   */
  public async login(credentials: LoginDTO): Promise<ApiResponse<AuthResponse>> {
    try {
      // Validate credentials
      const authResult = await this.userRepository.validateCredentials(
        credentials.email,
        credentials.password,
        credentials.mfaToken
      );

      if (!authResult.user) {
        if (authResult.status === 'locked') {
          throw new AuthErrors.AccountLockedError(
            'Account is temporarily locked',
            authResult.lockoutTime
          );
        }
        if (authResult.status === 'mfa_required') {
          throw new AuthErrors.MFARequiredError('MFA verification required');
        }
        throw new AuthErrors.InvalidCredentialsError(
          authResult.message,
          authResult.remainingAttempts
        );
      }

      // Generate session and tokens
      const sessionId = this.securityUtils.generateSessionId();
      const tokens = await this.tokenService.generateTokenPair({
        userId: authResult.user.id,
        role: authResult.user.role,
        sessionId,
        mfaVerified: !!credentials.mfaToken
      });

      // Track security metrics
      this.securityMetrics.trackLogin({
        userId: authResult.user.id,
        role: authResult.user.role,
        mfaUsed: !!credentials.mfaToken,
        sessionId
      });

      return {
        status: HTTP_STATUS.OK,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: JWT_CONFIG.TOKEN_EXPIRY,
          user: authResult.user,
          mfaRequired: false
        },
        message: 'Login successful',
        errors: [],
        timestamp: new Date(),
        requestId: this.securityUtils.generateRequestId()
      };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Enhanced token refresh with security checks
   * @param refreshToken Refresh token
   * @returns New access token and session data
   */
  public async refreshToken(refreshToken: string): Promise<ApiResponse<AuthResponse>> {
    try {
      // Verify refresh token
      const tokenPayload = await this.tokenService.verifyRefreshToken(refreshToken);
      if (!tokenPayload) {
        throw new AuthErrors.InvalidTokenError('Invalid refresh token');
      }

      // Check if user still exists and is active
      const user = await this.userRepository.findById(tokenPayload.userId);
      if (!user || !user.isActive) {
        throw new AuthErrors.UserNotFoundError('User not found or inactive');
      }

      // Generate new token pair
      const tokens = await this.tokenService.generateTokenPair({
        userId: user.id,
        role: user.role,
        sessionId: tokenPayload.sessionId,
        mfaVerified: tokenPayload.mfaVerified
      });

      // Track token refresh
      this.securityMetrics.trackTokenRefresh({
        userId: user.id,
        sessionId: tokenPayload.sessionId
      });

      return {
        status: HTTP_STATUS.OK,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: JWT_CONFIG.TOKEN_EXPIRY,
          user,
          mfaRequired: false
        },
        message: 'Token refreshed successfully',
        errors: [],
        timestamp: new Date(),
        requestId: this.securityUtils.generateRequestId()
      };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Handles authentication errors with proper error responses
   * @param error Error object
   * @returns Standardized error response
   */
  private handleAuthError(error: any): Error {
    // Track security incidents
    this.securityMetrics.trackSecurityIncident({
      type: error.name,
      message: error.message,
      timestamp: new Date()
    });

    if (error instanceof AuthErrors.BaseError) {
      return error;
    }

    return new AuthErrors.InternalError(
      'An unexpected error occurred during authentication'
    );
  }
}