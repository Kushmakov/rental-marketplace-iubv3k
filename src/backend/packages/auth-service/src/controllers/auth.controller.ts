/**
 * @fileoverview Enhanced authentication controller implementing OAuth 2.0 + JWT based auth
 * Provides secure endpoints for user registration, login, token refresh, and password management
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // v4.18.2
import { BadRequestError, UnauthorizedError, Logger, Metrics, RequestValidator } from '@projectx/common'; // v1.0.0
import { AuthService } from '../services/auth.service';
import { ApiResponse, UserRole } from '@projectx/common/interfaces';
import { HTTP_STATUS } from '@projectx/common/constants';
import { config } from '../config';

/**
 * Enhanced authentication controller with comprehensive security features
 */
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly validator: RequestValidator,
    private readonly logger: Logger,
    private readonly metrics: Metrics
  ) {}

  /**
   * Handles user registration with enhanced security validation
   */
  @Post('/register')
  @UseRateLimit(10, '1m')
  async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      this.logger.info('Processing registration request', { 
        email: req.body.email,
        role: req.body.role 
      });

      // Validate request payload
      await this.validator.validate(req.body, {
        email: { type: 'string', format: 'email', required: true },
        password: { 
          type: 'string', 
          minLength: config.password.minLength,
          pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])',
          required: true 
        },
        firstName: { type: 'string', minLength: 2, required: true },
        lastName: { type: 'string', minLength: 2, required: true },
        phone: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$', required: true },
        role: { type: 'string', enum: Object.values(UserRole), required: true }
      });

      // Process registration
      const result = await this.authService.register({
        ...req.body,
        mfaEnabled: config.mfa.enforceForRoles.includes(req.body.role)
      });

      // Set secure cookie options
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      };

      // Track registration metrics
      this.metrics.increment('auth.registration.success', {
        role: req.body.role,
        mfaEnabled: config.mfa.enforceForRoles.includes(req.body.role)
      });

      res.status(HTTP_STATUS.CREATED).json(result);
    } catch (error) {
      this.metrics.increment('auth.registration.error', {
        error: error.name
      });
      next(error);
    }
  }

  /**
   * Handles user login with MFA support and enhanced security
   */
  @Post('/login')
  @UseRateLimit(5, '1m')
  async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      this.logger.info('Processing login request', { email: req.body.email });

      // Validate login credentials
      await this.validator.validate(req.body, {
        email: { type: 'string', format: 'email', required: true },
        password: { type: 'string', required: true },
        mfaToken: { type: 'string', pattern: '^\\d{6}$', optional: true }
      });

      // Process login
      const result = await this.authService.login({
        email: req.body.email,
        password: req.body.password,
        mfaToken: req.body.mfaToken
      });

      // Set refresh token cookie
      res.cookie('refreshToken', result.data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Track login metrics
      this.metrics.increment('auth.login.success', {
        role: result.data.user.role,
        mfaUsed: !!req.body.mfaToken
      });

      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      this.metrics.increment('auth.login.error', {
        error: error.name
      });
      next(error);
    }
  }

  /**
   * Handles access token refresh with enhanced security validation
   */
  @Post('/refresh')
  @UseRateLimit(20, '1m')
  async refreshToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      this.logger.info('Processing token refresh request');

      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        throw new UnauthorizedError('Refresh token not found');
      }

      // Process token refresh
      const result = await this.authService.refreshToken(refreshToken);

      // Update refresh token cookie
      res.cookie('refreshToken', result.data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Track token refresh
      this.metrics.increment('auth.token.refresh.success');

      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      this.metrics.increment('auth.token.refresh.error', {
        error: error.name
      });
      next(error);
    }
  }

  /**
   * Handles password reset with enhanced security validation
   */
  @Post('/reset-password')
  @UseRateLimit(3, '1h')
  async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      this.logger.info('Processing password reset request');

      // Validate request payload
      await this.validator.validate(req.body, {
        token: { type: 'string', required: true },
        newPassword: { 
          type: 'string', 
          minLength: config.password.minLength,
          pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])',
          required: true 
        }
      });

      // Process password reset
      await this.authService.changePassword(
        req.body.token,
        req.body.newPassword
      );

      // Track password reset
      this.metrics.increment('auth.password.reset.success');

      res.status(HTTP_STATUS.OK).json({
        status: HTTP_STATUS.OK,
        message: 'Password reset successful',
        errors: [],
        timestamp: new Date(),
        requestId: req.id
      });
    } catch (error) {
      this.metrics.increment('auth.password.reset.error', {
        error: error.name
      });
      next(error);
    }
  }
}