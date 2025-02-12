/**
 * REST API controller implementing property listing operations with comprehensive
 * validation, caching, rate limiting and error handling.
 * @packageDocumentation
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RateLimit } from '@nestjs/throttler';
import { CacheInterceptor, CacheService } from '@nestjs/cache-manager';

import { ListingService } from '../services/listing.service';
import { Property, PropertyType, PropertyStatus } from '../models/property.model';
import { ApiResponse as CustomApiResponse } from '@common/interfaces';
import { CACHE_TTL, HTTP_STATUS } from '@common/constants';

/**
 * Interface for property creation/update parameters
 */
interface PropertyDto {
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
 * Interface for search query parameters
 */
interface SearchQueryParams {
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
  latitude?: number;
  longitude?: number;
  radius?: number;
}

@Controller('v1/listings')
@ApiTags('listings')
@UseGuards(AuthGuard)
@UseInterceptors(CacheInterceptor)
@RateLimit({ limit: 1000, ttl: 60000 })
export class ListingController {
  private readonly logger = new Logger(ListingController.name);

  constructor(
    private readonly listingService: ListingService,
    private readonly cacheService: CacheService
  ) {}

  /**
   * Creates a new property listing with validation
   */
  @Post()
  @ApiOperation({ summary: 'Create new property listing' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Property created successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid property data' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized access' })
  async createListing(
    @Body() propertyData: PropertyDto
  ): Promise<CustomApiResponse<Property>> {
    this.logger.log('Creating new property listing');
    
    try {
      const property = await this.listingService.createListing(propertyData);
      
      return {
        status: HTTP_STATUS.CREATED,
        data: property,
        message: 'Property listing created successfully',
        errors: [],
        timestamp: new Date(),
        requestId: crypto.randomUUID()
      };
    } catch (error) {
      this.logger.error('Failed to create property listing', error.stack);
      throw error;
    }
  }

  /**
   * Updates an existing property listing
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update property listing' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Property updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Property not found' })
  async updateListing(
    @Param('id') id: string,
    @Body() propertyData: Partial<PropertyDto>
  ): Promise<CustomApiResponse<Property>> {
    this.logger.log(`Updating property listing: ${id}`);
    
    try {
      const property = await this.listingService.updateListing(id, propertyData);
      await this.cacheService.del(`listing:${id}`);
      
      return {
        status: HTTP_STATUS.OK,
        data: property,
        message: 'Property listing updated successfully',
        errors: [],
        timestamp: new Date(),
        requestId: crypto.randomUUID()
      };
    } catch (error) {
      this.logger.error(`Failed to update property listing: ${id}`, error.stack);
      throw error;
    }
  }

  /**
   * Retrieves a property listing by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get property listing by ID' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Property retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Property not found' })
  async getListingById(
    @Param('id') id: string
  ): Promise<CustomApiResponse<Property>> {
    this.logger.log(`Retrieving property listing: ${id}`);
    
    try {
      const property = await this.listingService.getPropertyById(id);
      
      if (!property) {
        return {
          status: HTTP_STATUS.NOT_FOUND,
          data: null,
          message: 'Property listing not found',
          errors: [],
          timestamp: new Date(),
          requestId: crypto.randomUUID()
        };
      }
      
      return {
        status: HTTP_STATUS.OK,
        data: property,
        message: 'Property listing retrieved successfully',
        errors: [],
        timestamp: new Date(),
        requestId: crypto.randomUUID()
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve property listing: ${id}`, error.stack);
      throw error;
    }
  }

  /**
   * Searches property listings with advanced filtering
   */
  @Get()
  @ApiOperation({ summary: 'Search property listings' })
  @ApiQuery({ name: 'query', required: false, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Search results retrieved successfully' })
  async searchListings(
    @Query() params: SearchQueryParams
  ): Promise<CustomApiResponse<any>> {
    this.logger.log('Searching property listings', params);
    
    try {
      const results = await this.listingService.searchListings(params);
      
      return {
        status: HTTP_STATUS.OK,
        data: results,
        message: 'Search results retrieved successfully',
        errors: [],
        timestamp: new Date(),
        requestId: crypto.randomUUID()
      };
    } catch (error) {
      this.logger.error('Failed to search property listings', error.stack);
      throw error;
    }
  }

  /**
   * Updates property availability status
   */
  @Put(':id/availability')
  @ApiOperation({ summary: 'Update property availability' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Availability updated successfully' })
  async updateAvailability(
    @Param('id') id: string,
    @Body() data: { status: PropertyStatus }
  ): Promise<CustomApiResponse<Property>> {
    this.logger.log(`Updating property availability: ${id}`);
    
    try {
      const property = await this.listingService.updateAvailability(id, data.status);
      await this.cacheService.del(`listing:${id}`);
      
      return {
        status: HTTP_STATUS.OK,
        data: property,
        message: 'Property availability updated successfully',
        errors: [],
        timestamp: new Date(),
        requestId: crypto.randomUUID()
      };
    } catch (error) {
      this.logger.error(`Failed to update property availability: ${id}`, error.stack);
      throw error;
    }
  }

  /**
   * Deletes a property listing
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete property listing' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Property deleted successfully' })
  async deleteListing(
    @Param('id') id: string
  ): Promise<CustomApiResponse<void>> {
    this.logger.log(`Deleting property listing: ${id}`);
    
    try {
      await this.listingService.deleteListing(id);
      await this.cacheService.del(`listing:${id}`);
      
      return {
        status: HTTP_STATUS.NO_CONTENT,
        data: null,
        message: 'Property listing deleted successfully',
        errors: [],
        timestamp: new Date(),
        requestId: crypto.randomUUID()
      };
    } catch (error) {
      this.logger.error(`Failed to delete property listing: ${id}`, error.stack);
      throw error;
    }
  }
}