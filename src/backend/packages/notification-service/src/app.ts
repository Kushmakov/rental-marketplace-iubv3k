/**
 * @fileoverview Main application entry point for the notification microservice
 * Configures Express server, middleware, routes and initializes required services
 * for handling email, SMS and in-app notifications with enhanced security and monitoring
 * @version 1.0.0
 */

import express from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import { Registry } from 'prom-client'; // v14.2.0

import { 
  service, 
  email, 
  sms 
} from './config';

import { 
  logger,
  errorHandler,
  rateLimitMiddleware,
  healthCheck
} from '@projectx/common';

import { notificationRouter } from './routes/notification.routes';

// Initialize Express application
const app = express();

/**
 * Initializes and configures all required middleware with enhanced security and monitoring
 * @param app - Express application instance
 */
const initializeMiddleware = (app: express.Application): void => {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" }
  }));

  // CORS configuration with dynamic origin validation
  app.use(cors({
    origin: service.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-correlation-id'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Request parsing middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression());

  // Rate limiting with tenant isolation
  app.use(rateLimitMiddleware);

  // Request tracking and logging
  app.use((req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    const tenantId = req.headers['x-tenant-id'];

    // Add correlation ID to response headers
    res.setHeader('x-correlation-id', correlationId);

    // Log request with enhanced context
    logger.info('Incoming request', {
      correlationId,
      tenantId,
      method: req.method,
      path: req.path,
      ip: req.ip
    });

    next();
  });

  // Initialize Prometheus metrics
  const registry = new Registry();
  registry.setDefaultLabels({
    app: 'notification-service',
    version: service.apiVersion
  });
};

/**
 * Configures API routes with health checks and metrics endpoints
 * @param app - Express application instance
 */
const initializeRoutes = (app: express.Application): void => {
  // Health check endpoints
  app.get('/health', healthCheck);
  app.get('/health/live', (req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/health/ready', async (req, res) => {
    try {
      // Add service-specific health checks here
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      res.status(503).json({ status: 'error', message: error.message });
    }
  });

  // API routes
  app.use(`/api/${service.apiVersion}`, notificationRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      status: 404,
      message: 'Resource not found',
      path: req.path
    });
  });

  // Global error handler
  app.use(errorHandler);
};

/**
 * Starts the Express server with graceful shutdown support
 * @param app - Express application instance
 */
const startServer = async (app: express.Application): Promise<void> => {
  try {
    const server = app.listen(service.port, () => {
      logger.info('Notification service started', {
        port: service.port,
        env: service.env,
        version: service.apiVersion
      });
    });

    // Graceful shutdown handler
    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, starting graceful shutdown');

      server.close(async () => {
        try {
          // Cleanup resources
          logger.info('Server closed, cleaning up resources');
          process.exit(0);
        } catch (error) {
          logger.error('Error during cleanup', error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

// Initialize application
initializeMiddleware(app);
initializeRoutes(app);

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer(app);
}

export { app };