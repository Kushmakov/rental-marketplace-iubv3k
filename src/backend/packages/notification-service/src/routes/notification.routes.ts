/**
 * @fileoverview Notification service route configuration with comprehensive security,
 * rate limiting, and multi-tenant support for the Project X rental platform.
 * @version 1.0.0
 */

import { Router } from 'express'; // v4.18.2
import { 
  NotificationController,
  validateToken,
  validateRole,
  rateLimitMiddleware,
  errorHandler
} from '../controllers/notification.controller';
import { USER_ROLES } from '@projectx/common';

// Constants for rate limiting and roles
const ADMIN_ROLE = USER_ROLES.ADMIN;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

/**
 * Initializes notification routes with security middleware and rate limiting
 * @param controller - Notification controller instance
 * @returns Configured Express router
 */
const initializeRoutes = (controller: NotificationController): Router => {
  const router = Router();

  // Apply global middleware
  router.use(validateToken);
  router.use(rateLimitMiddleware({
    windowMs: RATE_LIMIT_WINDOW,
    maxRequests: RATE_LIMIT_MAX_REQUESTS
  }));

  /**
   * GET /notifications
   * Retrieves paginated user notifications with filtering
   * @security JWT Bearer token required
   */
  router.get('/notifications', async (req, res, next) => {
    try {
      await controller.getUserNotifications(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /notifications
   * Sends a new notification with tenant isolation
   * @security JWT Bearer token required
   */
  router.post('/notifications', async (req, res, next) => {
    try {
      await controller.sendNotification(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /notifications/:id/read
   * Marks a notification as read
   * @security JWT Bearer token required
   */
  router.put('/notifications/:id/read', async (req, res, next) => {
    try {
      await controller.markAsRead(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /notifications/batch
   * Sends batch notifications (admin only)
   * @security JWT Bearer token required
   * @security Admin role required
   */
  router.post('/notifications/batch', 
    (req, res, next) => validateRole(req.user?.role, [ADMIN_ROLE]),
    async (req, res, next) => {
      try {
        await controller.sendBatchNotifications(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /notifications/health
   * Service health check endpoint
   * @security JWT Bearer token required
   * @security Admin role required
   */
  router.get('/notifications/health',
    (req, res, next) => validateRole(req.user?.role, [ADMIN_ROLE]),
    async (req, res, next) => {
      try {
        await controller.checkHealth(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Apply global error handler
  router.use(errorHandler);

  return router;
};

// Export configured router
export const notificationRouter = initializeRoutes(new NotificationController());

// Export route initialization function for testing
export { initializeRoutes };