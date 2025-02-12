/**
 * @fileoverview Database configuration module for Project X rental platform
 * Manages PostgreSQL connection settings, pooling, and migrations with comprehensive monitoring
 * @version 1.0.0
 */

import { Pool, PoolConfig } from 'pg'; // v8.11.0
import Knex from 'knex'; // v2.5.0
import { HTTP_STATUS } from '../../../common/src/constants';

/**
 * Enhanced PostgreSQL connection configuration with monitoring support
 */
export const DATABASE_CONFIG = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production',
  application_name: 'rental_platform',
  statement_timeout: 30000,
  query_timeout: 30000,
  connectionTimeoutMillis: 10000,
  keepalive: true,
} as const;

/**
 * Advanced connection pool configuration with health monitoring
 */
export const POOL_CONFIG: PoolConfig = {
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500,
  log_error: true,
  allowExitOnIdle: true,
} as const;

/**
 * Migration configuration for database schema management
 */
export const MIGRATION_CONFIG = {
  directory: './migrations',
  tableName: 'knex_migrations',
  extension: 'ts',
  migrationSource: 'ts-migrations',
  schemaName: 'public',
  pool: {
    min: 1,
    max: 2,
  },
} as const;

/**
 * Creates and configures a PostgreSQL connection pool with comprehensive monitoring
 * @returns Configured PostgreSQL pool instance with health monitoring
 */
export const createDatabasePool = (): Pool => {
  // Validate required environment variables
  const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Create pool with enhanced configuration
  const pool = new Pool({
    ...DATABASE_CONFIG,
    ...POOL_CONFIG,
  });

  // Connection retry logic with exponential backoff
  const retryConnection = async (retries = 5, delay = 1000): Promise<void> => {
    try {
      const client = await pool.connect();
      client.release();
    } catch (error) {
      if (retries === 0) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryConnection(retries - 1, delay * 2);
    }
  };

  // Error event handlers
  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    if (client) {
      client.release(true); // Force release with error
    }
  });

  // Pool health monitoring
  let isHealthy = true;
  const healthCheck = async (): Promise<boolean> => {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT 1');
      client.release();
      isHealthy = result.rowCount === 1;
      return isHealthy;
    } catch (error) {
      isHealthy = false;
      console.error('Database health check failed:', error);
      return false;
    }
  };

  // Periodic health checks
  const healthCheckInterval = setInterval(healthCheck, 30000);

  // Graceful shutdown handler
  const shutdown = async (): Promise<void> => {
    clearInterval(healthCheckInterval);
    await pool.end();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Connection labeling for debugging
  pool.on('connect', client => {
    client.query(`SET application_name = '${DATABASE_CONFIG.application_name}'`);
  });

  // Add health check method to pool
  Object.defineProperty(pool, 'isHealthy', {
    get: () => isHealthy,
  });

  return pool;
};

/**
 * Initializes Knex instance with comprehensive configuration and error handling
 * @returns Configured Knex instance with migration support
 */
export const initializeKnex = (): Knex => {
  try {
    const knexConfig: Knex.Config = {
      client: 'postgresql',
      connection: {
        ...DATABASE_CONFIG,
      },
      pool: POOL_CONFIG,
      migrations: MIGRATION_CONFIG,
      debug: process.env.NODE_ENV === 'development',
    };

    const knex = Knex(knexConfig);

    // Query timeout and cancellation configuration
    knex.client.config.acquireConnectionTimeout = DATABASE_CONFIG.connectionTimeoutMillis;

    // Add error handling for migrations
    knex.migrate.on('migration', (migration) => {
      console.log(`Running migration: ${migration.name}`);
    });

    knex.migrate.on('error', (error) => {
      console.error('Migration error:', error);
      throw new Error(`Migration failed: ${error.message}`);
    });

    // Verify connection
    knex.raw('SELECT 1')
      .then(() => {
        console.log('Knex connection established successfully');
      })
      .catch((error) => {
        console.error('Knex connection failed:', error);
        throw error;
      });

    return knex;
  } catch (error) {
    console.error('Failed to initialize Knex:', error);
    throw new Error(`Database initialization failed: ${error.message}`);
  }
};

/**
 * Custom error class for database-related errors
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}