/**
 * @fileoverview Configuration module for the notification microservice
 * Handles environment variables, service settings, and integration configurations
 * for email, SMS and in-app notifications with enhanced security validation
 * @version 1.0.0
 */

import dotenv from 'dotenv'; // v16.3.1
import Joi from 'joi'; // v17.9.2
import winston from 'winston'; // v3.8.2
import { HTTP_STATUS } from '@projectx/common';

// Initialize environment variables
dotenv.config();

// Configure logger for configuration validation
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Configuration schema definition using Joi
const configSchema = Joi.object({
  service: Joi.object({
    name: Joi.string().required().default('notification-service'),
    port: Joi.number().default(3005),
    env: Joi.string().valid('development', 'staging', 'production').default('development'),
    logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    apiVersion: Joi.string().required().default('v1'),
    corsOrigins: Joi.array().items(Joi.string()).default(['http://localhost:3000']),
    rateLimits: Joi.object({
      windowMs: Joi.number().default(60000),
      max: Joi.number().default(100)
    })
  }),

  email: Joi.object({
    provider: Joi.string().valid('sendgrid').required(),
    apiKey: Joi.string().required(),
    fromEmail: Joi.string().email().required(),
    templateIds: Joi.object({
      welcome: Joi.string().required(),
      applicationUpdate: Joi.string().required(),
      paymentConfirmation: Joi.string().required(),
      propertyUpdate: Joi.string().required(),
      leaseDocument: Joi.string().required(),
      maintenanceRequest: Joi.string().required()
    }).required(),
    retryConfig: Joi.object({
      attempts: Joi.number().default(3),
      backoff: Joi.string().valid('exponential').default('exponential')
    })
  }),

  sms: Joi.object({
    provider: Joi.string().valid('twilio').required(),
    accountSid: Joi.string().required(),
    authToken: Joi.string().required(),
    fromNumber: Joi.string().required(),
    messageTemplates: Joi.object({
      verificationCode: Joi.string().required(),
      applicationStatus: Joi.string().required(),
      paymentReminder: Joi.string().required(),
      maintenanceUpdate: Joi.string().required(),
      viewingScheduled: Joi.string().required()
    }).required(),
    retryConfig: Joi.object({
      attempts: Joi.number().default(3),
      backoff: Joi.string().valid('exponential').default('exponential')
    })
  }),

  database: Joi.object({
    url: Joi.string().required(),
    name: Joi.string().default('notifications'),
    options: Joi.object({
      useNewUrlParser: Joi.boolean().default(true),
      useUnifiedTopology: Joi.boolean().default(true),
      retryWrites: Joi.boolean().default(true),
      w: Joi.string().default('majority')
    })
  }),

  security: Joi.object({
    encryption: Joi.object({
      algorithm: Joi.string().valid('aes-256-gcm').default('aes-256-gcm'),
      keyRotationDays: Joi.number().default(30)
    }),
    audit: Joi.object({
      enabled: Joi.boolean().default(true),
      retentionDays: Joi.number().default(90)
    })
  })
});

/**
 * Validates notification templates format and required variables
 * @param templates - Record of template IDs and their content
 * @returns boolean indicating if all templates are valid
 */
const validateTemplates = (templates: Record<string, string>): boolean => {
  try {
    const requiredTemplates = [
      'welcome',
      'applicationUpdate',
      'paymentConfirmation',
      'propertyUpdate',
      'leaseDocument',
      'maintenanceRequest'
    ];

    // Check if all required templates exist
    const missingTemplates = requiredTemplates.filter(
      template => !templates[template]
    );

    if (missingTemplates.length > 0) {
      logger.error('Missing required templates:', { missingTemplates });
      return false;
    }

    // Validate template format and variables
    for (const [id, template] of Object.entries(templates)) {
      if (!template || typeof template !== 'string') {
        logger.error('Invalid template format:', { templateId: id });
        return false;
      }

      // Verify template contains required variable placeholders
      const requiredVariables = ['{{userName}}', '{{timestamp}}'];
      const missingVariables = requiredVariables.filter(
        variable => !template.includes(variable)
      );

      if (missingVariables.length > 0) {
        logger.error('Template missing required variables:', {
          templateId: id,
          missingVariables
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('Template validation error:', { error });
    return false;
  }
};

/**
 * Validates all configuration values against defined schemas
 * @throws Error if validation fails
 */
const validateConfig = (): void => {
  try {
    const { error, value } = configSchema.validate({
      service: {
        name: process.env.SERVICE_NAME || 'notification-service',
        port: parseInt(process.env.PORT || '3005', 10),
        env: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info',
        apiVersion: 'v1',
        corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        rateLimits: {
          windowMs: 60000,
          max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
        }
      },
      email: {
        provider: 'sendgrid',
        apiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.EMAIL_FROM,
        templateIds: {
          welcome: process.env.EMAIL_TEMPLATE_WELCOME,
          applicationUpdate: process.env.EMAIL_TEMPLATE_APPLICATION_UPDATE,
          paymentConfirmation: process.env.EMAIL_TEMPLATE_PAYMENT_CONFIRMATION,
          propertyUpdate: process.env.EMAIL_TEMPLATE_PROPERTY_UPDATE,
          leaseDocument: process.env.EMAIL_TEMPLATE_LEASE_DOCUMENT,
          maintenanceRequest: process.env.EMAIL_TEMPLATE_MAINTENANCE
        },
        retryConfig: {
          attempts: 3,
          backoff: 'exponential'
        }
      },
      sms: {
        provider: 'twilio',
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.SMS_FROM_NUMBER,
        messageTemplates: {
          verificationCode: process.env.SMS_TEMPLATE_VERIFICATION,
          applicationStatus: process.env.SMS_TEMPLATE_APPLICATION_STATUS,
          paymentReminder: process.env.SMS_TEMPLATE_PAYMENT_REMINDER,
          maintenanceUpdate: process.env.SMS_TEMPLATE_MAINTENANCE_UPDATE,
          viewingScheduled: process.env.SMS_TEMPLATE_VIEWING_SCHEDULED
        },
        retryConfig: {
          attempts: 3,
          backoff: 'exponential'
        }
      },
      database: {
        url: process.env.MONGODB_URI,
        name: process.env.MONGODB_DB_NAME || 'notifications',
        options: {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          retryWrites: true,
          w: 'majority'
        }
      },
      security: {
        encryption: {
          algorithm: 'aes-256-gcm',
          keyRotationDays: 30
        },
        audit: {
          enabled: true,
          retentionDays: 90
        }
      }
    }, { abortEarly: false });

    if (error) {
      logger.error('Configuration validation failed:', { error: error.details });
      throw new Error(`Configuration validation failed: ${error.message}`);
    }

    // Additional validation for templates
    if (!validateTemplates(value.email.templateIds)) {
      throw new Error('Email template validation failed');
    }

    if (!validateTemplates(value.sms.messageTemplates)) {
      throw new Error('SMS template validation failed');
    }

    logger.info('Configuration validation successful');
    return value;
  } catch (error) {
    logger.error('Configuration validation error:', { error });
    throw error;
  }
};

// Export validated configuration
export const config = validateConfig();

// Type definitions for exported configuration
export type Config = typeof config;
export type EmailConfig = Config['email'];
export type SMSConfig = Config['sms'];
export type DatabaseConfig = Config['database'];
export type SecurityConfig = Config['security'];

export default config;