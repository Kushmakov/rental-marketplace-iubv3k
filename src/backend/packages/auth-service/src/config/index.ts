/**
 * @fileoverview Authentication service configuration module with enhanced security features
 * Manages environment variables, authentication settings, and service configuration
 * @version 1.0.0
 */

import dotenv from 'dotenv'; // ^16.3.1
import * as joi from 'joi'; // ^17.9.2
import { JWT_CONFIG } from '../../../common/src/constants';
import { DATABASE_CONFIG } from '../../../database/src/config';

// Load environment variables
dotenv.config();

/**
 * Authentication service configuration schema with comprehensive validation
 */
const configSchema = joi.object({
  auth: joi.object({
    port: joi.number().port().default(3001),
    host: joi.string().hostname().default('0.0.0.0'),
    nodeEnv: joi.string().valid('development', 'production', 'test').default('development'),
    logLevel: joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    version: joi.string().pattern(/^\d+\.\d+\.\d+$/).default('1.0.0'),
    corsOrigins: joi.array().items(joi.string().uri()).default([])
  }),
  oauth: joi.object({
    clientId: joi.string().required(),
    clientSecret: joi.string().required(),
    redirectUri: joi.string().uri().required(),
    scope: joi.array().items(joi.string()).default(['profile', 'email']),
    pkceRequired: joi.boolean().default(true),
    authorizationUrl: joi.string().uri().required(),
    tokenUrl: joi.string().uri().required(),
    userInfoUrl: joi.string().uri().required()
  }),
  jwt: joi.object({
    privateKey: joi.string().required(),
    publicKey: joi.string().required(),
    keyPassphrase: joi.string().allow('').optional(),
    expiry: joi.string().default(JWT_CONFIG.TOKEN_EXPIRY),
    refreshExpiry: joi.string().default(JWT_CONFIG.REFRESH_TOKEN_EXPIRY),
    issuer: joi.string().default(JWT_CONFIG.ISSUER),
    algorithm: joi.string().default(JWT_CONFIG.ALGORITHM)
  }),
  password: joi.object({
    saltRounds: joi.number().min(10).max(20).default(12),
    minLength: joi.number().min(8).max(128).default(12),
    requireUppercase: joi.boolean().default(true),
    requireLowercase: joi.boolean().default(true),
    requireNumbers: joi.boolean().default(true),
    requireSpecialChars: joi.boolean().default(true),
    maxAttempts: joi.number().min(3).max(10).default(5),
    lockoutDuration: joi.number().min(300).max(3600).default(900),
    historySize: joi.number().min(3).max(10).default(5)
  }),
  mfa: joi.object({
    issuer: joi.string().default('Project X Rental Platform'),
    digits: joi.number().valid(6, 8).default(6),
    step: joi.number().default(30),
    window: joi.number().min(0).max(2).default(1),
    algorithm: joi.string().valid('SHA1', 'SHA256', 'SHA512').default('SHA256'),
    backupCodesCount: joi.number().min(5).max(20).default(10),
    qrCodeSize: joi.number().min(100).max(400).default(200),
    enforceForRoles: joi.array().items(joi.string()).default(['admin', 'propertyManager'])
  }),
  database: joi.object({
    host: joi.string().required(),
    port: joi.number().port().required(),
    database: joi.string().required(),
    ssl: joi.boolean().default(process.env.NODE_ENV === 'production')
  })
});

/**
 * Loads and validates configuration with enhanced security checks
 * @param configPath - Optional path to configuration file
 * @returns Validated configuration object
 * @throws Error if configuration validation fails
 */
export const loadConfig = (configPath?: string): Record<string, any> => {
  if (configPath) {
    dotenv.config({ path: configPath });
  }

  const config = {
    auth: {
      port: process.env.AUTH_SERVICE_PORT || 3001,
      host: process.env.AUTH_SERVICE_HOST || '0.0.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      version: process.env.SERVICE_VERSION || '1.0.0',
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || []
    },
    oauth: {
      clientId: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      redirectUri: process.env.OAUTH_REDIRECT_URI,
      scope: ['profile', 'email'],
      pkceRequired: true,
      authorizationUrl: process.env.OAUTH_AUTH_URL,
      tokenUrl: process.env.OAUTH_TOKEN_URL,
      userInfoUrl: process.env.OAUTH_USERINFO_URL
    },
    jwt: {
      privateKey: process.env.JWT_PRIVATE_KEY,
      publicKey: process.env.JWT_PUBLIC_KEY,
      keyPassphrase: process.env.JWT_KEY_PASSPHRASE,
      expiry: JWT_CONFIG.TOKEN_EXPIRY,
      refreshExpiry: JWT_CONFIG.REFRESH_TOKEN_EXPIRY,
      issuer: JWT_CONFIG.ISSUER,
      algorithm: JWT_CONFIG.ALGORITHM
    },
    password: {
      saltRounds: 12,
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAttempts: 5,
      lockoutDuration: 900,
      historySize: 5
    },
    mfa: {
      issuer: 'Project X Rental Platform',
      digits: 6,
      step: 30,
      window: 1,
      algorithm: 'SHA256',
      backupCodesCount: 10,
      qrCodeSize: 200,
      enforceForRoles: ['admin', 'propertyManager']
    },
    database: {
      ...DATABASE_CONFIG
    }
  };

  return validateConfig(config);
};

/**
 * Validates configuration object against schema with security checks
 * @param config - Configuration object to validate
 * @returns Validated configuration object
 * @throws Error if validation fails
 */
const validateConfig = (config: Record<string, any>): Record<string, any> => {
  const { error, value } = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message).join(', ');
    throw new Error(`Configuration validation failed: ${details}`);
  }

  // Additional security checks
  if (!value.jwt.privateKey || !value.jwt.publicKey) {
    throw new Error('JWT key pair is required for authentication service');
  }

  if (value.auth.nodeEnv === 'production' && !value.database.ssl) {
    throw new Error('SSL must be enabled for database connections in production');
  }

  if (value.auth.nodeEnv === 'production' && value.corsOrigins.length === 0) {
    throw new Error('CORS origins must be explicitly defined in production');
  }

  return value;
};

// Export validated configuration
export const config = loadConfig();

// Export individual configuration sections
export const {
  auth,
  oauth,
  jwt,
  password,
  mfa,
  database
} = config;