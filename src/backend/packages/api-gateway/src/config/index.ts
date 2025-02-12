/**
 * @fileoverview API Gateway Configuration Module
 * Production-ready configuration with comprehensive validation and security controls
 * @version 1.0.0
 */

import { config as dotenvConfig } from 'dotenv'; // v16.3.1
import { z } from 'zod'; // v3.22.2
import validator from 'validator'; // v13.11.0
import { JWT_CONFIG, RATE_LIMIT } from '../../../common/src/constants';

// Load environment variables
dotenvConfig();

// Environment and global constants
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.API_GATEWAY_PORT || '3000', 10);
const CONFIG_VERSION = process.env.CONFIG_VERSION || '1.0';

// Zod schema for configuration validation
const ServerConfigSchema = z.object({
  port: z.number().min(1).max(65535),
  host: z.string().min(1),
  bodyLimit: z.string().regex(/^\d+(?:kb|mb)$/i),
  apiVersion: z.string().regex(/^v\d+$/),
  timeout: z.number().min(1000).max(30000)
});

const CorsConfigSchema = z.object({
  origin: z.array(z.string().url()),
  methods: z.array(z.string()),
  allowedHeaders: z.array(z.string()),
  exposedHeaders: z.array(z.string()),
  credentials: z.boolean(),
  maxAge: z.number().min(0)
});

const RateLimitConfigSchema = z.object({
  windowMs: z.number().min(1000),
  max: z.number().min(1),
  standardHeaders: z.boolean(),
  legacyHeaders: z.boolean(),
  skipFailedRequests: z.boolean(),
  keyGenerator: z.function()
});

const AuthConfigSchema = z.object({
  jwtPublicKey: z.string().min(1),
  tokenExpiry: z.string().min(1),
  algorithm: z.string().min(1),
  issuer: z.string().min(1),
  audience: z.array(z.string().min(1))
});

const TlsConfigSchema = z.object({
  enabled: z.boolean(),
  certPath: z.string().min(1),
  keyPath: z.string().min(1),
  minVersion: z.string().regex(/^TLSv1\.[23]$/)
});

const HeadersConfigSchema = z.object({
  hsts: z.boolean(),
  noSniff: z.boolean(),
  frameOptions: z.string().min(1),
  xssProtection: z.string().min(1)
});

const ServiceHealthCheckSchema = z.object({
  enabled: z.boolean(),
  interval: z.number().min(1000),
  path: z.string().startsWith('/')
});

const CircuitBreakerSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().min(1),
  resetTimeout: z.number().min(1000)
});

const RetryPolicySchema = z.object({
  attempts: z.number().min(1),
  delay: z.number().min(0),
  backoff: z.number().min(1)
});

const ServiceConfigSchema = z.object({
  url: z.string().url(),
  timeout: z.number().min(1000),
  healthCheck: ServiceHealthCheckSchema,
  circuitBreaker: CircuitBreakerSchema,
  retry: RetryPolicySchema
});

const MonitoringConfigSchema = z.object({
  enabled: z.boolean(),
  metrics: z.object({
    enabled: z.boolean(),
    path: z.string().startsWith('/'),
    interval: z.number().min(1000)
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    format: z.enum(['json', 'text']),
    destination: z.string().min(1)
  }),
  tracing: z.object({
    enabled: z.boolean(),
    samplingRate: z.number().min(0).max(1)
  }),
  alerting: z.object({
    enabled: z.boolean(),
    endpoints: z.array(z.string().url())
  })
});

// Configuration object with default values
export const config = {
  env: NODE_ENV,
  version: CONFIG_VERSION,
  
  server: {
    port: PORT,
    host: process.env.API_GATEWAY_HOST || '0.0.0.0',
    bodyLimit: process.env.API_BODY_LIMIT || '10mb',
    apiVersion: 'v1',
    timeout: 10000
  },

  security: {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
      credentials: true,
      maxAge: 86400
    },

    rateLimit: {
      windowMs: RATE_LIMIT.WINDOW_MS,
      max: RATE_LIMIT.MAX_REQUESTS,
      standardHeaders: true,
      legacyHeaders: false,
      skipFailedRequests: true,
      keyGenerator: (req: any) => req.ip
    },

    auth: {
      jwtPublicKey: process.env.JWT_PUBLIC_KEY || '',
      tokenExpiry: JWT_CONFIG.TOKEN_EXPIRY,
      algorithm: JWT_CONFIG.ALGORITHM,
      issuer: JWT_CONFIG.ISSUER,
      audience: [JWT_CONFIG.AUDIENCE]
    },

    tls: {
      enabled: process.env.TLS_ENABLED === 'true',
      certPath: process.env.TLS_CERT_PATH || '',
      keyPath: process.env.TLS_KEY_PATH || '',
      minVersion: 'TLSv1.2'
    },

    headers: {
      hsts: true,
      noSniff: true,
      frameOptions: 'DENY',
      xssProtection: '1; mode=block'
    }
  },

  services: {
    auth: {
      url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      timeout: 5000,
      healthCheck: {
        enabled: true,
        interval: 30000,
        path: '/health'
      },
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        resetTimeout: 30000
      },
      retry: {
        attempts: 3,
        delay: 1000,
        backoff: 2
      }
    }
  },

  monitoring: {
    enabled: true,
    metrics: {
      enabled: true,
      path: '/metrics',
      interval: 15000
    },
    logging: {
      level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
      format: 'json',
      destination: process.env.LOG_DESTINATION || 'stdout'
    },
    tracing: {
      enabled: true,
      samplingRate: 0.1
    },
    alerting: {
      enabled: true,
      endpoints: process.env.ALERT_ENDPOINTS?.split(',') || []
    }
  }
};

/**
 * Validates the entire configuration object against defined schemas
 * @throws {Error} if validation fails
 */
export function validateConfig(): void {
  try {
    ServerConfigSchema.parse(config.server);
    CorsConfigSchema.parse(config.security.cors);
    RateLimitConfigSchema.parse(config.security.rateLimit);
    AuthConfigSchema.parse(config.security.auth);
    TlsConfigSchema.parse(config.security.tls);
    HeadersConfigSchema.parse(config.security.headers);
    ServiceConfigSchema.parse(config.services.auth);
    MonitoringConfigSchema.parse(config.monitoring);

    // Additional validation for URLs
    if (!validator.isURL(config.services.auth.url)) {
      throw new Error('Invalid auth service URL');
    }

    // Validate all monitoring endpoints
    config.monitoring.alerting.endpoints.forEach(endpoint => {
      if (!validator.isURL(endpoint)) {
        throw new Error(`Invalid alerting endpoint: ${endpoint}`);
      }
    });

  } catch (error) {
    throw new Error(`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Loads and validates the configuration
 * @returns {typeof config} Validated configuration object
 */
export function loadConfig(): typeof config {
  validateConfig();
  return config;
}

// Export validated configuration
export default loadConfig();