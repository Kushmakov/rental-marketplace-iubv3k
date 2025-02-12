/**
 * Core TypeScript model defining the rental unit entity structure within a property.
 * Implements comprehensive unit details, features, pricing, availability status,
 * and image management with strict type safety and immutability.
 * @packageDocumentation
 */

import { BaseEntity } from '@common/interfaces';
import { Property } from './property.model';

/**
 * Enumeration of possible unit availability statuses
 */
export enum UnitStatus {
  /** Unit is available for rent */
  AVAILABLE = 'AVAILABLE',
  /** Unit is currently rented */
  RENTED = 'RENTED',
  /** Unit is under maintenance */
  MAINTENANCE = 'MAINTENANCE',
  /** Unit is temporarily reserved */
  RESERVED = 'RESERVED'
}

/**
 * Interface for unit image metadata with immutable properties
 */
export interface UnitImage {
  /** Unique identifier for the image */
  readonly id: string;
  /** Full URL to the image resource */
  readonly url: string;
  /** Image type/category (e.g., 'interior', 'exterior', 'floorplan') */
  readonly type: string;
  /** Whether this is the primary image for the unit */
  readonly isPrimary: boolean;
}

/**
 * Core unit interface extending BaseEntity with comprehensive unit details
 * and immutable properties for data integrity
 */
export interface Unit extends BaseEntity {
  /** Unique identifier inherited from BaseEntity */
  readonly id: string;

  /** Reference to the parent property */
  readonly propertyId: string;

  /** Unit identifier within the property */
  readonly unitNumber: string;

  /** Floor number within the building */
  readonly floorNumber: number;

  /** Current availability status */
  status: UnitStatus;

  /** Number of bedrooms */
  readonly bedrooms: number;

  /** Number of bathrooms */
  readonly bathrooms: number;

  /** Total square footage */
  readonly squareFeet: number;

  /** Monthly rental price */
  monthlyRent: number;

  /** Required security deposit */
  securityDeposit: number;

  /** Date when unit becomes available */
  availableFrom: Date;

  /** Array of unit features and amenities */
  features: readonly string[];

  /** Array of unit images */
  images: readonly UnitImage[];

  /** Creation timestamp inherited from BaseEntity */
  readonly createdAt: Date;

  /** Last update timestamp inherited from BaseEntity */
  readonly updatedAt: Date;
}