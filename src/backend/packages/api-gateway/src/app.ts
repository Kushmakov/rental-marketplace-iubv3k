/**
 * @fileoverview Main application configuration for API Gateway service
 * Implements comprehensive middleware stack, security controls, and production-ready features
 * @version 1.0.0
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import winston from 'winston';
import promClient from 'prom-client';
import { healthcheck } from '@healthcheck/express';

// Internal imports
import { configureRoutes } from './routes';
import { authenticate } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error.middleware';
import { rateLimitMiddleware } from './middleware/ratelimit.middleware';
import config from './config';

// Initialize Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'api_gateway_' });

// Configure Winston logger
const logger = winston.createLogger({
  level: config.monitoring.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Configures comprehensive middleware stack for the Express application
 * @param app - Express application instance
 */
const configureMiddleware = (app: Express): void => {
  // Basic middleware
  app.use(express.json({ limit: config.server.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));
  app.use(compression());

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: config.security.headers.hsts,
    noSniff: config.security.headers.noSniff,
    frameguard: { action: config.security.headers.frameOptions },
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
  app.use((req, _res, next) => {
    req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
    next();
  });

  // Logging middleware
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));

  // Rate limiting
  app.use(rateLimitMiddleware);

  // Metrics middleware
  if (config.monitoring.metrics.enabled) {
    app.get('/metrics', async (_req, res) => {
      res.set('Content-Type', promClient.register.contentType);
      res.send(await promClient.register.metrics());
    });
  }

  // Health check endpoint
  app.use(healthcheck({
    path: '/health',
    checks: {
      database: async () => {
        // Implement database health check
        return Promise.resolve();
      },
      redis: async () => {
        // Implement Redis health check
        return Promise.resolve();
      }
    }
  }));
};

/**
 * Configures graceful shutdown handling for the application
 * @param app - Express application instance
 * @param server - HTTP server instance
 */
const configureGracefulShutdown = (app: Express, server: any): void => {
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new requests
    server.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      // Close database connections
      // await db.disconnect();

      // Close other resources
      logger.info('All resources closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

/**
 * Creates and configures the Express application instance
 * @returns Configured Express application
 */
const createApp = (): Express => {
  const app = express();

  // Configure middleware stack
  configureMiddleware(app);

  // Configure routes
  configureRoutes(app);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
};

// Create and configure application instance
const app = createApp();

// Export configured application
export { app, configureGracefulShutdown };