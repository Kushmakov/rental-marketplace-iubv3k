import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect, jest } from '@jest/globals';
import request from 'supertest'; // v6.3.3
import { faker } from '@faker-js/faker'; // v8.0.2
import { GenericContainer, StartedTestContainer } from 'testcontainers'; // v9.9.1
import Redis from 'ioredis'; // v5.3.2

import app from '../src/app';
import { ApplicationService } from '../src/services/application.service';
import { VerificationService } from '../src/services/verification.service';
import { Application, ApplicationStatus, VerificationStatus, DocumentType } from '../src/models/application.model';
import { HTTP_STATUS } from '@common/constants';

// Test environment configuration
interface TestEnvironment {
  dbContainer: StartedTestContainer;
  redisClient: Redis;
  applicationService: ApplicationService;
  verificationService: VerificationService;
}

// Configure longer timeout for integration tests
jest.setTimeout(30000);

describe('Application Service Tests', () => {
  let testEnv: TestEnvironment;
  let mockApplication: Application;

  // Set up test environment
  beforeAll(async () => {
    testEnv = await setupTestEnvironment();
    mockApplication = generateTestApplication();
  });

  // Clean up test environment
  afterAll(async () => {
    await cleanupTestEnvironment(testEnv);
  });

  // Reset state before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Application Creation', () => {
    it('should create a new application successfully', async () => {
      const response = await request(app)
        .post('/api/v1/applications')
        .send({
          applicantId: mockApplication.applicantId,
          unitId: mockApplication.unitId,
          monthlyIncome: mockApplication.monthlyIncome,
          creditScore: mockApplication.creditScore,
          employmentDetails: mockApplication.employmentDetails,
          preferredMoveInDate: mockApplication.preferredMoveInDate
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe(ApplicationStatus.DRAFT);
      expect(response.body.verificationStatus).toBe(VerificationStatus.PENDING);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/applications')
        .send({});

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.errors).toHaveLength(6);
    });

    it('should prevent duplicate applications', async () => {
      // Create first application
      await request(app)
        .post('/api/v1/applications')
        .send(mockApplication);

      // Attempt duplicate
      const response = await request(app)
        .post('/api/v1/applications')
        .send(mockApplication);

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
    });
  });

  describe('Application Submission', () => {
    let applicationId: string;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/v1/applications')
        .send(mockApplication);
      applicationId = createResponse.body.id;
    });

    it('should submit application with documents', async () => {
      const response = await request(app)
        .post(`/api/v1/applications/${applicationId}/submit`)
        .attach('documents', Buffer.from('fake-pdf'), {
          filename: 'income-proof.pdf',
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.status).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should validate document types', async () => {
      const response = await request(app)
        .post(`/api/v1/applications/${applicationId}/submit`)
        .attach('documents', Buffer.from('fake-image'), {
          filename: 'invalid.exe',
          contentType: 'application/x-msdownload'
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.message).toContain('Invalid file type');
    });
  });

  describe('Verification Process', () => {
    let applicationId: string;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/v1/applications')
        .send(mockApplication);
      applicationId = createResponse.body.id;

      await request(app)
        .post(`/api/v1/applications/${applicationId}/submit`)
        .attach('documents', Buffer.from('fake-pdf'), {
          filename: 'income-proof.pdf',
          contentType: 'application/pdf'
        });
    });

    it('should verify documents successfully', async () => {
      jest.spyOn(testEnv.verificationService, 'verifyDocuments')
        .mockResolvedValueOnce(true);

      const response = await request(app)
        .post(`/api/v1/applications/${applicationId}/verify`)
        .send();

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.verificationStatus).toBe(VerificationStatus.COMPLETED);
    });

    it('should handle verification failures', async () => {
      jest.spyOn(testEnv.verificationService, 'verifyDocuments')
        .mockRejectedValueOnce(new Error('Verification failed'));

      const response = await request(app)
        .post(`/api/v1/applications/${applicationId}/verify`)
        .send();

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.verificationStatus).toBe(VerificationStatus.FAILED);
    });
  });

  describe('Performance Requirements', () => {
    it('should handle concurrent requests within SLA', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();

      const requests = Array(concurrentRequests).fill(null).map(() => 
        request(app)
          .post('/api/v1/applications')
          .send(generateTestApplication())
      );

      const responses = await Promise.all(requests);

      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      const avgResponseTime = totalDuration / concurrentRequests;

      expect(avgResponseTime).toBeLessThan(2000); // 2s SLA requirement
      expect(responses.every(r => r.status === HTTP_STATUS.CREATED)).toBe(true);
    });

    it('should maintain performance under load', async () => {
      const loadTestDuration = 10000; // 10 seconds
      const startTime = Date.now();
      const results: number[] = [];

      while (Date.now() - startTime < loadTestDuration) {
        const requestStart = Date.now();
        await request(app)
          .get(`/api/v1/applications/${mockApplication.id}`)
          .send();
        results.push(Date.now() - requestStart);
      }

      const avgResponseTime = results.reduce((a, b) => a + b) / results.length;
      expect(avgResponseTime).toBeLessThan(2000); // 2s SLA requirement
    });
  });
});

// Test environment setup helper
async function setupTestEnvironment(): Promise<TestEnvironment> {
  // Start PostgreSQL container
  const dbContainer = await new GenericContainer('postgres:15-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'rental_platform_test'
    })
    .withExposedPorts(5432)
    .start();

  // Initialize Redis client
  const redisClient = new Redis({
    host: 'localhost',
    port: 6379,
    db: 1 // Use separate DB for tests
  });

  // Initialize services
  const applicationService = new ApplicationService();
  const verificationService = new VerificationService();

  return {
    dbContainer,
    redisClient,
    applicationService,
    verificationService
  };
}

// Test environment cleanup helper
async function cleanupTestEnvironment(env: TestEnvironment): Promise<void> {
  await env.dbContainer.stop();
  await env.redisClient.quit();
}

// Test data generator
function generateTestApplication(): Application {
  return {
    id: faker.string.uuid(),
    applicantId: faker.string.uuid(),
    unitId: faker.string.uuid(),
    status: ApplicationStatus.DRAFT,
    verificationStatus: VerificationStatus.PENDING,
    monthlyIncome: faker.number.int({ min: 3000, max: 10000 }),
    creditScore: faker.number.int({ min: 300, max: 850 }),
    employmentDetails: {
      employerName: faker.company.name(),
      position: faker.person.jobTitle(),
      startDate: faker.date.past(),
      employmentType: 'FULL_TIME',
      contactPhone: faker.phone.number(),
      contactEmail: faker.internet.email()
    },
    documents: [],
    preferredMoveInDate: faker.date.future(),
    notes: '',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1
  };
}