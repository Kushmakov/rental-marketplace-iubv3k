/**
 * Core type definitions and interfaces for the API Gateway service.
 * Provides enhanced request/response types, authentication types, and service-specific interfaces.
 * @packageDocumentation
 */

import { Request } from 'express'; // v4.18.2
import { User, UserRole, ApiResponse } from '@projectx/common';

/**
 * Extended Express Request interface with authenticated user data.
 * Provides immutable user and token properties for type-safe request handling.
 */
export interface AuthenticatedRequest extends Request {
  readonly user: Readonly<User>;
  readonly token: Readonly<string>;
}

/**
 * Enhanced service response interface with service identification and timing.
 * @template T - Type of the response data
 */
export interface ServiceResponse<T> extends ApiResponse<T> {
  /** Service identifier that processed the request */
  readonly service: string;
  /** Response timestamp for service timing analysis */
  readonly timestamp: Date;
}

/**
 * Request interface with strictly typed and immutable route parameters.
 * @template T - Type of route parameters extending Record<string, unknown>
 */
export interface RequestWithParams<T extends Record<string, unknown>> extends Request {
  readonly params: Readonly<T>;
}

/**
 * Request interface with strictly typed and immutable request body.
 * @template T - Type of request body
 */
export interface RequestWithBody<T> extends Request {
  readonly body: Readonly<T>;
}

/**
 * Request interface with strictly typed and immutable query parameters.
 * @template T - Type of query parameters extending Record<string, unknown>
 */
export interface RequestWithQuery<T extends Record<string, unknown>> extends Request {
  readonly query: Readonly<T>;
}

/**
 * Enhanced API Gateway specific error interface with detailed error tracking.
 * Provides comprehensive error information for debugging and monitoring.
 */
export interface GatewayError {
  /** Error code for programmatic handling */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
  /** Service identifier where error originated */
  readonly service: string;
  /** Additional error context and details */
  readonly details: Record<string, unknown>;
  /** Error timestamp for timing analysis */
  readonly timestamp: Date;
  /** Unique request identifier for tracing */
  readonly requestId: string;
}

/**
 * Type guard to check if a request is authenticated
 * @param request - Express request object
 */
export function isAuthenticatedRequest(request: Request): request is AuthenticatedRequest {
  return 'user' in request && 'token' in request;
}

/**
 * Type guard to check if an error is a GatewayError
 * @param error - Error object to check
 */
export function isGatewayError(error: unknown): error is GatewayError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'service' in error &&
    'requestId' in error
  );
}

/**
 * Union type of all possible user roles for strict role checking
 */
export type UserRoleType = keyof typeof UserRole;

/**
 * Type for service identification in responses
 */
export type ServiceIdentifier = string;

/**
 * Type for request tracking
 */
export type RequestId = string;