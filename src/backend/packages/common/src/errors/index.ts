/**
 * @fileoverview Centralized error handling module for Project X rental platform
 * Provides standardized error classes and utilities for consistent error management
 * @version 1.0.0
 */

import { HTTP_STATUS } from '../constants';
import type { ErrorResponse } from '../interfaces';

/**
 * Enhanced base error class with improved tracking and validation capabilities
 * Extends native Error class with additional properties for API error responses
 */
export class BaseError extends Error {
  public readonly status: number;
  public readonly details: Record<string, unknown>;
  public readonly errorCode: string;
  public readonly requestId: string;
  public readonly timestamp: Date;

  /**
   * Creates a new BaseError instance with enhanced tracking and validation
   * @param message - Human-readable error message
   * @param status - HTTP status code (defaults to 500)
   * @param details - Additional error details (optional)
   * @param errorCode - Unique error identifier code (optional)
   * @param requestId - Request tracking ID (optional)
   */
  constructor(
    message: string,
    status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    details: Record<string, unknown> = {},
    errorCode?: string,
    requestId?: string
  ) {
    // Validate required parameters
    if (!message || typeof message !== 'string') {
      throw new Error('Error message is required and must be a string');
    }

    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new Error('Invalid HTTP status code');
    }

    // Call parent constructor with formatted message
    super(message);

    // Set error name for better stack traces
    this.name = this.constructor.name;

    // Initialize error properties with validation
    this.status = status;
    this.details = Object.freeze({ ...details });
    this.errorCode = errorCode || 'INTERNAL_ERROR';
    this.requestId = requestId || crypto.randomUUID();
    this.timestamp = new Date();

    // Capture and enhance stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Freeze error instance for immutability
    Object.freeze(this);
  }

  /**
   * Converts error to JSON format with enhanced tracking information
   * @returns Standardized error response object
   */
  public toJSON(): ErrorResponse {
    const response: ErrorResponse = {
      status: this.status,
      message: this.message,
      details: this.details,
      errorCode: this.errorCode,
      requestId: this.requestId
    };

    // Add stack trace in development environment
    if (process.env.NODE_ENV === 'development') {
      response.details = {
        ...response.details,
        stack: this.stack,
        timestamp: this.timestamp.toISOString()
      };
    }

    return response;
  }
}

/**
 * Bad Request Error (400) for invalid input validation
 */
export class BadRequestError extends BaseError {
  constructor(
    message: string = 'Bad Request',
    details?: Record<string, unknown>,
    errorCode: string = 'BAD_REQUEST',
    requestId?: string
  ) {
    super(message, HTTP_STATUS.BAD_REQUEST, details, errorCode, requestId);
  }
}

/**
 * Unauthorized Error (401) for authentication failures
 */
export class UnauthorizedError extends BaseError {
  constructor(
    message: string = 'Unauthorized',
    details?: Record<string, unknown>,
    errorCode: string = 'UNAUTHORIZED',
    requestId?: string
  ) {
    super(message, HTTP_STATUS.UNAUTHORIZED, details, errorCode, requestId);
  }
}

/**
 * Forbidden Error (403) for authorization failures
 */
export class ForbiddenError extends BaseError {
  constructor(
    message: string = 'Forbidden',
    details?: Record<string, unknown>,
    errorCode: string = 'FORBIDDEN',
    requestId?: string
  ) {
    super(message, HTTP_STATUS.FORBIDDEN, details, errorCode, requestId);
  }
}

/**
 * Not Found Error (404) for resource not found
 */
export class NotFoundError extends BaseError {
  constructor(
    message: string = 'Not Found',
    details?: Record<string, unknown>,
    errorCode: string = 'NOT_FOUND',
    requestId?: string
  ) {
    super(message, HTTP_STATUS.NOT_FOUND, details, errorCode, requestId);
  }
}

/**
 * Internal Server Error (500) for unexpected server errors
 */
export class InternalServerError extends BaseError {
  constructor(
    message: string = 'Internal Server Error',
    details?: Record<string, unknown>,
    errorCode: string = 'INTERNAL_ERROR',
    requestId?: string
  ) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, details, errorCode, requestId);
  }
}

/**
 * Type guard to check if an error is an instance of BaseError
 * @param error - Error to check
 * @returns True if error is BaseError instance
 */
export const isBaseError = (error: unknown): error is BaseError => {
  return error instanceof BaseError;
};

/**
 * Converts any error to a BaseError instance
 * @param error - Error to convert
 * @returns BaseError instance
 */
export const toBaseError = (error: unknown): BaseError => {
  if (isBaseError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message, {
      originalError: error.name,
      stack: error.stack
    });
  }

  return new InternalServerError('An unexpected error occurred', {
    originalError: error
  });
};