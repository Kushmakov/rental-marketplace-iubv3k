/**
 * @fileoverview Common middleware module for Project X rental platform
 * Provides reusable middleware functions for authentication, authorization,
 * error handling, logging, and rate limiting across backend microservices
 * @version 1.0.0
 */

import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import jwt from 'jsonwebtoken'; // v9.0.1
import winston from 'winston'; // v3.10.0
import DailyRotateFile from 'winston-daily-rotate-file'; // v4.7.1
import rateLimit from 'express-rate-limit'; // v6.9.0
import Redis from 'ioredis'; // v5.3.2
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import { HTTP_STATUS, JWT_CONFIG, USER_ROLES } from '../constants';
import { BaseError, UnauthorizedError, ForbiddenError } from '../errors';

// Types
interface DecodedToken {
  userId: string;
  role: string;
  version: string;
  iat: number;
  exp: number;
}

interface LoggerOptions {
  level: string;
  rotation: {
    maxSize: string;
    maxFiles: string;
  };
  format: {
    timestamp: boolean;
    colorize: boolean;
  };
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  bypassRules?: Array<{
    ip?: string;
    path?: string;
  }>;
}

// Global configurations
const RATE_LIMIT_CONFIG = {
  windowMs: 900000, // 15 minutes
  maxRequests: 1000,
  bypassRules: []
};

const LOGGER_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  rotation: {
    maxSize: '100m',
    maxFiles: '14d'
  },
  format: {
    timestamp: true,
    colorize: process.env.NODE_ENV === 'development'
  }
};

/**
 * Validates JWT token with enhanced security checks
 * @param token - JWT token to validate
 * @returns Decoded token payload
 * @throws UnauthorizedError if token is invalid
 */
export const validateToken = async (token: string): Promise<DecodedToken> => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY!, {
      algorithms: [JWT_CONFIG.ALGORITHM],
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
      clockTolerance: JWT_CONFIG.CLOCK_TOLERANCE
    }) as DecodedToken;

    if (decoded.version !== JWT_CONFIG.TOKEN_VERSION) {
      throw new UnauthorizedError('Token version is invalid');
    }

    return decoded;
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token', { originalError: error });
  }
};

/**
 * Validates user role against allowed roles with hierarchy support
 * @param userRole - User's current role
 * @param allowedRoles - Array of allowed roles
 * @returns Boolean indicating if role is allowed
 */
export const validateRole = (userRole: string, allowedRoles: string[]): boolean => {
  if (!userRole || !allowedRoles.length) return false;

  // Role hierarchy - higher roles inherit lower role permissions
  const roleHierarchy = {
    [USER_ROLES.SUPER_ADMIN]: [USER_ROLES.ADMIN, USER_ROLES.AGENT, USER_ROLES.LANDLORD, USER_ROLES.RENTER],
    [USER_ROLES.ADMIN]: [USER_ROLES.AGENT, USER_ROLES.LANDLORD, USER_ROLES.RENTER],
    [USER_ROLES.AGENT]: [USER_ROLES.RENTER],
    [USER_ROLES.LANDLORD]: [USER_ROLES.RENTER]
  };

  return allowedRoles.some(role => 
    role === userRole || roleHierarchy[userRole]?.includes(role)
  );
};

/**
 * Creates configured Winston logger instance with rotation
 * @param options - Logger configuration options
 * @returns Configured Winston logger
 */
export const createLogger = (options: LoggerOptions = LOGGER_CONFIG): winston.Logger => {
  const logger = winston.createLogger({
    level: options.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'rental-platform' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ]
  });

  if (process.env.NODE_ENV === 'production') {
    logger.add(new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: options.rotation.maxSize,
      maxFiles: options.rotation.maxFiles,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }));
  }

  return logger;
};

// Initialize logger instance
export const logger = createLogger();

/**
 * Creates rate limiting middleware with Redis cluster support
 * @param options - Rate limiting configuration
 * @returns Configured rate limiting middleware
 */
export const createRateLimiter = (options: RateLimitOptions = RATE_LIMIT_CONFIG): RequestHandler => {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    enableReadyCheck: true
  });

  return rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      return options.bypassRules?.some(rule => 
        (rule.ip && req.ip === rule.ip) ||
        (rule.path && req.path.startsWith(rule.path))
      ) ?? false;
    },
    handler: (req, res) => {
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        status: HTTP_STATUS.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil(options.windowMs / 1000)
      });
    },
    store: {
      incr: (key) => redis.incr(key),
      decr: (key) => redis.decr(key),
      resetKey: (key) => redis.del(key)
    }
  });
};

// Export configured rate limiting middleware
export const rateLimitMiddleware = createRateLimiter();

/**
 * Security headers middleware using helmet
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: true,
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: true,
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
});

/**
 * Request tracking middleware for correlation IDs
 */
export const requestTracker: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('x-request-id', requestId);

  // Log request details
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      requestId,
      statusCode: res.statusCode,
      duration,
      contentLength: res.getHeader('content-length')
    });
  });

  next();
};

/**
 * Global error handling middleware
 */
export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const baseError = error instanceof BaseError ? error : new BaseError(
    error.message || 'Internal Server Error',
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    { stack: error.stack }
  );

  logger.error('Error occurred', {
    requestId: req.headers['x-request-id'],
    error: baseError.toJSON()
  });

  res.status(baseError.status).json(baseError.toJSON());
};