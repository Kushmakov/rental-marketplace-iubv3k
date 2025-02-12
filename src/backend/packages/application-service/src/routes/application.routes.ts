import { Router } from 'express'; // express v4.18.0
import { validateRequest } from 'express-validator'; // express-validator v7.0.0
import { authenticate } from '@common/middleware'; // @common/middleware v1.0.0
import { rateLimit } from 'express-rate-limit'; // express-rate-limit v6.9.0
import helmet from 'helmet'; // helmet v7.0.0
import { RedisStore } from 'rate-limit-redis'; // rate-limit-redis v3.0.0
import { correlationMiddleware, errorHandler } from '@common/middleware'; // @common/middleware v1.0.0
import { ApplicationController } from '../controllers/application.controller';
import { Application } from '../models/application.model';

// Constants for rate limiting and timeouts
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_FILE_SIZE_MB = 10;

/**
 * Configures and returns the application router with enhanced security,
 * validation, and monitoring capabilities
 */
export function configureApplicationRoutes(
  router: Router,
  applicationController: ApplicationController,
  redisStore: RedisStore
): Router {
  // Apply security headers
  router.use(helmet({
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: true
  }));

  // Configure rate limiting with Redis store
  const limiter = rateLimit({
    store: redisStore,
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later'
  });

  // Apply common middleware
  router.use(correlationMiddleware());
  router.use(limiter);
  router.use(authenticate());

  // Create new application
  router.post('/applications',
    validateRequest([
      { field: 'applicantId', rules: ['required', 'uuid'] },
      { field: 'unitId', rules: ['required', 'uuid'] },
      { field: 'monthlyIncome', rules: ['required', 'numeric', 'min:0'] },
      { field: 'creditScore', rules: ['required', 'numeric', 'range:300,850'] },
      { field: 'employmentDetails', rules: ['required', 'object'] },
      { field: 'preferredMoveInDate', rules: ['required', 'date', 'future'] }
    ]),
    async (req, res, next) => {
      try {
        const application = await applicationController.createApplication(req.body);
        res.status(201).json(application);
      } catch (error) {
        next(error);
      }
    }
  );

  // Submit application with documents
  router.post('/applications/:id/submit',
    validateRequest([
      { field: 'id', rules: ['required', 'uuid'] },
      { field: 'documents', rules: ['required', 'array'] },
      { field: 'documents.*.type', rules: ['required', 'string'] },
      { field: 'documents.*.file', rules: ['required', 'file', `maxSize:${MAX_FILE_SIZE_MB}mb`] }
    ]),
    async (req, res, next) => {
      try {
        const application = await applicationController.submitApplication(req.params.id);
        res.status(200).json(application);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get application by ID
  router.get('/applications/:id',
    validateRequest([
      { field: 'id', rules: ['required', 'uuid'] }
    ]),
    async (req, res, next) => {
      try {
        const application = await applicationController.getApplication(req.params.id);
        res.status(200).json(application);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update application status
  router.put('/applications/:id/status',
    validateRequest([
      { field: 'id', rules: ['required', 'uuid'] },
      { field: 'status', rules: ['required', 'string', 'in:DRAFT,SUBMITTED,UNDER_REVIEW,APPROVED,REJECTED,CANCELLED'] }
    ]),
    async (req, res, next) => {
      try {
        const application = await applicationController.updateApplicationStatus(
          req.params.id,
          req.body.status
        );
        res.status(200).json(application);
      } catch (error) {
        next(error);
      }
    }
  );

  // Apply request timeout middleware
  router.use((req, res, next) => {
    res.setTimeout(REQUEST_TIMEOUT_MS, () => {
      res.status(408).json({
        error: 'Request timeout',
        message: 'The request took too long to process'
      });
    });
    next();
  });

  // Apply global error handling middleware
  router.use(errorHandler());

  return router;
}

// Export configured router
export default configureApplicationRoutes(
  Router(),
  new ApplicationController(),
  new RedisStore()
);