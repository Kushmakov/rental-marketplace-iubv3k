/**
 * @fileoverview Configuration module for the application service
 * Manages environment variables, service settings, and integration configurations
 * for the rental application processing system
 * @version 1.0.0
 */

import { z } from 'zod'; // ^3.22.0
import dotenv from 'dotenv'; // ^16.3.1
import { APPLICATION_STATUS } from '../../../common/src/constants';
import { DATABASE_CONFIG } from '../../../database/src/config';

// Load environment variables
dotenv.config();

/**
 * Custom error class for configuration-related issues
 */
export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'CONFIG_ERROR'
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Service configuration schema validation
 */
const serviceConfigSchema = z.object({
  port: z.number().int().positive(),
  host: z.string().min(1),
  nodeEnv: z.enum(['development', 'production', 'test']),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  region: z.string().min(1),
  serviceName: z.string().min(1),
  version: z.string().min(1)
});

/**
 * Verification configuration schema validation
 */
const verificationConfigSchema = z.object({
  creditCheckEnabled: z.boolean(),
  backgroundCheckEnabled: z.boolean(),
  incomeVerificationEnabled: z.boolean(),
  creditScoreThreshold: z.number().int().min(300).max(850),
  incomeMultiplier: z.number().positive(),
  verificationTimeout: z.number().int().positive(),
  retryAttempts: z.number().int().positive(),
  providers: z.object({
    credit: z.string().min(1),
    background: z.string().min(1),
    income: z.string().min(1)
  })
});

/**
 * Document configuration schema validation
 */
const documentConfigSchema = z.object({
  maxFileSize: z.number().int().positive(),
  allowedFileTypes: z.array(z.string()),
  maxDocuments: z.number().int().positive(),
  storageProvider: z.string().min(1),
  bucketName: z.string().min(1),
  retentionPeriod: z.number().int().positive(),
  compressionEnabled: z.boolean(),
  encryptionKey: z.string().min(1),
  cdnEnabled: z.boolean(),
  cdnDomain: z.string().optional()
});

/**
 * Notification configuration schema validation
 */
const notificationConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().min(1),
  applicationTopic: z.string().min(1),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  templates: z.object({
    applicationSubmitted: z.string().min(1),
    applicationApproved: z.string().min(1),
    applicationRejected: z.string().min(1)
  }),
  retryConfig: z.object({
    maxAttempts: z.number().int().positive(),
    backoffMs: z.number().int().positive()
  })
});

/**
 * Service configuration object
 */
export const APPLICATION_SERVICE_CONFIG = {
  port: parseInt(process.env.APPLICATION_SERVICE_PORT || '3003', 10),
  host: process.env.APPLICATION_SERVICE_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  region: process.env.AWS_REGION || 'us-east-1',
  serviceName: 'application-service',
  version: process.env.SERVICE_VERSION || '1.0.0'
} as const;

/**
 * Verification configuration object
 */
export const VERIFICATION_CONFIG = {
  creditCheckEnabled: process.env.CREDIT_CHECK_ENABLED === 'true',
  backgroundCheckEnabled: process.env.BACKGROUND_CHECK_ENABLED === 'true',
  incomeVerificationEnabled: process.env.INCOME_VERIFICATION_ENABLED === 'true',
  creditScoreThreshold: parseInt(process.env.CREDIT_SCORE_THRESHOLD, 10) || 650,
  incomeMultiplier: parseFloat(process.env.INCOME_MULTIPLIER) || 3.0,
  verificationTimeout: parseInt(process.env.VERIFICATION_TIMEOUT, 10) || 30000,
  retryAttempts: parseInt(process.env.VERIFICATION_RETRY_ATTEMPTS, 10) || 3,
  providers: {
    credit: process.env.CREDIT_CHECK_PROVIDER || 'experian',
    background: process.env.BACKGROUND_CHECK_PROVIDER || 'checkr',
    income: process.env.INCOME_VERIFICATION_PROVIDER || 'plaid'
  }
} as const;

/**
 * Document configuration object
 */
export const DOCUMENT_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  maxDocuments: parseInt(process.env.MAX_DOCUMENTS, 10) || 10,
  storageProvider: process.env.DOCUMENT_STORAGE_PROVIDER || 's3',
  bucketName: process.env.DOCUMENT_BUCKET_NAME,
  retentionPeriod: parseInt(process.env.DOCUMENT_RETENTION_DAYS, 10) || 365,
  compressionEnabled: process.env.DOCUMENT_COMPRESSION_ENABLED === 'true',
  encryptionKey: process.env.DOCUMENT_ENCRYPTION_KEY,
  cdnEnabled: process.env.DOCUMENT_CDN_ENABLED === 'true',
  cdnDomain: process.env.DOCUMENT_CDN_DOMAIN
} as const;

/**
 * Notification configuration object
 */
export const NOTIFICATION_CONFIG = {
  enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
  provider: process.env.NOTIFICATION_PROVIDER || 'sns',
  applicationTopic: process.env.APPLICATION_NOTIFICATION_TOPIC,
  emailEnabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
  smsEnabled: process.env.SMS_NOTIFICATIONS_ENABLED === 'true',
  templates: {
    applicationSubmitted: process.env.TEMPLATE_APPLICATION_SUBMITTED,
    applicationApproved: process.env.TEMPLATE_APPLICATION_APPROVED,
    applicationRejected: process.env.TEMPLATE_APPLICATION_REJECTED
  },
  retryConfig: {
    maxAttempts: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS, 10) || 3,
    backoffMs: parseInt(process.env.NOTIFICATION_RETRY_BACKOFF, 10) || 1000
  }
} as const;

/**
 * Validates configuration values against schemas
 * @param config Configuration object to validate
 * @throws {ConfigurationError} If validation fails
 */
export const validateConfig = (config: any): boolean => {
  try {
    serviceConfigSchema.parse(config.service);
    verificationConfigSchema.parse(config.verification);
    documentConfigSchema.parse(config.document);
    notificationConfigSchema.parse(config.notification);

    // Validate required environment variables
    if (!config.document.bucketName) {
      throw new ConfigurationError('Document bucket name is required');
    }
    if (!config.document.encryptionKey) {
      throw new ConfigurationError('Document encryption key is required');
    }
    if (!config.notification.applicationTopic) {
      throw new ConfigurationError('Application notification topic is required');
    }

    // Validate application status transitions
    if (!Object.values(APPLICATION_STATUS).includes(APPLICATION_STATUS.DRAFT)) {
      throw new ConfigurationError('Invalid application status configuration');
    }

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ConfigurationError(`Configuration validation failed: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Loads and validates all configuration settings
 * @returns Validated configuration object
 * @throws {ConfigurationError} If configuration loading or validation fails
 */
export const loadConfig = () => {
  try {
    const config = {
      service: APPLICATION_SERVICE_CONFIG,
      verification: VERIFICATION_CONFIG,
      document: DOCUMENT_CONFIG,
      notification: NOTIFICATION_CONFIG
    };

    validateConfig(config);

    // Merge with database config
    return {
      ...config,
      database: {
        host: DATABASE_CONFIG.host,
        port: DATABASE_CONFIG.port
      }
    };
  } catch (error) {
    throw new ConfigurationError(
      `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Export validated configuration
export const config = loadConfig();