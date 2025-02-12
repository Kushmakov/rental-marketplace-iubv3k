/**
 * @fileoverview Common utility functions module providing reusable helper functions
 * for data validation, formatting, security, error handling and other shared operations
 * across all backend microservices with enterprise-grade implementation
 * @version 1.0.0
 */

import { HTTP_STATUS } from '../constants';
import { ErrorResponse } from '../interfaces';
import bcrypt from 'bcrypt'; // v5.1.1
import jwt from 'jsonwebtoken'; // v9.0.2
import validator from 'validator'; // v13.11.0
import dayjs from 'dayjs'; // v1.11.10
import winston from 'winston'; // v3.11.0

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

/**
 * Creates a standardized error response object
 * @param statusCode - HTTP status code
 * @param message - Error message
 * @param details - Additional error details
 * @returns Standardized error response object
 */
export const createErrorResponse = (
  statusCode: number,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse => {
  // Validate status code
  if (!Object.values(HTTP_STATUS).includes(statusCode)) {
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }

  // Sanitize error message
  const sanitizedMessage = validator.escape(message);

  // Generate error code from status and timestamp
  const errorCode = `ERR_${statusCode}_${dayjs().unix()}`;

  return {
    code: errorCode,
    message: sanitizedMessage,
    details: details || {}
  };
};

/**
 * Handles validation errors with standardized format
 * @param error - Validation error object
 * @param context - Validation context
 * @returns Formatted validation error response
 */
export const handleValidationError = (
  error: Error,
  context: string
): ErrorResponse => {
  logger.error('Validation error', {
    error: error.message,
    context,
    stack: error.stack
  });

  return createErrorResponse(
    HTTP_STATUS.BAD_REQUEST,
    'Validation failed',
    {
      context,
      details: error.message,
      timestamp: dayjs().toISOString()
    }
  );
};

/**
 * Handles database errors with standardized format
 * @param error - Database error object
 * @param operation - Database operation description
 * @returns Formatted database error response
 */
export const handleDatabaseError = (
  error: Error,
  operation: string
): ErrorResponse => {
  logger.error('Database error', {
    error: error.message,
    operation,
    stack: error.stack
  });

  // Mask sensitive information
  const sanitizedMessage = 'Database operation failed';

  return createErrorResponse(
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    sanitizedMessage,
    {
      operation,
      errorId: dayjs().unix(),
      timestamp: dayjs().toISOString()
    }
  );
};

/**
 * Handles authentication errors with standardized format
 * @param error - Authentication error object
 * @param authType - Type of authentication
 * @returns Formatted authentication error response
 */
export const handleAuthenticationError = (
  error: Error,
  authType: string
): ErrorResponse => {
  logger.error('Authentication error', {
    error: error.message,
    authType,
    stack: error.stack
  });

  const statusCode = error.message.includes('invalid token') 
    ? HTTP_STATUS.UNAUTHORIZED 
    : HTTP_STATUS.FORBIDDEN;

  return createErrorResponse(
    statusCode,
    'Authentication failed',
    {
      authType,
      errorId: dayjs().unix(),
      timestamp: dayjs().toISOString()
    }
  );
};

/**
 * Handles unexpected errors with standardized format
 * @param error - Unexpected error object
 * @returns Formatted unexpected error response
 */
export const handleUnexpectedError = (error: Error): ErrorResponse => {
  // Generate unique error reference
  const errorRef = `UNEXP_${dayjs().unix()}`;

  logger.error('Unexpected error', {
    error: error.message,
    errorRef,
    stack: error.stack
  });

  return createErrorResponse(
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    'An unexpected error occurred',
    {
      errorRef,
      timestamp: dayjs().toISOString()
    }
  );
};

/**
 * Security utility functions
 */

/**
 * Hashes a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

/**
 * Compares a password with its hash
 * @param password - Plain text password
 * @param hash - Hashed password
 * @returns Boolean indicating match
 */
export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Validates and sanitizes an email address
 * @param email - Email address to validate
 * @returns Sanitized email or null if invalid
 */
export const validateEmail = (email: string): string | null => {
  if (!validator.isEmail(email)) {
    return null;
  }
  return validator.normalizeEmail(email);
};

/**
 * Sanitizes user input to prevent XSS
 * @param input - User input to sanitize
 * @returns Sanitized input
 */
export const sanitizeInput = (input: string): string => {
  return validator.escape(input);
};

/**
 * Formats a date using dayjs
 * @param date - Date to format
 * @param format - Optional format string
 * @returns Formatted date string
 */
export const formatDate = (
  date: Date | string,
  format = 'YYYY-MM-DD HH:mm:ss'
): string => {
  return dayjs(date).format(format);
};

/**
 * Validates a JWT token
 * @param token - JWT token to validate
 * @param secret - Secret key for validation
 * @returns Decoded token payload or null if invalid
 */
export const validateToken = (
  token: string,
  secret: string
): object | null => {
  try {
    return jwt.verify(token, secret) as object;
  } catch (error) {
    logger.error('Token validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
};