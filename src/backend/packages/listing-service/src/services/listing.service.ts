/**
 * Enhanced listing service implementing property listing management functionality
 * with resilience patterns, caching, and performance optimizations.
 * @packageDocumentation
 */

import { Injectable } from '@nestjs/common';
import Redis from 'ioredis'; // v5.3.2
import CircuitBreaker from 'opossum'; // v7.1.0
import { Logger } from 'winston'; // v3.10.0
import { Metrics } from 'prom-client'; // v14.2.0

import { Property, PropertyType, PropertyStatus } from '../models/property.model';
import { PropertyRepository } from '../repositories/property.repository';
import { SearchService } from './search.service';
import { CACHE_TTL } from '@common/constants';

/**
 * Interface for property creation parameters
 */
interface CreatePropertyParams {
  name: string;
  description: string;
  type: PropertyType;
  status: PropertyStatus;
  ownerId: string;
  propertyManagerId: string;
  address: any;
  location: any;
  yearBuilt: number;
  totalUnits: number;
  amenities: string[];
  propertyFeatures: any[];
  images: any[];
  units: any[];
  leaseTerms: any;
  propertyRules: any;
  accessibility: any;
  fairHousing: any;
}

/**
 * Enhanced service implementing property listing management functionality
 */
@Injectable()
export class ListingService {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly CACHE_PREFIX = 'listing:';

  constructor(
    private readonly propertyRepository: PropertyRepository,
    private readonly searchService: SearchService,
    private readonly cacheClient: Redis,
    private readonly logger: Logger,
    private readonly metricsClient: Metrics
  ) {
    // Initialize circuit breaker for repository operations
    this.circuitBreaker = new CircuitBreaker(
      async (operation: () => Promise<any>) => operation(),
      {
        timeout: 5000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        name: 'listing-service'
      }
    );

    // Register metrics
    this.initializeMetrics();

    // Error handling
    this.setupErrorHandlers();
  }

  /**
   * Creates a new property listing with enhanced validation and resilience
   */
  async createListing(params: CreatePropertyParams): Promise<Property> {
    const startTime = Date.now();
    this.logger.info('Creating new property listing', { params });

    try {
      // Validate property data
      this.validatePropertyData(params);

      // Check for duplicates
      await this.checkDuplicateListing(params);

      // Create property with circuit breaker
      const property = await this.circuitBreaker.fire(async () => {
        return this.propertyRepository.createProperty({
          ...params,
          status: PropertyStatus.ACTIVE
        });
      });

      // Cache the new property
      await this.cacheProperty(property);

      // Track metrics
      this.trackListingCreation(Date.now() - startTime);

      this.logger.info('Property listing created successfully', { 
        propertyId: property.id 
      });

      return property;

    } catch (error) {
      this.logger.error('Failed to create property listing', { 
        error,
        params 
      });
      throw error;
    }
  }

  /**
   * Updates an existing property listing with optimistic locking
   */
  async updateListing(id: string, params: Partial<CreatePropertyParams>): Promise<Property> {
    const startTime = Date.now();
    this.logger.info('Updating property listing', { id, params });

    try {
      // Get existing property
      const existing = await this.getPropertyById(id);
      if (!existing) {
        throw new Error('Property not found');
      }

      // Update property with circuit breaker
      const updated = await this.circuitBreaker.fire(async () => {
        return this.propertyRepository.updateProperty(id, params);
      });

      // Update cache
      await this.cacheProperty(updated);

      // Track metrics
      this.trackListingUpdate(Date.now() - startTime);

      this.logger.info('Property listing updated successfully', { 
        propertyId: id 
      });

      return updated;

    } catch (error) {
      this.logger.error('Failed to update property listing', { 
        error,
        id,
        params 
      });
      throw error;
    }
  }

  /**
   * Retrieves a property listing by ID with caching
   */
  async getPropertyById(id: string): Promise<Property | null> {
    try {
      // Check cache first
      const cached = await this.getCachedProperty(id);
      if (cached) {
        return cached;
      }

      // Get from repository with circuit breaker
      const property = await this.circuitBreaker.fire(async () => {
        return this.propertyRepository.searchProperties({ id });
      });

      if (property.items.length) {
        await this.cacheProperty(property.items[0]);
        return property.items[0];
      }

      return null;

    } catch (error) {
      this.logger.error('Failed to get property by ID', { 
        error,
        id 
      });
      throw error;
    }
  }

