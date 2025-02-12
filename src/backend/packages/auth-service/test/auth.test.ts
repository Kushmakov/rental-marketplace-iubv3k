/**
 * @fileoverview Comprehensive test suite for authentication service functionality
 * Tests OAuth 2.0, OIDC, MFA, token management, and security controls
 * @version 1.0.0
 */

import request from 'supertest'; // v6.3.3
import { MongoMemoryServer } from 'mongodb-memory-server'; // v8.13.0
import { authenticator } from 'otplib'; // v12.0.1
import app from '../src/app';
import { AuthService } from '../src/services/auth.service';
import { HTTP_STATUS, USER_ROLES } from '@projectx/common/constants';

// Test constants
const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#$',
  firstName: 'Test',
  lastName: 'User',
  phone: '+12345678901',
  role: USER_ROLES.RENTER
};

const MFA_TEST_SECRET = 'JBSWY3DPEHPK3PXP';

// Global test setup
let mongoServer: MongoMemoryServer;
let authService: AuthService;

beforeAll(async () => {
  // Setup in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();

  // Initialize auth service
  authService = new AuthService();
});

afterAll(async () => {
  await mongoServer.stop();
});

describe('AuthService Security', () => {
  beforeEach(async () => {
    // Clear test data
    await authService.clearTestData();
  });

  describe('Enhanced User Registration', () => {
    it('should enforce password complexity requirements', async () => {
      const weakPasswords = [
        'short',
        'onlylowercase',
        'ONLYUPPERCASE',
        '12345678',
        'NoSpecialChars123'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            ...TEST_USER,
            password
          });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(response.body.message).toMatch(/password.*requirements/i);
      }
    });

    it('should prevent duplicate email registration', async () => {
      // Register first user
      await request(app)
        .post('/api/v1/auth/register')
        .send(TEST_USER);

      // Attempt duplicate registration
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(TEST_USER);

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body.message).toMatch(/email.*registered/i);
    });

    it('should enforce MFA setup for required roles', async () => {
      const adminUser = {
        ...TEST_USER,
        role: USER_ROLES.ADMIN
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(adminUser);

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data.mfaEnabled).toBe(true);
      expect(response.body.data.mfaSecret).toBeDefined();
    });

    it('should sanitize sensitive data in response', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(TEST_USER);

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data.password).toBeUndefined();
      expect(response.body.data.mfaSecret).toBeUndefined();
      expect(response.body.data.backupCodes).toBeUndefined();
    });
  });

  describe('Secure Authentication', () => {
    beforeEach(async () => {
      // Create test user
      await request(app)
        .post('/api/v1/auth/register')
        .send(TEST_USER);
    });

    it('should implement progressive delays on failed attempts', async () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: TEST_USER.email,
            password: 'WrongPassword123!'
          });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify progressive delays
      expect(duration).toBeGreaterThan(1000);
    });

    it('should enforce account lockout after max attempts', async () => {
      // Attempt multiple failed logins
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: TEST_USER.email,
            password: 'WrongPassword123!'
          });
      }

      // Attempt login with correct credentials
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body.message).toMatch(/account.*locked/i);
    });

    it('should validate MFA tokens correctly', async () => {
      // Setup MFA for test user
      const setupResponse = await request(app)
        .post('/api/v1/auth/setup-mfa')
        .set('Authorization', `Bearer ${TEST_USER.token}`)
        .send();

      const mfaSecret = setupResponse.body.data.mfaSecret;
      const validToken = authenticator.generate(mfaSecret);
      const invalidToken = '123456';

      // Test valid MFA token
      const validResponse = await request(app)
        .post('/api/v1/auth/verify-mfa')
        .send({
          email: TEST_USER.email,
          mfaToken: validToken
        });

      expect(validResponse.status).toBe(HTTP_STATUS.OK);

      // Test invalid MFA token
      const invalidResponse = await request(app)
        .post('/api/v1/auth/verify-mfa')
        .send({
          email: TEST_USER.email,
          mfaToken: invalidToken
        });

      expect(invalidResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });
  });

  describe('Token Security', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Setup authenticated user
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });

      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('should validate token signatures', async () => {
      // Test valid token
      const validResponse = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(validResponse.status).toBe(HTTP_STATUS.OK);

      // Test tampered token
      const tamperedToken = accessToken.slice(0, -5) + 'xxxxx';
      const invalidResponse = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(invalidResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('should handle token refresh securely', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.accessToken).not.toBe(accessToken);
    });

    it('should revoke refresh tokens on logout', async () => {
      // Logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      // Attempt refresh with revoked token
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });
  });

  describe('Password Security', () => {
    it('should enforce password history', async () => {
      // Change password multiple times
      const passwords = [
        'NewPassword123!@#',
        'AnotherPass456$%^',
        'ThirdPass789&*()',
        TEST_USER.password // Attempt to reuse original password
      ];

      for (const newPassword of passwords) {
        const response = await request(app)
          .post('/api/v1/auth/change-password')
          .set('Authorization', `Bearer ${TEST_USER.token}`)
          .send({ newPassword });

        if (newPassword === TEST_USER.password) {
          expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
          expect(response.body.message).toMatch(/password.*recently used/i);
        } else {
          expect(response.status).toBe(HTTP_STATUS.OK);
        }
      }
    });

    it('should require current password verification', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${TEST_USER.token}`)
        .send({
          newPassword: 'NewPassword123!@#'
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.message).toMatch(/current password.*required/i);
    });

    it('should enforce password expiration', async () => {
      // Fast-forward time to simulate password expiration
      jest.useFakeTimers();
      jest.setSystemTime(Date.now() + 91 * 24 * 60 * 60 * 1000); // 91 days

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body.message).toMatch(/password.*expired/i);

      jest.useRealTimers();
    });
  });
});