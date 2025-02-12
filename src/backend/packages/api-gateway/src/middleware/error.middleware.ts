import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { BaseError } from '@projectx/common/errors';
import { errorLoggingMiddleware } from './logging.middleware';
import { SecurityUtils } from '@projectx/security-utils'; // v1.0.0

// Security-focused error response headers
const ERROR_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'",
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Surrogate-Control': 'no-store'
};

// Error pattern tracking for security monitoring
const errorPatterns = new Map<string, number>();
const ERROR_PATTERN_THRESHOLD = 10;
const ERROR_PATTERN_WINDOW = 300000; // 5 minutes

/**
 * Security-enhanced error transformation function
 * @param error - Original error object
 * @returns Standardized and sanitized BaseError
 */
const transformError = (error: unknown): BaseError => {
  // Handle known error types
  if (error instanceof BaseError) {
    return error;
  }

  // Transform unknown errors
  if (error instanceof Error) {
    const sanitizedMessage = SecurityUtils.sanitizeErrorDetails(error.message);
    const maskedStack = process.env.NODE_ENV === 'production' 
      ? undefined 
      : SecurityUtils.maskSensitiveData(error.stack);

    return new BaseError(
      sanitizedMessage,
      500,
      { stack: maskedStack },
      'INTERNAL_ERROR',
      crypto.randomUUID()
    );
  }

  // Handle non-Error objects
  return new BaseError(
    'An unexpected error occurred',
    500,
    {},
    'UNKNOWN_ERROR',
    crypto.randomUUID()
  );
};

/**
 * Enhanced Express error handling middleware with security features
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate correlation ID if not present
  const correlationId = req.headers['x-correlation-id'] as string || crypto.randomUUID();
  req.headers['x-correlation-id'] = correlationId;

  // Transform and sanitize error
  const transformedError = transformError(error);
  
  // Track error patterns for security monitoring
  const errorKey = `${transformedError.status}:${transformedError.errorCode}`;
  const currentCount = errorPatterns.get(errorKey) || 0;
  errorPatterns.set(errorKey, currentCount + 1);

  // Check for potential security incidents
  if (currentCount + 1 >= ERROR_PATTERN_THRESHOLD) {
    errorLoggingMiddleware(req, res, () => {
      console.error('Security Alert: Error pattern threshold exceeded', {
        errorKey,
        count: currentCount + 1,
        correlationId
      });
    });
  }

  // Clean up old error patterns
  setTimeout(() => {
    errorPatterns.delete(errorKey);
  }, ERROR_PATTERN_WINDOW);

  // Log error with security context
  errorLoggingMiddleware(req, res, () => {
    console.error('Error occurred', {
      error: transformedError.toJSON(),
      correlationId,
      securityContext: {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        path: req.path
      }
    });
  });

  // Set security headers
  Object.entries(ERROR_SECURITY_HEADERS).forEach(([header, value]) => {
    res.setHeader(header, value);
  });

  // Apply additional security headers via helmet
  helmet({
    noSniff: true,
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"]
      }
    }
  })(req, res, () => {
    // Send sanitized error response
    res.status(transformedError.status).json({
      status: transformedError.status,
      message: SecurityUtils.sanitizeErrorDetails(transformedError.message),
      errorCode: transformedError.errorCode,
      correlationId,
      timestamp: new Date().toISOString()
    });
  });
};