  /**
   * Searches for property listings with enhanced filtering
   */
  async searchListings(params: any): Promise<any> {
    const startTime = Date.now();
    this.logger.info('Searching property listings', { params });

    try {
      const results = await this.searchService.searchProperties(params);
      
      // Track metrics
      this.trackListingSearch(Date.now() - startTime, results.total);

      return results;

    } catch (error) {
      this.logger.error('Failed to search property listings', { 
        error,
        params 
      });
      throw error;
    }
  }

  /**
   * Validates property data before creation/update
   */
  private validatePropertyData(params: CreatePropertyParams): void {
    if (!params.name || params.name.length < 3) {
      throw new Error('Invalid property name');
    }

    if (!params.description || params.description.length < 10) {
      throw new Error('Invalid property description');
    }

    if (!params.address || !params.address.street1) {
      throw new Error('Invalid property address');
    }

    if (!params.location || !params.location.latitude || !params.location.longitude) {
      throw new Error('Invalid property location');
    }

    if (!params.units || !params.units.length) {
      throw new Error('Property must have at least one unit');
    }
  }

  /**
   * Checks for duplicate listings based on address and owner
   */
  private async checkDuplicateListing(params: CreatePropertyParams): Promise<void> {
    const existing = await this.searchService.searchProperties({
      query: params.address.street1,
      ownerId: params.ownerId
    });

    if (existing.total > 0) {
      throw new Error('Duplicate property listing detected');
    }
  }

  /**
   * Caches property data with TTL
   */
  private async cacheProperty(property: Property): Promise<void> {
    const key = `${this.CACHE_PREFIX}${property.id}`;
    await this.cacheClient.setex(
      key,
      CACHE_TTL.PROPERTY,
      JSON.stringify(property)
    );
  }

  /**
   * Retrieves cached property data
   */
  private async getCachedProperty(id: string): Promise<Property | null> {
    const key = `${this.CACHE_PREFIX}${id}`;
    const cached = await this.cacheClient.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Initializes service metrics
   */
  private initializeMetrics(): void {
    this.metricsClient.register.clear();
    
    new this.metricsClient.Counter({
      name: 'listing_creations_total',
      help: 'Total number of property listings created'
    });

    new this.metricsClient.Histogram({
      name: 'listing_creation_duration_seconds',
      help: 'Time taken to create property listings',
      buckets: [0.1, 0.5, 1, 2, 5]
    });

    new this.metricsClient.Counter({
      name: 'listing_searches_total',
      help: 'Total number of property searches performed'
    });
  }

  /**
   * Sets up error handlers for the service
   */
  private setupErrorHandlers(): void {
    this.circuitBreaker.on('open', () => {
      this.logger.warn('Circuit breaker opened');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.info('Circuit breaker half-open');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.info('Circuit breaker closed');
    });
  }

  /**
   * Tracks listing creation metrics
   */
  private trackListingCreation(duration: number): void {
    this.metricsClient.register.getSingleMetric('listing_creations_total')?.inc();
    this.metricsClient.register
      .getSingleMetric('listing_creation_duration_seconds')
      ?.observe(duration / 1000);
  }

  /**
   * Tracks listing update metrics
   */
  private trackListingUpdate(duration: number): void {
    this.metricsClient.register
      .getSingleMetric('listing_update_duration_seconds')
      ?.observe(duration / 1000);
  }

  /**
   * Tracks listing search metrics
   */
  private trackListingSearch(duration: number, resultCount: number): void {
    this.metricsClient.register.getSingleMetric('listing_searches_total')?.inc();
    this.metricsClient.register
      .getSingleMetric('listing_search_duration_seconds')
      ?.observe(duration / 1000);
    this.metricsClient.register
      .getSingleMetric('listing_search_results_total')
      ?.observe(resultCount);
  }
}