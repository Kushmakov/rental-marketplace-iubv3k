import { User } from '../types/auth';

/**
 * Enumeration of valid property types in the rental marketplace
 * Aligned with property management requirements
 */
export enum PropertyType {
  APARTMENT = 'APARTMENT',
  HOUSE = 'HOUSE',
  CONDO = 'CONDO'
}

/**
 * Enumeration of property listing statuses
 * Supports complete property lifecycle management
 */
export enum PropertyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
  ARCHIVED = 'ARCHIVED'
}

/**
 * Enumeration of unit availability statuses
 * Supports comprehensive unit lifecycle tracking
 */
export enum UnitStatus {
  AVAILABLE = 'AVAILABLE',
  RENTED = 'RENTED',
  MAINTENANCE = 'MAINTENANCE',
  RESERVED = 'RESERVED',
  PENDING_APPROVAL = 'PENDING_APPROVAL'
}

/**
 * Standardized address interface for property locations
 * Ensures consistent address formatting across the platform
 */
export interface Address {
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

/**
 * Geographic location interface for property mapping
 * Supports precise location-based search and mapping features
 */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Property image interface with enhanced metadata
 * Supports image management and gallery features
 */
export interface PropertyImage {
  id: string;
  url: string;
  type: string;
  isPrimary: boolean;
  caption: string | null;
  order: number;
}

/**
 * Unit image interface extending PropertyImage
 * Specific to unit-level images
 */
export interface UnitImage extends PropertyImage {
  unitId: string;
}

/**
 * Comprehensive rental unit interface
 * Contains all unit-specific details and features
 */
export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  floorNumber: number | null;
  status: UnitStatus;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  monthlyRent: number;
  securityDeposit: number;
  availableFrom: Date;
  features: string[];
  images: UnitImage[];
  lastUpdated: Date;
}

/**
 * Comprehensive property interface
 * Core data structure for rental properties with complete tracking
 */
export interface Property {
  id: string;
  name: string;
  description: string | null;
  type: PropertyType;
  status: PropertyStatus;
  ownerId: string;
  address: Address;
  location: GeoLocation;
  yearBuilt: number;
  totalUnits: number;
  amenities: string[];
  images: PropertyImage[];
  units: Unit[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Property search filters interface
 * Supports advanced property search functionality
 */
export interface PropertySearchFilters {
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  minSquareFeet?: number;
  maxSquareFeet?: number;
  amenities?: string[];
  availableFrom?: Date;
  location?: {
    latitude: number;
    longitude: number;
    radiusInMiles: number;
  };
}

/**
 * Property creation request interface
 * Ensures all required fields are provided when creating new properties
 */
export interface CreatePropertyRequest extends Omit<Property, 'id' | 'createdAt' | 'updatedAt'> {
  initialUnits?: Omit<Unit, 'id' | 'propertyId' | 'lastUpdated'>[];
}

/**
 * Property update request interface
 * Supports partial updates to existing properties
 */
export interface UpdatePropertyRequest extends Partial<Omit<Property, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>> {
  id: string;
}

/**
 * Unit update request interface
 * Supports partial updates to existing units
 */
export interface UpdateUnitRequest extends Partial<Omit<Unit, 'id' | 'propertyId' | 'lastUpdated'>> {
  id: string;
  propertyId: string;
}