/**
 * @fileoverview Payment Service Application Entry Point
 * Configures a PCI DSS compliant Express server with comprehensive security,
 * monitoring, and error handling for high-volume payment processing operations.
 * @version 1.0.0
 */

import express from 'express'; // v4.18.x
import cors from 'cors'; // v2.8.x
import helmet from 'helmet'; // v7.0.x
import morgan from 'morgan'; // v1.10.x
import compression from 'compression'; // v1.7.x
import { Container } from 'inversify'; // v6.0.x
import winston from 'winston'; // v3.10.x
import rateLimit from 'express-rate-limit'; // v6.9.x
import { CircuitBreaker } from 'opossum'; // v7.1.x
import errorHandler from 'express-error-handler'; // v1.1.x

import { config } from './config';
import configurePaymentRoutes from './routes/payment.routes';
import { PaymentService } from './services/payment.service';

// Initialize Express application
const app = express();

/**
 * Configures Express middleware with PCI DSS compliant security
 */
const configureMiddleware = (app: express.Application): void => {
  // Security headers with PCI compliance
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        frameSrc: ["'self'", 'https://js.stripe.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hidePoweredBy: true
  }));

  // CORS configuration with strict options
  app.use(cors({
    origin: config.security.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 600 // 10 minutes
  }));

  // Request parsing and compression
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  app.use(compression());

  // PCI-compliant request logging
  app.use(morgan('[:date[iso]] :method :url :status :response-time ms', {
    skip: (req) => req.path === '/health',
    stream: {
      write: (message: string) => {
        logger.info('HTTP Access Log', { 
          message: message.trim(),
          correlationId: req.id
        });
      }
    }
  }));

  // Rate limiting configuration
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  }));

  // Circuit breaker for external services
  const breaker = new CircuitBreaker(
    async (fn: () => Promise<any>) => await fn(),
    {
      timeout: 10000, // 10 seconds
      errorThresholdPercentage: 50,
      resetTimeout: 30000 // 30 seconds
    }
  );

  // Add request correlation ID
  app.use((req, res, next) => {
    req.id = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-Id', req.id);
    next();
  });
};

/**
 * Configures dependency injection container
 */
const configureDependencies = (): Container => {
  const container = new Container();

  // Configure Winston logger
  const logger = winston.createLogger({
    level: config.env === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ 
        filename: 'logs/payment-error.log', 
        level: 'error' 
      }),
      new winston.transports.File({ 
        filename: 'logs/payment-combined.log' 
      })
    ]
  });

  // Bind services
  container.bind<winston.Logger>('Logger').toConstantValue(logger);
  container.bind<PaymentService>('PaymentService').to(PaymentService);

  return container;
};

/**
 * Starts the Express server with health checks and graceful shutdown
 */
const startServer = async (
  app: express.Application,
  port: number
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info('Payment service started', {
        port,
        environment: config.env,
        timestamp: new Date().toISOString()
      });
      resolve();
    });

    // Health check endpoint
    app.get('/health', (_, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: config.version
      });
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down payment service...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Error handling
    server.on('error', (error: Error) => {
      logger.error('Server error', { error: error.message });
      reject(error);
    });
  });
};

// Initialize application
const initializeApp = async (): Promise<void> => {
  try {
    // Configure middleware
    configureMiddleware(app);

    // Configure dependencies
    const container = configureDependencies();

    // Configure routes
    const paymentService = container.get<PaymentService>('PaymentService');
    app.use('/api/v1/payments', configurePaymentRoutes(paymentService));

    // Global error handler
    app.use(errorHandler({
      logger: (err: Error) => {
        logger.error('Unhandled error', {
          error: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString()
        });
      }
    }));

    // Start server
    await startServer(app, config.port);
  } catch (error) {
    logger.error('Failed to initialize application', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

// Start application if not in test environment
if (process.env.NODE_ENV !== 'test') {
  initializeApp();
}

export { app };