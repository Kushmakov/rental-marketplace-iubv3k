/**
 * Advanced property search service implementing Elasticsearch-based search functionality
 * with Redis caching, circuit breaker patterns, and comprehensive search features.
 * @packageDocumentation
 */

import { Client } from '@elastic/elasticsearch'; // v8.9.0
import Redis from 'ioredis'; // v5.3.2
import CircuitBreaker from 'opossum'; // v7.1.0
import { Property, PropertyType } from '../models/property.model';
import { Unit, UnitStatus } from '../models/unit.model';

/**
 * Search parameters interface for property queries
 */
interface SearchParams {
  query?: string;
  propertyTypes?: PropertyType[];
  priceRange?: { min?: number; max?: number };
  bedrooms?: number;
  bathrooms?: number;
  amenities?: string[];
  availableFrom?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Geo-search parameters interface
 */
interface GeoSearchParams extends SearchParams {
  latitude: number;
  longitude: number;
  radius: number;
  unit?: 'km' | 'mi';
}

/**
 * Search result interface with metadata
 */
interface SearchResult {
  items: Property[];
  total: number;
  page: number;
  limit: number;
  facets: Record<string, any>;
  took: number;
}

/**
 * Service class implementing advanced property search functionality
 */
export class SearchService {
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes
  private readonly MAX_SEARCH_RESULTS = 1000;
  private readonly searchCircuitBreaker: CircuitBreaker;

  constructor(
    private readonly elasticsearchClient: Client,
    private readonly redisClient: Redis,
    private readonly config: { indexName: string }
  ) {
    // Initialize circuit breaker for Elasticsearch
    this.searchCircuitBreaker = new CircuitBreaker(
      async (query: any) => this.elasticsearchClient.search(query),
      {
        timeout: 5000, // 5 second timeout
        errorThresholdPercentage: 50,
        resetTimeout: 30000, // 30 second reset
        name: 'elasticsearch-search'
      }
    );
  }

  /**
   * Performs property search with advanced filtering and faceted search
   */
  async searchProperties(params: SearchParams): Promise<SearchResult> {
    const cacheKey = this.generateCacheKey(params);
    
    // Try to get cached results first
    const cachedResult = await this.redisClient.get(cacheKey);
    if (cachedResult) {
      return JSON.parse(cachedResult);
    }

    const query = this.buildSearchQuery(params);
    
    try {
      const result = await this.searchCircuitBreaker.fire({
        index: this.config.indexName,
        body: query
      });

      const searchResult = this.formatSearchResult(result);
      
      // Cache the results
      await this.redisClient.setex(
        cacheKey,
        this.CACHE_TTL_SECONDS,
        JSON.stringify(searchResult)
      );

      return searchResult;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Performs location-based property search
   */
  async searchByLocation(params: GeoSearchParams): Promise<SearchResult> {
    const geoQuery = this.buildGeoSearchQuery(params);
    
    try {
      const result = await this.searchCircuitBreaker.fire({
        index: this.config.indexName,
        body: geoQuery
      });

      return this.formatSearchResult(result);
    } catch (error) {
      throw new Error(`Geo-search failed: ${error.message}`);
    }
  }

  /**
   * Builds optimized Elasticsearch query
   */
  private buildSearchQuery(params: SearchParams): any {
    const query: any = {
      query: {
        bool: {
          must: [],
          filter: []
        }
      },
      aggs: this.buildAggregations(),
      size: params.limit || 10,
      from: ((params.page || 1) - 1) * (params.limit || 10)
    };

    // Full-text search
    if (params.query) {
      query.query.bool.must.push({
        multi_match: {
          query: params.query,
          fields: ['name^2', 'description', 'amenities', 'address.*'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    }

    // Property type filter
    if (params.propertyTypes?.length) {
      query.query.bool.filter.push({
        terms: { 'type': params.propertyTypes }
      });
    }

    // Price range filter
    if (params.priceRange) {
      const range: any = {};
      if (params.priceRange.min) range.gte = params.priceRange.min;
      if (params.priceRange.max) range.lte = params.priceRange.max;
      if (Object.keys(range).length) {
        query.query.bool.filter.push({
          range: { 'units.monthlyRent': range }
        });
      }
    }

    // Bedrooms and bathrooms filter
    if (params.bedrooms) {
      query.query.bool.filter.push({
        term: { 'units.bedrooms': params.bedrooms }
      });
    }
    if (params.bathrooms) {
      query.query.bool.filter.push({
        term: { 'units.bathrooms': params.bathrooms }
      });
    }

    // Amenities filter
    if (params.amenities?.length) {
      query.query.bool.filter.push({
        terms: { amenities: params.amenities }
      });
    }

    // Availability filter
    if (params.availableFrom) {
      query.query.bool.filter.push({
        range: {
          'units.availableFrom': {
            lte: params.availableFrom.toISOString()
          }
        }
      });
    }

    // Sorting
    if (params.sortBy) {
      query.sort = [{
        [params.sortBy]: {
          order: params.sortOrder || 'desc'
        }
      }];
    }

    return query;
  }

  /**
   * Builds geo-search query with distance sorting
   */
  private buildGeoSearchQuery(params: GeoSearchParams): any {
    const baseQuery = this.buildSearchQuery(params);
    
    baseQuery.query.bool.filter.push({
      geo_distance: {
        distance: `${params.radius}${params.unit || 'km'}`,
        'location': {
          lat: params.latitude,
          lon: params.longitude
        }
      }
    });

    // Add distance-based sorting
    baseQuery.sort = [
      {
        _geo_distance: {
          'location': {
            lat: params.latitude,
            lon: params.longitude
          },
          order: 'asc',
          unit: params.unit || 'km'
        }
      }
    ];

    return baseQuery;
  }

  /**
   * Builds aggregations for faceted search
   */
  private buildAggregations(): any {
    return {
      property_types: {
        terms: { field: 'type' }
      },
      price_ranges: {
        range: {
          field: 'units.monthlyRent',
          ranges: [
            { to: 1000 },
            { from: 1000, to: 2000 },
            { from: 2000, to: 3000 },
            { from: 3000, to: 4000 },
            { from: 4000 }
          ]
        }
      },
      bedrooms: {
        terms: { field: 'units.bedrooms' }
      },
      bathrooms: {
        terms: { field: 'units.bathrooms' }
      },
      amenities: {
        terms: { field: 'amenities', size: 20 }
      }
    };
  }

  /**
   * Formats Elasticsearch response into SearchResult
   */
  private formatSearchResult(result: any): SearchResult {
    return {
      items: result.hits.hits.map((hit: any) => ({
        ...hit._source,
        score: hit._score,
        distance: hit.sort?.[0] // Distance if geo-search
      })),
      total: result.hits.total.value,
      page: Math.floor(result.hits.from / result.hits.size) + 1,
      limit: result.hits.size,
      facets: this.formatAggregations(result.aggregations),
      took: result.took
    };
  }

  /**
   * Formats aggregations into facets
   */
  private formatAggregations(aggregations: any): Record<string, any> {
    const facets: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(aggregations)) {
      if (value.buckets) {
        facets[key] = value.buckets.map((bucket: any) => ({
          value: bucket.key,
          count: bucket.doc_count
        }));
      } else if (value.ranges) {
        facets[key] = value.ranges.map((range: any) => ({
          from: range.from,
          to: range.to,
          count: range.doc_count
        }));
      }
    }

    return facets;
  }

  /**
   * Generates cache key from search parameters
   */
  private generateCacheKey(params: SearchParams): string {
    return `search:${JSON.stringify(params)}`;
  }
}