/**
 * @fileoverview Enhanced authentication routes with comprehensive security features
 * Implements OAuth 2.0 + JWT based authentication with MFA support and detailed monitoring
 * @version 1.0.0
 */

import { Router } from 'express'; // v4.18.2
import { celebrate, Joi } from 'celebrate'; // v15.0.1
import helmet from 'helmet'; // v7.0.0
import { 
  validateToken, 
  rateLimitMiddleware, 
  requestTracker 
} from '@projectx/common';
import { AuthController } from '../controllers/auth.controller';

// Validation schemas with enhanced security rules
const registerSchema = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(12)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/)
      .required()
      .messages({
        'string.pattern.base': 'Password must contain uppercase, lowercase, number and special character'
      }),
    firstName: Joi.string().min(2).required(),
    lastName: Joi.string().min(2).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    role: Joi.string().valid('RENTER', 'PROPERTY_MANAGER', 'AGENT', 'ADMIN').required()
  })
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    mfaToken: Joi.string().pattern(/^\d{6}$/).optional()
  })
};

const resetPasswordSchema = {
  body: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string()
      .min(12)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/)
      .required()
      .messages({
        'string.pattern.base': 'Password must contain uppercase, lowercase, number and special character'
      })
  })
};

const mfaVerificationSchema = {
  body: Joi.object({
    mfaToken: Joi.string().pattern(/^\d{6}$/).required()
  })
};

/**
 * Initializes authentication routes with comprehensive security features
 * @param authController - Authentication controller instance
 * @returns Configured Express router
 */
const initializeAuthRoutes = (authController: AuthController): Router => {
  const router = Router();

  // Apply security middleware
  router.use(helmet());
  router.use(requestTracker);

  // Registration endpoint with rate limiting and validation
  router.post(
    '/register',
    rateLimitMiddleware,
    celebrate(registerSchema),
    authController.register
  );

  // Login endpoint with enhanced security
  router.post(
    '/login',
    rateLimitMiddleware,
    celebrate(loginSchema),
    authController.login
  );

  // Token refresh endpoint with validation
  router.post(
    '/refresh',
    rateLimitMiddleware,
    validateToken,
    authController.refreshToken
  );

  // Password reset endpoint with strict validation
  router.post(
    '/reset-password',
    rateLimitMiddleware,
    celebrate(resetPasswordSchema),
    authController.resetPassword
  );

  // MFA verification endpoint
  router.post(
    '/verify-mfa',
    rateLimitMiddleware,
    celebrate(mfaVerificationSchema),
    authController.verifyMFA
  );

  // Logout endpoint with token invalidation
  router.post(
    '/logout',
    validateToken,
    (req, res) => {
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      res.status(200).json({
        status: 200,
        message: 'Logged out successfully',
        errors: [],
        timestamp: new Date(),
        requestId: req.id
      });
    }
  );

  return router;
};

// Export configured router
export const authRouter = initializeAuthRoutes(new AuthController());