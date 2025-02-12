/**
 * @fileoverview Main application entry point for the rental application service
 * Configures Express server with comprehensive security, monitoring and reliability features
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import { rateLimit } from 'express-rate-limit'; // v6.9.0
import timeout from 'express-timeout-handler'; // v2.2.2

import { config } from './config';
import applicationRouter from './routes/application.routes';
import { 
  logger, 
  errorHandler, 
  healthCheck 
} from '@common/middleware';

// Initialize Express application
const app: Express = express();

/**
 * Configures all required middleware for the Express application
 * with security and monitoring features
 * @param app Express application instance
 */
const configureMiddleware = (app: Express): void => {
  // Security middleware
  app.use(helmet({
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

  // CORS configuration with whitelist
  app.use(cors({
    origin: config.security.corsWhitelist,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Request compression
  app.use(compression());

  // Request timeout handling
  app.use(timeout.handler({
    timeout: 30000, // 30 seconds
    onTimeout: (req: Request, res: Response) => {
      res.status(408).json({
        error: 'Request Timeout',
        message: 'Request took too long to process'
      });
    }
  }));

  // Body parsers with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ 
    extended: true,
    limit: '10mb'
  }));

  // Rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later'
  }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    next();
  });
};

/**
 * Configures all API routes with proper middleware and monitoring
 * @param app Express application instance
 */
const configureRoutes = (app: Express): void => {
  // Health check endpoint
  app.get('/health', healthCheck());

  // Metrics endpoint for monitoring
  app.get('/metrics', (req: Request, res: Response) => {
    // Return service metrics
    res.json({
      uptime: process.uptime(),
      timestamp: Date.now(),
      memory: process.memoryUsage()
    });
  });

  // API routes
  app.use('/api/v1/applications', applicationRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource does not exist'
    });
  });

  // Global error handler
  app.use(errorHandler());
};

/**
 * Starts the Express server with proper error handling and graceful shutdown
 * @param app Express application instance
 */
const startServer = async (app: Express): Promise<void> => {
  try {
    // Validate required configuration
    if (!config.service.port || !config.service.host) {
      throw new Error('Required configuration missing');
    }

    // Configure middleware and routes
    configureMiddleware(app);
    configureRoutes(app);

    // Start server
    const server = app.listen(config.service.port, config.service.host, () => {
      logger.info('Application service started', {
        port: config.service.port,
        environment: config.service.nodeEnv,
        version: config.service.version
      });
    });

    // Graceful shutdown handler
    const shutdown = async () => {
      logger.info('Shutting down application service...');
      
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force close after timeout
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
};

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer(app).catch(error => {
    logger.error('Server startup failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  });
}

export default app;