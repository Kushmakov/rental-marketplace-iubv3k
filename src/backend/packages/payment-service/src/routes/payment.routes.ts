import { Router } from 'express'; // v4.18.x
import { 
  authenticate, 
  validate, 
  rateLimit, 
  auditLog, 
  monitor,
  circuitBreaker 
} from '@projectx/common'; // v1.0.x
import { PaymentController } from '../controllers/payment.controller';
import { PaymentType } from '../models/payment.model';

/**
 * Configures and returns Express router with PCI DSS compliant payment endpoints
 * Implements comprehensive security, validation, and monitoring
 */
export const configurePaymentRoutes = (paymentController: PaymentController): Router => {
  const router = Router();

  // Global middleware for all payment routes
  router.use(authenticate({ 
    requireApiKey: true,
    validateToken: true
  }));

  // Rate limiting configuration per user/IP
  const rateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP/user to 100 requests per window
    message: 'Too many payment requests, please try again later'
  };

  // Circuit breaker configuration
  const breakerConfig = {
    timeout: 10000, // 10 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 30000 // 30 seconds
  };

  /**
   * Create new payment
   * POST /api/payments
   */
  router.post('/',
    validate({
      body: {
        propertyId: { type: 'string', required: true },
        userId: { type: 'string', required: true },
        type: { type: 'string', enum: Object.values(PaymentType), required: true },
        amount: { type: 'number', min: 0.01, required: true },
        currency: { type: 'string', length: 3, default: 'USD' },
        metadata: { type: 'object', optional: true }
      }
    }),
    rateLimit(rateLimitConfig),
    auditLog('payment_create'),
    monitor('payment_creation'),
    circuitBreaker(breakerConfig),
    async (req, res, next) => {
      try {
        const response = await paymentController.createPayment(req.body);
        res.status(201).json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Process payment
   * POST /api/payments/:id/process
   */
  router.post('/:id/process',
    validate({
      params: {
        id: { type: 'string', required: true }
      },
      body: {
        paymentMethodId: { type: 'string', required: true },
        metadata: { type: 'object', optional: true }
      }
    }),
    rateLimit({ ...rateLimitConfig, max: 50 }), // Stricter limit for processing
    auditLog('payment_process'),
    monitor('payment_processing'),
    circuitBreaker(breakerConfig),
    async (req, res, next) => {
      try {
        const response = await paymentController.processPayment(
          req.params.id,
          req.body
        );
        res.status(200).json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Setup recurring payment
   * POST /api/payments/:id/recurring
   */
  router.post('/:id/recurring',
    validate({
      params: {
        id: { type: 'string', required: true }
      },
      body: {
        frequency: { type: 'string', enum: ['monthly', 'bi_weekly', 'weekly'], required: true },
        startDate: { type: 'date', required: true },
        endDate: { type: 'date', optional: true }
      }
    }),
    rateLimit(rateLimitConfig),
    auditLog('recurring_setup'),
    monitor('recurring_setup'),
    circuitBreaker(breakerConfig),
    async (req, res, next) => {
      try {
        const response = await paymentController.setupRecurringPayment(
          req.params.id,
          req.body
        );
        res.status(200).json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Process refund
   * POST /api/payments/:id/refund
   */
  router.post('/:id/refund',
    validate({
      params: {
        id: { type: 'string', required: true }
      },
      body: {
        amount: { type: 'number', min: 0.01, required: true },
        reason: { type: 'string', required: true }
      }
    }),
    rateLimit({ ...rateLimitConfig, max: 20 }), // Very strict limit for refunds
    auditLog('payment_refund'),
    monitor('refund_processing'),
    circuitBreaker(breakerConfig),
    async (req, res, next) => {
      try {
        const response = await paymentController.refundPayment(
          req.params.id,
          req.body
        );
        res.status(200).json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Get payment history
   * GET /api/payments/history
   */
  router.get('/history',
    validate({
      query: {
        type: { type: 'string', enum: Object.values(PaymentType), optional: true },
        startDate: { type: 'date', optional: true },
        endDate: { type: 'date', optional: true },
        page: { type: 'number', min: 1, default: 1 },
        limit: { type: 'number', min: 1, max: 100, default: 20 }
      }
    }),
    rateLimit(rateLimitConfig),
    auditLog('payment_history'),
    monitor('history_retrieval'),
    async (req, res, next) => {
      try {
        const response = await paymentController.getPaymentHistory(req.query);
        res.status(200).json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Health check endpoint
   * GET /api/payments/health
   */
  router.get('/health',
    monitor('health_check'),
    (_, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    }
  );

  // Global error handler for payment routes
  router.use((error: any, req: any, res: any, next: any) => {
    const status = error.status || 500;
    const message = error.message || 'Internal server error';

    res.status(status).json({
      status,
      message,
      timestamp: new Date().toISOString(),
      requestId: req.id,
      path: req.path
    });
  });

  return router;
};

export default configurePaymentRoutes;