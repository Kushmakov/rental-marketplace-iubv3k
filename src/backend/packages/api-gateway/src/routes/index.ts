/**
 * @fileoverview Main router configuration for API Gateway
 * Implements comprehensive routing with security, monitoring, and resilience patterns
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // ^4.18.2
import helmet from 'helmet'; // ^7.0.0
import cors from 'cors'; // ^2.8.5
import compression from 'compression'; // ^1.7.4
import { validate } from 'express-validator'; // ^7.0.1
import promClient from 'prom-client'; // ^14.2.0
import CircuitBreaker from 'opossum'; // ^7.1.0

// Internal imports
import { authenticate, authorize } from '../middleware/auth.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { rateLimitMiddleware } from '../middleware/ratelimit.middleware';
import config from '../config';

// Initialize Prometheus metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

/**
 * Configures comprehensive middleware stack for security, monitoring, and performance
 * @param app - Express application instance
 */
export const configureMiddleware = (app: Express): void => {
  // Basic middleware
  app.use(express.json({ limit: config.server.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));
  app.use(compression());

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: config.security.headers.csp,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true
  }));

  // CORS configuration
  app.use(cors({
    origin: config.security.cors.origin,
    methods: config.security.cors.methods,
    allowedHeaders: config.security.cors.allowedHeaders,
    exposedHeaders: config.security.cors.exposedHeaders,
    credentials: config.security.cors.credentials,
    maxAge: config.security.cors.maxAge
  }));

  // Request tracking
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
    next();
  });

  // Prometheus metrics middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();

    res.on('finish', () => {
      const duration = process.hrtime(start);
      const durationSeconds = duration[0] + duration[1] / 1e9;

      httpRequestDurationMicroseconds
        .labels(req.method, req.path, res.statusCode.toString())
        .observe(durationSeconds);
    });

    next();
  });
};

/**
 * Configures all service routes with versioning, authentication, and monitoring
 * @param app - Express application instance
 */
export const configureRoutes = (app: Express): void => {
  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Metrics endpoint
  app.get('/metrics', async (_req: Request, res: Response) => {
    try {
      res.set('Content-Type', promClient.register.contentType);
      res.send(await promClient.register.metrics());
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  });

  // API version prefix
  const apiRouter = express.Router();
  app.use('/api/v1', apiRouter);

  // Circuit breaker configuration
  const breaker = new CircuitBreaker(async (req: Request) => {
    // Implement service call logic
    return Promise.resolve(req);
  }, {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  });

  // Authentication routes
  apiRouter.use('/auth', rateLimitMiddleware, require('./auth.routes'));

  // Property routes with authentication
  apiRouter.use('/properties',
    rateLimitMiddleware,
    authenticate,
    authorize(['ADMIN', 'PROPERTY_MANAGER', 'AGENT']),
    require('./property.routes')
  );

  // Application routes with role-based authorization
  apiRouter.use('/applications',
    rateLimitMiddleware,
    authenticate,
    authorize(['ADMIN', 'PROPERTY_MANAGER', 'AGENT', 'RENTER']),
    require('./application.routes')
  );

  // Payment routes with enhanced security
  apiRouter.use('/payments',
    rateLimitMiddleware,
    authenticate,
    authorize(['ADMIN', 'PROPERTY_MANAGER', 'RENTER']),
    require('./payment.routes')
  );

  // Document routes with authentication
  apiRouter.use('/documents',
    rateLimitMiddleware,
    authenticate,
    authorize(['ADMIN', 'PROPERTY_MANAGER', 'AGENT', 'RENTER']),
    require('./document.routes')
  );

  // User management routes
  apiRouter.use('/users',
    rateLimitMiddleware,
    authenticate,
    authorize(['ADMIN']),
    require('./user.routes')
  );

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      status: 404,
      message: 'Resource not found'
    });
  });

  // Global error handler
  app.use(errorHandler);

  // Circuit breaker event handlers
  breaker.on('timeout', () => {
    console.error('Circuit breaker: Service timeout');
  });

  breaker.on('open', () => {
    console.error('Circuit breaker: Circuit opened');
  });

  breaker.on('halfOpen', () => {
    console.log('Circuit breaker: Circuit half-open');
  });

  breaker.on('close', () => {
    console.log('Circuit breaker: Circuit closed');
  });
};