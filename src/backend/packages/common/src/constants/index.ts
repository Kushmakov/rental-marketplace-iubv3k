/**
 * @fileoverview Centralized constants module for Project X rental platform
 * Contains shared constants, enums, and configuration values used across backend microservices
 * @version 1.0.0
 */

/**
 * HTTP status codes used for standardized API responses
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatusCode = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
export const ALL_STATUS_CODES = Object.values(HTTP_STATUS);

/**
 * User roles for role-based access control
 */
export const USER_ROLES = {
  RENTER: 'RENTER',
  LANDLORD: 'LANDLORD',
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
export const ALL_ROLES = Object.values(USER_ROLES);

/**
 * Application lifecycle status constants
 */
export const APPLICATION_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PENDING_DOCUMENTS: 'PENDING_DOCUMENTS',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type ApplicationStatus = typeof APPLICATION_STATUS[keyof typeof APPLICATION_STATUS];
export const ALL_APPLICATION_STATUSES = Object.values(APPLICATION_STATUS);

/**
 * Payment processing status constants
 */
export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  DISPUTED: 'DISPUTED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];
export const ALL_PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);

/**
 * Currency configuration
 */
export const CURRENCY = {
  USD: 'USD',
  DEFAULT: 'USD',
} as const;

export type Currency = typeof CURRENCY[keyof typeof CURRENCY];

/**
 * JWT authentication configuration
 * Using RS256 algorithm for enhanced security
 */
export const JWT_CONFIG = {
  TOKEN_EXPIRY: '24h',
  REFRESH_TOKEN_EXPIRY: '7d',
  ISSUER: 'project-x-rental-platform',
  ALGORITHM: 'RS256',
  KEY_ID: 'current',
  TOKEN_VERSION: 'v1',
  AUDIENCE: 'project-x-api',
  CLOCK_TOLERANCE: 30, // seconds
} as const;

export const ALL_JWT_CONFIG = { ...JWT_CONFIG };

/**
 * Rate limiting configuration with header support
 * Window: 15 minutes (900000ms)
 * Max requests: 1000 per window
 */
export const RATE_LIMIT = {
  WINDOW_MS: 900000,
  MAX_REQUESTS: 1000,
  SKIP_FAILED_REQUESTS: true,
  HEADERS: true,
  LEGACY_HEADERS: false,
  DRAFT_POLLI_HEADERS: true,
} as const;

export const ALL_RATE_LIMIT_CONFIG = { ...RATE_LIMIT };

/**
 * Cache TTL configuration in seconds for different entity types
 */
export const CACHE_TTL = {
  USER: 3600,          // 1 hour
  PROPERTY: 1800,      // 30 minutes
  APPLICATION: 300,    // 5 minutes
  LISTING: 900,       // 15 minutes
  SEARCH_RESULTS: 600, // 10 minutes
  STATIC_CONTENT: 86400, // 24 hours
} as const;

export const ALL_CACHE_TTL = { ...CACHE_TTL };

/**
 * Type guard functions for runtime type checking
 */
export const isUserRole = (role: unknown): role is UserRole => {
  return typeof role === 'string' && Object.values(USER_ROLES).includes(role as UserRole);
};

export const isApplicationStatus = (status: unknown): status is ApplicationStatus => {
  return typeof status === 'string' && Object.values(APPLICATION_STATUS).includes(status as ApplicationStatus);
};

export const isPaymentStatus = (status: unknown): status is PaymentStatus => {
  return typeof status === 'string' && Object.values(PAYMENT_STATUS).includes(status as PaymentStatus);
};

export const isCurrency = (currency: unknown): currency is Currency => {
  return typeof currency === 'string' && Object.values(CURRENCY).includes(currency as Currency);
};