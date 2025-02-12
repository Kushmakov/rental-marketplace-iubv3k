/**
 * Property repository implementing data access and persistence operations
 * for property entities in the rental marketplace platform.
 * @packageDocumentation
 */

import { Injectable } from '@nestjs/common';
import { Pool } from 'pg'; // v8.11.0
import { Client } from '@elastic/elasticsearch'; // v8.9.0
import CircuitBreaker from 'opossum'; // v7.1.0
import { Property, PropertyType, PropertyStatus } from '../models/property.model';
import { Unit } from '../models/unit.model';
import { createDatabasePool } from '@database/config';
import { DatabaseError, HTTP_STATUS } from '@common/constants';

/**
 * Search parameters interface for property queries
 */
interface SearchParams {
  query?: string;
  location?: {
    lat: number;
    lon: number;
    radius: number;
  };
  propertyType?: PropertyType[];
  priceRange?: {
    min?: number;
    max?: number;
  };
  amenities?: string[];
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search result interface with pagination and facets
 */
interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  facets: {
    propertyTypes: { [key in PropertyType]: number };
    priceRanges: { min: number; max: number; count: number }[];
    amenities: { name: string; count: number }[];
  };
  suggestions?: string[];
}

@Injectable()
export class PropertyRepository {
  private readonly dbCircuitBreaker: CircuitBreaker;
  private readonly searchCircuitBreaker: CircuitBreaker;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  constructor(
    private readonly dbPool: Pool = createDatabasePool(),
    private readonly esClient: Client,
    options?: CircuitBreaker.Options
  ) {
    // Configure database circuit breaker
    this.dbCircuitBreaker = new CircuitBreaker(async (operation: () => Promise<any>) => {
      return operation();
    }, {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      ...options
    });

    // Configure search circuit breaker
    this.searchCircuitBreaker = new CircuitBreaker(async (operation: () => Promise<any>) => {
      return operation();
    }, {
      timeout: 3000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      ...options
    });

    // Error event handlers
    this.dbCircuitBreaker.on('open', () => console.error('Database circuit breaker opened'));
    this.searchCircuitBreaker.on('open', () => console.error('Search circuit breaker opened'));
  }

  /**
   * Creates a new property with transaction management and optimistic locking
   * @param property Property data to create
   * @returns Created property with generated ID and version
   */
  async createProperty(property: Omit<Property, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Property> {
    const client = await this.dbPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert property with version tracking
      const propertyResult = await client.query(
        `INSERT INTO properties (
          name, description, type, status, owner_id, property_manager_id,
          address, location, year_built, total_units, amenities,
          property_features, images, lease_terms, property_rules,
          accessibility, fair_housing, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 1)
        RETURNING *`,
        [
          property.name,
          property.description,
          property.type,
          property.status,
          property.ownerId,
          property.propertyManagerId,
          property.address,
          property.location,
          property.yearBuilt,
          property.totalUnits,
          property.amenities,
          property.propertyFeatures,
          property.images,
          property.leaseTerms,
          property.propertyRules,
          property.accessibility,
          property.fairHousing
        ]
      );

      // Insert units with foreign key constraint
      if (property.units?.length) {
        const unitValues = property.units.map(unit => [
          propertyResult.rows[0].id,
          unit.unitNumber,
          unit.floorPlan,
          unit.squareFeet,
          unit.bedrooms,
          unit.bathrooms,
          unit.isAvailable,
          unit.monthlyRent,
          unit.features
        ]);

        await client.query(
          `INSERT INTO units (
            property_id, unit_number, floor_plan, square_feet,
            bedrooms, bathrooms, is_available, monthly_rent, features
          ) VALUES ${unitValues.map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`).join(',')}`,
          unitValues.flat()
        );
      }

      // Index in Elasticsearch
      await this.searchCircuitBreaker.fire(async () => {
        await this.esClient.index({
          index: 'properties',
          id: propertyResult.rows[0].id,
          document: {
            ...propertyResult.rows[0],
            location: {
              lat: property.location.latitude,
              lon: property.location.longitude
            }
          }
        });
      });

      await client.query('COMMIT');
      return propertyResult.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw new DatabaseError(
        `Failed to create property: ${error.message}`,
        error.code,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    } finally {
      client.release();
    }
  }

  /**
   * Advanced property search with geo-spatial support and faceting
   * @param params Search parameters
   * @returns Search results with facets and suggestions
   */
  async searchProperties(params: SearchParams): Promise<SearchResult<Property>> {
    try {
      const esQuery = {
        index: 'properties',
        body: {
          query: {
            bool: {
              must: [
                params.query ? {
                  multi_match: {
                    query: params.query,
                    fields: ['name^2', 'description', 'amenities'],
                    fuzziness: 'AUTO'
                  }
                } : { match_all: {} }
              ],
              filter: []
            }
          },
          aggs: {
            property_types: {
              terms: { field: 'type' }
            },
            price_ranges: {
              range: {
                field: 'units.monthly_rent',
                ranges: [
                  { to: 1000 },
                  { from: 1000, to: 2000 },
                  { from: 2000, to: 3000 },
                  { from: 3000 }
                ]
              }
            },
            amenities: {
              terms: { field: 'amenities' }
            }
          },
          suggest: {
            text: params.query,
            property_suggest: {
              term: {
                field: 'name'
              }
            }
          }
        },
        from: (params.page - 1) * params.limit || 0,
        size: params.limit || 10,
        sort: params.sortBy ? [
          { [params.sortBy]: params.sortOrder || 'desc' }
        ] : undefined
      };

      // Add geo filter if location provided
      if (params.location) {
        esQuery.body.query.bool.filter.push({
          geo_distance: {
            distance: `${params.location.radius}km`,
            location: {
              lat: params.location.lat,
              lon: params.location.lon
            }
          }
        });
      }

      // Add property type filter
      if (params.propertyType?.length) {
        esQuery.body.query.bool.filter.push({
          terms: { type: params.propertyType }
        });
      }

      // Add price range filter
      if (params.priceRange) {
        const rangeFilter: any = { range: { 'units.monthly_rent': {} } };
        if (params.priceRange.min) rangeFilter.range['units.monthly_rent'].gte = params.priceRange.min;
        if (params.priceRange.max) rangeFilter.range['units.monthly_rent'].lte = params.priceRange.max;
        esQuery.body.query.bool.filter.push(rangeFilter);
      }

      const searchResult = await this.searchCircuitBreaker.fire(async () => {
        return await this.esClient.search(esQuery);
      });

      return {
        items: searchResult.hits.hits.map(hit => ({
          ...hit._source,
          score: hit._score
        })),
        total: searchResult.hits.total.value,
        page: params.page || 1,
        limit: params.limit || 10,
        facets: {
          propertyTypes: searchResult.aggregations.property_types.buckets.reduce((acc, bucket) => ({
            ...acc,
            [bucket.key]: bucket.doc_count
          }), {}),
          priceRanges: searchResult.aggregations.price_ranges.buckets,
          amenities: searchResult.aggregations.amenities.buckets
        },
        suggestions: searchResult.suggest?.property_suggest[0]?.options.map(option => option.text)
      };

    } catch (error) {
      throw new DatabaseError(
        `Failed to search properties: ${error.message}`,
        error.code,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }
}

export { PropertyRepository, SearchParams, SearchResult };