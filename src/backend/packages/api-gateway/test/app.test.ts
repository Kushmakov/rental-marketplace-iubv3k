/**
 * @fileoverview Integration test suite for API Gateway application
 * Tests middleware configurations, routing, security controls, error handling, and monitoring
 * @version 1.0.0
 */

import request from 'supertest'; // v6.3.3
import { jest } from '@jest/globals'; // v29.7.0
import Redis from 'ioredis-mock'; // v8.9.0
import nock from 'nock'; // v13.3.3
import { app } from '../src/app';
import { authenticate } from '../src/middleware/auth.middleware';
import { rateLimitMiddleware } from '../src/middleware/ratelimit.middleware';
import { errorHandler } from '../src/middleware/error.middleware';
import { HTTP_STATUS, USER_ROLES } from '@projectx/common/constants';

// Mock Redis client for rate limiting tests
const mockRedis = new Redis();

// Mock JWT token for authentication tests
const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';

// Configure test environment
beforeAll(async () => {
  // Setup mock Redis
  jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedis));

  // Configure test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_PUBLIC_KEY = 'test-public-key';

  // Setup mock downstream services
  nock('http://auth-service:3001')
    .persist()
    .get('/health')
    .reply(200, { status: 'healthy' });

  // Clear rate limit data
  await mockRedis.flushall();
});

afterAll(async () => {
  // Cleanup
  await mockRedis.quit();
  nock.cleanAll();
  jest.clearAllMocks();
});

describe('API Gateway Security', () => {
  test('should enforce security headers', async () => {
    const response = await request(app)
      .get('/health')
      .expect(HTTP_STATUS.OK);

    // Verify Helmet security headers
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  test('should implement rate limiting', async () => {
    const requests = Array(10).fill(null);
    
    // Make requests up to limit
    for (const _ of requests) {
      await request(app)
        .get('/api/v1/properties')
        .expect(response => {
          expect(response.headers['x-ratelimit-remaining']).toBeDefined();
          expect(response.headers['x-ratelimit-reset']).toBeDefined();
        });
    }

    // Exceed rate limit
    await request(app)
      .get('/api/v1/properties')
      .expect(HTTP_STATUS.TOO_MANY_REQUESTS)
      .expect(response => {
        expect(response.body.message).toContain('Too many requests');
        expect(response.body.retryAfter).toBeDefined();
      });
  });

  test('should validate authentication', async () => {
    // Test missing token
    await request(app)
      .get('/api/v1/protected')
      .expect(HTTP_STATUS.UNAUTHORIZED)
      .expect(response => {
        expect(response.body.message).toContain('Missing or invalid authorization header');
      });

    // Test invalid token
    await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer invalid-token')
      .expect(HTTP_STATUS.UNAUTHORIZED);

    // Test valid token
    await request(app)
      .get('/api/v1/protected')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HTTP_STATUS.OK);
  });

  test('should enforce role-based access control', async () => {
    // Test insufficient permissions
    await request(app)
      .get('/api/v1/admin')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HTTP_STATUS.FORBIDDEN)
      .expect(response => {
        expect(response.body.message).toContain('Insufficient permissions');
      });
  });
});

describe('API Gateway Routing', () => {
  test('should route requests to correct services', async () => {
    // Mock auth service
    nock('http://auth-service:3001')
      .get('/users/me')
      .reply(200, { id: '123', role: USER_ROLES.RENTER });

    const response = await request(app)
      .get('/api/v1/auth/users/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HTTP_STATUS.OK);

    expect(response.body.id).toBe('123');
  });

  test('should handle service timeouts', async () => {
    // Mock service timeout
    nock('http://auth-service:3001')
      .get('/users/me')
      .delay(6000) // Exceed timeout
      .reply(200);

    await request(app)
      .get('/api/v1/auth/users/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HTTP_STATUS.GATEWAY_TIMEOUT)
      .expect(response => {
        expect(response.body.message).toContain('Service timeout');
      });
  });

  test('should implement circuit breaker', async () => {
    // Generate errors to trigger circuit breaker
    const errorRequests = Array(6).fill(null);
    
    for (const _ of errorRequests) {
      nock('http://auth-service:3001')
        .get('/users/me')
        .reply(500);

      await request(app)
        .get('/api/v1/auth/users/me')
        .set('Authorization', `Bearer ${validToken}`);
    }

    // Circuit should be open
    await request(app)
      .get('/api/v1/auth/users/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HTTP_STATUS.SERVICE_UNAVAILABLE)
      .expect(response => {
        expect(response.body.message).toContain('Service unavailable');
      });
  });
});

describe('Error Handling', () => {
  test('should return standardized error responses', async () => {
    // Test validation error
    await request(app)
      .post('/api/v1/properties')
      .send({}) // Missing required fields
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HTTP_STATUS.BAD_REQUEST)
      .expect(response => {
        expect(response.body).toMatchObject({
          status: HTTP_STATUS.BAD_REQUEST,
          message: expect.any(String),
          errorCode: expect.any(String),
          requestId: expect.any(String),
          timestamp: expect.any(String)
        });
      });
  });

  test('should handle correlation IDs', async () => {
    const correlationId = 'test-correlation-id';

    const response = await request(app)
      .get('/api/v1/properties')
      .set('X-Correlation-ID', correlationId)
      .expect(response => {
        expect(response.headers['x-correlation-id']).toBe(correlationId);
      });
  });

  test('should mask sensitive error details in production', async () => {
    // Set environment to production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await request(app)
      .get('/api/v1/error-test')
      .expect(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .expect(response => {
        expect(response.body.stack).toBeUndefined();
        expect(response.body.details).toBeUndefined();
      });

    process.env.NODE_ENV = originalEnv;
  });
});

describe('Performance Monitoring', () => {
  test('should expose metrics endpoint', async () => {
    const response = await request(app)
      .get('/metrics')
      .expect(HTTP_STATUS.OK);

    expect(response.text).toContain('http_request_duration_seconds');
    expect(response.text).toContain('nodejs_heap_size_total_bytes');
  });

  test('should track request durations', async () => {
    // Make request that takes time
    nock('http://auth-service:3001')
      .get('/users/me')
      .delay(100)
      .reply(200, { id: '123' });

    await request(app)
      .get('/api/v1/auth/users/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HTTP_STATUS.OK);

    // Check metrics
    const metricsResponse = await request(app)
      .get('/metrics')
      .expect(HTTP_STATUS.OK);

    expect(metricsResponse.text).toContain('http_request_duration_seconds_bucket');
  });
});