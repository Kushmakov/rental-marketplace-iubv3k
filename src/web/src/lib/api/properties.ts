// @package zod@3.22.0
// @package axios-retry@3.8.0
// @package lru-cache@10.0.0

import { z } from 'zod';
import retry from 'axios-retry';
import { LRUCache } from 'lru-cache';
import axiosInstance from '../axios';
import { 
  Property, 
  PropertyType, 
  PropertyStatus,
  PropertySearchFilters,
  CreatePropertyRequest,
  UpdatePropertyRequest
} from '../../types/property';

// Initialize caching with 5 minute TTL
const propertyCache = new LRUCache<string, Property[]>({
  max: 100,
  ttl: 1000 * 60 * 5
});

// Configure retry strategy
const RETRY_CONFIG = {
  retries: 3,
  retryDelay: (retryCount: number) => Math.pow(2, retryCount) * 1000
};

// Apply retry configuration to axios instance
retry(axiosInstance, RETRY_CONFIG);

// Validation schemas
const propertySearchSchema = z.object({
  type: z.nativeEnum(PropertyType).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  minSquareFeet: z.number().min(0).optional(),
  maxSquareFeet: z.number().min(0).optional(),
  amenities: z.array(z.string()).optional(),
  availableFrom: z.date().optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    radiusInMiles: z.number().min(0)
  }).optional()
});

const propertyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.nativeEnum(PropertyType),
  status: z.nativeEnum(PropertyStatus),
  // ... other property fields
});

const propertyArraySchema = z.array(propertyResponseSchema);

/**
 * Searches properties based on provided filters with caching and request cancellation
 * @param filters - Search criteria for properties
 * @param signal - AbortSignal for request cancellation
 * @returns Promise resolving to array of matching properties
 */
export const searchProperties = async (
  filters: PropertySearchFilters,
  signal?: AbortSignal
): Promise<Property[]> => {
  try {
    // Validate input filters
    const validatedFilters = propertySearchSchema.parse(filters);
    
    // Generate cache key from filters
    const cacheKey = JSON.stringify(validatedFilters);
    
    // Check cache first
    const cachedResult = propertyCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Make API request with abort signal
    const response = await axiosInstance.get('/api/properties/search', {
      params: validatedFilters,
      signal
    });

    // Validate response
    const properties = propertyArraySchema.parse(response.data);
    
    // Cache successful response
    propertyCache.set(cacheKey, properties);
    
    return properties;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('Invalid search filters provided');
    }
    throw error;
  }
};

/**
 * Retrieves a single property by ID
 * @param id - Property UUID
 * @returns Promise resolving to property details
 */
export const getPropertyById = async (id: string): Promise<Property> => {
  const response = await axiosInstance.get(`/api/properties/${id}`);
  return propertyResponseSchema.parse(response.data);
};

/**
 * Creates a new property listing
 * @param property - Property creation request
 * @returns Promise resolving to created property
 */
export const createProperty = async (
  property: CreatePropertyRequest
): Promise<Property> => {
  const response = await axiosInstance.post('/api/properties', property);
  return propertyResponseSchema.parse(response.data);
};

/**
 * Updates an existing property
 * @param property - Property update request
 * @returns Promise resolving to updated property
 */
export const updateProperty = async (
  property: UpdatePropertyRequest
): Promise<Property> => {
  const response = await axiosInstance.put(
    `/api/properties/${property.id}`,
    property
  );
  return propertyResponseSchema.parse(response.data);
};

/**
 * Deletes a property listing
 * @param id - Property UUID
 * @returns Promise resolving on successful deletion
 */
export const deleteProperty = async (id: string): Promise<void> => {
  await axiosInstance.delete(`/api/properties/${id}`);
};

/**
 * Updates property availability status
 * @param id - Property UUID
 * @param status - New property status
 * @returns Promise resolving to updated property
 */
export const updatePropertyAvailability = async (
  id: string,
  status: PropertyStatus
): Promise<Property> => {
  const response = await axiosInstance.put(`/api/properties/${id}/status`, {
    status
  });
  return propertyResponseSchema.parse(response.data);
};

// Clear property cache when mutations occur
const clearPropertyCache = () => propertyCache.clear();

// Attach cache clearing to mutation operations
[createProperty, updateProperty, deleteProperty, updatePropertyAvailability].forEach(
  fn => {
    const original = fn;
    (fn as any) = async (...args: any[]) => {
      const result = await original(...args);
      clearPropertyCache();
      return result;
    };
  }
);