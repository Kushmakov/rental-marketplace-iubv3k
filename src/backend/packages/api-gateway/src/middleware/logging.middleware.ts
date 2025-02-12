import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid'; // v9.0.0
import { logger } from '@common/middleware';

// Headers that should be redacted from logs for security
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-session-id',
  'x-csrf-token'
];

// Log levels for different types of messages
const LOG_LEVELS = {
  INFO: 'info',
  ERROR: 'error',
  WARN: 'warn',
  DEBUG: 'debug'
};

// Performance thresholds for request duration monitoring
const PERFORMANCE_THRESHOLDS = {
  WARNING_MS: 500,  // Trigger warning if request takes longer than 500ms
  ERROR_MS: 1000,   // Trigger error if request takes longer than 1000ms
  MAX_BODY_SIZE: 10000 // Max body size to log in bytes
};

/**
 * Formats request details into structured log object
 * @param req - Express request object
 * @param requestId - Unique request identifier
 */
const formatRequestLog = (req: Request, requestId: string) => {
  // Sanitize headers by removing sensitive information
  const sanitizedHeaders = { ...req.headers };
  SENSITIVE_HEADERS.forEach(header => {
    if (sanitizedHeaders[header]) {
      sanitizedHeaders[header] = '[REDACTED]';
    }
  });

  return {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: sanitizedHeaders,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: (req as any).user?.id, // User ID if authenticated
    processId: process.pid,
    nodeEnv: process.env.NODE_ENV
  };
};

/**
 * Formats response details into structured log object
 * @param res - Express response object
 * @param requestId - Unique request identifier
 * @param duration - Request duration in milliseconds
 */
const formatResponseLog = (res: Response, requestId: string, duration: number) => {
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    statusCode: res.statusCode,
    headers: res.getHeaders(),
    duration,
    contentLength: res.get('content-length'),
    performanceMetrics: {
      duration,
      thresholds: {
        warning: PERFORMANCE_THRESHOLDS.WARNING_MS,
        error: PERFORMANCE_THRESHOLDS.ERROR_MS
      }
    }
  };

  // Add error details for non-success status codes
  if (res.statusCode >= 400) {
    logData['error'] = {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      errorRate: {
        window: '1m',
        threshold: '1%'
      }
    };
  }

  return logData;
};

/**
 * Express middleware for comprehensive request/response logging
 * Implements request tracking, performance monitoring, and error rate tracking
 */
const loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique request ID if not already present
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  
  // Add request ID to response headers for correlation
  res.setHeader('x-request-id', requestId);

  // Record request start time for duration calculation
  const startTime = process.hrtime.bigint();

  // Log incoming request
  logger.info('Incoming request', formatRequestLog(req, requestId));

  // Intercept response to log completion
  res.on('finish', () => {
    // Calculate request duration in milliseconds
    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;

    // Check for performance issues
    if (duration > PERFORMANCE_THRESHOLDS.ERROR_MS) {
      logger.error('Request exceeded error threshold', {
        requestId,
        duration,
        threshold: PERFORMANCE_THRESHOLDS.ERROR_MS
      });
    } else if (duration > PERFORMANCE_THRESHOLDS.WARNING_MS) {
      logger.warn('Request exceeded warning threshold', {
        requestId,
        duration,
        threshold: PERFORMANCE_THRESHOLDS.WARNING_MS
      });
    }

    // Log response details
    logger.info('Request completed', formatResponseLog(res, requestId, duration));

    // Track error rates for monitoring
    if (res.statusCode >= 400) {
      logger.error('Request error', {
        requestId,
        statusCode: res.statusCode,
        duration
      });
    }
  });

  next();
};

export default loggingMiddleware;