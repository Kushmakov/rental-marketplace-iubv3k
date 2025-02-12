/**
 * Core interfaces and types shared across the rental platform microservices.
 * Provides type definitions for data models, API contracts, and domain entities.
 * @packageDocumentation
 */

/**
 * Base interface for all database entities providing audit fields and optimistic locking
 */
export interface BaseEntity {
  /** Unique identifier */
  readonly id: string;
  /** Record creation timestamp */
  readonly createdAt: Date;
  /** Last update timestamp */
  readonly updatedAt: Date;
  /** Optimistic locking version number */
  readonly version: number;
}

/**
 * Core user interface extending BaseEntity with comprehensive user data
 */
export interface User extends BaseEntity {
  /** Unique email address */
  readonly email: string;
  /** User's assigned role */
  readonly role: UserRole;
  /** User's profile information */
  readonly profile: UserProfile;
  /** Current account status */
  readonly status: UserStatus;
  /** Timestamp of last successful login */
  readonly lastLoginAt: Date | null;
}

/**
 * User profile information
 */
export interface UserProfile {
  /** User's first name */
  readonly firstName: string;
  /** User's last name */
  readonly lastName: string;
  /** User's phone number */
  readonly phone: string;
  /** Profile picture URL */
  readonly avatarUrl?: string;
  /** User's preferred language */
  readonly preferredLanguage?: string;
  /** User's timezone */
  readonly timezone?: string;
}

/**
 * Enumeration of available user roles for authorization
 */
export enum UserRole {
  RENTER = 'RENTER',
  PROPERTY_MANAGER = 'PROPERTY_MANAGER',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN'
}

/**
 * Enumeration of possible user account statuses
 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION'
}

/**
 * Generic API response interface with comprehensive error handling
 * @template T - Type of the response data
 */
export interface ApiResponse<T> {
  /** HTTP status code */
  readonly status: number;
  /** Response payload */
  readonly data: T;
  /** Human-readable message */
  readonly message: string;
  /** Array of validation errors if any */
  readonly errors: ValidationError[];
  /** Response timestamp */
  readonly timestamp: Date;
  /** Unique request identifier for tracing */
  readonly requestId: string;
}

/**
 * Detailed validation error interface for API responses
 */
export interface ValidationError {
  /** Field that failed validation */
  readonly field: string;
  /** Error code for programmatic handling */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
}

/**
 * Generic paginated response interface with cursor support
 * @template T - Type of items being paginated
 */
export interface PaginatedResponse<T> {
  /** Array of items for current page */
  readonly items: readonly T[];
  /** Total number of items across all pages */
  readonly total: number;
  /** Current page number (1-based) */
  readonly page: number;
  /** Number of items per page */
  readonly limit: number;
  /** Whether more items exist beyond current page */
  readonly hasMore: boolean;
}

/**
 * Comprehensive address interface with geocoding support
 */
export interface Address {
  /** Primary street address */
  readonly street1: string;
  /** Secondary street address (apt, unit, etc) */
  readonly street2: string | null;
  /** City name */
  readonly city: string;
  /** State/province code */
  readonly state: string;
  /** Postal code */
  readonly zipCode: string;
  /** Country code (ISO 3166-1 alpha-2) */
  readonly country: string;
  /** Geographic coordinates */
  readonly location: GeoLocation;
}

/**
 * Geographic location interface with accuracy information
 */
export interface GeoLocation {
  /** Latitude in decimal degrees */
  readonly latitude: number;
  /** Longitude in decimal degrees */
  readonly longitude: number;
  /** Accuracy radius in meters (if available) */
  readonly accuracy: number | null;
}