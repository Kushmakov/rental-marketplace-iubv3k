import { Request, Response, NextFunction } from 'express';
import { HttpStatus } from 'http-status-codes'; // v2.2.0
import { NotificationService } from '../services/notification.service';
import { Notification } from '../models/notification.model';
import { logger } from '@projectx/common';
import { BadRequestError, NotFoundError } from '@projectx/common/src/errors';

/**
 * Enhanced controller for handling notification-related HTTP requests
 * with support for multi-tenancy, batch operations, and monitoring
 */
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly rateLimiter: any,
    private readonly metrics: any
  ) {
    this.validateDependencies();
  }

  /**
   * Validates required service dependencies
   */
  private validateDependencies(): void {
    if (!this.notificationService) {
      throw new Error('NotificationService is required');
    }
    if (!this.rateLimiter) {
      throw new Error('RateLimiter is required');
    }
    if (!this.metrics) {
      throw new Error('Metrics collector is required');
    }
  }

  /**
   * Sends a new notification with tenant isolation and delivery tracking
   * @route POST /api/notifications
   */
  public async sendNotification(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const startTime = Date.now();
      const tenantId = req.headers['x-tenant-id'] as string;
      const correlationId = req.headers['x-correlation-id'] as string;

      if (!tenantId) {
        throw new BadRequestError('Tenant ID is required');
      }

      // Validate request body
      const { type, userId, content, priority, expiresAt } = req.body;

      if (!type || !userId || !content) {
        throw new BadRequestError('Missing required notification fields');
      }

      // Track notification request
      this.metrics.incrementCounter('notification_requests_total', {
        tenant: tenantId,
        type
      });

      // Send notification
      const result = await this.notificationService.sendNotification(
        {
          type,
          userId,
          content,
          priority,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined
        },
        tenantId
      );

      // Record metrics
      const duration = Date.now() - startTime;
      this.metrics.recordLatency('notification_request_duration', duration, {
        tenant: tenantId,
        type
      });

      logger.info('Notification sent successfully', {
        tenantId,
        correlationId,
        notificationId: result.id,
        duration
      });

      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        data: result,
        message: 'Notification sent successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves user notifications with pagination and filtering
   * @route GET /api/notifications
   */
  public async getUserNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.query.userId as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string[];
      const type = req.query.type as string[];

      if (!tenantId) {
        throw new BadRequestError('Tenant ID is required');
      }

      if (!userId) {
        throw new BadRequestError('User ID is required');
      }

      const result = await this.notificationService.getUserNotifications(
        tenantId,
        userId,
        {
          page,
          limit,
          status,
          type
        }
      );

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        data: result.notifications,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Marks a notification as read with validation
   * @route PATCH /api/notifications/:id/read
   */
  public async markAsRead(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const notificationId = req.params.id;
      const userId = req.body.userId;

      if (!tenantId) {
        throw new BadRequestError('Tenant ID is required');
      }

      if (!notificationId) {
        throw new BadRequestError('Notification ID is required');
      }

      if (!userId) {
        throw new BadRequestError('User ID is required');
      }

      const result = await this.notificationService.markNotificationAsRead(
        notificationId,
        userId,
        tenantId
      );

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        data: result,
        message: 'Notification marked as read'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Sends batch notifications with progress tracking
   * @route POST /api/notifications/batch
   */
  public async sendBatchNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const notifications = req.body.notifications as Notification[];

      if (!tenantId) {
        throw new BadRequestError('Tenant ID is required');
      }

      if (!Array.isArray(notifications) || notifications.length === 0) {
        throw new BadRequestError('Valid notifications array is required');
      }

      if (notifications.length > 1000) {
        throw new BadRequestError('Batch size cannot exceed 1000 notifications');
      }

      // Track batch request
      this.metrics.incrementCounter('notification_batch_requests_total', {
        tenant: tenantId,
        size: notifications.length
      });

      const results = await this.notificationService.sendBatchNotifications(
        notifications,
        tenantId
      );

      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        data: results,
        message: 'Batch notifications processed successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Checks notification service health
   * @route GET /api/notifications/health
   */
  public async checkHealth(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const health = await this.notificationService.checkServiceHealth();

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        data: health,
        message: 'Notification service health check completed'
      });

    } catch (error) {
      next(error);
    }
  }
}