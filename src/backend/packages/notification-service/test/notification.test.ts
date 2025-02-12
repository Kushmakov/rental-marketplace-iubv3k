import { mock, mockReset, MockProxy } from 'jest-mock-extended';
import { NotificationService } from '../src/services/notification.service';
import { NotificationRepository } from '../src/repositories/notification.repository';
import { NotificationType, NotificationStatus } from '../src/models/notification.model';
import { CircuitBreaker } from 'opossum';
import { Metrics } from 'prom-client';
import { RateLimiter } from 'rate-limiter-flexible';
import { Logger } from 'winston';

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockRepository: MockProxy<NotificationRepository>;
  let mockCircuitBreaker: MockProxy<CircuitBreaker>;
  let mockMetrics: MockProxy<Metrics>;
  let mockRateLimiter: MockProxy<RateLimiter>;
  let mockLogger: MockProxy<Logger>;

  const TEST_TENANT_ID = 'test-tenant-123';
  const TEST_USER_ID = 'test-user-456';

  beforeEach(() => {
    mockRepository = mock<NotificationRepository>();
    mockCircuitBreaker = mock<CircuitBreaker>();
    mockMetrics = mock<Metrics>();
    mockRateLimiter = mock<RateLimiter>();
    mockLogger = mock<Logger>();

    notificationService = new NotificationService(
      mockRepository,
      mockCircuitBreaker,
      mockMetrics,
      mockRateLimiter
    );
  });

  afterEach(() => {
    mockReset(mockRepository);
    mockReset(mockCircuitBreaker);
    mockReset(mockMetrics);
    mockReset(mockRateLimiter);
    mockReset(mockLogger);
  });

  describe('sendNotification', () => {
    const testNotification = {
      type: NotificationType.EMAIL,
      userId: TEST_USER_ID,
      content: {
        subject: 'Test Subject',
        body: 'Test Body',
        html: '<p>Test HTML</p>'
      },
      priority: 1
    };

    it('should successfully send a notification and track delivery', async () => {
      // Setup mocks
      mockRateLimiter.consume.mockResolvedValue(undefined);
      mockRepository.getNotificationPreferences.mockResolvedValue({
        userId: TEST_USER_ID,
        channels: [{ type: NotificationType.EMAIL, enabled: true }]
      });
      mockRepository.createNotificationBatch.mockResolvedValue([{
        id: 'test-notification-id',
        ...testNotification,
        status: NotificationStatus.PENDING
      }]);
      mockCircuitBreaker.fire.mockResolvedValue({
        status: NotificationStatus.DELIVERED,
        provider: 'test-provider',
        metadata: {}
      });

      // Execute test
      const result = await notificationService.sendNotification(
        testNotification,
        TEST_TENANT_ID
      );

      // Verify results
      expect(result.status).toBe(NotificationStatus.DELIVERED);
      expect(result.provider).toBe('test-provider');
      expect(mockRepository.createNotificationBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            type: NotificationType.EMAIL,
            userId: TEST_USER_ID
          })
        ]),
        TEST_TENANT_ID
      );
    });

    it('should handle rate limiting correctly', async () => {
      // Setup rate limit exceeded scenario
      mockRateLimiter.consume.mockRejectedValue(new Error('Rate limit exceeded'));

      // Execute and verify
      await expect(
        notificationService.sendNotification(testNotification, TEST_TENANT_ID)
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should respect user notification preferences', async () => {
      // Setup disabled channel preference
      mockRateLimiter.consume.mockResolvedValue(undefined);
      mockRepository.getNotificationPreferences.mockResolvedValue({
        userId: TEST_USER_ID,
        channels: [{ type: NotificationType.EMAIL, enabled: false }]
      });

      // Execute and verify
      await expect(
        notificationService.sendNotification(testNotification, TEST_TENANT_ID)
      ).rejects.toThrow('Notification delivery not allowed by user preferences');
    });
  });

  describe('handleWebhook', () => {
    const webhookPayload = {
      provider: 'test-provider',
      eventType: 'delivery',
      notificationId: 'test-notification-id',
      status: 'delivered',
      timestamp: new Date(),
      metadata: {}
    };

    it('should process webhook and update notification status', async () => {
      // Execute test
      await notificationService.handleWebhook(webhookPayload);

      // Verify status update
      expect(mockRepository.updateNotificationStatusWithTracking).toHaveBeenCalledWith(
        'test-notification-id',
        expect.any(String),
        expect.objectContaining({
          provider: 'test-provider'
        })
      );
    });

    it('should handle invalid webhook signatures', async () => {
      // Setup invalid signature scenario
      const invalidPayload = { ...webhookPayload, signature: 'invalid' };

      // Execute and verify
      await expect(
        notificationService.handleWebhook(invalidPayload)
      ).rejects.toThrow();
    });
  });

  describe('Multi-tenant Scenarios', () => {
    it('should maintain tenant isolation for notifications', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';
      const notification = {
        type: NotificationType.EMAIL,
        userId: TEST_USER_ID,
        content: { body: 'Test' }
      };

      // Send notifications for different tenants
      await notificationService.sendNotification(notification, tenant1);
      await notificationService.sendNotification(notification, tenant2);

      // Verify tenant isolation
      expect(mockRepository.createNotificationBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ tenantId: tenant1 })]),
        tenant1
      );
      expect(mockRepository.createNotificationBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ tenantId: tenant2 })]),
        tenant2
      );
    });
  });

  describe('Performance Monitoring', () => {
    it('should track notification delivery latency', async () => {
      const notification = {
        type: NotificationType.EMAIL,
        userId: TEST_USER_ID,
        content: { body: 'Test' }
      };

      // Setup mocks
      mockRateLimiter.consume.mockResolvedValue(undefined);
      mockRepository.getNotificationPreferences.mockResolvedValue({
        userId: TEST_USER_ID,
        channels: [{ type: NotificationType.EMAIL, enabled: true }]
      });
      mockRepository.createNotificationBatch.mockResolvedValue([{
        id: 'test-id',
        ...notification,
        status: NotificationStatus.PENDING
      }]);
      mockCircuitBreaker.fire.mockResolvedValue({
        status: NotificationStatus.DELIVERED,
        provider: 'test-provider',
        metadata: {}
      });

      // Execute test
      const startTime = Date.now();
      await notificationService.sendNotification(notification, TEST_TENANT_ID);
      const endTime = Date.now();

      // Verify latency tracking
      expect(mockRepository.updateNotificationStatusWithTracking).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          latency: expect.any(Number)
        })
      );

      // Verify latency is reasonable
      const trackedLatency = mockRepository.updateNotificationStatusWithTracking.mock.calls[0][2].latency;
      expect(trackedLatency).toBeLessThanOrEqual((endTime - startTime) / 1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle external service failures gracefully', async () => {
      const notification = {
        type: NotificationType.EMAIL,
        userId: TEST_USER_ID,
        content: { body: 'Test' }
      };

      // Setup service failure
      mockCircuitBreaker.fire.mockRejectedValue(new Error('External service error'));

      // Execute and verify
      await expect(
        notificationService.sendNotification(notification, TEST_TENANT_ID)
      ).rejects.toThrow('External service error');

      // Verify error is logged
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should implement circuit breaker pattern correctly', async () => {
      // Verify circuit breaker configuration
      expect(mockCircuitBreaker.fallback).toHaveBeenCalled();
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith('success', expect.any(Function));
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith('failure', expect.any(Function));
    });
  });
});