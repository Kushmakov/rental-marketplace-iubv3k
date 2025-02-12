/**
 * @fileoverview Main application entry point for the authentication service
 * Configures Express server with comprehensive security, monitoring, and performance features
 * @version 1.0.0
 */

import express, { Express } from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import morgan from 'morgan'; // v1.10.0
import { expressSanitizer } from 'express-sanitizer'; // v1.0.6
import { auth, server } from './config';
import { authRouter } from './routes/auth.routes';
import { 
  logger, 
  errorHandler, 
  rateLimiter, 
  requestTracker 
} from '@projectx/common';

// Initialize Express application
const app: Express = express();

/**
 * Initializes and configures Express middleware stack with security-first approach
 * @param app Express application instance
 */
const initializeMiddleware = (app: Express): void => {
  // Security headers with strict CSP
  app.use(helmet(HELMET_OPTIONS));

  // CORS configuration with strict options
  app.use(cors(CORS_OPTIONS));

  // Request tracking for observability
  app.use(requestTracker);

  // Request body parsing with size limits
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Request sanitization
  app.use(expressSanitizer());

  // Response compression
  app.use(compression());

  // Structured request logging
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg) } }));

  // Rate limiting per endpoint
  app.use(rateLimiter);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date(),
      version: auth.version,
      environment: auth.nodeEnv
    });
  });
};

/**
 * Configures API routes with versioning and security middleware
 * @param app Express application instance
 */
const initializeRoutes = (app: Express): void => {
  // API routes with version prefix
  app.use('/api/v1/auth', authRouter);

  // 404 handler for unknown routes
  app.use((req, res) => {
    res.status(404).json({
      status: 404,
      message: 'Resource not found',
      path: req.path,
      timestamp: new Date(),
      requestId: req.id
    });
  });

  // Global error handler
  app.use(errorHandler);
};

/**
 * Starts the Express server with graceful shutdown handling
 * @param app Express application instance
 */
const startServer = async (app: Express): Promise<void> => {
  try {
    const port = server.port || 3001;
    const server = app.listen(port, () => {
      logger.info(`Auth service started on port ${port}`, {
        environment: auth.nodeEnv,
        version: auth.version
      });
    });

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Initialize application
initializeMiddleware(app);
initializeRoutes(app);

// Start server in production, export app for testing
if (process.env.NODE_ENV !== 'test') {
  startServer(app);
}

// Global constants
const CORS_OPTIONS = {
  origin: auth.corsOrigins,
  credentials: true,
  maxAge: 86400,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

const HELMET_OPTIONS = {
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
};

export { app };