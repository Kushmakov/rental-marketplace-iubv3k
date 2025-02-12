/**
 * @fileoverview Distributed rate limiting middleware using Redis for API Gateway
 * Implements token bucket algorithm with Redis storage for cross-instance rate limiting
 * @version 1.0.0
 */

import rateLimit from 'express-rate-limit'; // v7.1.0
import RedisStore from 'rate-limit-redis'; // v4.0.0
import Redis from 'ioredis'; // v5.3.2
import winston from 'winston'; // v3.10.0
import { rateLimit as rateLimitConfig, redis as redisConfig } from '../config';
import { BadRequestError } from '@projectx/common/errors';

// Configure logger for rate limit events
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Initialize Redis client with retry strategy
const redisClient = new Redis({
  ...redisConfig,
  retryStrategy: (times: number) => Math.min(times * 50, 2000)
});

// Cache for rate limit skip decisions
const RATE_LIMIT_CACHE = new Map<string, boolean>();

/**
 * Determines if rate limiting should be skipped for a request
 * @param req - Express request object
 * @returns Boolean indicating if rate limiting should be skipped
 */
const shouldSkipRateLimit = (req: any): boolean => {
  const cacheKey = `skip:${req.ip}:${req.path}`;
  
  // Check cache first
  if (RATE_LIMIT_CACHE.has(cacheKey)) {
    return RATE_LIMIT_CACHE.get(cacheKey)!;
  }

  // Validate IP address
  if (!req.ip || typeof req.ip !== 'string') {
    return false;
  }

  // Check for whitelisted IPs or paths
  const skipRequest = (
    // Internal health check endpoints
    req.path.startsWith('/health') ||
    req.path.startsWith('/metrics') ||
    // Whitelisted IP ranges (e.g., internal services)
    req.ip.startsWith('10.') ||
    req.ip.startsWith('172.16.') ||
    req.ip.startsWith('192.168.')
  );

  // Cache the decision for 5 minutes
  RATE_LIMIT_CACHE.set(cacheKey, skipRequest);
  setTimeout(() => RATE_LIMIT_CACHE.delete(cacheKey), 300000);

  return skipRequest;
};

/**
 * Handles rate limit violations and Redis errors
 * @param error - Error object
 * @param req - Express request object
 */
const handleRateLimitError = (error: Error, req: any): void => {
  logger.error('Rate limit error', {
    error: error.message,
    ip: req.ip,
    path: req.path,
    requestId: req.id
  });

  throw new BadRequestError(
    'Too many requests, please try again later',
    {
      retryAfter: rateLimitConfig.windowMs / 1000,
      limit: rateLimitConfig.max,
      requestId: req.id
    },
    'RATE_LIMIT_EXCEEDED'
  );
};

/**
 * Creates and configures the rate limiting middleware
 * @returns Configured rate limit middleware
 */
const createRateLimiter = () => {
  // Ensure Redis connection
  redisClient.on('error', (error) => {
    logger.error('Redis connection error', { error: error.message });
  });

  // Configure Redis store with error handling
  const store = new RedisStore({
    prefix: 'rl:',
    sendCommand: (...args: string[]) => redisClient.call(...args),
    resetKey: (key) => {
      return new Promise((resolve) => {
        redisClient.del(key).then(() => resolve(true)).catch(() => resolve(false));
      });
    }
  });

  // Configure rate limiter with Redis store
  return rateLimit({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.max,
    standardHeaders: rateLimitConfig.standardHeaders,
    legacyHeaders: rateLimitConfig.legacyHeaders,
    skipFailedRequests: rateLimitConfig.skipFailedRequests,
    skip: shouldSkipRateLimit,
    store,
    keyGenerator: (req) => {
      // Generate unique key based on IP and optional user ID
      const userId = req.user?.id || '';
      return `${req.ip}:${userId}`;
    },
    handler: (req: any, _res: any, next: any) => {
      handleRateLimitError(
        new Error('Rate limit exceeded'),
        req
      );
    },
    onLimitReached: (req: any) => {
      logger.warn('Rate limit reached', {
        ip: req.ip,
        path: req.path,
        requestId: req.id
      });
    }
  });
};

// Export configured middleware
export const rateLimitMiddleware = createRateLimiter();