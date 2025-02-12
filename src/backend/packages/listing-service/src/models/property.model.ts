/**
 * Property model defining the core data structure for rental properties
 * in the marketplace platform. Includes comprehensive property details,
 * management information, and compliance-related data.
 * @packageDocumentation
 */

import { BaseEntity, Address, GeoLocation } from '@common/interfaces';

/**
 * Enumeration of supported property types
 */
export enum PropertyType {
  APARTMENT = 'APARTMENT',
  HOUSE = 'HOUSE',
  CONDO = 'CONDO'
}

/**
 * Enumeration of possible property statuses
 */
export enum PropertyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
  MAINTENANCE = 'MAINTENANCE',
  RESERVED = 'RESERVED'
}

/**
 * Interface for property image metadata
 */
export interface ImageMetadata {
  width: number;
  height: number;
  sizeInBytes: number;
  format: string;
  takenAt?: Date;
}

/**
 * Interface for property images with accessibility support
 */
export interface PropertyImage {
  id: string;
  url: string;
  type: string;
  isPrimary: boolean;
  metadata: ImageMetadata;
  altText: string;
}

/**
 * Interface for property features and amenities
 */
export interface PropertyFeature {
  name: string;
  category: string;
  description: string;
  isHighlighted: boolean;
}

/**
 * Interface for unit information
 */
export interface Unit {
  id: string;
  unitNumber: string;
  floorPlan: string;
  squareFeet: number;
  bedrooms: number;
  bathrooms: number;
  isAvailable: boolean;
  monthlyRent: number;
  features: string[];
}

/**
 * Interface for lease terms and conditions
 */
export interface LeaseTerms {
  minLeaseDuration: number;
  maxLeaseDuration: number;
  securityDeposit: number;
  petDeposit?: number;
  utilityRequirements: string[];
  requiredInsurance: string[];
}

/**
 * Interface for property rules and policies
 */
export interface PropertyRules {
  petPolicy: string;
  smokingPolicy: string;
  parkingPolicy: string;
  guestPolicy: string;
  noisePolicy: string;
  maintenancePolicy: string;
}

/**
 * Interface for accessibility information
 */
export interface AccessibilityInfo {
  hasWheelchairAccess: boolean;
  hasElevator: boolean;
  hasAccessibleParking: boolean;
  hasAccessibleUnit: boolean;
  accessibleFeatures: string[];
}

/**
 * Interface for fair housing compliance information
 */
export interface FairHousingInfo {
  isFairHousingCompliant: boolean;
  equalOpportunityStatement: string;
  acceptsHousingVouchers: boolean;
  accessibilityStatement: string;
}

/**
 * Core property interface extending BaseEntity with comprehensive
 * property management and compliance features
 */
export interface Property extends BaseEntity {
  name: string;
  description: string;
  type: PropertyType;
  status: PropertyStatus;
  ownerId: string;
  propertyManagerId: string;
  address: Address;
  location: GeoLocation;
  yearBuilt: number;
  totalUnits: number;
  amenities: string[];
  propertyFeatures: PropertyFeature[];
  images: PropertyImage[];
  units: Unit[];
  leaseTerms: LeaseTerms;
  propertyRules: PropertyRules;
  accessibility: AccessibilityInfo;
  fairHousing: FairHousingInfo;
}