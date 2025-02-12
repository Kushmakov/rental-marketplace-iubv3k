/**
 * @fileoverview Payment Service Configuration Module
 * Provides secure configuration management for payment processing with PCI DSS compliance
 * @version 1.0.0
 */

import { config as dotenv } from 'dotenv'; // ^16.0.0
import { AES, enc } from 'crypto-js'; // ^4.1.1
import { PAYMENT_STATUS, ConfigValidationError } from '@projectx/common';

// Load environment variables with validation
dotenv();

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.PAYMENT_SERVICE_PORT || '3004', 10);
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;

/**
 * Validates all required configuration values with comprehensive security checks
 * @throws {ConfigValidationError} If configuration is invalid
 */
const validateConfig = (): void => {
  const requiredEnvVars = [
    'NODE_ENV',
    'STRIPE_API_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'CONFIG_ENCRYPTION_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new ConfigValidationError(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate Stripe API key format
  const stripeKeyPattern = /^(sk|pk)_(test|live)_[A-Za-z0-9]+$/;
  if (!stripeKeyPattern.test(process.env.STRIPE_API_KEY!)) {
    throw new ConfigValidationError('Invalid Stripe API key format');
  }

  // Validate environment-specific API key
  const isProduction = NODE_ENV === 'production';
  const keyType = process.env.STRIPE_API_KEY!.includes('_live_');
  if (isProduction !== keyType) {
    throw new ConfigValidationError('Stripe API key environment mismatch');
  }

  // Validate database URL format
  const dbUrlPattern = /^postgres:\/\/.+/;
  if (!dbUrlPattern.test(process.env.DATABASE_URL!)) {
    throw new ConfigValidationError('Invalid database URL format');
  }

  // Validate Redis URL format
  const redisUrlPattern = /^redis:\/\/.+/;
  if (!redisUrlPattern.test(process.env.REDIS_URL!)) {
    throw new ConfigValidationError('Invalid Redis URL format');
  }
};

/**
 * Encrypts sensitive configuration values
 * @param config Configuration object containing sensitive data
 * @returns Encrypted configuration object
 */
const encryptSensitiveConfig = (config: Record<string, any>): Record<string, any> => {
  if (!ENCRYPTION_KEY) {
    throw new ConfigValidationError('Encryption key is required for sensitive config');
  }

  const sensitiveFields = ['apiKey', 'webhookSecret', 'databaseUrl'];
  const encrypted = { ...config };

  for (const field of sensitiveFields) {
    if (encrypted[field]) {
      encrypted[field] = AES.encrypt(encrypted[field], ENCRYPTION_KEY).toString();
    }
  }

  return encrypted;
};

// Validate configuration on module load
validateConfig();

// Basic service configuration
export const config = {
  env: NODE_ENV,
  port: PORT,
  isProduction: NODE_ENV === 'production',
  serviceName: 'payment-service',
  version: '1.0.0'
};

// Stripe integration configuration
export const stripeConfig = encryptSensitiveConfig({
  apiKey: process.env.STRIPE_API_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  apiVersion: '2023-10-16',
  retryConfig: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000
  }
});

// Database configuration with SSL
export const databaseConfig = {
  url: process.env.DATABASE_URL,
  options: {
    ssl: config.isProduction,
    maxConnections: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  },
  ssl: config.isProduction ? {
    rejectUnauthorized: true,
    ca: process.env.DATABASE_CA_CERT
  } : undefined
};

// Redis configuration with TLS
export const redisConfig = {
  url: process.env.REDIS_URL,
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  tls: config.isProduction ? {
    rejectUnauthorized: true,
    ca: process.env.REDIS_CA_CERT
  } : undefined,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true
};

// Payment processing configuration
export const paymentConfig = {
  currency: 'USD',
  minimumAmount: 100, // $1.00
  maximumAmount: 50000000, // $500,000.00
  processingFee: 0.029, // 2.9%
  fixedFee: 30, // $0.30
  retryPolicy: {
    maxAttempts: 3,
    backoffMultiplier: 1.5,
    initialDelay: 1000
  },
  transactionStates: {
    pending: PAYMENT_STATUS.PENDING,
    completed: PAYMENT_STATUS.COMPLETED
  },
  securitySettings: {
    requireVerification: true,
    requireAddress: true,
    requirePostalCode: true,
    requireCVC: true,
    validateAmount: true,
    validateCurrency: true,
    validateCustomer: true,
    validateSource: true
  },
  pciCompliance: {
    dataRetentionDays: 30,
    maskCardNumber: true,
    maskCVC: true,
    encryptData: true,
    auditLogging: true
  }
};