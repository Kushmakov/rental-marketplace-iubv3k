/**
 * @fileoverview API Gateway Server Entry Point
 * Initializes and manages HTTP/HTTPS server with comprehensive security, monitoring and resilience features
 * @version 1.0.0
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import { app } from './app';
import config from './config';
import { logger } from '@projectx/common/middleware';

// Track active connections for graceful shutdown
const activeConnections = new Set<any>();

/**
 * Creates appropriate server instance based on environment with TLS 1.3 support
 * @returns Promise<http.Server | https.Server>
 */
async function createServer(): Promise<http.Server | https.Server> {
  if (config.security.tls.enabled) {
    // Load TLS certificates
    const tlsOptions = {
      cert: fs.readFileSync(config.security.tls.certPath),
      key: fs.readFileSync(config.security.tls.keyPath),
      minVersion: config.security.tls.minVersion,
      ciphers: [
        'TLS_AES_128_GCM_SHA256',
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256'
      ].join(':'),
      honorCipherOrder: true,
      sessionTimeout: 300,
      handshakeTimeout: 10000
    };

    return https.createServer(tlsOptions, app);
  }

  return http.createServer(app);
}

/**
 * Starts server with comprehensive error handling and monitoring
 * @param server - HTTP/HTTPS server instance
 */
async function startServer(server: http.Server | https.Server): Promise<void> {
  // Configure timeouts
  server.timeout = config.server.timeout;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // Track connections for graceful shutdown
  server.on('connection', (connection) => {
    activeConnections.add(connection);
    connection.on('close', () => {
      activeConnections.delete(connection);
    });
  });

  // Error handling
  server.on('error', (error: NodeJS.ErrnoException) => {
    logger.error('Server error occurred', {
      error: error.message,
      code: error.code,
      syscall: error.syscall
    });

    if (error.syscall !== 'listen') {
      throw error;
    }

    switch (error.code) {
      case 'EACCES':
        logger.error(`Port ${config.server.port} requires elevated privileges`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        logger.error(`Port ${config.server.port} is already in use`);
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  // Start listening
  await new Promise<void>((resolve) => {
    server.listen(config.server.port, config.server.host, () => {
      logger.info('Server started', {
        port: config.server.port,
        environment: config.env,
        version: config.version,
        tls: config.security.tls.enabled
      });
      resolve();
    });
  });
}

/**
 * Implements graceful shutdown with connection draining
 * @param server - HTTP/HTTPS server instance
 */
async function gracefulShutdown(server: http.Server | https.Server): Promise<void> {
  logger.info('Initiating graceful shutdown...');

  // Stop accepting new connections
  server.close(() => {
    logger.info('Server stopped accepting new connections');
  });

  // Set shutdown timeout
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    // Wait for active connections to complete
    const drainConnections = async () => {
      if (activeConnections.size > 0) {
        logger.info(`Waiting for ${activeConnections.size} connections to complete`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return drainConnections();
      }
    };

    await drainConnections();

    // Clean shutdown
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Initialize server
(async () => {
  try {
    const server = await createServer();
    await startServer(server);

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      gracefulShutdown(server);
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      gracefulShutdown(server);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
})();

// Export server instance for testing
export { createServer, startServer, gracefulShutdown };