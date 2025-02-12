/**
 * Comprehensive test suite for the listing service implementing end-to-end testing
 * of property listing management, search functionality, and performance metrics.
 * @packageDocumentation
 */

import request from 'supertest'; // v6.3.3
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'; // v29.6.0
import { faker } from '@faker-js/faker'; // v8.0.2
import { TestDatabase } from '@testing-library/database-mock'; // v1.0.0

import app from '../src/app';
import { ListingService } from '../src/services/listing.service';
import { Property, PropertyType, PropertyStatus } from '../src/models/property.model';
import { HTTP_STATUS } from '@common/constants';

// Constants for test configuration
const TEST_TIMEOUT = 30000;
const API_BASE_URL = '/api/v1/listings';
const PERFORMANCE_THRESHOLD_MS = 2000;

describe('Listing Service Tests', () => {
  let listingService: ListingService;
  let testDb: TestDatabase;
  let testProperties: Property[];

  // Setup test environment
  beforeAll(async () => {
    // Initialize test database
    testDb = new TestDatabase({
      name: 'test_listings',
      clean: true
    });

    // Initialize listing service with test configuration
    listingService = new ListingService(
      testDb.getConnection(),
      testDb.getSearchClient(),
      testDb.getCacheClient(),
      testDb.getLogger(),
      testDb.getMetricsClient()
    );

    // Generate test property data
    testProperties = await generateTestProperties(5);
  }, TEST_TIMEOUT);

  // Cleanup test environment
  afterAll(async () => {
    await testDb.cleanup();
    await testDb.close();
  });

  // Reset cache before each test
  beforeEach(async () => {
    await testDb.getCacheClient().flushall();
  });

  describe('Property Creation Tests', () => {
    test('should create a new property listing within performance threshold', async () => {
      const startTime = Date.now();
      const propertyData = generatePropertyData();

      const response = await request(app)
        .post(API_BASE_URL)
        .send(propertyData)
        .expect(HTTP_STATUS.CREATED);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      expect(response.body.data).toMatchObject({
        name: propertyData.name,
        type: propertyData.type,
        status: PropertyStatus.ACTIVE
      });
    });

    test('should handle duplicate property creation', async () => {
      const propertyData = generatePropertyData();

      // Create first property
      await request(app)
        .post(API_BASE_URL)
        .send(propertyData)
        .expect(HTTP_STATUS.CREATED);

      // Attempt to create duplicate
      await request(app)
        .post(API_BASE_URL)
        .send(propertyData)
        .expect(HTTP_STATUS.CONFLICT);
    });
  });

  describe('Property Search Tests', () => {
    test('should search properties with pagination and filtering', async () => {
      const searchParams = {
        query: 'luxury',
        propertyTypes: [PropertyType.APARTMENT],
        priceRange: { min: 1000, max: 5000 },
        page: 1,
        limit: 10
      };

      const response = await request(app)
        .get(API_BASE_URL + '/search')
        .query(searchParams)
        .expect(HTTP_STATUS.OK);

      expect(response.body.data.items).toBeInstanceOf(Array);
      expect(response.body.data.total).toBeGreaterThanOrEqual(0);
      expect(response.body.data.page).toBe(searchParams.page);
      expect(response.body.data.limit).toBe(searchParams.limit);
    });

    test('should perform geo-search within radius', async () => {
      const geoSearchParams = {
        latitude: 40.7128,
        longitude: -74.0060,
        radius: 10,
        propertyTypes: [PropertyType.APARTMENT]
      };

      const response = await request(app)
        .get(API_BASE_URL + '/search')
        .query(geoSearchParams)
        .expect(HTTP_STATUS.OK);

      expect(response.body.data.items).toBeInstanceOf(Array);
      expect(response.body.data.items[0]).toHaveProperty('distance');
    });
  });

  describe('Property Update Tests', () => {
    test('should update property with optimistic locking', async () => {
      // Create test property
      const property = await listingService.createListing(generatePropertyData());

      const updateData = {
        name: 'Updated Property Name',
        status: PropertyStatus.MAINTENANCE
      };

      const response = await request(app)
        .put(`${API_BASE_URL}/${property.id}`)
        .send(updateData)
        .expect(HTTP_STATUS.OK);

      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.status).toBe(updateData.status);
      expect(response.body.data.version).toBe(property.version + 1);
    });

    test('should handle concurrent updates correctly', async () => {
      const property = await listingService.createListing(generatePropertyData());

      // Simulate concurrent updates
      const update1 = request(app)
        .put(`${API_BASE_URL}/${property.id}`)
        .send({ name: 'Update 1' });

      const update2 = request(app)
        .put(`${API_BASE_URL}/${property.id}`)
        .send({ name: 'Update 2' });

      const [response1, response2] = await Promise.all([update1, update2]);
      expect(response1.status === HTTP_STATUS.OK || response2.status === HTTP_STATUS.OK).toBeTruthy();
      expect(response1.status === HTTP_STATUS.CONFLICT || response2.status === HTTP_STATUS.CONFLICT).toBeTruthy();
    });
  });

  describe('Cache Behavior Tests', () => {
    test('should cache search results and return from cache', async () => {
      const searchParams = { query: 'test property', limit: 10 };

      // First request - should hit database
      const startTime1 = Date.now();
      await request(app)
        .get(API_BASE_URL + '/search')
        .query(searchParams)
        .expect(HTTP_STATUS.OK);
      const duration1 = Date.now() - startTime1;

      // Second request - should hit cache
      const startTime2 = Date.now();
      await request(app)
        .get(API_BASE_URL + '/search')
        .query(searchParams)
        .expect(HTTP_STATUS.OK);
      const duration2 = Date.now() - startTime2;

      expect(duration2).toBeLessThan(duration1);
    });

    test('should invalidate cache on property update', async () => {
      const property = await listingService.createListing(generatePropertyData());
      const cacheKey = `listing:${property.id}`;

      // Update property
      await request(app)
        .put(`${API_BASE_URL}/${property.id}`)
        .send({ name: 'Updated Name' })
        .expect(HTTP_STATUS.OK);

      // Verify cache was invalidated
      const cached = await testDb.getCacheClient().get(cacheKey);
      expect(cached).toBeNull();
    });
  });

  // Helper function to generate test property data
  function generatePropertyData(): Partial<Property> {
    return {
      name: faker.company.name() + ' Apartments',
      description: faker.lorem.paragraph(),
      type: PropertyType.APARTMENT,
      status: PropertyStatus.ACTIVE,
      ownerId: faker.string.uuid(),
      propertyManagerId: faker.string.uuid(),
      address: {
        street1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        zipCode: faker.location.zipCode(),
        country: 'US'
      },
      location: {
        latitude: parseFloat(faker.location.latitude()),
        longitude: parseFloat(faker.location.longitude())
      },
      yearBuilt: faker.number.int({ min: 1990, max: 2023 }),
      totalUnits: faker.number.int({ min: 10, max: 100 }),
      amenities: ['parking', 'pool', 'gym'],
      units: Array(3).fill(null).map(() => ({
        unitNumber: faker.string.alphanumeric(4),
        floorPlan: 'A1',
        squareFeet: faker.number.int({ min: 500, max: 2000 }),
        bedrooms: faker.number.int({ min: 1, max: 4 }),
        bathrooms: faker.number.int({ min: 1, max: 3 }),
        monthlyRent: faker.number.int({ min: 1000, max: 5000 }),
        isAvailable: true
      }))
    };
  }

  // Helper function to generate multiple test properties
  async function generateTestProperties(count: number): Promise<Property[]> {
    const properties = [];
    for (let i = 0; i < count; i++) {
      const property = await listingService.createListing(generatePropertyData());
      properties.push(property);
    }
    return properties;
  }
});