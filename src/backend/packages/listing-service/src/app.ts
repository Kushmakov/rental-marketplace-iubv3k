/**
 * Main application entry point for the listing service implementing property listings,
 * search functionality, and availability management with enterprise-grade features.
 * @packageDocumentation
 */

import express, { Express, Request, Response } from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v6.9.0

import { configureListingRoutes } from './routes/listing.routes';
import {
  SERVICE_CONFIG,
  ELASTICSEARCH_CONFIG,
  REDIS_CONFIG,
  createElasticsearchClient,
  createRedisClient
} from './config';
import {
  logger,
  errorHandler,
  requestTracker,
  healthCheck
} from '@common/middleware';

/**
 * Initializes and configures the Express application with comprehensive
 * middleware stack, security features, and monitoring
 */
const initializeApp = async (): Promise<Express> => {
  const app = express();

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
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" }
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Request parsing and compression
  app.use(compression({ level: 6 }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Initialize clients
  const elasticsearchClient = createElasticsearchClient();
  const redisClient = createRedisClient();

  // Rate limiting with Redis store
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    store: {
      incr: (key: string) => redisClient.incr(key),
      decr: (key: string) => redisClient.decr(key),
      resetKey: (key: string) => redisClient.del(key)
    }
  });
  app.use(limiter);

  // Request tracking and correlation IDs
  app.use(requestTracker);

  // Health check endpoints
  app.get('/health', healthCheck);
  app.get('/health/live', (req: Request, res: Response) => {
    res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
  });
  app.get('/health/ready', async (req: Request, res: Response) => {
    try {
      await Promise.all([
        elasticsearchClient.ping(),
        redisClient.ping()
      ]);
      res.status(200).json({
        status: 'READY',
        elasticsearch: 'UP',
        redis: 'UP',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'DOWN',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // API routes
  app.use('/api/v1/listings', configureListingRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
};

/**
 * Starts the HTTP server with comprehensive error handling and graceful shutdown
 */
const startServer = async (): Promise<void> => {
  try {
    const app = await initializeApp();
    const server = app.listen(SERVICE_CONFIG.port, SERVICE_CONFIG.host, () => {
      logger.info(`Listing service started on ${SERVICE_CONFIG.host}:${SERVICE_CONFIG.port}`);
    });

    // Configure server timeouts
    server.timeout = SERVICE_CONFIG.timeout;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close(async () => {
        try {
          // Close database connections and cleanup
          await Promise.all([
            createElasticsearchClient().close(),
            createRedisClient().quit()
          ]);
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
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
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled Promise rejection:', reason);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if running directly
if (require.main === module) {
  startServer();
}

// Export for testing
export { initializeApp, startServer };